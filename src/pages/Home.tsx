import { PRODUCT_IDENTITY } from '@/content/productIdentity';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobPolling } from '@/hooks/useJobPolling';
import { apiClient } from '@/services/api';
import type { ProfileItem, ReportJob } from '@/services/types';
import { useProfile } from '@/contexts/ProfileContext';
import { useQuota } from '@/hooks/useQuota';
import { useFeedbackUnread } from '@/hooks/useFeedbackUnread';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { Menu } from 'lucide-react';
import { OPEN_ASSISTANT_HISTORY_EVENT } from '@/services/assistant';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { profiles, activeProfileId, activeProfile, setActiveProfile } = useProfile();
  const { quota } = useQuota();
  const { hasUnread } = useFeedbackUnread();
  const { showToast } = useToast();
  const [activeJobId, setActiveJobId] = useState<string | null>(() => localStorage.getItem('active_job_id'));
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(() =>
    localStorage.getItem('active_job_submission_id')
  );
  const [reportJobId, setReportJobId] = useState<string | null>(() => localStorage.getItem('active_report_job_id'));
  const [reportId, setReportId] = useState<string | null>(() => localStorage.getItem('active_report_id'));
  const [reportJob, setReportJob] = useState<ReportJob | null>(null);

  // Refs to track if we've already handled failed/cleared state
  const clearedJobIdRef = useRef<string | null>(null);

  const clearActiveJob = useCallback(() => {
    localStorage.removeItem('active_job_id');
    localStorage.removeItem('active_job_status');
    localStorage.removeItem('active_job_submission_id');
    setActiveJobId(null);
    setActiveSubmissionId(null);
  }, []);

  const handleJobPollingFail = useCallback(() => {
    clearActiveJob();
  }, [clearActiveJob]);

  const { status, data } = useJobPolling({
    jobId: activeJobId,
    enabled: Boolean(activeJobId),
    onFail: handleJobPollingFail,
  });

  const totalPages = data?.total_pages || 0;
  const donePages = data?.done_pages || 0;
  const isDone = status === 'done';
  const isFailed = status === 'failed';

  useEffect(() => {
    if (activeJobId && isFailed && clearedJobIdRef.current !== activeJobId) {
      clearedJobIdRef.current = activeJobId;
      clearActiveJob();
    }
  }, [activeJobId, isFailed, clearActiveJob]);

  useEffect(() => {
    if (!reportJobId) {
      if (reportJob !== null) {
        setReportJob(null);
      }
      return;
    }

    let timer: number | null = null;
    let active = true;

    const poll = async () => {
      try {
        const res = await apiClient.get<ReportJob>(`/reports/jobs/${reportJobId}`);
        if (!active) return;
        setReportJob(res.data);
        if (res.data.status === 'done' && res.data.report_id) {
          localStorage.setItem('active_report_id', res.data.report_id);
          localStorage.removeItem('active_report_job_id');
          setReportId(res.data.report_id);
          setReportJobId(null);
          setReportJob(null);
          return;
        }
        if (res.data.status === 'failed') {
          localStorage.removeItem('active_report_job_id');
          setReportJobId(null);
          setReportJob(null);
          return;
        }
        timer = window.setTimeout(poll, 2500);
      } catch (err) {
        console.error(err);
        timer = window.setTimeout(poll, 4000);
      }
    };

    poll();

    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportJobId]);

  return (
    <div className="relative flex h-[100dvh] w-full flex-col max-w-md mx-auto bg-neu-bg overflow-x-hidden overflow-y-auto">
      {/* Header */}
      <header className="flex items-center px-8 pt-[max(1.5rem,env(safe-area-inset-top))] pb-3 justify-between z-20 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="查看知之历史对话"
            title="查看知之历史对话"
            onClick={() => window.dispatchEvent(new Event(OPEN_ASSISTANT_HISTORY_EVENT))}
            className="h-10 w-10 shrink-0 rounded-full bg-neu-bg shadow-neu-circle flex items-center justify-center text-neu-text-secondary hover:text-primary active:shadow-neu-circle-pressed transition-all"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex flex-col gap-1 min-w-0">
            <h2 className="text-sm font-bold tracking-widest text-neu-text-secondary leading-none">{PRODUCT_IDENTITY.name}</h2>
            {quota && (
              <div className="text-[10px] font-bold tracking-widest text-neu-text-secondary/70 leading-none whitespace-nowrap">
                CP {quota.cp_left} · 报告券 {quota.report_coupons_left}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center">
          {(() => {
            const visibleProfiles = (profiles.length
              ? profiles
              : activeProfileId
                ? [{ profile_id: activeProfileId, display_name: '当前', avatar_url: null }]
                : []
            ).slice(0, 2);
            const selectedProfileId = activeProfileId || activeProfile?.profile_id || null;
            const lightColorClass = 'bg-emerald-500';

            const renderProfileButton = (p: ProfileItem, isActive: boolean) => (
              <button
                key={p.profile_id}
                type="button"
                onClick={async () => {
                  if (activeJobId) {
                    showToast('批改进行中，暂不切换孩子', 'warning');
                    return;
                  }
                  await setActiveProfile(p.profile_id);
                  showToast(`已切换到：${p.display_name || '默认'}`, 'success');
                }}
                className={cn(
                  'relative h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300 bg-neu-bg focus:outline-none',
                  isActive ? 'shadow-neu-circle-pressed opacity-90' : 'shadow-neu-circle'
                )}
                aria-label={`切换到${p.display_name || '默认'}`}
                title={p.display_name || '默认'}
              >
                <div className="h-8 w-8 rounded-full overflow-hidden flex items-center justify-center bg-neu-bg shadow-neu-pressed relative">
                  {p.avatar_url ? (
                    <img alt={p.display_name} className="h-full w-full object-cover opacity-90" src={p.avatar_url} />
                  ) : (
                    <span className="text-[11px] font-bold text-neu-text-secondary">
                      {(p.display_name || '默认').slice(0, 1)}
                    </span>
                  )}
                  <div
                    className={cn(
                      'absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full transition-opacity duration-200',
                      lightColorClass,
                      isActive ? 'opacity-100' : 'opacity-0'
                    )}
                    style={{
                      boxShadow:
                        '0 0 0 2px rgba(239,238,238,0.95), 0 0 12px rgba(16,185,129,0.55)',
                    }}
                  />
                </div>
              </button>
            );

            if (visibleProfiles.length <= 1) {
              const p = visibleProfiles[0];
              if (!p) return null;
              return renderProfileButton(p, true);
            }

            const [left, right] = visibleProfiles;
            const isLeftActive = Boolean(selectedProfileId && left?.profile_id === selectedProfileId);
            const isRightActive = Boolean(selectedProfileId && right?.profile_id === selectedProfileId);

            return (
              <div className="flex items-center gap-3" aria-label="孩子切换">
                {renderProfileButton(left, isLeftActive)}
                {renderProfileButton(right, isRightActive)}
              </div>
            );
          })()}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center relative px-6 pb-20 min-h-0">
        {/* Central Button Area */}
        {activeJobId ? (
          // Processing State
          <div className="relative w-[min(18rem,55vmin)] h-[min(18rem,55vmin)] rounded-full flex items-center justify-center mb-10 sm:mb-12 shrink-0">
            <div className="absolute inset-0 rounded-full bg-neu-bg shadow-neu-flat flex items-center justify-center">
              <div className="w-[82%] h-[82%] rounded-full bg-neu-bg shadow-neu-pressed flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 w-full h-full animate-spin-slow opacity-30 bg-gradient-to-tr from-primary/20 to-transparent rounded-full"></div>
                <button
                  onClick={() => {
                    if (isDone) {
                      navigate(`/result-summary?jobId=${activeJobId}&submissionId=${activeSubmissionId || ''}`);
                    } else {
                      navigate(`/result?jobId=${activeJobId}&submissionId=${activeSubmissionId || ''}`);
                    }
                  }}
                  className="group flex flex-col items-center justify-center z-10 w-full h-full rounded-full focus:outline-none"
                >
                  <span className="material-symbols-outlined text-primary text-[48px] animate-pulse">hourglass_top</span>
                  <div className="flex flex-col items-center mt-4">
                    <span className="text-sm font-bold text-gray-600 tracking-widest">{isDone ? '已完成' : '批改中'}</span>
                    <span className="text-[10px] text-gray-400 font-medium mt-1">
                      {isDone ? '点击查看' : `第 ${Math.max(donePages, 0)} / ${Math.max(totalPages, 0) || '--'} 页`}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : reportJobId || reportId ? (
          // Report Processing / Ready State
          <div className="relative w-[min(18rem,55vmin)] h-[min(18rem,55vmin)] rounded-full flex items-center justify-center mb-10 sm:mb-12 shrink-0">
            <div className="absolute inset-0 rounded-full bg-neu-bg shadow-neu-flat flex items-center justify-center">
              <div className="w-[82%] h-[82%] rounded-full bg-neu-bg shadow-neu-pressed flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 w-full h-full animate-spin-slow opacity-30 bg-gradient-to-tr from-primary/20 to-transparent rounded-full"></div>
                <button
                  onClick={() => {
                    if (reportJobId) {
                      navigate(`/report-generating/${reportJobId}`);
                      return;
                    }
                    if (reportId) {
                      localStorage.removeItem('active_report_id');
                      setReportId(null);
                      navigate(`/report/${reportId}`);
                    }
                  }}
                  className="group flex flex-col items-center justify-center z-10 w-full h-full rounded-full focus:outline-none"
                >
                  <span className="material-symbols-outlined text-primary text-[clamp(2rem,8vmin,3rem)] animate-pulse">
                    {reportJobId ? 'hourglass_top' : 'description'}
                  </span>
                  <div className="flex flex-col items-center mt-2">
                    <span className="text-sm font-bold text-gray-600 tracking-widest">学习报告</span>
                    <span className="text-[10px] text-gray-400 font-medium mt-1">
                      {reportJobId ? (reportJob?.status === 'failed' ? '生成失败' : '生成中') : '点击查看'}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : (
          // Default Scan State
          <div className="relative w-[min(18rem,55vmin)] h-[min(18rem,55vmin)] rounded-full flex items-center justify-center mb-10 sm:mb-12 shrink-0">
            <div className="absolute inset-0 rounded-full bg-neu-bg shadow-flow-ring flex items-center justify-center">
              <div className="w-[82%] h-[82%] rounded-full bg-neu-bg shadow-neu-inset flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute top-0 w-full h-full bg-gradient-to-tr from-transparent via-white/20 to-transparent pointer-events-none rounded-full"></div>
                <button
                  onClick={() => navigate('/scan')}
                  className="group flex flex-col items-center justify-center z-10 w-full h-full rounded-full focus:outline-none active:scale-95 transition-transform duration-200"
                >
                  <span
                    className="material-symbols-outlined text-neu-text !text-[clamp(2.5rem,10vmin,4rem)] mb-1 group-hover:text-primary transition-colors duration-300"
                    style={{ fontVariationSettings: "'FILL' 1, 'wght' 300" }}
                  >
                    photo_camera
                  </span>
                  <span className="text-xs font-bold tracking-widest text-neu-text-secondary mt-1 group-hover:text-primary transition-colors duration-300">
                    点击拍照
                  </span>
                </button>
              </div>
            </div>
            <div className="absolute inset-[8px] rounded-full border border-white/40 shadow-sm pointer-events-none"></div>
          </div>
        )}

        {/* Dashboard Grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 shrink-0 -translate-y-6 sm:-translate-y-8">
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => navigate('/history')}
              className="h-[4.5rem] w-[4.5rem] rounded-full bg-neu-bg shadow-neu-circle flex items-center justify-center text-neu-text-secondary hover:text-neu-text active:shadow-neu-circle-pressed active:text-primary active:scale-95 transition-all duration-200 group"
            >
              <span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform">history</span>
            </button>
            <span className="text-xs font-bold tracking-[0.18em] text-red-500">历史批改</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => navigate('/data')}
              className="h-[4.5rem] w-[4.5rem] rounded-full bg-neu-bg shadow-neu-circle flex items-center justify-center text-neu-text-secondary hover:text-neu-text active:shadow-neu-circle-pressed active:text-primary active:scale-95 transition-all duration-200 group"
            >
              <span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform">database</span>
            </button>
            <span className="text-xs font-bold tracking-[0.18em] text-red-500">数据中心</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => navigate('/analysis')}
              className="h-[4.5rem] w-[4.5rem] rounded-full bg-neu-bg shadow-neu-circle flex items-center justify-center text-neu-text-secondary hover:text-neu-text active:shadow-neu-circle-pressed active:text-primary active:scale-95 transition-all duration-200 group"
            >
              <span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform">bar_chart</span>
            </button>
            <span className="text-xs font-bold tracking-[0.18em] text-red-500">分析报告</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => navigate('/mine')}
              className="h-[4.5rem] w-[4.5rem] rounded-full bg-neu-bg shadow-neu-circle flex items-center justify-center text-neu-text-secondary hover:text-neu-text active:shadow-neu-circle-pressed active:text-primary active:scale-95 transition-all duration-200 group relative"
            >
              <span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform">person</span>
              {hasUnread && (
                <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-[#EFEEEE]" />
              )}
            </button>
            <span className="text-xs font-bold tracking-[0.18em] text-red-500">个人中心</span>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;
