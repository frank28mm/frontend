import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useAssistant } from '@/hooks/useAssistant';
import type { ReportConfirmation } from '@/services/assistant';

const service = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), turn: vi.fn(), send: vi.fn(), update: vi.fn(), remove: vi.fn(), getConfirmation: vi.fn(), executeConfirmation: vi.fn() }));
vi.mock('@/services/assistant', async original => ({ ...await original<object>(), assistantService: service }));
export const confirmation = (): ReportConfirmation => ({ confirmation_id: 'c1', conversation_id: 'conv', turn_id: 't1', status: 'pending', expires_at: '2026-10-11T12:00:00Z', preview: { scope: { profile_id: 'child/?', subject: 'math', from_date: '2026-10-01', through_date: '2026-10-11' }, child_name: '孩子', time_zone: 'Asia/Shanghai', goal: '观察', content_version: 'parent_report.v1', cost: { report_coupons: 1, bt: 0 }, eligibility: { eligible: false, submission_count: 0, distinct_days: 0, required_count: 3, required_days: 3 }, quota_available: false, scope_revision: 't1' } });
const detail = () => ({ conversation: { conversation_id: 'conv', archived: false }, messages: [{ message_id: 'm1', turn_id: 't1', sequence: 1, role: 'assistant', blocks: [{ type: 'action_confirmation', action_confirmation: confirmation() }] }], next_before_sequence: 0 });
beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear(); const stored = new Map([['user_id', 'owner'], ['access_token', 'token']]);
  vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v) });
  service.list.mockResolvedValue({ items: [] }); service.detail.mockResolvedValue(detail()); service.getConfirmation.mockResolvedValue(confirmation());
});
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); vi.unstubAllGlobals(); });
async function opened() {
  const view = renderHook(() => useAssistant());
  await act(async () => { await view.result.current.openConversation('conv'); });
  await waitFor(() => expect(view.result.current.confirmations.c1?.phase).toBe('ready'));
  return view;
}
it('opens with GET only, permits explicit execute despite frozen readiness false and serializes all mutations', async () => {
  const view = await opened();
  expect(service.executeConfirmation).not.toHaveBeenCalled();
  let resolve!: (v: ReportConfirmation) => void;
  service.executeConfirmation.mockImplementation(() => new Promise(r => { resolve = r; }));
  let execution!: Promise<void>;
  act(() => { execution = view.result.current.executeConfirmation('c1'); });
  await act(async () => {
    await view.result.current.executeConfirmation('c1'); await view.result.current.send('hello');
    await view.result.current.openConversation('other'); view.result.current.newConversation();
    await view.result.current.updateConversation('conv', { archived: true }); await view.result.current.removeConversation('conv');
  });
  expect(service.executeConfirmation).toHaveBeenCalledTimes(1); expect(service.send).not.toHaveBeenCalled(); expect(service.remove).not.toHaveBeenCalled(); expect(service.update).not.toHaveBeenCalled(); expect(service.detail).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ ...confirmation(), status: 'executed', job_id: 'job/?' }); await execution; });
  expect(view.result.current.confirmations.c1.confirmation.job_id).toBe('job/?');
});
it('unknown POST first GETs and requires an explicit same ID retry, preserved across refresh', async () => {
  const view = await opened(); service.executeConfirmation.mockRejectedValue(new Error('network'));
  await act(async () => { await view.result.current.executeConfirmation('c1'); });
  expect(service.getConfirmation).toHaveBeenCalledTimes(2); expect(view.result.current.confirmations.c1.phase).toBe('retryable');
  expect(JSON.parse(sessionStorage.getItem('rizhi-assistant:owner')!).confirmation).toMatchObject({ accountId: 'owner', confirmationId: 'c1', body: { contract_version: 'rizhi.assistant.v1' } });
  view.unmount(); service.executeConfirmation.mockClear();
  const restored = renderHook(() => useAssistant());
  await waitFor(() => expect(restored.result.current.confirmations.c1?.phase).toBe('retryable'));
  expect(service.executeConfirmation).not.toHaveBeenCalled();
  service.executeConfirmation.mockResolvedValue({ ...confirmation(), status: 'executed', job_id: 'job' });
  await act(async () => { await restored.result.current.executeConfirmation('c1'); });
  expect(service.executeConfirmation.mock.calls[0][0]).toBe('c1');
});
it('late POST after account change has no storage or state effects', async () => {
  const view = await opened(); let resolve!: (v: ReportConfirmation) => void;
  service.executeConfirmation.mockImplementation(() => new Promise(r => { resolve = r; }));
  let execution!: Promise<void>; act(() => { execution = view.result.current.executeConfirmation('c1'); });
  act(() => { localStorage.setItem('user_id', 'other'); window.dispatchEvent(new Event('auth:changed')); });
  await act(async () => { resolve({ ...confirmation(), status: 'executed', job_id: 'job' }); await execution; });
  expect(view.result.current.messages).toEqual([]); expect(view.result.current.confirmations).toEqual({});
  expect(sessionStorage.getItem('rizhi-assistant:other')).toBeNull();
});
it.each([402, 409])('definitive %s error is honest, not an automatic POST retry', async status => {
  const view = await opened(); service.executeConfirmation.mockRejectedValue({ response: { status, data: { detail: status === 402 ? 'quota_insufficient' : 'ASSISTANT_CONFIRMATION_NOT_READY' } } });
  await act(async () => { await view.result.current.executeConfirmation('c1'); });
  expect(view.result.current.confirmations.c1.error).toMatch(status === 402 ? /券/ : /条件/);
  expect(view.result.current.confirmationLocked).toBe(false); expect(service.executeConfirmation).toHaveBeenCalledTimes(1);
});
it.each(['ASSISTANT_CONFIRMATION_INVALID', 'ASSISTANT_CONFIRMATION_NOT_READY'])('real report AxiosError 409 prefers %s over ERR_BAD_REQUEST and clears recovery', async detail => {
  const view = await opened();
  service.executeConfirmation.mockRejectedValue(new AxiosError('Request failed with status code 409', AxiosError.ERR_BAD_REQUEST, undefined, undefined, {
    status: 409, statusText: 'Conflict', headers: {}, config: { headers: new AxiosHeaders() }, data: { detail },
  }));
  await act(async () => { await view.result.current.executeConfirmation('c1'); });
  expect(view.result.current.confirmationLocked).toBe(false);
  expect(view.result.current.confirmations.c1.phase).toBe(detail === 'ASSISTANT_CONFIRMATION_INVALID' ? 'invalid' : 'ready');
  expect(view.result.current.confirmations.c1.error).toMatch(detail === 'ASSISTANT_CONFIRMATION_INVALID' ? /失效/ : /条件/);
  expect(JSON.parse(sessionStorage.getItem('rizhi-assistant:owner')!).confirmation).toBeUndefined();
  expect(service.getConfirmation).toHaveBeenCalledTimes(1);
  expect(service.executeConfirmation).toHaveBeenCalledTimes(1);
});
it.each([null, 409, {}, ['ASSISTANT_CONFIRMATION_INVALID'], ''])('ignores non-string or empty business detail %s and preserves valid local code fallback', async detail => {
  const view = await opened();
  service.executeConfirmation.mockRejectedValue(new AxiosError('Conflict', 'ASSISTANT_CONFIRMATION_INVALID', undefined, undefined, {
    status: 409, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: { detail },
  }));
  await act(async () => { await view.result.current.executeConfirmation('c1'); });
  expect(view.result.current.confirmationLocked).toBe(false);
  expect(view.result.current.confirmations.c1.phase).toBe('invalid');
  expect(service.getConfirmation).toHaveBeenCalledTimes(1);
});
it('storage refusal fails closed before POST, with no dangling lock', async () => {
  const view = await opened(); vi.spyOn(Object.getPrototypeOf(window.sessionStorage), 'setItem').mockImplementation(() => { throw new DOMException('Quota', 'QuotaExceededError'); });
  await act(async () => { await view.result.current.executeConfirmation('c1'); });
  expect(service.executeConfirmation).not.toHaveBeenCalled(); expect(view.result.current.confirmationLocked).toBe(false); expect(view.result.current.confirmations.c1.error).toMatch(/存储/);
});
it('unknown execute restored as executed via GET never reposts', async () => {
  const view = await opened(); service.executeConfirmation.mockRejectedValue(new Error('lost'));
  service.getConfirmation.mockResolvedValue({ ...confirmation(), status: 'executed', job_id: 'same-job' });
  await act(async () => { await view.result.current.executeConfirmation('c1'); });
  expect(view.result.current.confirmations.c1.confirmation.job_id).toBe('same-job'); expect(view.result.current.confirmationLocked).toBe(false); expect(service.executeConfirmation).toHaveBeenCalledTimes(1);
});
it('source excluded from history is fetched from the saved canonical turn on refresh', async () => {
  const view = await opened(); service.executeConfirmation.mockRejectedValue(new Error('lost'));
  await act(async () => { await view.result.current.executeConfirmation('c1'); }); view.unmount();
  service.detail.mockResolvedValue({ ...detail(), messages: [] }); service.turn.mockResolvedValue({ conversation_id: 'conv', turn_id: 't1', messages: detail().messages });
  const restored = renderHook(() => useAssistant()); await waitFor(() => expect(restored.result.current.confirmations.c1?.phase).toBe('retryable')); expect(service.turn).toHaveBeenCalledWith('t1', expect.any(AbortSignal));
});
it('late GET after conversation switch never overlays the new conversation', async () => {
  let resolve!: (v: ReportConfirmation) => void; service.getConfirmation.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const view = renderHook(() => useAssistant()); let opening!: Promise<void>; act(() => { opening = view.result.current.openConversation('conv'); });
  await waitFor(() => expect(service.getConfirmation).toHaveBeenCalledTimes(1)); service.detail.mockResolvedValue({ conversation: { conversation_id: 'other', archived: false }, messages: [], next_before_sequence: 0 });
  await act(async () => { await view.result.current.openConversation('other'); });
  await act(async () => { resolve(confirmation()); await opening; }); expect(view.result.current.conversationId).toBe('other'); expect(view.result.current.confirmations).toEqual({});
});
it('unmount fences late POST without clearing unresolved recovery', async () => {
  const view = await opened(); let resolve!: (v: ReportConfirmation) => void; service.executeConfirmation.mockImplementation(() => new Promise(r => { resolve = r; }));
  let work!: Promise<void>; act(() => { work = view.result.current.executeConfirmation('c1'); }); view.unmount(); const saved = sessionStorage.getItem('rizhi-assistant:owner');
  await act(async () => { resolve({ ...confirmation(), status: 'executed', job_id: 'job' }); await work; }); expect(sessionStorage.getItem('rizhi-assistant:owner')).toBe(saved);
});
it('503 with unknown outcome remains refreshable and does not invent acceptance', async () => {
  const view = await opened(); service.executeConfirmation.mockRejectedValue({ response: { status: 503, data: { detail: 'ASSISTANT_UNAVAILABLE' } } }); service.getConfirmation.mockRejectedValue(new Error('offline'));
  await act(async () => { await view.result.current.executeConfirmation('c1'); }); expect(view.result.current.confirmations.c1.phase).toBe('uncertain'); expect(view.result.current.confirmations.c1.error).toMatch(/暂不可用/); expect(view.result.current.confirmationLocked).toBe(true);
});
it('missing source after recovery remains locked but permits explicit GET-only reload', async () => {
  const view = await opened(); service.executeConfirmation.mockRejectedValue(new Error('lost')); await act(async () => { await view.result.current.executeConfirmation('c1'); }); view.unmount();
  service.detail.mockRejectedValue(new Error('offline')); const restored = renderHook(() => useAssistant()); await waitFor(() => expect(restored.result.current.error).not.toBe(''));
  service.detail.mockResolvedValue(detail()); await act(async () => { await restored.result.current.retryConfirmationRecovery(); }); expect(restored.result.current.confirmations.c1.phase).toBe('retryable'); expect(service.executeConfirmation).toHaveBeenCalledTimes(1);
});
it('a definitive confirmation GET 404 clears uncertainty without POST or fabricated acceptance', async () => {
  const view = await opened(); service.executeConfirmation.mockRejectedValue(new Error('lost')); service.getConfirmation.mockRejectedValue({ response: { status: 404, data: { detail: 'ASSISTANT_NOT_FOUND' } } });
  await act(async () => { await view.result.current.executeConfirmation('c1'); }); expect(view.result.current.confirmationLocked).toBe(false); expect(view.result.current.confirmations.c1.phase).toBe('invalid');
});
it('unreadable live identity fails closed without POST or navigation', async () => {
  const view = await opened(); vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
  await act(async () => { await view.result.current.executeConfirmation('c1'); }); expect(service.executeConfirmation).not.toHaveBeenCalled(); expect(view.result.current.canNavigateConfirmation()).toBe(false);
});
it('history GET started before POST cannot resurrect pending after execution', async () => {
  service.detail.mockResolvedValue({ ...detail(), next_before_sequence: 2 }); const view = await opened();
  let resolveDetail!: (d: ReturnType<typeof detail>) => void; service.detail.mockImplementationOnce(() => new Promise(r => { resolveDetail = r; }));
  let history!: Promise<void>; act(() => { history = view.result.current.olderMessages(); });
  let resolvePost!: (c: ReportConfirmation) => void; service.executeConfirmation.mockImplementation(() => new Promise(r => { resolvePost = r; }));
  let post!: Promise<void>; act(() => { post = view.result.current.executeConfirmation('c1'); });
  let resolveGet!: (c: ReportConfirmation) => void; service.getConfirmation.mockImplementationOnce(() => new Promise(r => { resolveGet = r; }));
  await act(async () => { resolveDetail(detail()); });
  await act(async () => { resolvePost({ ...confirmation(), status: 'executed', job_id: 'job' }); await post; });
  await act(async () => { if (resolveGet) resolveGet(confirmation()); await history; });
  expect(view.result.current.confirmations.c1.confirmation.status).toBe('executed');
});
it.each(['executed', 'missing', 'archived'])('recovery releases lock for %s source using authoritative GET', async kind => {
  const view = await opened(); service.executeConfirmation.mockRejectedValue(new Error('lost')); await act(async () => { await view.result.current.executeConfirmation('c1'); }); view.unmount();
  if (kind === 'archived') { service.detail.mockResolvedValue({ ...detail(), conversation: { conversation_id: 'conv', archived: true } }); service.getConfirmation.mockResolvedValue({ ...confirmation(), status: 'invalidated' }); }
  else { service.detail.mockRejectedValue({ response: { status: 404 } }); if (kind === 'executed') service.getConfirmation.mockResolvedValue({ ...confirmation(), status: 'executed', job_id: 'retained-job' }); else service.getConfirmation.mockRejectedValue({ response: { status: 404 } }); }
  const restored = renderHook(() => useAssistant()); await waitFor(() => expect(restored.result.current.confirmationLocked).toBe(false));
  if (kind === 'executed') { expect(restored.result.current.recoveredConfirmation?.job_id).toBe('retained-job'); expect(restored.result.current.messages).toEqual([]); }
  expect(service.executeConfirmation).toHaveBeenCalledTimes(1);
});
it.each(['refresh', 'switch'])('preserves account-isolated unresolved record through %s identity changes, with GET-only restore', async kind => {
  const view = await opened(); service.executeConfirmation.mockRejectedValue(new Error('lost')); await act(async () => { await view.result.current.executeConfirmation('c1'); });
  const saved = sessionStorage.getItem('rizhi-assistant:owner');
  act(() => { localStorage.setItem(kind === 'refresh' ? 'access_token' : 'user_id', kind === 'refresh' ? 'new-token' : 'other'); window.dispatchEvent(new Event('auth:changed')); });
  expect(sessionStorage.getItem('rizhi-assistant:owner')).toBe(saved);
  if (kind === 'switch') { expect(view.result.current.messages).toEqual([]); expect(sessionStorage.getItem('rizhi-assistant:other')).toBeNull(); act(() => { localStorage.setItem('user_id', 'owner'); window.dispatchEvent(new Event('auth:changed')); }); }
  await waitFor(() => expect(view.result.current.confirmations.c1?.phase).toBe('retryable')); expect(service.executeConfirmation).toHaveBeenCalledTimes(1);
  expect(service.getConfirmation.mock.calls.at(-1)![1].token).toBe(kind === 'refresh' ? 'new-token' : 'token');
});
it('two GETs resolved out of order preserve latest executed result', async () => {
  service.detail.mockResolvedValue({ ...detail(), next_before_sequence: 2 }); const view = await opened();
  let first!: (c: ReportConfirmation) => void; let second!: (c: ReportConfirmation) => void;
  service.getConfirmation.mockImplementationOnce(() => new Promise(r => { first = r; })).mockImplementationOnce(() => new Promise(r => { second = r; }));
  let a!: Promise<void>, b!: Promise<void>; act(() => { a = view.result.current.olderMessages(); b = view.result.current.olderMessages(); });
  await waitFor(() => expect(second).toBeDefined());
  await act(async () => { second({ ...confirmation(), status: 'executed', job_id: 'job' }); await b; });
  await act(async () => { first(confirmation()); await a; }); expect(view.result.current.confirmations.c1.confirmation.status).toBe('executed');
});
