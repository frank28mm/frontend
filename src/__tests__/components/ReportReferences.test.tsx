import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantHost } from '@/components/assistant/AssistantHost';
import { assistantService } from '@/services/assistant';
import { ReportReferences } from '@/components/assistant/ReportReferences';

const state = vi.hoisted(() => ({ messages: [] as unknown[], conversations: [], pending: false, archived: false, error: '', beforeSequence: 0 }));
vi.mock('@/hooks/useAssistant', () => ({ useAssistant: () => state }));
const item = (report_id = 'r1', extra = {}) => ({ report_id, title: `报告 ${report_id}`, subject: 'math', created_at: '2026-10-10T10:00:00Z', href: `/report/${report_id}`, ...extra });
const page = (items = [item()], extra = {}) => ({ items, total: 3, filter_basis: 'generated_at' as const, next_cursor: 'scope-cursor', ...extra });
function message(initial = page(), turnId: string | undefined = 'historical-turn') {
  return { message_id: 'old-message', turn_id: turnId, sequence: 1, role: 'assistant', blocks: [{ type: 'report_references', report_references: initial, report_scope: { profile_id: 'child', from_date: '2026-10-01', through_date: '2026-10-11' } }] };
}
function mount() {
  const view = render(<MemoryRouter><AssistantHost /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: '知之' }));
  return view;
}

