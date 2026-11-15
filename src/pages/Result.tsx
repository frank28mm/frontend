import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useJobPolling } from '@/hooks/useJobPolling';
import { cn } from '@/lib/utils';
import type { JobResponse, QuestionCard } from '@/services/types';
import { HomeFab } from '@/components/ui/HomeButton';
import { BackButton } from '@/components/ui/BackButton';
import { ResultPresentation } from '@/components/learning/ResultPresentation';
import { LiveGradingProgress } from '@/components/learning/LiveGradingProgress';
import type { QuestionNavFilter } from '@/utils/questionNavigation';
import { questionCardFromPresentation } from '@/utils/resultPresentation';
import { jobSubject, shouldUseLiveGradingProgress } from '@/utils/jobProgress';
import {
  buildQuestionPresentation,
  type PresentationQuestion,
} from '@/utils/questionPresentation';
import { useToast } from '@/components/ui/Toast';
import { isCapabilitySubject, subjectOption } from '@/config/subjects';
import { useSubjectCapabilities } from '@/hooks/useSubjectCapabilities';
import { hasBlockingPendingReview } from '@/utils/questionRelations';

const FILTERS = ['all', 'wrong', 'uncertain', 'correct'] as const;

type FilterKey = (typeof FILTERS)[number];

const Result: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const jobId = searchParams.get('jobId');
  const submissionIdFromUrl = searchParams.get('submissionId') || '';
  const [filter, setFilter] = useState<FilterKey>('all');
  const redirectRef = useRef(false);
  const capabilityRedirectRef = useRef(false);
  const { showToast } = useToast();
  const { loading: capabilitiesLoading, isReadEnabled } = useSubjectCapabilities();

  const { status, data, longRunning } = useJobPolling({
    jobId,
    enabled: !!jobId,
  });

  const jobData = data as JobResponse | null;
  const derivedSubmissionId = useMemo(() => {
    return (
      submissionIdFromUrl ||
      String(localStorage.getItem('active_job_submission_id') || '').trim() ||
      String(jobData?.request?.upload_id || '').trim()
    );
  }, [submissionIdFromUrl, jobData]);
  const questionCards = useMemo(() => (jobData?.question_cards || []) as QuestionCard[], [jobData?.question_cards]);
  const hasPendingReview = hasBlockingPendingReview(questionCards);
  const totalPages = jobData?.total_pages || Math.max(1, ...questionCards.map((c) => c.page_index + 1), 1);
  const donePages = jobData?.done_pages || 0;
  const jobResult = jobData?.result;
  const presentation = useMemo(
    () => jobResult
      ? buildQuestionPresentation(jobResult)
      : buildQuestionPresentation({ question_cards: questionCards }),
    [jobResult, questionCards],
  );
  const liveProgressEnabled = shouldUseLiveGradingProgress(jobData, ['math', 'physics', 'chemistry']);
  const resolvedJobSubject = jobSubject(jobData);
  const capabilitySubject = isCapabilitySubject(resolvedJobSubject) ? resolvedJobSubject : null;
  const subjectReadEnabled = capabilitySubject ? isReadEnabled(capabilitySubject) : true;
  const subjectGatePending = Boolean(capabilitySubject && capabilitiesLoading && !subjectReadEnabled);
  const subjectBlocked = Boolean(capabilitySubject && !capabilitiesLoading && !subjectReadEnabled);

  useEffect(() => {
    if (!jobId) {
      navigate('/', { replace: true });
      return;
    }
    localStorage.setItem('active_job_id', jobId);
    if (derivedSubmissionId) {
      localStorage.setItem('active_job_submission_id', derivedSubmissionId);
    }
    if (jobData?.status === 'done') {
      localStorage.setItem('active_job_status', 'done');
    }
  }, [jobId, jobData?.status, navigate, derivedSubmissionId]);

  useEffect(() => {
    if (!subjectBlocked || !capabilitySubject || capabilityRedirectRef.current) return;
    capabilityRedirectRef.current = true;
    showToast(`${subjectOption(capabilitySubject).label}入口已暂时关闭`, 'info');
    navigate('/', { replace: true });
  }, [capabilitySubject, navigate, showToast, subjectBlocked]);

  useEffect(() => {
    if (
      !subjectGatePending &&
      !subjectBlocked &&
      jobData?.status === 'done' &&
      !hasPendingReview &&
      !redirectRef.current
    ) {
      redirectRef.current = true;
      localStorage.setItem('active_job_status', 'done');
      navigate(`/result-summary?jobId=${jobId}${derivedSubmissionId ? `&submissionId=${derivedSubmissionId}` : ''}`, { replace: true });
    }
  }, [
    jobData?.status,
    hasPendingReview,
    jobId,
    navigate,
    derivedSubmissionId,
    subjectBlocked,
    subjectGatePending,
  ]);

  const handleOpenQuestion = (question: PresentationQuestion, itemIds: string[]) => {
    const card = questionCardFromPresentation(question);
    const query = derivedSubmissionId ? `?submissionId=${encodeURIComponent(derivedSubmissionId)}` : '';
    navigate(`/question/${encodeURIComponent(card.item_id)}${query}`, {
      state: {
        card,
        submissionId: derivedSubmissionId,
        questionNav: {
          filter: filter as QuestionNavFilter,
          itemIds,
        },
      },
    });
  };

  const handleAskAI = (question: PresentationQuestion) => {
    const card = questionCardFromPresentation(question);
    const subject = String((question as { subject?: string }).subject || '').trim().toLowerCase();
    const query = derivedSubmissionId ? `?submissionId=${encodeURIComponent(derivedSubmissionId)}` : '';
    navigate(`/ai-tutor/${encodeURIComponent(card.item_id)}${query}`, {
      state: { card, submissionId: derivedSubmissionId, ...(subject ? { subject } : {}) },
    });
  };

  const handleOpenLiveQuestion = (card: QuestionCard, itemIds: string[]) => {
    const query = derivedSubmissionId ? `?submissionId=${encodeURIComponent(derivedSubmissionId)}` : '';
    navigate(`/question/${encodeURIComponent(card.item_id)}${query}`, {
      state: {
        card,
        submissionId: derivedSubmissionId,
        questionNav: {
          filter: filter as QuestionNavFilter,
          itemIds,
        },
      },
    });
  };

  const handleAskAILiveQuestion = (card: QuestionCard) => {
    const query = derivedSubmissionId ? `?submissionId=${encodeURIComponent(derivedSubmissionId)}` : '';
    navigate(`/ai-tutor/${encodeURIComponent(card.item_id)}${query}`, {
      state: {
        card,
        submissionId: derivedSubmissionId,
        ...(resolvedJobSubject ? { subject: resolvedJobSubject } : {}),
      },
    });
  };

  if (!jobId || subjectGatePending || subjectBlocked) return null;

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col max-w-md mx-auto bg-neu-bg overflow-hidden pb-4">
      <header className="flex items-center px-6 py-6 justify-between sticky top-0 z-20 bg-neu-bg/90 backdrop-blur-md">
        <BackButton to="/" />
        <div className="flex flex-col items-center">
          <h2 className="text-lg font-bold text-gray-800 tracking-tight opacity-90">批改结果</h2>
          <span className="text-[10px] text-gray-400">{donePages}/{totalPages} 页完成</span>
        </div>
        <div className="h-10 w-10"></div>
      </header>

      <section className="px-6 pt-2 pb-4">
        <div className="bg-neu-bg rounded-[2.5rem] p-6 shadow-neu-flat relative overflow-hidden transition-all duration-300 z-10 border border-white/40">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500 font-medium mb-1.5 opacity-80">任务编号</div>
              <span className="text-lg font-bold text-gray-800 tracking-wider">#{jobId.slice(0, 6)}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs text-gray-400">{status === 'failed' ? '失败' : status === 'done' ? '完成' : '批改中'}</span>
              {longRunning && status !== 'failed' && (
                <span className="text-[10px] text-gray-400">仍在处理中</span>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-4 gap-2">
            {FILTERS.map((key) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  'py-2 rounded-full text-[10px] font-bold tracking-widest transition-all',
                  filter === key
                    ? 'bg-neu-bg shadow-neu-flat text-gray-700'
                    : 'text-gray-400 hover:text-gray-600'
                )}
              >
                {key === 'all' && '全部'}
                {key === 'wrong' && '错题'}
                {key === 'uncertain' && '待定'}
                {key === 'correct' && '正确'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {status !== 'done' && (
        <section className="px-6 pb-2">
          <div className="rounded-2xl bg-neu-bg shadow-neu-flat p-4 border border-white/40">
            <div className="text-[11px] text-gray-500 leading-relaxed text-center">
              无需等待，可点击下方 <span className="font-bold">HOME</span> 返回首页，稍后在「历史记录」查看批改进度。
              <div className="mt-1">
                当前为快速占位卡，题干可能仅为简要摘要（不含选项/图示）；批改完成后会自动补齐。
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="flex-1 overflow-y-auto px-6 pb-24">
        {liveProgressEnabled && jobData ? (
          <LiveGradingProgress
            job={jobData}
            filter={filter}
            onOpenQuestion={handleOpenLiveQuestion}
            onAskAI={handleAskAILiveQuestion}
          />
        ) : (
          <ResultPresentation
            presentation={presentation}
            filter={filter}
            onOpenQuestion={handleOpenQuestion}
            onAskAI={handleAskAI}
            loading={status !== 'done' && presentation.questions.length === 0}
          />
        )}
      </section>

      <HomeFab to="/" avoidContentOverlap />
    </div>
  );
};

export default Result;
