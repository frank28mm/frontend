import { Link } from 'react-router-dom';
import type { ReportConfirmation } from '@/services/assistant';
import type { ConfirmationOverlay } from '@/hooks/useAssistant';
import { validReportProfileId } from '@/services/reportNavigationScope';
import { MathText } from '@/components/ui/MathText';
import { isPlanConfirmation } from '@/services/assistantPlanConfirmation';

const subjects = { math: '数学', english: '英语', physics: '物理', chemistry: '化学' };
type Props = {
  proposal: ReportConfirmation;
  overlay?: ConfirmationOverlay;
  disabled: boolean;
  onExecute: (id: string) => void;
  onRefresh: (id: string) => void;
  onNavigate: () => void;
  canNavigate: () => boolean;
};
export function ActionConfirmation({ proposal, overlay, disabled, onExecute, onRefresh, onNavigate, canNavigate }: Props) {
  const value = overlay && !isPlanConfirmation(overlay.confirmation) ? overlay.confirmation : proposal;
  const phase = overlay?.phase || 'checking';
  const { preview } = value;
  const id = value.confirmation_id;
  const resultId = value.report_id || value.job_id;
  const href = value.status === 'executed' && resultId && validReportProfileId(preview.scope.profile_id)
    ? `/${value.report_id ? 'report' : 'report-generating'}/${encodeURIComponent(resultId)}?profileId=${encodeURIComponent(preview.scope.profile_id)}` : undefined;
  return <div className="min-w-0 space-y-2 break-words">
    <p className="font-medium">{preview.child_name} · {subjects[preview.scope.subject]}报告</p>
    <p className="text-xs text-neu-text-secondary">{preview.scope.from_date} 至 {preview.scope.through_date}（上海日期）</p>
    {preview.goal && <MathText text={preview.goal} className="text-sm whitespace-pre-wrap" />}
    <p>消耗 1 张报告券 · 0 BT</p>
    <p className="text-xs text-neu-text-secondary">提议时：{preview.eligibility.submission_count} 份作业，{preview.eligibility.distinct_days} 天；{preview.eligibility.eligible ? '样本满足条件' : '样本尚未满足条件'}，{preview.quota_available ? '报告券可用' : '报告券不足'}</p>
    {value.status === 'executed' ? href ? <Link className="inline-block text-primary py-2" to={href} onClick={event => { if (!canNavigate()) { event.preventDefault(); return; } onNavigate(); }}>{value.report_id ? '查看报告' : '查看报告生成进度'}</Link> : <p>报告暂不可跳转</p>
      : value.status === 'expired' || value.status === 'invalidated' || phase === 'invalid' ? <p className="text-neu-text-secondary">此确认已失效</p>
        : phase === 'executing' ? <p role="status">正在确认生成请求</p>
          : phase === 'checking' ? <p role="status">正在查询确认状态</p>
            : phase === 'uncertain' ? <button type="button" disabled={disabled} className="text-primary py-2" onClick={() => onRefresh(id)}>刷新确认状态</button>
              : <button type="button" disabled={disabled} className="text-primary py-2 disabled:opacity-40" onClick={() => onExecute(id)}>{phase === 'retryable' ? '重试同一确认' : '确认生成报告'}</button>}
    {overlay?.error && <p role="alert" className="text-red-700">{overlay.error}</p>}
  </div>;
}
