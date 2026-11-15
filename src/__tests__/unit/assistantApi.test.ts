import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('account assistant transport', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_DEV_USER_ID', 'dev-user');
    vi.stubEnv('VITE_USE_MOCK', 'false');
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  async function transport() {
    const { apiClient } = await import('@/services/api');
    const requests: import('axios').InternalAxiosRequestConfig[] = [];
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      return { data: { contract_version: 'rizhi.assistant.v1', items: [] }, status: 200, statusText: 'OK', headers: {}, config };
    };
    return { requests, service: (await import('@/services/assistant')).assistantService, apiClient };
  }

  it('does not use development identity, page child or timestamp parameters', async () => {
    localStorage.setItem('active_profile_id', 'page-child');
    const { requests, service } = await transport();
    await service.list('active', 'cursor');
    expect(requests[0].headers.has('X-User-Id')).toBe(false);
    expect(requests[0].headers.has('X-Profile-Id')).toBe(false);
    expect(requests[0].params).toEqual({ status: 'active', cursor: 'cursor' });
  });

  it('keeps confirmation GET and execute token-only even with a configured development user', async () => {
    localStorage.setItem('active_profile_id', 'page-child');
    const { requests, apiClient } = await transport();
    await apiClient.get('/assistant/confirmations/confirm_1');
    await apiClient.post('/assistant/confirmations/confirm_1/execute', { contract_version: 'rizhi.assistant.v1' });
    expect(requests.every(request => !request.headers.has('X-User-Id') && !request.headers.has('X-Profile-Id') && !request.params)).toBe(true);
  });

  it('uses login token and strips default identity/profile headers', async () => {
    localStorage.setItem('access_token', 'account-token');
    const { requests, service, apiClient } = await transport();
    apiClient.defaults.headers.common['X-Profile-Id'] = 'default-child';
    apiClient.defaults.headers.common['X-User-Id'] = 'default-owner';
    await service.detail('conv_1', 23);
    expect(requests[0].headers.get('Authorization')).toBe('Bearer account-token');
    expect(requests[0].headers.has('X-Profile-Id')).toBe(false);
    expect(requests[0].headers.has('X-User-Id')).toBe(false);
    expect(requests[0].params).toEqual({ before_sequence: 23 });
  });

  it('preserves the same idempotency key and input on transport retry', async () => {
    const { requests, service } = await transport();
    const input = { conversation_id: '', client_request_id: 'request_1', text: 'recent math' };
    await service.send(input);
    await service.send(input);
    expect(requests[0].data).toBe(requests[1].data);
    expect(JSON.parse(requests[0].data)).toEqual({ ...input, contract_version: 'rizhi.assistant.v1' });
  });

  it('passes the additive explicit failed-turn retry protocol unchanged', async () => {
    const { requests, service, apiClient } = await transport();
    const input = { conversation_id: 'conv', client_request_id: 'new-request', text: '  canonical  ', retry_of_turn_id: 'failed-turn' };
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      return { data: { contract_version: 'rizhi.assistant.v1', conversation_id: 'conv', turn_id: 'retry-turn', status: 'processing', retry_of_turn_id: 'failed-turn' }, status: 200, statusText: 'OK', headers: {}, config };
    };
    const turn = await service.send(input);
    expect(JSON.parse(requests[0].data)).toEqual({ ...input, contract_version: 'rizhi.assistant.v1' });
    expect(turn.retry_of_turn_id).toBe('failed-turn');
  });

  it('encodes identities and only supplies supported reference pagination parameters', async () => {
    const { requests, service } = await transport();
    await service.references('turn/a', 'scope cursor', 12);
    expect(requests[0].url).toBe('/assistant/turns/turn%2Fa/references');
    expect(requests[0].params).toEqual({ cursor: 'scope cursor', limit: 12 });
  });

  it('rejects an unsupported server contract', async () => {
    const { service, apiClient } = await transport();
    apiClient.defaults.adapter = async config => ({ data: { contract_version: 'future' }, status: 200, statusText: 'OK', headers: {}, config });
    await expect(service.list()).rejects.toThrow('UNSUPPORTED_ASSISTANT_CONTRACT');
  });

  it('pages reports with the original encoded turn, default limit and cancellation', async () => {
    const { requests, service, apiClient } = await transport();
    const controller = new AbortController();
    await service.reports('old/turn', 'opaque cursor', undefined, controller.signal);
    expect(requests[0].url).toBe('/assistant/turns/old%2Fturn/reports');
    expect(requests[0].params).toEqual({ cursor: 'opaque cursor', limit: 12 });
    expect(requests[0].signal).toBe(controller.signal);
    await service.reports('old-turn', undefined, 6);
    expect(requests[1].params).toEqual({ limit: 6 });
    apiClient.defaults.adapter = async config => ({ data: { contract_version: 'future' }, status: 200, statusText: 'OK', headers: {}, config });
    await expect(service.reports('old-turn')).rejects.toThrow('UNSUPPORTED_ASSISTANT_CONTRACT');
  });

  it('sends management and polling operations without rewriting their bodies', async () => {
    const { requests, service } = await transport();
    await service.update('conv_1', { title: 'renamed', archived: true });
    await service.remove('conv_1');
    await service.turn('turn_1');
    expect(requests.map(request => [request.method, request.url])).toEqual([
      ['patch', '/assistant/conversations/conv_1'],
      ['delete', '/assistant/conversations/conv_1'],
      ['get', '/assistant/turns/turn_1'],
    ]);
    expect(JSON.parse(requests[0].data)).toEqual({ title: 'renamed', archived: true });
    expect(requests.every(request => !request.params?._t)).toBe(true);
  });

  it('passes cancellation through to the transport', async () => {
    const { requests, service } = await transport();
    const controller = new AbortController();
    await service.turn('turn_1', controller.signal);
    expect(requests[0].signal).toBe(controller.signal);
    controller.abort();
    await expect(service.turn('turn_1', controller.signal)).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(requests).toHaveLength(1);
  });
});
