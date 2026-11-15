import { CanceledError, getAdapter, isAxiosError, type AxiosRequestConfig } from 'axios';
import { apiClient } from './api';

export const API_KEY_SCOPES = ['profiles:read', 'mistakes:read', 'knowledge:read', 'evidence:read', 'reports:read'];
export interface ApiKey {
  key_id: string; name: string; prefix: string; last_four: string; scopes: string[];
  status: 'active' | 'revoked'; created_at: string; last_used_at?: string; revoked_at?: string;
}
export interface ApiKeyAccount { accountId: string; token: string; isCurrent?: () => boolean }
export class ApiKeysError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'ApiKeysError'; this.code = code; }
}
type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
const fields = (v: Obj, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
export const validApiKeyName = (v: string) => {
  const name = v.trim();
  return [...name].length > 0 && [...name].length <= 64 && !/[\p{Cc}\p{Cs}]/u.test(v);
};
const timestamp = (v: unknown) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
function metadata(v: unknown): v is ApiKey {
  return object(v) && fields(v, ['key_id', 'name', 'prefix', 'last_four', 'scopes', 'status', 'created_at', 'last_used_at', 'revoked_at']) &&
    id(v.key_id) && typeof v.name === 'string' && validApiKeyName(v.name) && v.name === v.name.trim() &&
    typeof v.prefix === 'string' && /^rz_ro_[A-Za-z0-9_-]{8}$/.test(v.prefix) &&
    typeof v.last_four === 'string' && /^[A-Za-z0-9_-]{4}$/.test(v.last_four) &&
    Array.isArray(v.scopes) && v.scopes.length === API_KEY_SCOPES.length && new Set(v.scopes).size === API_KEY_SCOPES.length && v.scopes.every(s => API_KEY_SCOPES.includes(s)) &&
    (v.status === 'active' || v.status === 'revoked') && timestamp(v.created_at) &&
    (v.last_used_at === undefined || timestamp(v.last_used_at)) && (v.revoked_at === undefined || timestamp(v.revoked_at));
}
const invalid = () => new ApiKeysError('INVALID_API_KEY_RESPONSE');
async function request(config: AxiosRequestConfig, context: ApiKeyAccount, signal?: AbortSignal): Promise<Obj> {
  const live = () => !!context.accountId && !!context.token && !signal?.aborted && (!context.isCurrent || context.isCurrent()) &&
    localStorage.getItem('user_id') === context.accountId && localStorage.getItem('access_token') === context.token;
  const fence = () => { if (!live()) throw new CanceledError('Account changed'); };
  fence();
  const adapter = getAdapter(apiClient.defaults.adapter);
  const response = await apiClient.request({ ...config, signal, headers: { Authorization: `Bearer ${context.token}` }, adapter: async inner => {
    fence();
    inner.headers.set('Authorization', `Bearer ${context.token}`);
    inner.headers.delete('X-User-Id'); inner.headers.delete('X-Profile-Id'); inner.params = undefined;
    try { const result = await adapter(inner); fence(); return result; }
    catch (error) {
      fence();
      // Do not let raw error payloads reach shared interceptors, storage or consumers.
      const code = isAxiosError(error) && object(error.response?.data) && object(error.response.data.error) ? error.response.data.error.code : undefined;
      const known = ['UNAUTHORIZED', 'INVALID_INPUT', 'KEY_NOT_FOUND', 'KEY_LIMIT_REACHED', 'KEY_REVOKED', 'INTERNAL_ERROR'];
      throw new ApiKeysError(typeof code === 'string' && known.includes(code) ? code : 'REQUEST_FAILED');
    }
  } });
  fence();
  if (!object(response.data) || response.data.contract_version !== 'rizhi.api_keys.v1') throw invalid();
  return response.data;
}
function issuance(data: Obj) {
  if (!metadata(data.key) || data.key.status !== 'active' || typeof data.secret !== 'string' || !/^rz_ro_[A-Za-z0-9_-]{43}$/.test(data.secret) ||
    !data.secret.startsWith(data.key.prefix) || !data.secret.endsWith(data.key.last_four)) throw invalid();
  return { key: data.key, secret: data.secret };
}
export const apiKeysService = {
  async list(context: ApiKeyAccount, signal?: AbortSignal): Promise<ApiKey[]> {
    const data = await request({ url: '/me/api-keys', method: 'get' }, context, signal);
    if (!fields(data, ['contract_version', 'items']) || !Array.isArray(data.items) || !data.items.every(metadata) || new Set(data.items.map(k => k.key_id)).size !== data.items.length) throw invalid();
    return data.items;
  },
  async create(name: string, context: ApiKeyAccount, signal?: AbortSignal) {
    if (!validApiKeyName(name)) throw new ApiKeysError('INVALID_INPUT');
    const data = await request({ url: '/me/api-keys', method: 'post', data: { name: name.trim() } }, context, signal);
    if (!fields(data, ['contract_version', 'key', 'secret'])) throw invalid();
    const result = issuance(data);
    if (result.key.name !== name.trim()) throw invalid();
    return result;
  },
  async rotate(key: ApiKey, context: ApiKeyAccount, signal?: AbortSignal) {
    if (!metadata(key)) throw new ApiKeysError('INVALID_INPUT');
    if (key.status === 'revoked') throw new ApiKeysError('KEY_REVOKED');
    const data = await request({ url: `/me/api-keys/${key.key_id}/rotate`, method: 'post', data: {} }, context, signal);
    if (!fields(data, ['contract_version', 'key', 'secret', 'replaces_key_id'])) throw invalid();
    const result = issuance(data);
    if (data.replaces_key_id !== key.key_id || result.key.key_id === key.key_id || result.key.name !== key.name) throw invalid();
    return { ...result, replaces_key_id: key.key_id };
  },
  async revoke(keyId: string, context: ApiKeyAccount, signal?: AbortSignal): Promise<void> {
    if (!id(keyId)) throw new ApiKeysError('INVALID_INPUT');
    const data = await request({ url: `/me/api-keys/${keyId}`, method: 'delete' }, context, signal);
    if (!fields(data, ['contract_version', 'ok']) || data.ok !== true) throw invalid();
  },
};
