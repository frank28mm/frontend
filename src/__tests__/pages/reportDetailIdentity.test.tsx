import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportReferences } from '@/components/assistant/ReportReferences';
import ReportDetail from '@/pages/ReportDetail';
import { apiClient } from '@/services/api';

vi.mock('@/hooks/useSubjectCapabilities', () => ({
  useSubjectCapabilities: () => ({ loading: false, isReadEnabled: () => true }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/ProfileContext', () => ({ useProfile: () => ({ activeProfileId: 'child-a', loading: false }) }));

describe('exact report identity through real router and detail transport', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let requests: string[];
  let stored: Map<string, string>;
  beforeEach(() => {
    requests = [];
    stored = new Map([['user_id', 'account-a'], ['access_token', 'token-a'], ['active_profile_id', 'child-a']]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) });
    apiClient.defaults.adapter = async config => {
      requests.push(config.url || '');
      return { data: { title: 'Identity report', params: { subject: 'math' }, stats: {}, content: '' }, status: 200, statusText: 'OK', headers: {}, config };
    };
  });
  afterEach(() => { cleanup(); apiClient.defaults.adapter = originalAdapter; vi.unstubAllGlobals(); });

  it.each([
    ['legacy?x', '/report/legacy%3Fx', '/reports/legacy%3Fx'],
    ['legacy#fragment', '/report/legacy%23fragment', '/reports/legacy%23fragment'],
    ['legacy%2F1', '/report/legacy%252F1', '/reports/legacy%252F1'],
    ['legacy%252F1', '/report/legacy%25252F1', '/reports/legacy%25252F1'],
    ['legacy:1', '/report/legacy:1', '/reports/legacy%3A1'],
    ['报告', '/report/%E6%8A%A5%E5%91%8A', '/reports/%E6%8A%A5%E5%91%8A'],
  ])('loads the exact linked report ID %s without reinterpreting delimiters', async (id, href, requestPath) => {
    render(<MemoryRouter initialEntries={['/']}><Routes>
      <Route path="/" element={<ReportReferences initial={{ items: [{ report_id: id, href, title: 'Open exact report', subject: 'math', created_at: '2026-10-10T10:00:00Z' }], total: 1, filter_basis: 'generated_at' }} onNavigate={() => undefined} />} />
      <Route path="/report/:id" element={<ReportDetail />} />
    </Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole('link', { name: 'Open exact report' }));
    await waitFor(() => expect(requests).toEqual([requestPath]));
    const url = new URL(requests[0], window.location.origin);
    expect(url.pathname.split('/')).toHaveLength(3);
    expect(decodeURIComponent(url.pathname.slice('/reports/'.length))).toBe(id);
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });

  it('preserves a once-decoded query reportId while encoding the request segment', async () => {
    render(<MemoryRouter initialEntries={['/report/placeholder?reportId=legacy%252F1%3F%23']}><Routes>
      <Route path="/report/:id" element={<ReportDetail />} />
    </Routes></MemoryRouter>);
    await waitFor(() => expect(requests).toEqual(['/reports/legacy%252F1%3F%23']));
  });

  it('cancels a stale quota error before shared response storage and redirect side effects', async () => {
    let reject!: (error: unknown) => void;
    const dispatched = vi.fn();
    apiClient.defaults.adapter = config => {
      dispatched();
      return new Promise<import('axios').AxiosResponse>((_yes, no) => { reject = no; }).catch(error => { throw Object.assign(error as object, { config }); });
    };
    const page = render(<MemoryRouter initialEntries={['/report/private']}><Routes><Route path="/report/:id" element={<ReportDetail />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(dispatched).toHaveBeenCalledTimes(1));
    // Storage can change before React observes the auth event. Transport fencing still applies.
    stored.set('user_id', 'account-b');
    stored.set('access_token', 'token-b');
    await act(async () => { reject({ response: { status: 402 } }); });
    expect(stored.has('last_quota_error')).toBe(false);
    expect(screen.queryByText(/private/)).not.toBeInTheDocument();
    page.unmount();
  });
});
