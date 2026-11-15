import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { savedPlanFixture } from './planFixture';

describe('saved plan account transport', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_DEV_USER_ID', 'dev-user');
    vi.stubEnv('VITE_USE_MOCK', 'false');
    const stored = new Map([['user_id', 'owner'], ['access_token', 'token'], ['active_profile_id', 'page-child']]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('keeps plan routes token-only without page-child or timestamp params', async () => {
    const { apiClient } = await import('@/services/api');
    const requests: import('axios').InternalAxiosRequestConfig[] = [];
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };
    for (const url of ['/plans', '/plans/plan_1', '/plan-jobs/job_1', '/plans?limit=20', '/plan-jobs?status=ready']) await apiClient.get(url);
    expect(requests.every(r => !r.params && !r.headers.has('X-Profile-Id') && !r.headers.has('X-User-Id'))).toBe(true);
  });

  async function transport(data: unknown = { contract_version: 'revision_plan.v1', items: [] }) {
    const { apiClient } = await import('@/services/api');
    const requests: import('axios').InternalAxiosRequestConfig[] = [];
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      return { data, status: 200, statusText: 'OK', headers: {}, config };
    };
    return { apiClient, requests, service: (await import('@/services/plans')).plansService };
  }
  const context = { accountId: 'owner', token: 'token' };

  it('lists only the explicit query scope and supported pagination fields', async () => {
    const { service, requests } = await transport();
    await service.list(context, 'child-b', 20);
    expect(requests[0].params).toEqual({ profile_id: 'child-b', limit: 20, offset: 20 });
    expect(requests[0].headers.get('Authorization')).toBe('Bearer token');
    expect(requests[0].headers.has('X-Profile-Id')).toBe(false);
    expect(localStorage.getItem('active_profile_id')).toBe('page-child');
  });

  it.each(['math', 'english', 'physics', 'chemistry'])('accepts a saved %s plan without generation', async subject => {
    const fixture = savedPlanFixture(subject);
    const { service, requests } = await transport({ contract_version: 'revision_plan.v1', plan: fixture });
    await expect(service.detail('plan_1', 2, context, 'child-b')).resolves.toEqual(fixture);
    expect(requests[0].method).toBe('get');
    expect(requests[0].params).toEqual({ version: 2, profile_id: 'child-b' });
  });

  it('rejects malformed scope before networking', async () => {
    const { service, requests } = await transport();
    await expect(service.detail('../other', 1, context)).rejects.toThrow('INVALID_PLAN_SCOPE');
    await expect(service.detail('plan_1', -1, context)).rejects.toThrow('INVALID_PLAN_SCOPE');
    await expect(service.list(context, '', 0)).rejects.toThrow('INVALID_PLAN_SCOPE');
    expect(requests).toHaveLength(0);
  });

  it.each(['identity', 'profile', 'version', 'subject', 'period', 'evidence', 'arrays', 'contract', 'fields', 'facts', 'captured', 'timestamp', 'oversize'])('rejects mismatched %s in saved content', async kind => {
    const fixture = savedPlanFixture();
    if (kind === 'identity') fixture.plan_id = 'plan_other';
    if (kind === 'profile') fixture.profile_id = 'child-other';
    if (kind === 'version') fixture.version = 1;
    if (kind === 'subject') fixture.subject = 'physics';
    if (kind === 'period') fixture.from_date = '2026-10-02';
    if (kind === 'evidence') fixture.content.priorities[0].evidence_ids = ['unknown'];
    if (kind === 'arrays') Object.assign(fixture.content, { suggestions: null });
    if (kind === 'contract') fixture.content.contract_version = 'future';
    if (kind === 'fields') Object.assign(fixture.content, { script: 'evil' });
    if (kind === 'facts') fixture.facts.overall.correct = 99;
    if (kind === 'captured') fixture.captured_at = '2026-10-05T00:00:00Z';
    if (kind === 'timestamp') fixture.created_at = '2026-02-30T00:00:00Z';
    if (kind === 'oversize') fixture.content.overview = 'x'.repeat(256 * 1024);
    const { service } = await transport({ contract_version: 'revision_plan.v1', plan: fixture });
    await expect(service.detail('plan_1', 2, context, 'child-b')).rejects.toThrow('INVALID_SAVED_PLAN');
  });

  it('rejects cross-child or duplicate list entries and unsupported envelope contracts', async () => {
    const detail = savedPlanFixture();
    const summary = { plan_id: detail.plan_id, version: detail.version, profile_id: detail.profile_id, subject: detail.subject, title: detail.content.title, from_date: detail.from_date, through_date: detail.through_date, created_at: detail.created_at };
    const { service, apiClient } = await transport({ contract_version: 'revision_plan.v1', items: [summary, summary] });
    await expect(service.list(context, 'child-b')).rejects.toThrow('INVALID_PLAN_LIST');
    apiClient.defaults.adapter = async config => ({ data: { contract_version: 'revision_plan.v1', items: [summary] }, status: 200, statusText: 'OK', headers: {}, config });
    await expect(service.list(context, 'child-other')).rejects.toThrow('INVALID_PLAN_LIST');
    apiClient.defaults.adapter = async config => ({ data: { contract_version: 'future', items: [] }, status: 200, statusText: 'OK', headers: {}, config });
    await expect(service.list(context)).rejects.toThrow('UNSUPPORTED_PLAN_CONTRACT');
  });

  it('fences late success and late 401 before old account responses affect new login', async () => {
    const { service, apiClient } = await transport();
    const { AxiosError } = await import('axios');
    for (const fail of [false, true]) {
      localStorage.setItem('user_id', 'owner'); localStorage.setItem('access_token', 'token');
      let resolve!: (value: import('axios').AxiosResponse) => void;
      let reject!: (value: unknown) => void;
      let sent!: import('axios').InternalAxiosRequestConfig;
      apiClient.defaults.adapter = config => { sent = config; return new Promise((yes, no) => { resolve = yes; reject = no; }); };
      const result = service.list(context);
      const rejected = expect(result).rejects.toMatchObject({ code: 'ERR_CANCELED' });
      await vi.waitFor(() => expect(sent).toBeDefined());
      localStorage.setItem('user_id', 'new-owner'); localStorage.setItem('access_token', 'new-token');
      if (fail) reject(new AxiosError('Old 401', undefined, sent, undefined, { data: {}, status: 401, statusText: 'Unauthorized', headers: {}, config: sent }));
      else resolve({ data: { contract_version: 'revision_plan.v1', items: [] }, status: 200, statusText: 'OK', headers: {}, config: sent });
      await rejected;
      expect(localStorage.getItem('user_id')).toBe('new-owner');
      expect(localStorage.getItem('access_token')).toBe('new-token');
    }
  });

  it('refuses missing login, cancellation, or a stale caller before dispatch', async () => {
    const { service, requests } = await transport();
    await expect(service.list({ ...context, isCurrent: () => false })).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    const abort = new AbortController(); abort.abort();
    await expect(service.list(context, undefined, 0, abort.signal)).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    localStorage.removeItem('access_token');
    await expect(service.list(context)).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(requests).toHaveLength(0);
  });

  it('fences account changes even when the token text is unchanged', async () => {
    const { service, apiClient } = await transport();
    let resolve!: (value: import('axios').AxiosResponse) => void;
    let sent!: import('axios').InternalAxiosRequestConfig;
    apiClient.defaults.adapter = config => { sent = config; return new Promise(yes => { resolve = yes; }); };
    const rejected = expect(service.list(context)).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await vi.waitFor(() => expect(sent).toBeDefined());
    localStorage.setItem('user_id', 'different-owner');
    resolve({ data: { contract_version: 'revision_plan.v1', items: [] }, status: 200, statusText: 'OK', headers: {}, config: sent });
    await rejected;
  });
});
