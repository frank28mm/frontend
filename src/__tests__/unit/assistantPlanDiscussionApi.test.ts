import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { assistantService, type SendTurn } from '@/services/assistant';
import { apiClient } from '@/services/api';
const originalAdapter = apiClient.defaults.adapter;
const context = { plan_id: 'plan_1', version: 3 };
let requests: InternalAxiosRequestConfig[];
beforeEach(() => {
  const stored = new Map([['user_id', 'owner'], ['access_token', 'token'], ['active_profile_id', 'unrelated']]);
  vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) }); requests = [];
  apiClient.defaults.adapter = async config => { requests.push(config); return { config, status: 200, statusText: '', headers: {}, data: { contract_version: 'rizhi.assistant.v1', conversation: { conversation_id: 'bound', plan_context: context }, items: [{ conversation_id: 'bound', plan_context: context }] } }; };
});
afterEach(() => { apiClient.defaults.adapter = originalAdapter; vi.unstubAllGlobals(); });
it('sends the exact pointer token-only and preserves detail/list pointers', async () => {
  const input = { conversation_id: '', client_request_id: 'request', text: '讨论', plan_context: context };
  await assistantService.send(input);
  expect(JSON.parse(requests[0].data)).toEqual({ ...input, contract_version: 'rizhi.assistant.v1' });
  expect(requests[0].headers.has('X-Profile-Id')).toBe(false); expect(requests[0].headers.has('X-User-Id')).toBe(false);
  expect((await assistantService.detail('bound')).conversation.plan_context).toEqual(context);
  expect((await assistantService.list()).items[0].plan_context).toEqual(context);
});
it.each([null, {}, { plan_id: 'plan_1', version: 0 }, { plan_id: 'plan_1', version: 1.5 }, { plan_id: 'plan_1', version: 'latest' }, { plan_id: 'plan_1', version: 2, profile_id: 'global' }])('rejects invalid send pointer %s before transport', async plan_context => {
  await expect(assistantService.send({ conversation_id: '', client_request_id: 'request', text: '讨论', plan_context } as SendTurn)).rejects.toThrow('INVALID_PLAN_CONTEXT');
  expect(requests).toHaveLength(0);
});
it.each(['detail', 'list'] as const)('rejects malformed %s pointer instead of treating a bound conversation as generic', async route => {
  apiClient.defaults.adapter = async config => ({ config, status: 200, statusText: '', headers: {}, data: { contract_version: 'rizhi.assistant.v1', conversation: { plan_context: { plan_id: 'p', version: 0 } }, items: [{ plan_context: { plan_id: 'p', version: 0 } }] } });
  await expect(route === 'detail' ? assistantService.detail('bound') : assistantService.list()).rejects.toThrow('INVALID_PLAN_CONTEXT');
});
it('stale first-turn 401 cannot logout a new account even with the same token', async () => {
  let reject!: (error: unknown) => void; let config!: InternalAxiosRequestConfig;
  apiClient.defaults.adapter = input => { config = input; return new Promise<AxiosResponse>((_, no) => { reject = no; }); };
  const work = assistantService.send({ conversation_id: '', client_request_id: 'request', text: '讨论', plan_context: context });
  const observed = expect(work).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  await vi.waitFor(() => expect(config).toBeDefined()); localStorage.setItem('user_id', 'other');
  reject(new AxiosError('Unauthorized', AxiosError.ERR_BAD_REQUEST, config, undefined, { config, status: 401, statusText: '', headers: {}, data: {} }));
  await observed; expect(localStorage.getItem('user_id')).toBe('other'); expect(localStorage.getItem('access_token')).toBe('token');
});
