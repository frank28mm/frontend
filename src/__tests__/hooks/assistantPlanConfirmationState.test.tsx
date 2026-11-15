import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useAssistant } from '@/hooks/useAssistant';
import type { PlanConfirmation } from '@/services/assistantPlanConfirmation';
const service = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), turn: vi.fn(), send: vi.fn(), update: vi.fn(), remove: vi.fn() }));
const plans = vi.hoisted(() => ({ getConfirmation: vi.fn(), executeConfirmation: vi.fn() }));
vi.mock('@/services/assistant', async original => ({ ...await original<object>(), assistantService: service }));
vi.mock('@/services/assistantPlanConfirmation', async original => ({ ...await original<object>(), planConfirmationService: plans }));
const proposal = (): PlanConfirmation => ({ confirmation_id: 'pc1', conversation_id: 'conv', turn_id: 't1', status: 'pending', expires_at: '2099-10-11T12:00:00Z', preview: { scope: { profile_id: 'child', subject: 'math', from_date: '2026-10-01', through_date: '2026-10-11' }, child_name: '孩子', time_zone: 'Asia/Shanghai', goal: '复习', content_version: 'revision_plan.v1', generation_available: true } });
const executed = () => ({ ...proposal(), status: 'executed' as const, job_id: 'job', plan_id: 'plan' });
const detail = () => ({ conversation: { conversation_id: 'conv', archived: false }, messages: [{ message_id: 'm', turn_id: 't1', role: 'assistant', sequence: 1, blocks: [{ type: 'plan_confirmation', plan_confirmation: proposal() }] }], next_before_sequence: 0 });
beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear(); const stored = new Map([['user_id', 'owner'], ['access_token', 'token']]);
  vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v) });
  service.list.mockResolvedValue({ items: [] }); service.detail.mockResolvedValue(detail()); plans.getConfirmation.mockResolvedValue(proposal()); plans.executeConfirmation.mockResolvedValue(executed());
});
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
async function opened() { const view = renderHook(() => useAssistant()); await act(async () => { await view.result.current.openConversation('conv'); }); await waitFor(() => expect(view.result.current.confirmations.pc1?.phase).toBe('ready')); return view; }
const update = () => ({ ...proposal(), preview: { ...proposal().preview, target_plan_id: 'plan', base_version: 1 } });
function boundUpdate() {
  service.detail.mockResolvedValue({ ...detail(), conversation: { conversation_id: 'conv', archived: false, plan_context: { plan_id: 'plan', version: 1 } }, messages: [{ ...detail().messages[0], blocks: [{ type: 'plan_confirmation', plan_confirmation: update() }] }] });
  plans.getConfirmation.mockResolvedValue(update());
  plans.executeConfirmation.mockResolvedValue({ ...update(), status: 'executed', job_id: 'job', plan_id: 'plan' });
}
it('canonical hydration rejects preview drift against an already verified update', async () => {
  boundUpdate(); const initial = await service.detail(); service.detail.mockResolvedValue({ ...initial, next_before_sequence: 1 });
  const view = await opened();
  const changed = { ...update(), preview: { ...update().preview, goal: '另一目标' } };
  service.detail.mockResolvedValue({ ...initial, messages: [{ ...initial.messages[0], blocks: [{ type: 'plan_confirmation', plan_confirmation: changed }] }] });
  await act(async () => { await view.result.current.olderMessages(); });
  expect(view.result.current.confirmations.pc1.phase).toBe('invalid');
  await act(async () => { await view.result.current.executeConfirmation('pc1'); }); expect(plans.executeConfirmation).not.toHaveBeenCalled();
});
it('canonical hydration accepts legitimate execution progression without changing source metadata', async () => {
  boundUpdate(); const initial = await service.detail(); service.detail.mockResolvedValue({ ...initial, next_before_sequence: 1 });
  const view = await opened(); const complete = { ...update(), status: 'executed' as const, job_id: 'job', plan_id: 'plan' };
  service.detail.mockResolvedValue({ ...initial, messages: [{ ...initial.messages[0], blocks: [{ type: 'plan_confirmation', plan_confirmation: complete }] }] }); plans.getConfirmation.mockResolvedValue(complete);
  await act(async () => { await view.result.current.olderMessages(); });
  expect(view.result.current.confirmations.pc1).toMatchObject({ confirmation: { status: 'executed' }, error: '' });
});
it('bound ordinary creation remains forbidden', async () => {
  service.detail.mockResolvedValue({ ...detail(), conversation: { conversation_id: 'conv', archived: false, plan_context: { plan_id: 'plan', version: 1 } } });
  const view = renderHook(() => useAssistant()); await act(async () => { await view.result.current.openConversation('conv'); });
  expect(view.result.current.confirmations.pc1.phase).toBe('invalid');
  await act(async () => { await view.result.current.executeConfirmation('pc1'); }); expect(plans.executeConfirmation).not.toHaveBeenCalled();
});
it('restored update rejects a canonical binding that drifted from the saved source', async () => {
  boundUpdate(); sessionStorage.setItem('rizhi-assistant:owner', JSON.stringify({ conversationId: 'conv', planContext: { plan_id: 'plan', version: 2 }, confirmation: { kind: 'plan', accountId: 'owner', conversationId: 'conv', confirmationId: 'pc1', turnId: 't1', body: { contract_version: 'rizhi.assistant.v1' } } }));
  const view = renderHook(() => useAssistant()); await waitFor(() => expect(view.result.current.loadingConversation).toBe(false));
  await waitFor(() => expect(view.result.current.error).toBe('方案讨论绑定不兼容，请重新打开会话。'));
  expect(view.result.current.confirmations).toEqual({}); expect(plans.executeConfirmation).not.toHaveBeenCalled();
});
it('source-less recovery cannot authorize an update using only cached binding', async () => {
  boundUpdate(); service.detail.mockRejectedValue({ response: { status: 404 } });
  sessionStorage.setItem('rizhi-assistant:owner', JSON.stringify({ conversationId: 'conv', planContext: { plan_id: 'plan', version: 1 }, confirmation: { kind: 'plan', accountId: 'owner', conversationId: 'conv', confirmationId: 'pc1', turnId: 't1', body: { contract_version: 'rizhi.assistant.v1' } } }));
  const view = renderHook(() => useAssistant()); await waitFor(() => expect(view.result.current.error).toBe('无法核实上次确认，请重新加载会话。'));
  expect(view.result.current.confirmations).toEqual({}); expect(view.result.current.recoveredConfirmation).toBeUndefined();
});
it('late bound update execution cannot affect another account', async () => {
  boundUpdate(); const view = await opened(); let resolve!: (c: PlanConfirmation) => void;
  plans.executeConfirmation.mockImplementation(() => new Promise(r => { resolve = r; }));
  let work!: Promise<void>; act(() => { work = view.result.current.executeConfirmation('pc1'); });
  act(() => { localStorage.setItem('user_id', 'other'); window.dispatchEvent(new Event('auth:changed')); });
  await act(async () => { resolve({ ...update(), status: 'executed', job_id: 'job', plan_id: 'plan' }); await work; });
  expect(view.result.current.confirmations).toEqual({}); expect(view.result.current.planContext).toBeUndefined();
});
it('bound exact update executes once and retains the immutable source binding', async () => {
  boundUpdate(); const view = await opened();
  await act(async () => { await Promise.all([view.result.current.executeConfirmation('pc1'), view.result.current.executeConfirmation('pc1')]); });
  expect(plans.executeConfirmation).toHaveBeenCalledTimes(1);
  expect(view.result.current.planContext).toEqual({ plan_id: 'plan', version: 1 });
  expect(view.result.current.confirmations.pc1.confirmation.status).toBe('executed');
});
it('bound update recovers on remount and retries only the same confirmation', async () => {
  boundUpdate(); const view = await opened(); plans.executeConfirmation.mockRejectedValue(new Error('lost'));
  await act(async () => { await view.result.current.executeConfirmation('pc1'); });
  expect(view.result.current.confirmationLocked).toBe(true); view.unmount();
  const restored = renderHook(() => useAssistant());
  await waitFor(() => expect(restored.result.current.confirmations.pc1?.phase).toBe('retryable'));
  expect(restored.result.current.planContext).toEqual({ plan_id: 'plan', version: 1 });
  plans.executeConfirmation.mockResolvedValue({ ...update(), status: 'executed', job_id: 'job', plan_id: 'plan' });
  await act(async () => { await restored.result.current.executeConfirmation('pc1'); });
  expect(plans.executeConfirmation).toHaveBeenCalledTimes(2);
  expect(restored.result.current.confirmationLocked).toBe(false);
});
it.each([undefined, { plan_id: 'other', version: 1 }, { plan_id: 'plan', version: 2 }])('refuses an update without its exact canonical binding %s', async plan_context => {
  boundUpdate(); const d = await service.detail(); service.detail.mockResolvedValue({ ...d, conversation: { ...d.conversation, plan_context } });
  const view = renderHook(() => useAssistant()); await act(async () => { await view.result.current.openConversation('conv'); await view.result.current.executeConfirmation('pc1'); });
  expect(plans.executeConfirmation).not.toHaveBeenCalled();
  expect(view.result.current.confirmations.pc1?.phase).toBe('invalid');
});
it('GET-only hydration then explicit button executes once with shared mutation lock', async () => {
  const view = await opened(); expect(plans.executeConfirmation).not.toHaveBeenCalled();
  let resolve!: (c: PlanConfirmation) => void; plans.executeConfirmation.mockImplementation(() => new Promise(r => { resolve = r; }));
  let work!: Promise<void>; act(() => { work = view.result.current.executeConfirmation('pc1'); });
  await act(async () => { await view.result.current.executeConfirmation('pc1'); await view.result.current.send('确认'); view.result.current.newConversation(); });
  expect(plans.executeConfirmation).toHaveBeenCalledTimes(1); expect(service.send).not.toHaveBeenCalled();
  await act(async () => { resolve(executed()); await work; }); expect(view.result.current.confirmations.pc1.confirmation.status).toBe('executed');
});
it('generation flag off blocks programmatic execution too', async () => {
  plans.getConfirmation.mockResolvedValue({ ...proposal(), preview: { ...proposal().preview, generation_available: false } });
  const view = await opened(); await act(async () => { await view.result.current.executeConfirmation('pc1'); }); expect(plans.executeConfirmation).not.toHaveBeenCalled();
});
it('uncertain plan execution survives remount with GET-only same-kind recovery', async () => {
  const view = await opened(); plans.executeConfirmation.mockRejectedValue(new Error('lost'));
  await act(async () => { await view.result.current.executeConfirmation('pc1'); }); expect(view.result.current.confirmationLocked).toBe(true); view.unmount();
  const restored = renderHook(() => useAssistant()); await waitFor(() => expect(restored.result.current.confirmations.pc1?.phase).toBe('retryable')); expect(plans.executeConfirmation).toHaveBeenCalledTimes(1);
  plans.getConfirmation.mockResolvedValue(executed()); await act(async () => { await restored.result.current.refreshConfirmation('pc1'); }); expect(restored.result.current.confirmationLocked).toBe(false);
});
it.each([['ASSISTANT_CONFIRMATION_INVALID', 409], ['ASSISTANT_CONFIRMATION_NOT_READY', 409], ['PLAN_GENERATION_DISABLED', 503], ['ASSISTANT_NOT_FOUND', 404]] as const)('handles definitive %s without automatic execute', async (code, status) => {
  const view = await opened(); plans.executeConfirmation.mockRejectedValue({ response: { status, data: { detail: code } } });
  await act(async () => { await view.result.current.executeConfirmation('pc1'); }); expect(plans.executeConfirmation).toHaveBeenCalledTimes(1); expect(view.result.current.confirmations.pc1.error).not.toBe('');
});
it('new source turn prevents executing an older pending plan', async () => {
  service.detail.mockResolvedValue({ ...detail(), messages: [...detail().messages, { message_id: 'new', turn_id: 't2', role: 'user', sequence: 2, blocks: [{ type: 'text', text: '改孩子' }] }] });
  const view = await opened(); await act(async () => { await view.result.current.executeConfirmation('pc1'); }); expect(plans.executeConfirmation).not.toHaveBeenCalled();
});
it('late plan POST cannot mutate a new account', async () => {
  const view = await opened(); let resolve!: (c: PlanConfirmation) => void; plans.executeConfirmation.mockImplementation(() => new Promise(r => { resolve = r; }));
  let work!: Promise<void>; act(() => { work = view.result.current.executeConfirmation('pc1'); });
  act(() => { localStorage.setItem('user_id', 'other'); window.dispatchEvent(new Event('auth:changed')); });
  await act(async () => { resolve(executed()); await work; }); expect(view.result.current.confirmations).toEqual({});
});
it('real AxiosError 503 business detail disables generation and releases unresolved recovery without GET or POST retry', async () => {
  const view = await opened();
  plans.executeConfirmation.mockRejectedValue(new AxiosError('Request failed with status code 503', AxiosError.ERR_BAD_RESPONSE, undefined, undefined, {
    status: 503, statusText: 'Service Unavailable', headers: {}, config: { headers: new AxiosHeaders() }, data: { detail: 'PLAN_GENERATION_DISABLED' },
  }));
  await act(async () => { await view.result.current.executeConfirmation('pc1'); });
  expect(view.result.current.confirmationLocked).toBe(false);
  expect(view.result.current.confirmations.pc1).toMatchObject({ phase: 'ready', confirmation: { status: 'pending', preview: { generation_available: false } }, error: '方案生成暂不可用，请稍后刷新确认状态。' });
  expect(JSON.parse(sessionStorage.getItem('rizhi-assistant:owner')!).confirmation).toBeUndefined();
  expect(plans.getConfirmation).toHaveBeenCalledTimes(1);
  await act(async () => { await view.result.current.executeConfirmation('pc1'); });
  expect(plans.executeConfirmation).toHaveBeenCalledTimes(1);
});
it('late real disabled-plan AxiosError preserves old recovery and does not affect a new account', async () => {
  const view = await opened(); let reject!: (error: unknown) => void;
  plans.executeConfirmation.mockImplementation(() => new Promise((_, no) => { reject = no; }));
  let work!: Promise<void>; act(() => { work = view.result.current.executeConfirmation('pc1'); });
  const saved = sessionStorage.getItem('rizhi-assistant:owner');
  act(() => { localStorage.setItem('user_id', 'other'); window.dispatchEvent(new Event('auth:changed')); });
  await act(async () => {
    reject(new AxiosError('Disabled', AxiosError.ERR_BAD_RESPONSE, undefined, undefined, { status: 503, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: { detail: 'PLAN_GENERATION_DISABLED' } }));
    await work;
  });
  expect(view.result.current.confirmations).toEqual({});
  expect(view.result.current.confirmationLocked).toBe(false);
  expect(sessionStorage.getItem('rizhi-assistant:owner')).toBe(saved);
  expect(sessionStorage.getItem('rizhi-assistant:other')).toBeNull();
});
