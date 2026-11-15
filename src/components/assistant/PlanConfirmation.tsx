import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MathText } from '@/components/ui/MathText';
import type { ConfirmationOverlay } from '@/hooks/useAssistant';
import { isPlanConfirmation, planConfirmationService, validatePlanConfirmation, type PlanConfirmation as Proposal, type PlanJob } from '@/services/assistantPlanConfirmation';

const subjects = { math: '数学', english: '英语', physics: '物理', chemistry: '化学' };
const identity = () => { try { return `${localStorage.getItem('user_id') || ''}\n${localStorage.getItem('access_token') || ''}`; } catch { return ''; } };
type Props = { proposal: Proposal; overlay?: ConfirmationOverlay; disabled: boolean; onExecute: (id: string) => void; onRefresh: (id: string) => void; onNavigate: () => void; canNavigate: () => boolean };

function PlanResult({ value, canNavigate, onNavigate }: { value: Proposal; canNavigate: () => boolean; onNavigate: () => void }) {
  const [owner] = useState(identity);
  const [result, setResult] = useState<{ job?: PlanJob; error?: string }>({});
  const [attempt, setAttempt] = useState(0);
  const [accountId, token] = owner.split('\n');
  const liveAccount = () => Boolean(accountId && token && owner === identity() && canNavigate());
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const live = () => !controller.signal.aborted && owner === identity();
    const poll = async () => {
      try {
        const job = await planConfirmationService.job(value, { accountId, token, isCurrent: live }, controller.signal);
        if (!live()) return;
        if (job.job_id !== value.job_id || job.plan_id !== value.plan_id || (job.status === 'done' && (!Number.isSafeInteger(job.version) || !job.version || job.version < 1))) throw new Error('INVALID_PLAN_JOB');
        setResult({ job });
        if (job.status === 'queued' || job.status === 'processing') timer = setTimeout(() => void poll(), 1500);
      } catch { if (live()) setResult({ error: '无法查询方案生成结果，请刷新状态。' }); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [accountId, token, owner, value, attempt]);
  const job = result.job;
  const href = job?.status === 'done' && liveAccount() ? `/plan/${encodeURIComponent(job.plan_id)}?profileId=${encodeURIComponent(value.preview.scope.profile_id)}&version=${job.version}` : undefined;
  return <>
    {href ? <Link className="inline-block text-primary py-2" to={href} onClick={event => { if (!liveAccount() || result.job !== job) { event.preventDefault(); return; } onNavigate(); }}>查看复习方案</Link>
      : result.error ? <><p role="alert" className="text-red-700">{result.error}</p><button type="button" disabled={!liveAccount()} className="text-primary py-2" onClick={() => setAttempt(v => v + 1)}>刷新方案状态</button></>
        : job?.status === 'failed' ? <p role="alert" className="text-red-700">方案生成未完成{job.error_code ? `（${job.error_code}）` : ''}</p>
          : <p role="status">{job?.status === 'queued' ? '方案已排队' : '正在生成复习方案'}</p>}
  </>;
}

export function PlanConfirmation({ proposal, overlay, disabled, onExecute, onRefresh, onNavigate, canNavigate }: Props) {
  const value = overlay && isPlanConfirmation(overlay.confirmation) ? overlay.confirmation : proposal;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const delay = Date.parse(value.expires_at) - Date.now();
    if (!Number.isFinite(delay)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(delay + 1, 2147483647)));
    return () => clearTimeout(timer);
  }, [value.expires_at]);
  if (!validatePlanConfirmation(value, { confirmation_id: proposal.confirmation_id, previous: proposal })) return <p className="text-neu-text-secondary">此确认已失效</p>;
  const phase = overlay?.phase || 'checking';
  const { preview } = value;
  const id = value.confirmation_id;
  const inactive = value.status === 'expired' || value.status === 'invalidated' || phase === 'invalid' && (value.status !== 'executed' || Boolean(overlay?.error)) || value.status === 'pending' && Date.parse(value.expires_at) <= now;
  const resultKey = JSON.stringify([id, value.conversation_id, value.turn_id, preview.scope.profile_id, value.job_id, value.plan_id]);
  return <div className="min-w-0 space-y-2 break-words">
    <p className="font-medium">{preview.child_name} · {subjects[preview.scope.subject]}复习方案</p>
    {preview.target_plan_id && <p className="text-xs text-neu-text-secondary">来源版本 {preview.base_version} · 更新原方案</p>}
    <p className="text-xs text-neu-text-secondary">{preview.scope.from_date} 至 {preview.scope.through_date}（上海日期）</p>
    <MathText text={preview.goal} className="text-sm whitespace-pre-wrap" />
    {preview.target_plan_id && value.status === 'pending' && <p className="text-xs text-neu-text-secondary">确认后将采集最新数据，生成原方案的新版本。</p>}
    {value.status === 'executed' && !inactive && overlay && !['checking', 'uncertain', 'executing'].includes(phase) ? <PlanResult key={resultKey} value={value} canNavigate={canNavigate} onNavigate={onNavigate} />
      : inactive ? <p className="text-neu-text-secondary">此确认已失效</p>
        : phase === 'executing' ? <p role="status">正在确认生成请求</p>
          : phase === 'checking' ? <p role="status">正在查询确认状态</p>
            : phase === 'uncertain' ? <button type="button" disabled={disabled} className="text-primary py-2" onClick={() => onRefresh(id)}>刷新确认状态</button>
              : <><button type="button" disabled={disabled || !preview.generation_available} className="text-primary py-2 disabled:opacity-40" onClick={() => onExecute(id)}>{phase === 'retryable' ? '重试同一确认' : preview.target_plan_id ? '确认更新复习方案' : '确认生成复习方案'}</button>{!preview.generation_available && <><p className="text-neu-text-secondary">方案生成暂不可用</p><button type="button" disabled={disabled} className="text-primary py-2" onClick={() => onRefresh(id)}>刷新确认状态</button></>}</>}
    {overlay?.error && <p role="alert" className="text-red-700">{overlay.error}</p>}
  </div>;
}
