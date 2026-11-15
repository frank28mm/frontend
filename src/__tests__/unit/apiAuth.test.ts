import type { InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function createClient(dev = false, devUserId = '') {
  vi.stubEnv('DEV', dev);
  vi.stubEnv('VITE_DEV_USER_ID', devUserId);
  const { apiClient } = await import('@/services/api');
  apiClient.defaults.adapter = async (config) => ({
    data: { ok: true },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });
  return apiClient;
}

describe('API request authentication', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCK', 'false');
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, String(value)),
      removeItem: (key: string) => stored.delete(key),
    });
    document.cookie = 'access_token=; Path=/; Max-Age=0';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    document.cookie = 'access_token=; Path=/; Max-Age=0';
  });

  it.each([false, true])('does not authenticate a stored user_id by default (DEV=%s)', async (dev) => {
    localStorage.setItem('user_id', 'stale-user');
    const client = await createClient(dev);

    const { config } = await client.get('/me/account');

    expect(config.headers.has('X-User-Id')).toBe(false);
    expect(config.headers.has('Authorization')).toBe(false);
  });

  it('ignores VITE_DEV_USER_ID in production', async () => {
    const client = await createClient(false, 'dev-user');

    const { config } = await client.get('/me/account');

    expect(config.headers.has('X-User-Id')).toBe(false);
  });

  it.each(['X-User-Id', 'x-user-id', 'X-USER-ID'])('removes a caller-provided %s in production', async (name) => {
    const client = await createClient(false, 'dev-user');

    const { config } = await client.get('/me/account', { headers: { [name]: 'caller-user' } });

    expect(config.headers.has('X-User-Id')).toBe(false);
  });

  it.each([false, true])('removes a default X-User-Id in production (has token=%s)', async (hasToken) => {
    const client = await createClient(false, 'dev-user');
    client.defaults.headers.common['x-user-id'] = 'default-user';
    if (hasToken) localStorage.setItem('access_token', 'valid-token');

    const { config } = await client.get('/me/account');

    expect(config.headers.has('X-User-Id')).toBe(false);
    expect(config.headers.get('Authorization')).toBe(hasToken ? 'Bearer valid-token' : undefined);
  });

  it.each(['', '   '])('requires a nonblank explicit development ID (%j)', async (devUserId) => {
    const client = await createClient(true, devUserId);

    const { config } = await client.get('/me/account', { headers: { 'X-User-Id': 'caller-user' } });

    expect(config.headers.has('X-User-Id')).toBe(false);
  });

  it('uses only the explicitly configured development ID without a token', async () => {
    localStorage.setItem('user_id', 'stale-user');
    const client = await createClient(true, 'dev-user');

    const { config } = await client.get('/me/account');

    expect(config.headers.get('X-User-Id')).toBe('dev-user');
    expect(config.headers.has('Authorization')).toBe(false);
  });

  it.each([false, true])('preserves token authentication and cookie sync (DEV=%s)', async (dev) => {
    localStorage.setItem('access_token', 'valid-token');
    localStorage.setItem('user_id', 'signed-in-user');
    localStorage.setItem('active_profile_id', 'profile-1');
    localStorage.setItem('active_profile_user_id', 'signed-in-user');
    const client = await createClient(dev, 'dev-user');

    const { config } = await client.get('/me/account');

    expect(config.headers.get('Authorization')).toBe('Bearer valid-token');
    expect(config.headers.has('X-User-Id')).toBe(false);
    expect(config.headers.get('X-Profile-Id')).toBe('profile-1');
    expect(document.cookie).toContain('access_token=valid-token');
  });

  it.each([false, true])('preserves explicit Authorization without a stored token (DEV=%s)', async (dev) => {
    const client = await createClient(dev, 'dev-user');

    const { config } = await client.get('/me/account', {
      headers: { Authorization: 'Bearer caller-token' },
    });

    expect(config.headers.get('Authorization')).toBe('Bearer caller-token');
    expect(config.headers.has('X-User-Id')).toBe(false);
  });

  it('keeps SMS login requests and the subsequent authenticated request working', async () => {
    localStorage.setItem('user_id', 'stale-user');
    const client = await createClient();
    const requests: InternalAxiosRequestConfig[] = [];
    const loginResponse = {
      access_token: 'sms-token',
      token_type: 'bearer',
      expires_at: '2099-01-01T00:00:00Z',
      user: { user_id: 'sms-user', phone: '13800138000' },
    };
    client.defaults.adapter = async (config) => {
      requests.push(config);
      const data = config.url === '/auth/sms/verify'
        ? loginResponse
        : config.url === '/auth/sms/send'
          ? { ok: true, expires_in_seconds: 60 }
          : { nickname: 'Parent' };
      return { data, status: 200, statusText: 'OK', headers: {}, config };
    };
    const { authService } = await import('@/services/auth');

    await expect(authService.sendSmsCode('13800138000')).resolves.toMatchObject({ ok: true });
    await expect(authService.verifySmsCode('13800138000', '123456')).resolves.toEqual(loginResponse);
    const { config } = await client.get('/me/account');

    expect(requests[0].url).toBe('/auth/sms/send');
    expect(JSON.parse(requests[0].data)).toEqual({ phone: '13800138000' });
    expect(requests[1].url).toBe('/auth/sms/verify');
    expect(JSON.parse(requests[1].data)).toEqual({ phone: '13800138000', code: '123456' });
    expect(requests.slice(0, 2).every((request) => !request.headers.has('Authorization'))).toBe(true);
    expect(requests.every((request) => !request.headers.has('X-User-Id'))).toBe(true);
    expect(config.headers.get('Authorization')).toBe('Bearer sms-token');
    expect(localStorage.getItem('access_token')).toBe('sms-token');
    expect(localStorage.getItem('user_id')).toBe('sms-user');
    expect(document.cookie).toContain('access_token=sms-token');
  });
});