describe('existing report references in historical messages', () => {
  it.each([undefined, '孩子/?', '', ' child ', 'x\u0000'])('validates optional explicit profile %s without global fallback', profileId => {
    render(<MemoryRouter><ReportReferences initial={page()} profileId={profileId} onNavigate={() => {}} /></MemoryRouter>);
    if (profileId === undefined || profileId === '孩子/?') expect(screen.getByRole('link')).toHaveAttribute('href', `/report/r1${profileId === undefined ? '' : `?profileId=${encodeURIComponent(profileId)}`}`);
    else expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  let token: string;
  beforeEach(() => {
    token = 'account-a';
    vi.stubGlobal('localStorage', { getItem: () => token });
    vi.stubEnv('VITE_ASSISTANT_ENABLED', 'true');
    state.messages = [message()];
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('pages through the original message turn, dedupes IDs and stops at the end', async () => {
    const reports = vi.spyOn(assistantService, 'reports').mockResolvedValue(page([item(), item('r2')], { next_cursor: undefined }));
    mount();
    fireEvent.click(screen.getByRole('button', { name: '查看更多报告' }));
    await waitFor(() => expect(screen.getByRole('link', { name: /报告 r2/ })).toBeInTheDocument());
    expect(reports).toHaveBeenCalledWith('historical-turn', 'scope-cursor', 12, expect.any(AbortSignal));
    expect(screen.getAllByRole('link', { name: /报告 r1/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '查看更多报告' })).not.toBeInTheDocument();
  });

  it('shows generation and covered dates separately with the clipped title marker', () => {
    state.messages = [message(page([item('r1', { title: '阶段总结', title_truncated: true, period_from: '2026-09-01', period_to: '2026-09-30' })]))];
    mount();
    expect(screen.getByText(/标题已截断/)).toBeInTheDocument();
    expect(screen.getByText('2026-10-10T10:00:00Z').closest('p')).toHaveTextContent('生成时间：2026-10-10T10:00:00Z');
    expect(screen.getByText('2026-09-01').closest('p')).toHaveTextContent('覆盖日期：2026-09-01 至 2026-09-30');
    expect(screen.getByText(/共 3 份报告/)).toBeInTheDocument();
  });

  it.each([
    'https://example.com/report/r1', '//example.com/report/r1', '/report/r1?x=1', '/report/r1#x',
    '/report/r2', '/report/r1/extra', '/report/%72%31', '/report/../r1', undefined,
  ])('does not link unsafe or non-exact href %s', href => {
    state.messages = [message(page([item('r1', { href })]))];
    mount();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('报告暂不可跳转')).toBeInTheDocument();
  });

  it('honors navigation unavailable even with a valid href', () => {
    state.messages = [message(page([item('r1', { navigation_unavailable: true })]))];
    mount();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it.each([
    ['legacy:1', '/report/legacy:1'],
    ['legacy@$&+=', '/report/legacy@$&+='],
    ["legacy!'()*", '/report/legacy%21%27%28%29%2A'],
    ['报告 ,;?#%', '/report/%E6%8A%A5%E5%91%8A%20%2C%3B%3F%23%25'],
  ])('accepts the Go PathEscape canonical href for %s', (reportId, href) => {
    state.messages = [message(page([item(reportId, { href })]))];
    mount();
    expect(screen.getByRole('link')).toHaveAttribute('href', `${href}?profileId=child`);
  });

  it.each([
    ['legacy:1', '/report/legacy%3A1'],
    ["legacy!'()*", "/report/legacy!'()*"],
    ['a/b', '/report/a%2Fb'],
    ['a\\b', '/report/a%5Cb'],
    ['..', '/report/..'],
    ['.', '/report/.'],
    ['a\nb', '/report/a%0Ab'],
    ['a\u0000b', '/report/a%00b'],
    ['a\u007fb', '/report/a%7Fb'],
    ['r1', `${window.location.origin}/report/r1`],
  ])('rejects noncanonical or unsafe decoded report segment %s', (reportId, href) => {
    state.messages = [message(page([item(reportId, { href })]))];
    mount();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('preserves empty-ID rows across pages with stable keys while deduping only known IDs', async () => {
    const unavailable = () => item('', { title: 'Unavailable legacy report', href: undefined, navigation_unavailable: true });
    state.messages = [message(page([item('r1'), unavailable(), unavailable(), item('r1')], { total: 6 }))];
    vi.spyOn(assistantService, 'reports').mockResolvedValue(page([item('r1', { title: 'Updated known report' }), unavailable(), item('r2')], { total: 6, next_cursor: undefined }));
    const errors = vi.spyOn(console, 'error');
    mount();
    const originalRows = screen.getAllByText('Unavailable legacy report').map(title => title.closest('li'));
    expect(originalRows).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /报告 r1/ })).toHaveLength(1);
    const knownRow = screen.getByRole('link', { name: /报告 r1/ }).closest('li');
    fireEvent.click(screen.getByRole('button', { name: '查看更多报告' }));
    await waitFor(() => expect(screen.getByRole('link', { name: /报告 r2/ })).toBeInTheDocument());
    const updatedRows = screen.getAllByText('Unavailable legacy report').map(title => title.closest('li'));
    expect(updatedRows).toHaveLength(3);
    expect(updatedRows[0]).toBe(originalRows[0]);
    expect(updatedRows[1]).toBe(originalRows[1]);
    expect(screen.getByRole('link', { name: 'Updated known report' }).closest('li')).toBe(knownRow);
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(errors).not.toHaveBeenCalled();
  });

  it('disables paging without an original turn', () => {
    state.messages = [message(page(), '')];
    mount();
    expect(screen.getByRole('button', { name: '查看更多报告' })).toBeDisabled();
  });

  it('bounds concurrent loads, shows an error and retries the same cursor', async () => {
    let reject!: (error: Error) => void;
    const reports = vi.spyOn(assistantService, 'reports').mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; })).mockResolvedValueOnce(page([item('r2')], { next_cursor: undefined }));
    mount();
    fireEvent.click(screen.getByRole('button', { name: '查看更多报告' }));
    expect(screen.getByRole('button', { name: '加载中' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '加载中' }));
    expect(reports).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error('offline')));
    expect(screen.getByRole('alert')).toHaveTextContent('报告列表暂时无法加载');
    fireEvent.click(screen.getByRole('button', { name: '重试加载报告' }));
    await waitFor(() => expect(screen.getByRole('link', { name: /报告 r2/ })).toBeInTheDocument());
    expect(reports.mock.calls.map(call => call.slice(0, 3))).toEqual(Array(2).fill(['historical-turn', 'scope-cursor', 12]));
  });

  it.each(['unmount', 'account change'] as const)('aborts paging on %s and ignores late results', async lifecycle => {
    let resolve!: (value: ReturnType<typeof page>) => void;
    const reports = vi.spyOn(assistantService, 'reports').mockImplementation(() => new Promise(done => { resolve = done; }));
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: '查看更多报告' }));
    const signal = reports.mock.calls[0][3]!;
    if (lifecycle === 'unmount') view.unmount();
    else {
      token = 'account-b';
      act(() => { window.dispatchEvent(new Event('auth:changed')); });
      fireEvent.click(screen.getByRole('button', { name: '知之' }));
    }
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(page([item('late')])));
    expect(screen.queryByText('报告 late')).not.toBeInTheDocument();
  });

  it('closes the assistant when navigating to an exact report path', () => {
    mount();
    const link = screen.getByRole('link', { name: /报告 r1/ });
    expect(link).toHaveAttribute('href', '/report/r1?profileId=child');
    fireEvent.click(link);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
