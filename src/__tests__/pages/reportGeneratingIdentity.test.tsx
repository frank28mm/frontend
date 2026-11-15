import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReportGenerating from '@/pages/ReportGenerating';
import { apiClient } from '@/services/api';

const scope = vi.hoisted(() => ({ profile: 'child-a' as string | null, loading: false, navigate: vi.fn() }));
vi.mock('@/contexts/ProfileContext', () => ({ useProfile: () => ({ activeProfileId: scope.profile, loading: scope.loading }) }));
vi.mock('react-router-dom', async importOriginal => ({ ...await importOriginal<typeof import('react-router-dom')>(), useNavigate: () => scope.navigate }));

type Pending = { config: InternalAxiosRequestConfig; resolve: (response: AxiosResponse) => void; reject: (error: unknown) => void };
const flush = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };

describe('report generation frozen identity', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let stored: Map<string, string>;
  let pending: Pending[];
  let responseErrors: unknown[];
  let interceptor: number;
  beforeEach(() => {
    vi.useFakeTimers();
    scope.profile = 'child-a';
    scope.loading = false;
    scope.navigate.mockReset();
    stored = new Map([['user_id', 'account-a'], ['access_token', 'token-a'], ['active_profile_id', 'child-a'], ['active_profile_user_id', 'account-a']]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    });
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    pending = [];
    responseErrors = [];
    apiClient.defaults.adapter = config => new Promise<AxiosResponse>((resolve, reject) => { pending.push({ config, resolve, reject }); });
    interceptor = apiClient.interceptors.response.use(undefined, error => { responseErrors.push(error); return Promise.reject(error); });
  });
  afterEach(() => {
    cleanup();
    apiClient.defaults.adapter = originalAdapter;
    apiClient.interceptors.response.eject(interceptor);
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const page = (job = 'job-a') => <MemoryRouter initialEntries={[`/report-generating/${encodeURIComponent(job)}`]}>
    <Link to="/report-generating/job-b">Next job</Link>
    <Routes><Route path="/report-generating/:id" element={<ReportGenerating />} /></Routes>
  </MemoryRouter>;
  const complete = async (index: number, data: { status: string; report_id?: string }) => {
    const request = pending[index];
    request.resolve({ data, status: 200, statusText: 'OK', headers: {}, config: request.config });
    await flush();
  };
  const fail = async (index: number, status = 500) => {
    const request = pending[index];
    request.reject(new AxiosError('Failure', undefined, request.config, undefined, { data: {}, status, statusText: 'Failure', headers: {}, config: request.config }));
    await flush();
  };

  it.each(['job?query#hash', 'job%2F1', 'job%252F1', 'job/part', '报告'])('requests exactly the once-decoded job identity %s', async job => {
    render(page(job));
    await flush();
    expect(pending[0].config.url).toBe(`/reports/jobs/${encodeURIComponent(job)}`);
    expect(pending[0].config.headers.get('Authorization')).toBe('Bearer token-a');
    expect(pending[0].config.headers.get('X-Profile-Id')).toBe('child-a');
  });

  it('encodes the completed report link and updates only the live job', async () => {
    render(page());
    await flush();
    await complete(0, { status: 'done', report_id: 'report?x#y%2F1' });
    expect(scope.navigate).toHaveBeenCalledWith('/report/report%3Fx%23y%252F1', { replace: true });
    expect(stored.get('active_report_id')).toBe('report?x#y%2F1');
    expect(stored.has('active_report_job_id')).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(pending).toHaveLength(1);
  });

  it('does not dispatch under a changed token before adapter execution', async () => {
    render(page());
    stored.set('access_token', 'token-b');
    stored.set('user_id', 'account-b');
    await flush();
    expect(pending).toHaveLength(0);
    expect(scope.navigate).not.toHaveBeenCalled();
  });

  it.each([401, 402])('cancels stale %s before shared auth/quota effects and never retries', async status => {
    render(page());
    await flush();
    stored.set('access_token', 'token-b');
    stored.set('user_id', 'account-b');
    await fail(0, status);
    expect(responseErrors[0]).toMatchObject({ code: 'ERR_CANCELED' });
    expect(stored.get('access_token')).toBe('token-b');
    expect(stored.has('last_quota_error')).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(pending).toHaveLength(1);
    expect(scope.navigate).not.toHaveBeenCalled();
  });

  it.each(['account', 'logout', 'profile'])('ignores late completion after %s changes without waiting for React', async change => {
    render(page());
    await flush();
    if (change === 'account') { stored.set('user_id', 'account-b'); stored.set('access_token', 'token-b'); }
    if (change === 'logout') stored.delete('access_token');
    if (change === 'profile') stored.set('active_profile_id', 'child-b');
    stored.set('active_report_job_id', 'new-owner-job');
    await complete(0, { status: 'done', report_id: 'private-report' });
    expect(stored.has('active_report_id')).toBe(false);
    expect(stored.get('active_report_job_id')).toBe('new-owner-job');
    expect(scope.navigate).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(pending).toHaveLength(1);
  });

  it('ignores late success from a previous route', async () => {
    render(page());
    await flush();
    fireEvent.click(screen.getByRole('link', { name: 'Next job' }));
    await flush();
    expect(pending).toHaveLength(2);
    await complete(0, { status: 'done', report_id: 'old-report' });
    expect(scope.navigate).not.toHaveBeenCalled();
    expect(stored.get('active_report_job_id')).toBe('job-b');
    expect(stored.has('active_report_id')).toBe(false);
    await complete(1, { status: 'done', report_id: 'new-report' });
    expect(scope.navigate).toHaveBeenCalledWith('/report/new-report', { replace: true });
  });

  it('does not resurrect an old route poll from a late rejection', async () => {
    render(page());
    await flush();
    fireEvent.click(screen.getByRole('link', { name: 'Next job' }));
    await flush();
    await fail(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(pending).toHaveLength(2);
  });

  it.each(['success', 'failure'])('fences late %s after unmount including poll timers', async outcome => {
    const view = render(page());
    await flush();
    view.unmount();
    if (outcome === 'success') await complete(0, { status: 'done', report_id: 'late-report' });
    else await fail(0, 402);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(pending).toHaveLength(1);
    expect(scope.navigate).not.toHaveBeenCalled();
    expect(stored.has('active_report_id')).toBe(false);
    expect(stored.has('last_quota_error')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for profile loading and an authenticated account', async () => {
    scope.loading = true;
    const view = render(page());
    await flush();
    expect(pending).toHaveLength(0);
    scope.loading = false;
    stored.delete('access_token');
    view.rerender(page());
    await flush();
    expect(pending).toHaveLength(0);
    expect(stored.has('active_report_job_id')).toBe(false);
  });

  it.each(['profile', 'account'])('does not restore the same route job under a different %s after context refresh', async change => {
    const view = render(page());
    await flush();
    if (change === 'account') {
      stored.set('user_id', 'account-b');
      stored.set('access_token', 'token-b');
      stored.set('active_profile_user_id', 'account-b');
    }
    stored.set('active_profile_id', 'child-b');
    scope.profile = 'child-b';
    view.rerender(page());
    await flush();
    expect(pending).toHaveLength(1);
    await complete(0, { status: 'done', report_id: 'old-report' });
    expect(scope.navigate).not.toHaveBeenCalled();
    expect(stored.has('active_report_id')).toBe(false);
  });

  it('aborts on auth events even if the old identity is restored before a late result', async () => {
    render(page());
    await flush();
    stored.delete('access_token');
    act(() => { window.dispatchEvent(new Event('auth:changed')); });
    stored.set('access_token', 'token-a');
    await complete(0, { status: 'done', report_id: 'old-session-report' });
    expect(scope.navigate).not.toHaveBeenCalled();
    expect(pending[0].config.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pins the frozen profile at actual adapter dispatch despite request interceptor header changes', async () => {
    const requestInterceptor = apiClient.interceptors.request.use(config => {
      config.headers.set('X-Profile-Id', 'unrelated-child');
      return config;
    });
    try {
      render(page());
      await flush();
      expect(pending[0].config.headers.get('X-Profile-Id')).toBe('child-a');
      expect(pending[0].config.headers.get('Authorization')).toBe('Bearer token-a');
    } finally { apiClient.interceptors.request.eject(requestInterceptor); }
  });

  it('keeps the live StrictMode effect independent from an aborted setup catch', async () => {
    render(<StrictMode>{page()}</StrictMode>);
    await flush();
    expect(pending).toHaveLength(1);
    await complete(0, { status: 'processing' });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(pending).toHaveLength(2);
    await complete(1, { status: 'done', report_id: 'strict-report' });
    expect(scope.navigate).toHaveBeenCalledWith('/report/strict-report', { replace: true });
  });

  it('retries a live transient failure, polls processing, and handles live failure', async () => {
    render(page());
    await flush();
    await fail(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(pending).toHaveLength(2);
    await complete(1, { status: 'processing' });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(pending).toHaveLength(3);
    await complete(2, { status: 'failed' });
    expect(window.alert).toHaveBeenCalledTimes(1);
    expect(scope.navigate).toHaveBeenCalledWith('/analysis', { replace: true });
    expect(stored.has('active_report_job_id')).toBe(false);
  });

  it('continues polling after an initial quota write error and still cleans up listeners and timers', async () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'active_report_job_id') throw new DOMException('Full', 'QuotaExceededError');
      stored.set(key, value);
    });
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    const view = render(page());
    await flush();
    expect(pending).toHaveLength(1);
    await complete(0, { status: 'processing' });
    view.unmount();
    for (const event of ['auth:changed', 'storage']) {
      const registration = added.mock.calls.find(([name]) => name === event);
      expect(registration).toBeDefined();
      expect(removed).toHaveBeenCalledWith(event, registration![1]);
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(pending).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['done', 'write'], ['done', 'remove'], ['failed', 'remove'], ['done', 'shortcut-read'],
  ])('navigates after %s despite an optional shortcut %s error without retrying', async (status, operation) => {
    render(page());
    await flush();
    if (operation === 'write') vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    if (operation === 'remove') vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    if (operation === 'shortcut-read') vi.spyOn(localStorage, 'getItem').mockImplementation(key => {
      if (key === 'active_report_job_id') throw new DOMException('Denied', 'SecurityError');
      return stored.get(key) ?? null;
    });
    await complete(0, { status, report_id: status === 'done' ? 'report-a' : undefined });
    expect(scope.navigate).toHaveBeenCalledWith(status === 'done' ? '/report/report-a' : '/analysis', { replace: true });
    expect(window.alert).toHaveBeenCalledTimes(status === 'failed' ? 1 : 0);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(pending).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails closed without dispatch when auth storage is unreadable initially', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    render(page());
    await flush();
    expect(pending).toHaveLength(0);
    expect(scope.navigate).not.toHaveBeenCalled();
    expect(stored.has('active_report_job_id')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a late quota error when auth reads become unreadable and stops all polling', async () => {
    render(page());
    await flush();
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    await fail(0, 402);
    expect(responseErrors[0]).toMatchObject({ code: 'ERR_CANCELED' });
    expect(stored.has('last_quota_error')).toBe(false);
    expect(scope.navigate).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(pending).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
