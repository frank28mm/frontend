import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiClient } from '@/services/api';
import { apiKeysService, API_KEY_SCOPES, type ApiKey } from '@/services/apiKeys';

const secret = `rz_ro_${'A'.repeat(43)}`;
const key = (id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'): ApiKey => ({ key_id: id, name: 'Agent', prefix: 'rz_ro_AAAAAAAA', last_four: 'AAAA', scopes: [...API_KEY_SCOPES], status: 'active', created_at: '2026-10-11T12:00:00Z' });
const context = { accountId: 'owner', token: 'session' };
const original = apiClient.defaults.adapter;
let requests: InternalAxiosRequestConfig[];
beforeEach(() => {
  const stored = new Map([['user_id', 'owner'], ['access_token', 'session'], ['active_profile_id', 'child']]);
  vi.stubGlobal('localStorage', { getItem: (name: string) => stored.get(name) ?? null, setItem: (name: string, value: string) => stored.set(name, value), removeItem: (name: string) => stored.delete(name) });
  requests = [];
  apiClient.defaults.adapter = async config => {
    requests.push(config);
    const payload = config.method === 'get' ? { items: [key()] } : config.method === 'delete' ? { ok: true }
      : config.url?.endsWith('/rotate') ? { key: key('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), secret, replaces_key_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } : { key: key(), secret };
    return { config, status: 200, statusText: '', headers: {}, data: { contract_version: 'rizhi.api_keys.v1', ...payload } };
  };
});
afterEach(() => { apiClient.defaults.adapter = original; vi.unstubAllGlobals(); });
it('uses only login auth, exact management bodies, no child or GET query', async () => {
  await apiKeysService.list(context);
  expect(await apiKeysService.create('  Agent  ', context)).toEqual({ key: key(), secret });
  expect(await apiKeysService.rotate(key(), context)).toEqual({ key: key('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), secret, replaces_key_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
  await apiKeysService.revoke('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', context);
  expect(requests.map(r => [r.method, r.url, r.data === undefined ? undefined : JSON.parse(r.data)])).toEqual([
    ['get', '/me/api-keys', undefined], ['post', '/me/api-keys', { name: 'Agent' }],
    ['post', '/me/api-keys/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/rotate', {}], ['delete', '/me/api-keys/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', undefined],
  ]);
  expect(requests.every(r => r.headers.get('Authorization') === 'Bearer session' && !r.headers.has('X-Profile-Id') && !r.headers.has('X-User-Id') && r.params === undefined)).toBe(true);
});
it.each(['', 'x'.repeat(65), 'Agent\nname', '\uD800'])('rejects invalid names without transport %s', async name => {
  await expect(apiKeysService.create(name, context)).rejects.toMatchObject({ code: 'INVALID_INPUT' }); expect(requests).toEqual([]);
});
it('counts Unicode code points rather than UTF-16 units', async () => {
  const name = '😀'.repeat(64); apiClient.defaults.adapter = async config => ({ config, status: 201, statusText: '', headers: {}, data: { contract_version: 'rizhi.api_keys.v1', key: { ...key(), name }, secret } });
  expect((await apiKeysService.create(name, context)).key.name).toBe(name);
});
it.each(['secret-in-list', 'unknown-contract', 'write-scope', 'duplicate', 'full-prefix', 'invalid-id', 'short-prefix'])('rejects unsafe metadata %s', async kind => {
  const item = key(); let items: unknown[] = [item];
  if (kind === 'secret-in-list') items = [{ ...item, secret }];
  if (kind === 'write-scope') item.scopes = ['grading:write'];
  if (kind === 'duplicate') items = [item, item];
  if (kind === 'full-prefix') item.prefix = secret;
  if (kind === 'invalid-id') item.key_id = 'key_bad';
  if (kind === 'short-prefix') item.prefix = 'rz_ro_A';
  apiClient.defaults.adapter = async config => ({ config, status: 200, statusText: '', headers: {}, data: { contract_version: kind === 'unknown-contract' ? 'other' : 'rizhi.api_keys.v1', items } });
  await expect(apiKeysService.list(context)).rejects.toMatchObject({ code: 'INVALID_API_KEY_RESPONSE' });
});
it.each(['mismatched-secret', 'wrong-source', 'same-id', 'changed-name'])('rejects malformed rotation %s', async kind => {
  const next = { ...key('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), ...(kind === 'same-id' ? { key_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } : {}), ...(kind === 'changed-name' ? { name: 'Another' } : {}) };
  apiClient.defaults.adapter = async config => ({ config, status: 201, statusText: '', headers: {}, data: { contract_version: 'rizhi.api_keys.v1', key: next, secret: kind === 'mismatched-secret' ? `rz_ro_${'B'.repeat(43)}` : secret, replaces_key_id: kind === 'wrong-source' ? 'other' : 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } });
  await expect(apiKeysService.rotate(key(), context)).rejects.toMatchObject({ code: 'INVALID_API_KEY_RESPONSE' });
});
it.each([false, true])('fences late old-account success/401 even with the same login token (%s)', async fail => {
  let resolve!: (response: AxiosResponse) => void; let reject!: (error: unknown) => void; let config!: InternalAxiosRequestConfig;
  apiClient.defaults.adapter = input => { config = input; return new Promise((yes, no) => { resolve = yes; reject = no; }); };
  const work = expect(apiKeysService.create('Agent', context)).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  await vi.waitFor(() => expect(config).toBeDefined()); localStorage.setItem('user_id', 'other');
  if (fail) reject(new AxiosError(secret, undefined, config, undefined, { config, status: 401, statusText: '', headers: {}, data: { secret } }));
  else resolve({ config, status: 201, statusText: '', headers: {}, data: { contract_version: 'rizhi.api_keys.v1', key: key(), secret } });
  await work; expect(localStorage.getItem('access_token')).toBe('session');
});
it('sanitizes errors and never forwards a response secret into error messages', async () => {
  apiClient.defaults.adapter = async config => { throw new AxiosError(secret, undefined, config, undefined, { config, status: 409, statusText: secret, headers: {}, data: { error: { code: 'KEY_LIMIT_REACHED' }, secret } }); };
  try { await apiKeysService.create('Agent', context); throw new Error('expected failure'); }
  catch (error) { expect(error).toMatchObject({ code: 'KEY_LIMIT_REACHED' }); expect(JSON.stringify(error)).not.toContain(secret); expect(String(error)).not.toContain(secret); }
});
it('refuses missing sessions, stale callers and revoked rotation without transport', async () => {
  await expect(apiKeysService.rotate({ ...key(), status: 'revoked' }, context)).rejects.toMatchObject({ code: 'KEY_REVOKED' });
  await expect(apiKeysService.list({ ...context, isCurrent: () => false })).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  localStorage.removeItem('access_token'); await expect(apiKeysService.list(context)).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  expect(requests).toEqual([]);
});
it('prevents an unexpected quota response from persisting sensitive details', async () => {
  const storage = vi.spyOn(localStorage, 'setItem');
  apiClient.defaults.adapter = async config => { throw new AxiosError(secret, undefined, config, undefined, { config, status: 402, statusText: secret, headers: {}, data: { detail: { secret } } }); };
  await expect(apiKeysService.create('Agent', context)).rejects.toMatchObject({ code: 'REQUEST_FAILED' });
  expect(storage).not.toHaveBeenCalled(); expect(localStorage.getItem('last_quota_error')).toBeNull();
  storage.mockRestore();
});
it('does not dispatch invalid identifiers or an aborted caller', async () => {
  await expect(apiKeysService.revoke('../keys', context)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  const controller = new AbortController(); controller.abort();
  await expect(apiKeysService.list(context, controller.signal)).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  expect(requests).toEqual([]);
});
