import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { apiClient } from '@/services/api';
import { cn } from '@/lib/utils';
import type { JobResponse, SubmissionDetail } from '@/services/types';
import { HomeFab } from '@/components/ui/HomeButton';
import { BackButton } from '@/components/ui/BackButton';
import { ResultPresentation } from '@/components/learning/ResultPresentation';
import { useProfile } from '@/contexts/ProfileContext';
import { useToast } from '@/components/ui/Toast';
import { fetchSubmissionDetailWithProfiles } from '@/utils/submissionDetail';
import type { QuestionNavFilter } from '@/utils/questionNavigation';
import { questionCardFromPresentation } from '@/utils/resultPresentation';
import {
  buildQuestionPresentation,
  type PresentationQuestion,
} from '@/utils/questionPresentation';
import { isCapabilitySubject, subjectOption } from '@/config/subjects';
import { useSubjectCapabilities } from '@/hooks/useSubjectCapabilities';

const FILTERS = ['wrong', 'uncertain', 'correct', 'all'] as const;

type FilterKey = QuestionNavFilter;

interface ResultSummaryLocationState {
  from?: 'history' | string;
}

const extractHttpStatus = (err: unknown): number | undefined => {
  if (typeof err !== 'object' || err === null) return undefined;
  if (!('response' in err)) return undefined;
  const response = (err as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null) return undefined;
  if (!('status' in response)) return undefined;
  const status = (response as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
};

const extractHttpDetail = (err: unknown): string | undefined => {
  if (typeof err !== 'object' || err === null) return undefined;
  if (!('response' in err)) return undefined;
  const response = (err as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null) return undefined;
  if (!('data' in response)) return undefined;
  const data = (response as { data?: unknown }).data;
  if (typeof data === 'string') return data;
  if (typeof data !== 'object' || data === null) return undefined;
  if ('detail' in data) {
    const detail = (data as { detail?: unknown }).detail;
    return typeof detail === 'string' ? detail : undefined;
  }
  return undefined;
};

const ResultSummary: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profiles, activeProfileId, activeProfile, setActiveProfile } = useProfile();
  const { showToast } = useToast();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('jobId') || '';
  const submissionIdFromUrl = searchParams.get('submissionId') || params.submissionId || '';
  const [filter, setFilter] = useState<FilterKey>('wrong');
  const [jobData, setJobData] = useState<JobResponse | null>(null);
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [effectiveSubmissionId, setEffectiveSubmissionId] = useState(submissionIdFromUrl);
  const [moveOpen, setMoveOpen] = useState(false);
  const [movingToProfileId, setMovingToProfileId] = useState<string | null>(null);
  const { loading: capabilitiesLoading, isReadEnabled } = useSubjectCapabilities();

  const subjectCandidate = submission?.subject || jobData?.request?.subject;
  const capabilitySubject = isCapabilitySubject(subjectCandidate) ? subjectCandidate : null;
  const subjectReadEnabled = capabilitySubject ? isReadEnabled(capabilitySubject) : true;
  const subjectGatePending = Boolean(capabilitySubject && capabilitiesLoading && !subjectReadEnabled);
  const subjectBlocked = Boolean(capabilitySubject && !capabilitiesLoading && !subjectReadEnabled);

  // Determine back navigation target based on source
  const backTarget = (location.state as ResultSummaryLocationState | null)?.from === 'history' ? '/history' : '/';

  useEffect(() => {
    setEffectiveSubmissionId(submissionIdFromUrl);
  }, [submissionIdFromUrl]);

  const loadSubmissionDetail = React.useCallback(
    async (sid: string, opts?: { silent?: boolean }) => {
      const cleanedSid = String(sid || '').trim();
      if (!cleanedSid) return null;
      try {
        const res = await fetchSubmissionDetailWithProfiles(cleanedSid, {
          activeProfileId,
          profiles,
        });
        setSubmission(res.data);
        setSubmissionError(null);
        return res.data;
      } catch (err) {
        console.error(err);
        const status = extractHttpStatus(err);
        const detail =
          extractHttpDetail(err) ||
          (status === 404 ? '作业结果暂未更新完成，请稍后重试。' : '作业结果拉取失败，请稍后重试。');
        if (!opts?.silent) {
          setSubmissionError(detail);
        }
        return null;
      }
    },
    [activeProfileId, profiles]
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        let jobResp: JobResponse | null = null;
        if (jobId) {
          try {
            const res = await apiClient.get<JobResponse>(`/jobs/${jobId}`);
            if (mounted) {
              setJobData(res.data);
            }
            jobResp = res.data;
          } catch (err) {
            console.error(err);
          }
        }
        const sid =
          submissionIdFromUrl ||
          String((jobResp as { request?: { upload_id?: string } })?.request?.upload_id || '').trim() ||
          String(localStorage.getItem('active_job_submission_id') || '').trim();
        if (sid) {
          setEffectiveSubmissionId(sid);
          await loadSubmissionDetail(sid);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [jobId, submissionIdFromUrl, loadSubmissionDetail]);

  useEffect(() => {
    const sid = String(effectiveSubmissionId || '').trim();
    if (!sid) return undefined;

    const refreshSubmission = async () => {
      const key = `submission_dirty_${sid}`;
      try {
        await loadSubmissionDetail(sid, { silent: true });
      } catch (err) {
        console.error(err);
      } finally {
        try {
          localStorage.removeItem(key);
        } catch {
          // ignore
        }
      }
    };

    const handleFocus = () => {
      void refreshSubmission();
    };
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshSubmission();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [effectiveSubmissionId, loadSubmissionDetail]);

  useEffect(() => {
    const sid = String((jobData as { request?: { upload_id?: string } })?.request?.upload_id || '').trim();
    if (sid && !effectiveSubmissionId) setEffectiveSubmissionId(sid);
  }, [jobData, effectiveSubmissionId]);

  useEffect(() => {
    if (jobData?.status === 'done') {
      localStorage.removeItem('active_job_id');
      localStorage.removeItem('active_job_status');
      localStorage.removeItem('active_job_submission_id');
    }
  }, [jobData?.status]);

  useEffect(() => {
    if (!subjectBlocked || !capabilitySubject) return;
    showToast(`${subjectOption(capabilitySubject).label}入口已暂时关闭`, 'info');
    navigate('/', { replace: true });
  }, [capabilitySubject, navigate, showToast, subjectBlocked]);

  const presentation = useMemo(() => {
    if (submission) return buildQuestionPresentation(submission);
    if (jobData?.result) return buildQuestionPresentation(jobData.result);
    return buildQuestionPresentation({ question_cards: jobData?.question_cards || [] });
  }, [jobData?.question_cards, jobData?.result, submission]);

  const cards = useMemo(
    () => presentation.questions.map(questionCardFromPresentation),
    [presentation.questions],
  );

  const counts = useMemo(() => {
    const summary = submission?.summary;
    const totalItems =
      typeof summary?.total_items === 'number' ? summary.total_items : cards.length;
    const wrong =
      typeof summary?.wrong_count === 'number'
        ? summary.wrong_count
        : cards.filter((card) => String(card.verdict || '').toLowerCase() === 'incorrect').length;
    const uncertain =
      typeof summary?.uncertain_count === 'number'
        ? summary.uncertain_count
        : cards.filter((card) => String(card.verdict || '').toLowerCase() === 'uncertain').length;
    const correct = Math.max(0, totalItems - wrong - uncertain);
    return { correct, wrong, uncertain, total: totalItems };
  }, [cards, submission?.summary]);

  const accuracyPercent = useMemo(() => {
    const denominator = String(submission?.subject || '').toLowerCase() === 'english'
      ? counts.correct + counts.wrong
      : counts.total;
    return denominator > 0 ? Math.round((counts.correct / denominator) * 100) : null;
  }, [counts, submission?.subject]);

  const displayId = effectiveSubmissionId
    ? `#${effectiveSubmissionId.slice(-6)}`
    : jobId
      ? `#${jobId.slice(0, 6)}`
      : '#--';

  const ownedByName = activeProfile?.display_name || '默认';
  const moveTargets = useMemo(
    () => profiles.filter((p) => p.profile_id && p.profile_id !== activeProfileId),
    [profiles, activeProfileId]
  );

  const handleOpenQuestion = (question: PresentationQuestion, itemIds: string[]) => {
    const card = questionCardFromPresentation(question);
    const query = effectiveSubmissionId ? `?submissionId=${encodeURIComponent(effectiveSubmissionId)}` : '';
    navigate(`/question/${encodeURIComponent(card.item_id)}${query}`, {
      state: {
        card,
        submissionId: effectiveSubmissionId,
        questionNav: {
          filter,
          itemIds,
        },
      },
    });
  };

  const handleAskAI = (question: PresentationQuestion) => {
    const card = questionCardFromPresentation(question);
    const subject = String((question as { subject?: string }).subject || '').trim().toLowerCase();
    const query = effectiveSubmissionId ? `?submissionId=${encodeURIComponent(effectiveSubmissionId)}` : '';
    navigate(`/ai-tutor/${encodeURIComponent(card.item_id)}${query}`, {
      state: { card, submissionId: effectiveSubmissionId, ...(subject ? { subject } : {}) },
    });
  };

  const handleMoveSubmission = async (toProfileId: string) => {
    const sid = String(effectiveSubmissionId || '').trim();
    const pid = String(toProfileId || '').trim();
    if (!sid || !pid) return;
    setMovingToProfileId(pid);
    try {
      await apiClient.post(`/submissions/${encodeURIComponent(sid)}/move_profile`, { to_profile_id: pid });
      const targetName = profiles.find((p) => p.profile_id === pid)?.display_name || '目标孩子';
      showToast(`已移动到：${targetName}`, 'success');
      await setActiveProfile(pid);
      setMoveOpen(false);
      navigate(`/history/${encodeURIComponent(sid)}`, { replace: true });
    } catch (err) {
      console.error(err);
      showToast('移动失败，请稍后重试', 'error');
    } finally {
      setMovingToProfileId(null);
    }
  };

  if (subjectGatePending || subjectBlocked) return null;

  return (
    <div className="relative flex h-full min-h-screen w-full max-w-md mx-auto flex-col bg-[#EFEEEE] overflow-hidden pb-24 max-[360px]:pb-0 font-display text-[#1F2937]">
      <header className="flex items-center px-4 sm:px-6 py-6 justify-between sticky top-0 z-20 bg-[#EFEEEE]/90 backdrop-blur-md">
        <BackButton
          to={backTarget}
          ariaLabel="Back"
          className="h-12 w-12 bg-[#EFEEEE] shadow-[4px_4px_8px_#D1D1D1,-4px_-4px_8px_#FFFFFF] text-[#6B7280] active:shadow-[inset_6px_6px_12px_#D1D1D1,-6px_-6px_12px_#FFFFFF] active:scale-95"
          iconClassName="text-[1.35rem]"
        />
        <h2 className="text-xl font-bold text-[#1F2937] tracking-tight opacity-90">批改结果</h2>
        <div className="w-12" />
      </header>

		      <section className="px-4 sm:px-6 pt-2 pb-6">
		        <div className="bg-neu-bg rounded-[2.5rem] p-8 shadow-neu-flat relative overflow-hidden transition-all duration-300 z-10 border border-white/40">
	          <div className="relative z-10 flex justify-between items-center mb-10">
	            <div>
	              <div className="text-sm text-[#6B7280] font-medium mb-1.5 opacity-80">作业编号：</div>
	              <span className="text-xl font-bold text-[#1F2937] tracking-wider pl-1">{displayId}</span>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-[10px] font-bold tracking-widest text-red-500 uppercase">
                    归属：{ownedByName}
                  </span>
                  {Boolean(effectiveSubmissionId && moveTargets.length) && (
                    <button
                      type="button"
                      onClick={() => setMoveOpen(true)}
                      className="px-3 py-1.5 rounded-full bg-[#EFEEEE] shadow-[4px_4px_8px_#D1D1D1,-4px_-4px_8px_#FFFFFF] text-[10px] font-bold tracking-widest text-[#6B7280] active:shadow-[inset_6px_6px_12px_#D1D1D1,-6px_-6px_12px_#FFFFFF] active:scale-95 transition-all"
                    >
                      移动到其他孩子
                    </button>
                  )}
                </div>
	            </div>
		            <div className="h-20 w-20 rounded-full bg-[#EFEEEE] flex items-center justify-center">
		              <span className="text-3xl font-bold text-[#1F2937]">
		                {loading ? '--' : accuracyPercent === null ? '--' : `${accuracyPercent}%`}
		              </span>
	            </div>
	          </div>
          <div className="grid grid-cols-3 gap-6 pt-2">
            <div className="flex flex-col items-center group gap-3">
              <div className="h-14 w-14 rounded-full bg-[#EFEEEE] shadow-[4px_4px_8px_#D1D1D1,-4px_-4px_8px_#FFFFFF] flex items-center justify-center text-gray-400 border border-white/30">
                <span className="material-symbols-outlined text-2xl">check_circle</span>
              </div>
              <div className="text-lg font-bold text-[#1F2937] opacity-90">{counts.correct}</div>
            </div>
            <div className="flex flex-col items-center group gap-3">
              <div className="h-14 w-14 rounded-full bg-[#EFEEEE] shadow-[4px_4px_8px_#D1D1D1,-4px_-4px_8px_#FFFFFF] flex items-center justify-center text-gray-400 border border-white/30">
                <span className="material-symbols-outlined text-2xl">cancel</span>
              </div>
              <div className="text-lg font-bold text-[#1F2937] opacity-90">{counts.wrong}</div>
            </div>
            <div className="flex flex-col items-center group gap-3">
              <div className="h-14 w-14 rounded-full bg-[#EFEEEE] shadow-[4px_4px_8px_#D1D1D1,-4px_-4px_8px_#FFFFFF] flex items-center justify-center text-gray-400 border border-white/30">
                <span className="material-symbols-outlined text-2xl">warning</span>
              </div>
              <div className="text-lg font-bold text-[#1F2937] opacity-90">{counts.uncertain}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="flex-1 flex flex-col min-h-0 relative">
        <div className="px-4 sm:px-6 mb-4 flex justify-between items-center">
          <h3 className="font-bold text-xl text-[#1F2937] pl-2 opacity-90">错题详情</h3>
        </div>

        <div className="px-4 sm:px-6 mb-4 flex gap-2">
          {FILTERS.map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'px-4 py-2 rounded-full text-[10px] font-bold tracking-widest transition-all',
                filter === key
                  ? 'bg-[#EFEEEE] shadow-[4px_4px_8px_#D1D1D1,-4px_-4px_8px_#FFFFFF] text-[#1F2937]'
                  : 'text-[#9CA3AF]'
              )}
            >
              {key === 'wrong' && '错题'}
              {key === 'uncertain' && '待定'}
              {key === 'correct' && '正确'}
              {key === 'all' && '全部'}
            </button>
          ))}
        </div>

        {submissionError && (
          <div className="px-4 sm:px-6 mb-4">
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {submissionError}
            </div>
          </div>
        )}

		        <div className="flex-1 px-4 sm:px-6 pb-2 h-full z-10 w-full min-w-0">
		          <ResultPresentation
		            presentation={presentation}
		            filter={filter}
		            onOpenQuestion={handleOpenQuestion}
		            onAskAI={handleAskAI}
		            loading={loading}
		            layout="carousel"
		          />
		        </div>
      </section>

      <HomeFab to="/" avoidContentOverlap />

      {moveOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-[#EFEEEE]/60 backdrop-blur-[6px]" onClick={() => setMoveOpen(false)} />
          <div className="relative w-full max-w-[360px] bg-[#EFEEEE] rounded-[32px] shadow-[20px_20px_40px_#D1D1D1,-20px_-20px_40px_#FFFFFF] p-6 border border-white/40">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-bold tracking-widest text-[#6B7280] uppercase">选择目标孩子</div>
              <button
                type="button"
                onClick={() => setMoveOpen(false)}
                className="w-10 h-10 rounded-full bg-[#EFEEEE] shadow-[4px_4px_8px_#D1D1D1,-4px_-4px_8px_#FFFFFF] flex items-center justify-center text-[#6B7280] active:shadow-[inset_6px_6px_12px_#D1D1D1,-6px_-6px_12px_#FFFFFF]"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="space-y-3">
              {moveTargets.map((p) => (
                <button
                  key={p.profile_id}
                  type="button"
                  disabled={movingToProfileId === p.profile_id}
                  onClick={() => handleMoveSubmission(p.profile_id)}
                  className={cn(
                    'w-full px-5 py-4 rounded-2xl bg-[#EFEEEE] shadow-[6px_6px_12px_#D1D1D1,-6px_-6px_12px_#FFFFFF] flex items-center justify-between active:shadow-[inset_6px_6px_12px_#D1D1D1,-6px_-6px_12px_#FFFFFF] active:scale-[0.99] transition-all border border-white/40',
                    movingToProfileId === p.profile_id && 'opacity-60'
                  )}
                >
                  <span className="text-sm font-bold text-[#1F2937]">{p.display_name}</span>
                  {movingToProfileId === p.profile_id ? (
                    <span className="text-[10px] font-bold tracking-widest text-[#9CA3AF] uppercase">MOVING…</span>
                  ) : (
                    <span className="material-symbols-outlined text-[#6B7280]">chevron_right</span>
                  )}
                </button>
              ))}
              {!moveTargets.length && (
                <div className="text-sm text-[#9CA3AF] text-center py-6">暂无可移动目标</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultSummary;
