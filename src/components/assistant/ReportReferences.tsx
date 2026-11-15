import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MathText } from '@/components/ui/MathText';
import { assistantService, type ReportReference, type ReportReferencePage } from '@/services/assistant';
import { validReportProfileId } from '@/services/reportNavigationScope';

// Go PathEscape leaves these reserved segment characters literal, unlike encodeURIComponent.
const reportPathEscape = (segment: string) => encodeURIComponent(segment)
  .replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
  .replace(/%(24|26|2B|3A|3D|40)/g, encoded => decodeURIComponent(encoded));

function safeReportReference(item: ReportReference): string | undefined {
  if (!item.report_id || item.navigation_unavailable || /[/\\]/.test(item.report_id) || item.report_id === '.' || item.report_id === '..') return;
  if (Array.from(item.report_id).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return;
  try {
    const path = `/report/${reportPathEscape(item.report_id)}`;
    if (item.href !== path) return;
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== path || url.search || url.hash) return;
    const segments = url.pathname.split('/');
    if (segments.length !== 3 || decodeURIComponent(segments[2]) !== item.report_id) return;
    return path;
  } catch { return; }
}

function uniqueReports(items: ReportReference[]): ReportReference[] {
  const result: ReportReference[] = [];
  const positions = new Map<string, number>();
  for (const item of items) {
    const position = item.report_id ? positions.get(item.report_id) : undefined;
    if (position !== undefined) result[position] = item;
    else {
      if (item.report_id) positions.set(item.report_id, result.length);
      result.push(item);
    }
  }
  return result;
}
const subjects: Record<string, string> = { math: '数学', english: '英语', physics: '物理', chemistry: '化学' };

export function ReportReferences({ initial, turnId, profileId, onNavigate }: { initial: ReportReferencePage; turnId?: string; profileId?: string; onNavigate: () => void }) {
  const [page, setPage] = useState(() => ({ ...initial, items: uniqueReports(initial.items) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);

  const more = async () => {
    if (!turnId || !page.next_cursor || request.current) return;
    const active = new AbortController();
    request.current = active;
    setBusy(true);
    setError('');
    try {
      const next = await assistantService.reports(turnId, page.next_cursor, 12, active.signal);
      if (active.signal.aborted) return;
      setPage(previous => ({ ...next, items: uniqueReports([...previous.items, ...next.items]) }));
    } catch {
      if (!active.signal.aborted) setError('报告列表暂时无法加载，请重试。');
    } finally {
      if (!active.signal.aborted) {
        request.current = null;
        setBusy(false);
      }
    }
  };

  return <div>
    <p className="text-xs text-neu-text-secondary">共 {page.total} 份报告 · 按生成时间筛选</p>
    {!page.items.length && <p className="py-3 text-neu-text-secondary">暂无报告</p>}
    <ul className="divide-y divide-neu-text/10">
      {page.items.map((item, index) => {
        const safeHref = safeReportReference(item);
        const href = safeHref && (profileId === undefined ? safeHref : validReportProfileId(profileId) ? `${safeHref}?profileId=${encodeURIComponent(profileId)}` : undefined);
        const title = <><MathText text={item.title} className="font-medium break-words" />{item.title_truncated && <span className="text-xs text-neu-text-secondary">（标题已截断）</span>}</>;
        // Merging only appends unknown identities, so their existing positions stay stable.
        return <li key={item.report_id ? `report:${item.report_id}` : `unavailable:${index}`} className="py-3 break-words">
          {href ? <Link to={href} onClick={onNavigate} className="block text-primary">{title}</Link> : <div>{title}<p className="text-xs text-neu-text-secondary">报告暂不可跳转</p></div>}
          <p className="mt-1 text-xs text-neu-text-secondary">{subjects[item.subject] ?? item.subject}</p>
          <p className="mt-1 text-xs text-neu-text-secondary">生成时间：<time dateTime={item.created_at}>{item.created_at}</time></p>
          <p className="mt-1 text-xs text-neu-text-secondary">覆盖日期：{item.period_from || item.period_to ? <><span>{item.period_from || '未注明'}</span> 至 <span>{item.period_to || '未注明'}</span></> : '未注明'}</p>
        </li>;
      })}
    </ul>
    {page.next_cursor && <button type="button" disabled={busy || !turnId} onClick={() => void more()} className="text-primary py-2 text-sm disabled:opacity-40">{busy ? '加载中' : error ? '重试加载报告' : '查看更多报告'}</button>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
