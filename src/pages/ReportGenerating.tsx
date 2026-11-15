import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CanceledError, getAdapter } from 'axios';
import { apiClient } from '@/services/api';
import { HomeFab } from '@/components/ui/HomeButton';
import { useProfile } from '@/contexts/ProfileContext';
import { reportNavigationScope } from '@/services/reportNavigationScope';

const jobRouteIdentity = (pathname: string) => {
  const match = /^\/report-generating\/([^/]+)\/?$/.exec(pathname);
  if (!match) return '';
  // Router params reinterpret literal %2F; decode the original segment once.
  try { return decodeURIComponent(match[1]); } catch { return ''; }
};

const readIdentity = () => {
  try {
    return {
      account: localStorage.getItem('user_id'),
      token: localStorage.getItem('access_token'),
      profile: localStorage.getItem('active_profile_id') || '',
      profileOwner: localStorage.getItem('active_profile_user_id'),
    };
  } catch { return null; }
};

const ReportGenerating: React.FC = () => {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const id = jobRouteIdentity(pathname);
  const { activeProfileId, loading } = useProfile();
  const selection = reportNavigationScope(search);
  const profile = selection.explicit ? selection.profile : activeProfileId || '';
  const waiting = !selection.explicit && loading;
  const routeKey = pathname + search;
  const [progress, setProgress] = useState(0);
  const routeScope = useRef<{ pathname: string; account: string; token: string; profile: string; invalidated: boolean } | null>(null);

  useEffect(() => {
    const identity = readIdentity();
    if (!id || !selection.valid || waiting || !identity?.account || !identity.token) return;
    const { account, token } = identity;
    // A context refresh must not restore this job under a new account or child.
    if (routeScope.current?.pathname === routeKey &&
      (routeScope.current.invalidated || routeScope.current.account !== account || routeScope.current.token !== token || routeScope.current.profile !== profile)) {
      routeScope.current.invalidated = true;
      return;
    }
    if (routeScope.current?.pathname !== routeKey) routeScope.current = { pathname: routeKey, account, token, profile, invalidated: false };
    const scope = routeScope.current;
    const controller = new AbortController();
    let active = true;
    const timers: { poll?: number; progress?: number } = {};
    const identityLive = () => {
      const current = readIdentity();
      return current !== null && current.account === account && current.token === token &&
        (selection.explicit || (current.profile === profile && (!current.profileOwner || current.profileOwner === account)));
    };
    const live = () => active && !scope.invalidated && !controller.signal.aborted && identityLive();
    const stop = () => {
      active = false;
      controller.abort();
      window.clearTimeout(timers.poll);
      window.clearInterval(timers.progress);
    };
    const invalidate = () => {
      if (active && !identityLive()) scope.invalidated = true;
      stop();
    };
    const onIdentityChange = () => { if (!live()) invalidate(); };
    if (!live()) return stop;
    window.addEventListener('auth:changed', onIdentityChange);
    window.addEventListener('storage', onIdentityChange);
    const adapter = getAdapter(apiClient.defaults.adapter);
    const removeActiveJob = () => {
      if (selection.explicit) return;
      try {
        if (localStorage.getItem('active_report_job_id') === id) localStorage.removeItem('active_report_job_id');
      } catch { /* Optional navigation shortcut. */ }
    };

    if (!selection.explicit) {
      try { localStorage.setItem('active_report_job_id', id); } catch { /* Optional navigation shortcut. */ }
    }

    const poll = async () => {
      if (!live()) { invalidate(); return; }
      try {
        const res = await apiClient.get<{ status: string; report_id?: string }>(`/reports/jobs/${encodeURIComponent(id)}`, {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, ...(profile ? { 'X-Profile-Id': profile } : {}) },
          adapter: async config => {
            if (!live()) throw new CanceledError('Report job identity changed');
            config.headers.set('Authorization', `Bearer ${token}`);
            if (profile) config.headers.set('X-Profile-Id', profile);
            else config.headers.delete('X-Profile-Id');
            try {
              const response = await adapter(config);
              if (!live()) throw new CanceledError('Report job identity changed');
              return response;
            } catch (error) {
              // Cancel stale errors before shared auth/quota response side effects.
              if (!live()) throw new CanceledError('Report job identity changed');
              throw error;
            }
          },
        });
        if (!live()) { invalidate(); return; }
        if (res.data.status === 'done' && res.data.report_id) {
          if (!selection.explicit) {
            try { localStorage.setItem('active_report_id', res.data.report_id); } catch { /* Optional navigation shortcut. */ }
          }
          removeActiveJob();
          setProgress(100);
          stop();
          const selectedChild = selection.explicit ? `?profileId=${encodeURIComponent(profile)}` : '';
          navigate(`/report/${encodeURIComponent(res.data.report_id)}${selectedChild}`, { replace: true });
          return;
        }
        if (res.data.status === 'failed') {
          removeActiveJob();
          stop();
          alert('报告生成失败');
          navigate('/analysis', { replace: true });
          return;
        }
        timers.poll = window.setTimeout(poll, 2000);
      } catch (err) {
        if (!live()) { invalidate(); return; }
        console.error(err);
        timers.poll = window.setTimeout(poll, 3000);
      }
    };

    poll();

    // Simulate progress (real progress is not provided by the API yet).
    timers.progress = window.setInterval(() => {
      if (!live()) { invalidate(); return; }
      setProgress((prev) => {
        if (prev >= 92) return prev;
        return prev + Math.random() * 10;
      });
    }, 500);

    return () => {
      stop();
      window.removeEventListener('auth:changed', onIdentityChange);
      window.removeEventListener('storage', onIdentityChange);
    };
  }, [id, routeKey, navigate, profile, waiting, selection.explicit, selection.valid]);

  if (!selection.valid) return <main className="min-h-screen max-w-md mx-auto bg-neu-bg px-6 pt-12 pb-32 text-neu-text">
    <p role="alert">报告链接中的孩子信息无效</p><HomeFab />
  </main>;

  return (
    <div className="bg-neu-bg font-display text-neu-text-main overflow-hidden min-h-[100dvh] w-full max-w-md mx-auto flex flex-col items-center pb-24">
      <div className="w-full flex items-center p-6 justify-center z-20 shrink-0 relative">
        <h2 className="text-neu-text-main text-lg font-bold tracking-tight text-center">生成分析报告</h2>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full px-6 relative z-10 max-w-md pb-12">
        <div className="relative w-full p-6 rounded-[40px] bg-neu-bg shadow-neu-deep flex flex-col items-center mb-8">
          <div className="w-full flex items-center justify-center gap-2 mb-6 px-2">
            <span className="material-symbols-outlined text-accent-yellow animate-pulse-slow">bolt</span>
            <span className="text-xs font-semibold text-neu-text-sub tracking-widest uppercase">AI Processing</span>
          </div>

          <div className="w-full max-w-[240px] flex flex-col items-center gap-2">
            <div className="w-full h-4 rounded-full bg-neu-bg shadow-neu-concave p-1 relative overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }}></div>
            </div>
            <span className="text-xl font-bold text-neu-text-main font-display mt-2">
              {Math.round(progress)}<span className="text-sm">%</span>
            </span>
          </div>

          <div className="text-center space-y-2 mt-8">
            <h2 className="text-neu-text-main text-2xl font-bold tracking-tight">
              正在生成报告...
            </h2>
            <p className="text-neu-text-sub text-sm font-medium">
              AI 正在分析您的学习数据
            </p>
          </div>
        </div>
      </div>

      <HomeFab to="/" />
    </div>
  );
};

export default ReportGenerating;
