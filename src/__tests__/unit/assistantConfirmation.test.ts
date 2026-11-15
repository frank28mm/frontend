import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assistantService, validateReportConfirmation, type ReportConfirmation } from '@/services/assistant';
import { apiClient } from '@/services/api';

const fixture = (): ReportConfirmation => ({
  confirmation_id: 'confirm-a', conversation_id: 'conversation-a', turn_id: 'turn-a', status: 'pending',
  expires_at: '2026-10-11T02:15:00.000000000Z',
  preview: {
    scope: { profile_id: 'selected-child', subject: 'math', from_date: '2026-10-01', through_date: '2026-10-11' },
    child_name: 'Child', time_zone: 'Asia/Shanghai', goal: '', content_version: 'parent_report.v1',
    cost: { report_coupons: 1, bt: 0 }, scope_revision: 'turn-a', quota_available: true,
    eligibility: { eligible: true, submission_count: 4, required_count: 2, distinct_days: 2, required_days: 1, subject: 'math', progress_percent: 100, sample_submission_ids: ['submission-a'] },
  },
});
const expected = { confirmation_id: 'confirm-a', conversation_id: 'conversation-a', turn_id: 'turn-a' };

describe('strict confirmation payload validation', () => {
  it.each(['math', 'english', 'physics', 'chemistry'] as const)('accepts the authoritative %s shape without imposing 3/3 thresholds or a fresh expiry', subject => {
    const value = fixture();
    value.preview.scope.subject = subject;
    value.preview.eligibility.subject = subject;
    expect(validateReportConfirmation(value, expected)).toBe(true);
  });

  it.each([
    ['confirmation_id', 'other'], ['conversation_id', 'other'], ['turn_id', 'other'], ['status', 'future'], ['status', ['pending']], ['status', {}],
    ['expires_at', '2026-02-30T00:00:00Z'], ['expires_at', '2026-10-11'], ['expires_at', '2026-10-11T25:00:00Z'],
    ['preview', null], ['preview.scope.profile_id', ''], ['preview.scope.profile_id', ' child '],
    ['preview.scope.subject', 'biology'], ['preview.scope.subject', ['math']], ['preview.scope.subject', {}], ['preview.scope.from_date', '2026-02-30'],
    ['preview.scope.from_date', '2026-10-12'], ['preview.scope.through_date', '2026-1-2'],
    ['preview.time_zone', 'UTC'], ['preview.content_version', 'legacy'],
    ['preview.cost.report_coupons', 2], ['preview.cost.bt', 1], ['preview.cost.bt', '0'],
    ['preview.scope_revision', 'other'], ['preview.child_name', null], ['preview.goal', 42],
    ['preview.quota_available', 1], ['preview.eligibility.eligible', 'true'],
    ['preview.eligibility.submission_count', -1], ['preview.eligibility.distinct_days', 5],
    ['preview.eligibility.required_count', 1.5], ['preview.eligibility.required_days', Infinity],
    ['preview.eligibility.submission_count', Number.MAX_SAFE_INTEGER + 1],
    ['preview.eligibility.subject', 'english'], ['preview.eligibility.progress_percent', 101],
    ['preview.eligibility.sample_submission_ids', ['']], ['preview.eligibility.reason', {}],
    ['job_id', 'job-a'], ['report_id', 'report-a'],
  ])('rejects malformed or inconsistent %s=%s', (path, replacement) => {
    const value: Record<string, unknown> = { ...fixture() };
    const parts = path.split('.');
    let node = value;
    for (const key of parts.slice(0, -1)) node = node[key] as Record<string, unknown>;
    node[parts.at(-1)!] = replacement;
    expect(validateReportConfirmation(value, expected)).toBe(false);
  });

  it.each([null, [], {}, { ...fixture(), preview: undefined }])('fails closed on missing shape', value => {
    expect(validateReportConfirmation(value, expected)).toBe(false);
  });

  it('accepts frozen not-ready previews and omitted optional eligibility fields', () => {
    const value = fixture();
    value.preview.quota_available = false;
    value.preview.eligibility = { eligible: false, submission_count: 0, required_count: 2, distinct_days: 0, required_days: 1, subject: 'math' } as typeof value.preview.eligibility;
    expect(validateReportConfirmation(value, expected)).toBe(true);
  });

  it.each(['expired', 'invalidated'])('accepts %s without executable identities', status => {
    expect(validateReportConfirmation({ ...fixture(), status }, expected)).toBe(true);
  });

  it('requires a job only for executed and allows its old not-ready preview', () => {
    const value = { ...fixture(), status: 'executed', job_id: 'job-a', report_id: 'report-a' };
    value.preview.quota_available = false;
    expect(validateReportConfirmation(value, expected)).toBe(true);
    expect(validateReportConfirmation({ ...value, job_id: undefined }, expected)).toBe(false);
    expect(validateReportConfirmation({ ...value, report_id: null }, expected)).toBe(false);
  });

  it('compares immutable preview structurally and preserves previously known result identities', () => {
    const previous: ReportConfirmation = { ...fixture(), status: 'executed', job_id: 'job-a', report_id: 'report-a' };
    const same = JSON.parse(JSON.stringify(previous));
    same.preview.scope = { through_date: '2026-10-11', from_date: '2026-10-01', subject: 'math', profile_id: 'selected-child' };
    expect(validateReportConfirmation(same, { ...expected, previous })).toBe(true);
    same.preview.quota_available = false;
    expect(validateReportConfirmation(same, { ...expected, previous })).toBe(false);
    expect(validateReportConfirmation({ ...previous, job_id: 'other' }, { ...expected, previous })).toBe(false);
    expect(validateReportConfirmation({ ...previous, report_id: undefined }, { ...expected, previous })).toBe(false);
    expect(validateReportConfirmation(fixture(), { ...expected, previous })).toBe(false);
  });

  it.each(['expired', 'invalidated'] as const)('never revives a previous %s confirmation to pending', status => {
    const previous: ReportConfirmation = { ...fixture(), status };
    expect(validateReportConfirmation(fixture(), { ...expected, previous })).toBe(false);
    expect(validateReportConfirmation({ ...fixture(), status: status === 'expired' ? 'invalidated' : 'expired' }, { ...expected, previous })).toBe(true);
  });

  it.each(['expired', 'invalidated'] as const)('never executes a previously %s confirmation by adding a job identity', status => {
    const previous: ReportConfirmation = { ...fixture(), status };
    expect(validateReportConfirmation({ ...fixture(), status: 'executed', job_id: 'job-a' }, { ...expected, previous })).toBe(false);
  });

  it('does not apply confirmation route restrictions to profile or job identities', () => {
    const value = { ...fixture(), status: 'executed', job_id: 'job/with space' };
    value.preview.scope.profile_id = 'child/with space';
    expect(validateReportConfirmation(value, expected)).toBe(true);
  });
});

