import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/services/api';
import ReportDetail from '@/pages/ReportDetail';
import ReportGenerating from '@/pages/ReportGenerating';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

const profile = vi.hoisted(() => ({ activeProfileId: 'child-a', loading: false }));
vi.mock('@/contexts/ProfileContext', () => ({ useProfile: () => profile }));
vi.mock('@/hooks/useSubjectCapabilities', () => ({ useSubjectCapabilities: () => ({ loading: false, isReadEnabled: () => true }) }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
const Location = () => { const location = useLocation(); return <p data-testid="location">{location.pathname}{location.search}</p>; };
const page = (path: string) => <MemoryRouter initialEntries={[path]}><Location /><Routes>
  <Route path="/report/:id" element={<ReportDetail />} />
  <Route path="/report-generating/:id" element={<ReportGenerating />} />
</Routes><Link to={`${path.split('?')[0]}?profileId=child-c`}>Change selected child</Link></MemoryRouter>;
const report = { title: 'Selected child report', params: { subject: 'math' }, stats: {}, content: 'Selected child report' };

describe('account assistant selected-child report navigation', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let stored: Map<string, string>;
  let requests: InternalAxiosRequestConfig[];
  beforeEach(() => {
    profile.activeProfileId = 'child-a';
    profile.loading = false;
    requests = [];
    stored = new Map([['user_id', 'owner'], ['access_token', 'token'], ['active_profile_id', 'child-a'], ['active_profile_user_id', 'owner'], ['active_report_id', 'default-report']]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) });
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      return { data: config.url?.includes('/jobs/') ? { status: 'done', report_id: 'selected-report' } : report, status: 200, statusText: 'OK', headers: {}, config };
    };
  });
  afterEach(() => { cleanup(); apiClient.defaults.adapter = originalAdapter; vi.unstubAllGlobals(); });

  it.each(['child-b', 'child%2Fname'])('loads the exact selected child %s independently of global profile', async child => {
    render(page(`/report/selected-report?profileId=${encodeURIComponent(child)}`));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].headers.get('X-Profile-Id')).toBe(child);
    expect(requests[0].headers.get('Authorization')).toBe('Bearer token');
    expect(stored.get('active_profile_id')).toBe('child-a');
  });

  it('preserves selected child through job completion and does not overwrite default shortcuts', async () => {
    render(page('/report-generating/job-b?profileId=child-b'));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests.map(config => config.headers.get('X-Profile-Id'))).toEqual(['child-b', 'child-b']);
    expect(screen.getByTestId('location')).toHaveTextContent('/report/selected-report?profileId=child-b');
    expect(stored.get('active_report_id')).toBe('default-report');
    expect(stored.has('active_report_job_id')).toBe(false);
    expect(stored.get('active_profile_id')).toBe('child-a');
  });

  it.each(['/report/selected-report', '/report-generating/job-b'])('does not depend on default child loading for %s', async route => {
    profile.loading = true;
    render(page(`${route}?profileId=child-b`));
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(requests.every(config => config.headers.get('X-Profile-Id') === 'child-b')).toBe(true);
  });

  it.each(['profileId=', 'profileId=child-b&profileId=child-c', 'profileId=%0D%0Achild-b', `profileId=${'a'.repeat(129)}`])('rejects malformed explicit selection without fallback: %s', async query => {
    for (const route of ['/report/selected-report', '/report-generating/job-b']) {
      const view = render(page(`${route}?${query}`));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(requests).toHaveLength(0);
      expect(screen.getByRole('alert')).toHaveTextContent('报告链接中的孩子信息无效');
      view.unmount();
    }
  });

  it('keeps the selected child during a default-profile change while a response is pending', async () => {
    let resolve!: (response: AxiosResponse) => void;
    apiClient.defaults.adapter = config => {
      requests.push(config);
      return new Promise<AxiosResponse>(done => { resolve = done; });
    };
    const view = render(page('/report/selected-report?profileId=child-b'));
    await waitFor(() => expect(requests).toHaveLength(1));
    profile.activeProfileId = 'child-c';
    stored.set('active_profile_id', 'child-c');
    view.rerender(page('/report/selected-report?profileId=child-b'));
    await act(async () => { resolve({ data: report, status: 200, statusText: 'OK', headers: {}, config: requests[0] }); });
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get('X-Profile-Id')).toBe('child-b');
    expect(screen.getAllByText(/Selected child report/).length).toBeGreaterThan(0);
  });

  it('does not restart selected-child job polling when the default profile starts loading', async () => {
    apiClient.defaults.adapter = config => {
      requests.push(config);
      return new Promise<AxiosResponse>(() => undefined);
    };
    const view = render(page('/report-generating/job-b?profileId=child-b'));
    await waitFor(() => expect(requests).toHaveLength(1));
    profile.loading = true;
    view.rerender(page('/report-generating/job-b?profileId=child-b'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(requests).toHaveLength(1);
  });

  it.each(['/report/selected-report', '/report-generating/job-b'])('fences late account errors on explicit route %s', async route => {
    let reject!: (error: unknown) => void;
    apiClient.defaults.adapter = config => {
      requests.push(config);
      return new Promise<AxiosResponse>((_yes, no) => { reject = no; });
    };
    render(page(`${route}?profileId=child-b`));
    await waitFor(() => expect(requests).toHaveLength(1));
    stored.set('user_id', 'new-owner');
    stored.set('access_token', 'new-token');
    await act(async () => { reject(new AxiosError('Old unauthorized response', undefined, requests[0], undefined, { data: {}, status: 401, statusText: 'Unauthorized', headers: {}, config: requests[0] })); });
    expect(stored.get('access_token')).toBe('new-token');
    expect(stored.get('user_id')).toBe('new-owner');
    expect(requests).toHaveLength(1);
  });

  it.each(['/report/selected-report', '/report-generating/job-b'])('discards late success after explicit query change on %s', async route => {
    const resolves: Array<(value: AxiosResponse) => void> = [];
    apiClient.defaults.adapter = config => {
      requests.push(config);
      return new Promise<AxiosResponse>(done => { resolves.push(done); });
    };
    render(page(`${route}?profileId=child-b`));
    await waitFor(() => expect(requests).toHaveLength(1));
    fireEvent.click(screen.getByRole('link', { name: 'Change selected child' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    await act(async () => { resolves[0]({ data: route.includes('generating') ? { status: 'done', report_id: 'old-report' } : report, status: 200, statusText: 'OK', headers: {}, config: requests[0] }); });
    expect(screen.getByTestId('location')).toHaveTextContent(`${route}?profileId=child-c`);
    expect(screen.queryByText(/Selected child report/)).not.toBeInTheDocument();
    expect(requests.map(request => request.headers.get('X-Profile-Id'))).toEqual(['child-b', 'child-c']);
    expect(stored.get('active_report_id')).toBe('default-report');
  });
});
