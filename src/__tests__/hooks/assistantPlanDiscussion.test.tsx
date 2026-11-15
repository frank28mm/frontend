import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAssistant } from '@/hooks/useAssistant';
const service = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), send: vi.fn(), turn: vi.fn() }));
vi.mock('@/services/assistant', async original => ({ ...await original<object>(), assistantService: service }));
const context = { plan_id: 'plan_1', version: 2 };
const detail = (status = 'completed') => ({ conversation: { conversation_id: 'discussion', archived: false, plan_context: context, latest_turn: { turn_id: 't1', status } }, messages: [{ message_id: 'user', turn_id: 't1', role: 'user', sequence: 1, blocks: [{ type: 'text', text: '讨论目标' }] }], next_before_sequence: 0 });
beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear(); const stored = new Map([['user_id', 'owner'], ['access_token', 'token']]);
  vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v) });
  service.list.mockResolvedValue({ items: [] }); service.detail.mockResolvedValue(detail()); service.send.mockResolvedValue({ conversation_id: 'discussion', turn_id: 't1', status: 'completed' }); service.turn.mockResolvedValue({ conversation_id: 'discussion', turn_id: 't1', status: 'completed', messages: [] });
});
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
it('creates only a local draft until first send and inherits a fixed pointer on continuation', async () => {
  const view = renderHook(() => useAssistant());
  act(() => { view.result.current.newConversation(context); });
  expect(view.result.current.planContext).toEqual(context); expect(service.send).not.toHaveBeenCalled(); expect(service.detail).not.toHaveBeenCalled();
  await act(async () => { await view.result.current.send('讨论目标'); await view.result.current.send('再说说重点'); });
  expect(service.send.mock.calls.map(c => c[0].plan_context)).toEqual([context, context]);
  expect(service.send.mock.calls[0][0].conversation_id).toBe(''); expect(service.send.mock.calls[1][0].conversation_id).toBe('discussion');
  act(() => { view.result.current.newConversation(); }); expect(view.result.current.planContext).toBeUndefined();
});
it('transport retry and remount replay the same first-message binding and request id', async () => {
  service.send.mockRejectedValueOnce(new Error('offline'));
  const view = renderHook(() => useAssistant()); act(() => { view.result.current.newConversation(context); });
  await act(async () => { await view.result.current.send('讨论目标'); }); const first = service.send.mock.calls[0][0]; view.unmount();
  const restored = renderHook(() => useAssistant()); await waitFor(() => expect(restored.result.current.pending).toBe(true));
  expect(restored.result.current.planContext).toEqual(context);
  await act(async () => { await restored.result.current.retry(); }); expect(service.send.mock.calls[1][0]).toEqual(first);
});
it('history restores the binding and failed-turn retry retains it', async () => {
  service.detail.mockResolvedValue(detail('failed'));
  service.turn.mockResolvedValue({ conversation_id: 'discussion', turn_id: 't1', status: 'completed', messages: [] });
  const view = renderHook(() => useAssistant()); await act(async () => { await view.result.current.openConversation('discussion'); });
  expect(view.result.current.planContext).toEqual(context);
  await act(async () => { await view.result.current.retryFailed(); });
  expect(service.send.mock.calls[0][0]).toMatchObject({ plan_context: context, retry_of_turn_id: 't1', conversation_id: 'discussion', text: '讨论目标' });
});
it('account change cancels old request and clears its binding', async () => {
  let resolve!: (value: unknown) => void; service.send.mockImplementation(() => new Promise(r => { resolve = r; }));
  const view = renderHook(() => useAssistant()); act(() => { view.result.current.newConversation(context); });
  let sending!: Promise<void>; act(() => { sending = view.result.current.send('讨论目标'); });
  const signal = service.send.mock.calls[0][1] as AbortSignal;
  act(() => { localStorage.setItem('user_id', 'other'); window.dispatchEvent(new Event('auth:changed')); });
  expect(signal.aborted).toBe(true); expect(view.result.current.planContext).toBeUndefined();
  await act(async () => { resolve({ conversation_id: 'old', turn_id: 'late', status: 'completed' }); await sending; });
  expect(view.result.current.conversationId).toBe(''); expect(view.result.current.planContext).toBeUndefined(); expect(service.detail).not.toHaveBeenCalled();
});
it.each([true, false])('persisted accepted-turn recovery must not silently change the original fixed version (latest turn: %s)', async hasLatestTurn => {
  sessionStorage.setItem('rizhi-assistant:owner', JSON.stringify({ conversationId: 'discussion', turnId: 't1', planContext: context }));
  service.detail.mockResolvedValue({ ...detail(), conversation: { ...detail().conversation, latest_turn: hasLatestTurn ? detail().conversation.latest_turn : undefined, plan_context: { plan_id: 'plan_1', version: 3 } } });
  const view = renderHook(() => useAssistant());
  await waitFor(() => expect(view.result.current.error).not.toBe(''));
  expect(view.result.current.planContext).toEqual(context); expect(service.turn).not.toHaveBeenCalled();
  await act(async () => { await view.result.current.send('不能漂移到新版'); }); expect(service.send).not.toHaveBeenCalled();
});
it('server omission or mismatch after first send cannot silently drop the local binding', async () => {
  service.detail.mockResolvedValue({ ...detail(), conversation: { conversation_id: 'discussion', archived: false } });
  const view = renderHook(() => useAssistant()); act(() => { view.result.current.newConversation(context); });
  await act(async () => { await view.result.current.send('讨论目标'); });
  expect(view.result.current.planContext).toEqual(context); expect(view.result.current.error).not.toBe('');
  await act(async () => { await view.result.current.send('继续'); }); expect(service.send).toHaveBeenCalledTimes(1);
});
it.each([{ plan_id: 'plan_1', version: 0 }, { plan_id: 'plan_1', version: -1 }, { plan_id: 'plan_1', version: 1.5 }, { plan_id: '', version: 2 }])('rejects invalid local pointer %s', async invalid => {
  const view = renderHook(() => useAssistant()); await act(async () => { view.result.current.newConversation(invalid); }); expect(view.result.current.planContext).toBeUndefined(); expect(service.send).not.toHaveBeenCalled();
});
