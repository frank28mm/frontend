import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import ReportDetail from '@/pages/ReportDetail';
import { parentReportFixture } from './parentReportFixture';

const mocks = vi.hoisted(() => ({ get: vi.fn(), profile: { activeProfileId: 'child-a', loading: false } }));
vi.mock('@/services/api', () => ({ apiClient: { get: mocks.get } }));
vi.mock('@/contexts/ProfileContext', () => ({ useProfile: () => mocks.profile }));
vi.mock('@/hooks/useSubjectCapabilities', () => ({ useSubjectCapabilities: () => ({ loading: false, isReadEnabled: () => true }) }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
const deferred = () => {
  let resolve!: (value: unknown) => void;
  let reject!: (value: unknown) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const response = (subject = 'math') => ({ data: { title: '家长报告', params: { subject }, stats: { parent_report: parentReportFixture(subject) } } });
const RouteSwitch = () => { const go = useNavigate(); return <button onClick={() => go('/report/next')}>切换报告</button>; };
const QuestionProbe = () => { const location = useLocation(); return <pre data-testid="question-route">{JSON.stringify({ path: location.pathname, query: location.search, state: location.state })}</pre>; };
const Page = ({ url = '/report/report-a' }: { url?: string }) => <MemoryRouter initialEntries={[url]}><RouteSwitch /><Routes><Route path="/report/:id" element={<ReportDetail />} /><Route path="/question/:id" element={<QuestionProbe />} /></Routes></MemoryRouter>;
const renderPage = (url = '/report/report-a') => render(<Page url={url} />);
beforeEach(() => {
  vi.resetAllMocks();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  localStorage.setItem('user_id', 'account-a');
  localStorage.setItem('access_token', 'token-a');
  localStorage.setItem('active_profile_id', 'child-a');
  mocks.profile = { activeProfileId: 'child-a', loading: false };
  mocks.get.mockResolvedValue(response());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('parent report detail', () => {
  it.each([['math', '数学'], ['english', '英语'], ['physics', '物理'], ['chemistry', '化学']])('renders %s shared facts and dedicated module without legacy grades', async (subject, label) => {
    mocks.get.mockResolvedValue(response(subject));
    renderPage();
    expect(await screen.findByRole('heading', { name: `${label}学科观察` })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '作业分布' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '可选建议' })).toBeInTheDocument();
    expect(screen.queryByText('薄弱知识点 TOP 3')).not.toBeInTheDocument();
    expect(screen.queryByText('行动建议')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('parent-errors')).queryByText(/图像风险/)).not.toBeInTheDocument();
    expect(screen.getByTestId('parent-quality')).toHaveTextContent('图像风险 1');
    fireEvent.click(screen.getByText(/知识领域/, { selector: 'summary' }));
    expect(screen.getByText(/单元知识/, { selector: 'summary' })).toBeVisible();
    fireEvent.click(screen.getByText(/单元知识/, { selector: 'summary' }));
    expect(screen.getByText(/细分知识/, { selector: 'summary' })).toBeVisible();
    expect(screen.getAllByRole('link', { name: /原题 2/ })[0]).toHaveAttribute('href', '/question/item%2F%25%3F%23?submissionId=sub%2F%3F%25%23&back=%2Freport%2Freport-a');
  });

  it.each(['unknown', 'malformed', 'subject', 'dangling'])('fails closed for %s parent payload', async mode => {
    const value = response();
    if (mode === 'unknown') value.data.stats.parent_report.contract_version = 'parent_report.v2';
    if (mode === 'malformed') value.data.stats.parent_report.overall.correct = Infinity;
    if (mode === 'subject') value.data.stats.parent_report.subject_detail.subject = 'english';
    if (mode === 'dangling') value.data.stats.parent_report.primary_suggestion.evidence_ids = ['missing'];
    mocks.get.mockResolvedValue(value);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('暂不支持此报告数据');
    expect(screen.queryByText('薄弱知识点 TOP 3')).not.toBeInTheDocument();
  });

  it('retains versionless legacy reports', async () => {
    mocks.get.mockResolvedValue({ data: { params: { subject: 'math' }, stats: { overall: { accuracy: 0.5, correct: 1 } } } });
    renderPage();
    expect(await screen.findByText('薄弱知识点 TOP 3')).toBeInTheDocument();
  });
  it('does not evaluate poisoned legacy stats for an unsupported parent payload', async () => {
    const value = response();
    value.data.stats.parent_report.contract_version = 'future';
    mocks.get.mockResolvedValue({ data: { ...value.data, stats: { ...value.data.stats, trends: { points: 'invalid-array' }, knowledge_mastery: { rows: {} } } } });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('暂不支持此报告数据');
  });
  it('discloses missing original-question evidence for every focused conclusion', async () => {
    const value = response();
    for (const conclusion of [...value.data.stats.parent_report.parent_summary.strengths, ...value.data.stats.parent_report.parent_summary.concerns, value.data.stats.parent_report.primary_suggestion]) conclusion.evidence_ids = [];
    mocks.get.mockResolvedValue(value);
    renderPage();
    await screen.findByTestId('parent-report');
    expect(screen.getAllByText('缺少可靠原题引用，仅可作为汇总观察。')).toHaveLength(3);
  });

  it('navigates evidence with encoded canonical IDs, subject and report return context', async () => {
    renderPage('/report/report-a?reportId=report-a');
    await screen.findByTestId('parent-report');
    fireEvent.click(screen.getAllByRole('link', { name: '原题 2' })[0]);
    const route = JSON.parse(screen.getByTestId('question-route').textContent!);
    expect(route.path).toBe('/question/item%2F%25%3F%23');
    const query = new URLSearchParams(route.query);
    expect(query.get('submissionId')).toBe('sub/?%#');
    expect(query.get('back')).toBe('/report/report-a?reportId=report-a');
    expect(route.state).toEqual({ subject: 'math', submissionId: 'sub/?%#', backTo: '/report/report-a?reportId=report-a' });
  });

  it.each(['account', 'profile', 'loading'])('clears an already visible report synchronously on %s change', async boundary => {
    const page = renderPage();
    await screen.findByTestId('parent-report');
    const next = deferred();
    mocks.get.mockReturnValue(next.promise);
    act(() => {
      if (boundary === 'account') {
        localStorage.setItem('user_id', 'account-b');
        localStorage.setItem('access_token', 'token-b');
        window.dispatchEvent(new Event('auth:changed'));
      } else {
        mocks.profile = { activeProfileId: boundary === 'profile' ? 'child-b' : 'child-a', loading: boundary === 'loading' };
        if (boundary === 'profile') localStorage.setItem('active_profile_id', 'child-b');
        page.rerender(<Page />);
      }
    });
    expect(screen.queryByTestId('parent-report')).not.toBeInTheDocument();
    if (boundary === 'loading') expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it.each(['route', 'account', 'profile'])('never reschedules a stale poll catch after %s changes', async boundary => {
    vi.useFakeTimers();
    const work = deferred();
    mocks.get.mockReturnValueOnce(work.promise).mockReturnValue(new Promise(() => {}));
    const page = renderPage('/report/placeholder?jobId=job%2F%3F');
    expect(mocks.get.mock.calls[0][0]).toBe('/reports/jobs/job%2F%3F');
    act(() => {
      if (boundary === 'route') fireEvent.click(screen.getByText('切换报告'));
      else if (boundary === 'account') {
        localStorage.setItem('user_id', 'account-b');
        localStorage.setItem('access_token', 'token-b');
        window.dispatchEvent(new Event('auth:changed'));
      } else {
        mocks.profile = { activeProfileId: 'child-b', loading: false };
        localStorage.setItem('active_profile_id', 'child-b');
        page.rerender(<Page url="/report/placeholder?jobId=job%2F%3F" />);
      }
    });
    const before = mocks.get.mock.calls.length;
    await act(async () => { work.reject(new Error('stale')); vi.advanceTimersByTime(10000); });
    expect(mocks.get).toHaveBeenCalledTimes(before);
  });

  it.each(['route', 'account', 'profile', 'logout', 'unmount'])('fences late report after %s changes', async boundary => {
    const work = deferred();
    mocks.get.mockReturnValueOnce(work.promise).mockResolvedValue({ data: { title: 'new', stats: {} } });
    const page = renderPage();
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));
    act(() => {
      if (boundary === 'route') fireEvent.click(screen.getByText('切换报告'));
      else if (boundary === 'unmount') page.unmount();
      else if (boundary === 'profile') {
        mocks.profile = { activeProfileId: 'child-b', loading: false };
        localStorage.setItem('active_profile_id', 'child-b');
        page.rerender(<Page />);
      } else {
        localStorage.setItem('user_id', boundary === 'logout' ? '' : 'account-b');
        localStorage.setItem('access_token', boundary === 'logout' ? '' : 'token-b');
        window.dispatchEvent(new Event('auth:changed'));
      }
    });
    await act(async () => { work.resolve({ data: { stats: {}, content: 'PRIVATE OLD REPORT' } }); });
    expect(screen.queryByText(/PRIVATE OLD REPORT/)).not.toBeInTheDocument();
    if (boundary === 'route') expect(mocks.get.mock.calls.at(-1)?.[0]).toBe('/reports/next');
  });

  it('never reschedules polling from a stale rejected request after unmount', async () => {
    vi.useFakeTimers();
    const work = deferred();
    mocks.get.mockReturnValue(work.promise);
    const page = renderPage('/report/placeholder?jobId=job%2F%3F');
    const before = mocks.get.mock.calls.length;
    page.unmount();
    await act(async () => { work.reject(new Error('late poll failure')); });
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(mocks.get).toHaveBeenCalledTimes(before);
  });
});
