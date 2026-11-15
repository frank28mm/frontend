import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { canonicalConfirmation } from '@/services/assistant';
import { planConfirmationService, validatePlanConfirmation, type PlanConfirmation } from '@/services/assistantPlanConfirmation';
import { apiClient } from '@/services/api';

export const proposal = (): PlanConfirmation => ({ confirmation_id: 'pc1', conversation_id: 'conv', turn_id: 't1', status: 'pending', expires_at: '2026-10-11T12:00:00Z', preview: { scope: { profile_id: 'child/?', subject: 'math', from_date: '2026-10-01', through_date: '2026-10-11' }, child_name: '孩子', time_zone: 'Asia/Shanghai', goal: '复习', content_version: 'revision_plan.v1', generation_available: true } });
const context = { accountId: 'owner', token: 'token' };
it.each([
  { target_plan_id: 'plan' }, { base_version: 1 },
  { target_plan_id: '', base_version: 1 }, { target_plan_id: 'plan', base_version: 0 },
  { target_plan_id: 'plan', base_version: 1.5 }, { target_plan_id: 'plan', base_version: null },
])('rejects corrupt update metadata %s', metadata => {
  const p = proposal();
  expect(validatePlanConfirmation({ ...p, preview: { ...p.preview, ...metadata } }, { confirmation_id: 'pc1' })).toBe(false);
});
it('freezes update target/base across reads and requires the executed original family', () => {
  const p = { ...proposal(), preview: { ...proposal().preview, target_plan_id: 'plan', base_version: 1 } };
  expect(validatePlanConfirmation(p, { confirmation_id: 'pc1' })).toBe(true);
  for (const metadata of [{ target_plan_id: 'other', base_version: 1 }, { target_plan_id: 'plan', base_version: 2 }, { target_plan_id: undefined, base_version: undefined }]) {
    expect(validatePlanConfirmation({ ...p, preview: { ...p.preview, ...metadata } }, { confirmation_id: 'pc1', previous: p })).toBe(false);
  }
  expect(validatePlanConfirmation(p, { confirmation_id: 'pc1', previous: proposal() })).toBe(false);
  expect(validatePlanConfirmation({ ...p, status: 'executed', job_id: 'job', plan_id: 'other' }, { confirmation_id: 'pc1' })).toBe(false);
});
const original = apiClient.defaults.adapter;
let requests: InternalAxiosRequestConfig[];
beforeEach(() => {
  const stored = new Map([['user_id', 'owner'], ['access_token', 'token'], ['active_profile_id', 'unrelated']]);
  vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
  requests = [];
  apiClient.defaults.adapter = async config => { requests.push(config); return { config, status: 202, statusText: 'OK', headers: {}, data: { contract_version: 'rizhi.assistant.v1', confirmation: { ...proposal(), ...(config.method === 'post' ? { status: 'executed', job_id: 'job', plan_id: 'plan' } : {}) } } }; };
});
afterEach(() => { apiClient.defaults.adapter = original; vi.unstubAllGlobals(); });
it('canonical plan proposals require assistant role and exact source', () => {
  const block = { type: 'plan_confirmation' as const, plan_confirmation: proposal() };
  expect(canonicalConfirmation(block, 'conv', 't1', 'assistant')).toEqual(proposal());
  expect(canonicalConfirmation(block, 'conv', 't1', 'user')).toBeUndefined();
  expect(canonicalConfirmation(block, 'conv', 'other', 'assistant')).toBeUndefined();
});
it('freezes scope/results but permits live generation availability changes', () => {
  const p = proposal();
  expect(validatePlanConfirmation({ ...p, preview: { ...p.preview, generation_available: false } }, { confirmation_id: 'pc1', previous: p })).toBe(true);
  expect(validatePlanConfirmation({ ...p, preview: { ...p.preview, scope: { ...p.preview.scope, profile_id: 'other' } } }, { confirmation_id: 'pc1', previous: p })).toBe(false);
  expect(validatePlanConfirmation({ ...p, job_id: 'job' }, { confirmation_id: 'pc1' })).toBe(false);
  expect(validatePlanConfirmation({ ...p, status: 'executed' }, { confirmation_id: 'pc1' })).toBe(false);
});
it('uses token-only transport and fixed explicit execute body, never global child', async () => {
  await planConfirmationService.getConfirmation('pc1', context);
  await planConfirmationService.executeConfirmation('pc1', context);
  expect(requests.map(r => r.url)).toEqual(['/assistant/plan-confirmations/pc1', '/assistant/plan-confirmations/pc1/execute']);
  expect(JSON.parse(requests[1].data)).toEqual({ contract_version: 'rizhi.assistant.v1' });
  expect(requests.every(r => !r.headers.has('X-Profile-Id') && !r.headers.has('X-User-Id') && !r.params)).toBe(true);
});
it('stale 401 cannot logout a new account even with the same token', async () => {
  let reject!: (error: unknown) => void; let config!: InternalAxiosRequestConfig;
  apiClient.defaults.adapter = input => { config = input; return new Promise<AxiosResponse>((_, no) => { reject = no; }); };
  const work = planConfirmationService.getConfirmation('pc1', context);
  const observed = expect(work).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  await vi.waitFor(() => expect(config).toBeDefined());
  localStorage.setItem('user_id', 'new-owner');
  reject(new AxiosError('Unauthorized', undefined, config, undefined, { config, status: 401, statusText: '', headers: {}, data: {} }));
  await observed;
  expect(localStorage.getItem('access_token')).toBe('token');
});
it.each([{ job_id: 'other', plan_id: 'plan', status: 'done', version: 1 }, { job_id: 'job', plan_id: 'other', status: 'done', version: 1 }, { job_id: 'job', plan_id: 'plan', status: 'done', version: 0 }])('rejects mismatched or unversioned jobs %s', async job => {
  apiClient.defaults.adapter = async config => ({ config, status: 200, statusText: '', headers: {}, data: { contract_version: 'revision_plan.v1', job } });
  await expect(planConfirmationService.job({ ...proposal(), status: 'executed', job_id: 'job', plan_id: 'plan' }, context)).rejects.toThrow();
});
it('queries the confirmed child and accepts omitted queued version', async () => {
  apiClient.defaults.adapter = async config => { requests.push(config); return { config, status: 200, statusText: '', headers: {}, data: { contract_version: 'revision_plan.v1', job: { job_id: 'job', plan_id: 'plan', status: 'queued' } } }; };
  expect((await planConfirmationService.job({ ...proposal(), status: 'executed', job_id: 'job', plan_id: 'plan' }, context)).status).toBe('queued');
  expect(requests[0].params).toEqual({ profile_id: 'child/?' });
  expect(requests[0].headers.has('X-Profile-Id')).toBe(false);
});