describe('confirmation transport through real shared interceptors', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let stored: Map<string, string>;
  let requests: InternalAxiosRequestConfig[];
  const context = { accountId: 'account-a', token: 'token-a' };
  beforeEach(() => {
    stored = new Map([['user_id', 'account-a'], ['access_token', 'token-a'], ['active_profile_id', 'unrelated-page-child']]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) });
    requests = [];
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      return { data: { contract_version: 'rizhi.assistant.v1', confirmation: { ...fixture(), confirmation_id: 'confirm?x#y%2F1', ...(config.method === 'post' ? { status: 'executed', job_id: 'job-a' } : {}) } }, status: 200, statusText: 'OK', headers: {}, config };
    };
  });
  afterEach(() => { apiClient.defaults.adapter = originalAdapter; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('adds confirmations to token-only paths, stripping page/caller identity and GET timestamp', async () => {
    await apiClient.get('/assistant/confirmations/confirm-a', { headers: { 'X-Profile-Id': 'caller-child', 'X-User-Id': 'caller-account' } });
    expect(requests[0].headers.has('X-Profile-Id')).toBe(false);
    expect(requests[0].headers.has('X-User-Id')).toBe(false);
    expect(requests[0].params).toBeUndefined();
  });

  it('encodes exact confirmation IDs and replays only the fixed execute body', async () => {
    const id = 'confirm?x#y%2F1';
    expect((await assistantService.getConfirmation(id, context)).status).toBe('pending');
    expect((await assistantService.executeConfirmation(id, context)).job_id).toBe('job-a');
    await assistantService.executeConfirmation(id, context);
    expect(requests.map(r => r.url)).toEqual([`/assistant/confirmations/${encodeURIComponent(id)}`, ...Array(2).fill(`/assistant/confirmations/${encodeURIComponent(id)}/execute`)]);
    expect(JSON.parse(requests[1].data)).toEqual({ contract_version: 'rizhi.assistant.v1' });
    expect(requests[1].data).toBe(requests[2].data);
    expect(requests.every(r => r.headers.get('Authorization') === 'Bearer token-a' && !r.headers.has('X-Profile-Id') && !r.headers.has('X-User-Id') && !r.params)).toBe(true);
  });

  it('accepts the actual execute route 202 envelope without interpreting acceptance as report completion', async () => {
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      return { status: 202, statusText: 'Accepted', headers: {}, config, data: {
        contract_version: 'rizhi.assistant.v1', confirmation: { ...fixture(), status: 'executed', job_id: 'job-a' },
      } };
    };
    const confirmation = await assistantService.executeConfirmation('confirm-a', context);
    expect(confirmation.status).toBe('executed');
    expect(confirmation.job_id).toBe('job-a');
    expect(confirmation.report_id).toBeUndefined();
    expect(JSON.parse(requests[0].data)).toEqual({ contract_version: 'rizhi.assistant.v1' });
  });

  it.each(['version', 'missing', 'identity', 'pending-execute'])('rejects malformed %s success before returning acceptance', async kind => {
    apiClient.defaults.adapter = async config => ({ data: {
      contract_version: kind === 'version' ? 'future' : 'rizhi.assistant.v1',
      confirmation: kind === 'missing' ? undefined : { ...fixture(), confirmation_id: kind === 'identity' ? 'other' : 'confirm-a' },
    }, status: 200, statusText: 'OK', headers: {}, config });
    await expect(assistantService.executeConfirmation('confirm-a', context)).rejects.toThrow();
  });

  it('does not dispatch after account changes before the shared request interceptor executes', async () => {
    const promise = assistantService.executeConfirmation('confirm-a', context);
    stored.set('user_id', 'account-b');
    stored.set('access_token', 'token-b');
    await expect(promise).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(requests).toHaveLength(0);
  });

  it.each(['account', 'scope', 'abort', 'unreadable'])('fences late quota errors for %s before shared storage/redirect effects', async change => {
    let reject!: (error: unknown) => void;
    let config!: InternalAxiosRequestConfig;
    apiClient.defaults.adapter = input => { config = input; return new Promise<AxiosResponse>((_resolve, no) => { reject = no; }); };
    const controller = new AbortController();
    let current = true;
    const promise = assistantService.executeConfirmation('confirm-a', { ...context, isCurrent: () => current }, controller.signal);
    const observed = expect(promise).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await vi.waitFor(() => expect(config).toBeDefined());
    if (change === 'account') { stored.set('user_id', 'account-b'); stored.set('access_token', 'token-b'); }
    if (change === 'scope') current = false;
    if (change === 'abort') controller.abort();
    if (change === 'unreadable') vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    reject(new AxiosError('Quota', undefined, config, undefined, { status: 402, data: {}, statusText: 'Quota', headers: {}, config }));
    await observed;
    expect(stored.has('last_quota_error')).toBe(false);
  });

  it('fences a late success after caller scope invalidation', async () => {
    let resolve!: (response: AxiosResponse) => void;
    let config!: InternalAxiosRequestConfig;
    apiClient.defaults.adapter = input => { config = input; return new Promise<AxiosResponse>(yes => { resolve = yes; }); };
    let current = true;
    const promise = assistantService.getConfirmation('confirm-a', { ...context, isCurrent: () => current });
    const observed = expect(promise).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await vi.waitFor(() => expect(config).toBeDefined());
    current = false;
    resolve({ status: 200, statusText: 'OK', headers: {}, config, data: { contract_version: 'rizhi.assistant.v1', confirmation: fixture() } });
    await observed;
  });

  it('cancels a late 401 before shared effects even when only account identity changes', async () => {
    let reject!: (error: unknown) => void;
    let config!: InternalAxiosRequestConfig;
    apiClient.defaults.adapter = input => { config = input; return new Promise<AxiosResponse>((_resolve, no) => { reject = no; }); };
    const promise = assistantService.getConfirmation('confirm-a', context);
    const observed = expect(promise).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await vi.waitFor(() => expect(config).toBeDefined());
    stored.set('user_id', 'account-b');
    reject(new AxiosError('Unauthorized', undefined, config, undefined, { status: 401, data: {}, statusText: 'Unauthorized', headers: {}, config }));
    await observed;
    expect(stored.get('access_token')).toBe('token-a');
    expect(stored.get('user_id')).toBe('account-b');
  });

  it('preserves live backend errors without turning a rejection into accepted execution', async () => {
    const failure = new AxiosError('Not ready', undefined, undefined, undefined, { status: 409 } as AxiosResponse);
    apiClient.defaults.adapter = async () => { throw failure; };
    await expect(assistantService.executeConfirmation('confirm-a', context)).rejects.toBe(failure);
  });

  it('keeps live quota refusal local to explicit confirmation, without shared redirect/storage', async () => {
    apiClient.defaults.adapter = async config => { throw new AxiosError('Quota', undefined, config, undefined, { status: 402, data: { detail: 'quota_insufficient' }, statusText: 'Quota', headers: {}, config }); };
    await expect(assistantService.executeConfirmation('confirm-a', context)).rejects.toMatchObject({ status: 402, code: 'quota_insufficient' });
    expect(stored.has('last_quota_error')).toBe(false);
  });

  it('allows account confirmation regardless of the current global child and checks source identities', async () => {
    apiClient.defaults.adapter = async config => ({ status: 200, statusText: 'OK', headers: {}, config, data: { contract_version: 'rizhi.assistant.v1', confirmation: fixture() } });
    stored.set('active_profile_id', 'different-child');
    expect((await assistantService.getConfirmation('confirm-a', { ...context, expected: { conversation_id: 'conversation-a', turn_id: 'turn-a' } })).preview.scope.profile_id).toBe('selected-child');
    await expect(assistantService.getConfirmation('confirm-a', { ...context, expected: { conversation_id: 'different-conversation' } })).rejects.toThrow();
  });

  it('fails closed on missing or unreadable auth and invalid request identity', async () => {
    await expect(assistantService.getConfirmation('', context)).rejects.toThrow();
    stored.delete('access_token');
    await expect(assistantService.getConfirmation('confirm-a', context)).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    await expect(assistantService.getConfirmation('confirm-a', context)).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(requests).toHaveLength(0);
  });

  it.each(['confirm/a', 'confirm\\a', 'confirm a', 'confirm\ta', 'confirm\na', '.', '..'])('rejects backend-invalid confirmation path identity %s before dispatch', async id => {
    await expect(assistantService.getConfirmation(id, context)).rejects.toThrow('INVALID_CONFIRMATION_ID');
    expect(requests).toHaveLength(0);
  });
});
