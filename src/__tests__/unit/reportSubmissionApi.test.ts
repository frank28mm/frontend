import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('frozen report transport', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCK', 'false');
    vi.stubEnv('VITE_DEV_USER_ID', '');
    const data = new Map([['access_token', 'token-a'], ['user_id', 'account-a'], ['active_profile_id', 'child-a']]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('replays identical request data and pins the explicit profile at adapter dispatch', async () => {
    const { apiClient } = await import('@/services/api');
    const { reportSubmissionService } = await import('@/services/reportSubmission');
    const requests: import('axios').InternalAxiosRequestConfig[] = [];
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      return { data: { job_id: 'job-a' }, status: 200, statusText: 'OK', headers: {}, config };
    };
    const context = { accountId: 'account-a', profileId: 'child-a', token: 'token-a' };
    const input = { subject: 'math' as const, window_days: 7, client_request_id: 'stable-id', from_date: '2026-10-05', through_date: '2026-10-11' };
    localStorage.setItem('active_profile_id', 'unrelated-child');
    await reportSubmissionService.submit(input, context, new AbortController().signal, () => true);
    await reportSubmissionService.submit(input, context, new AbortController().signal, () => true);
    expect(requests[0].data).toBe(requests[1].data);
    expect(JSON.parse(requests[0].data)).toEqual(input);
    expect(requests.every(r => r.headers.get('X-Profile-Id') === 'child-a' && r.headers.get('Authorization') === 'Bearer token-a')).toBe(true);
  });

  it('cancels dispatch after account change even if the shared interceptor has replaced Authorization', async () => {
    const { apiClient } = await import('@/services/api');
    const { reportSubmissionService } = await import('@/services/reportSubmission');
    const adapter = vi.fn();
    apiClient.defaults.adapter = adapter;
    const context = { accountId: 'account-a', profileId: 'child-a', token: 'token-a' };
    const promise = reportSubmissionService.submit({ subject: 'math', window_days: 3, client_request_id: 'stable-id', from_date: '2026-10-09', through_date: '2026-10-11' }, context, new AbortController().signal, () => true);
    localStorage.setItem('access_token', 'token-b');
    localStorage.setItem('user_id', 'account-b');
    await expect(promise).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(adapter).not.toHaveBeenCalled();
  });

  it('cancels stale quota rejection before shared response side effects', async () => {
    const { apiClient } = await import('@/services/api');
    const { reportSubmissionService } = await import('@/services/reportSubmission');
    let reject!: (error: unknown) => void;
    const dispatched = vi.fn();
    apiClient.defaults.adapter = config => {
      dispatched();
      return new Promise<import('axios').AxiosResponse>((_resolve, no) => { reject = no; }).catch(error => { throw Object.assign(error as object, { config }); });
    };
    let current = true;
    const promise = reportSubmissionService.submit({ subject: 'math', window_days: 3, client_request_id: 'stable-id', from_date: '2026-10-09', through_date: '2026-10-11' }, { accountId: 'account-a', profileId: 'child-a', token: 'token-a' }, new AbortController().signal, () => current);
    await vi.waitFor(() => expect(dispatched).toHaveBeenCalled());
    current = false;
    reject({ response: { status: 402 } });
    await expect(promise).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(localStorage.getItem('last_quota_error')).toBeNull();
  });
});
