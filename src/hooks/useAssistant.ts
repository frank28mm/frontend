import { useCallback, useEffect, useRef, useState } from 'react';
import { ASSISTANT_CONTRACT, canonicalConfirmation, validAssistantPlanContext, validateReportConfirmation as validateReportOnly, assistantService, type AssistantPlanContext, type ReportConfirmation as ReportOnlyConfirmation, type AssistantConfirmationContext, type AssistantMessage, type Conversation, type SendTurn, type LatestAssistantTurn } from '@/services/assistant';
import { isConfirmationIdentifier, isConfirmationPathID } from '@/services/assistantConfirmationValidation';
import { isPlanConfirmation, matchesConfirmationPlanContext, validatePlanConfirmation, planConfirmationService, type PlanConfirmation } from '@/services/assistantPlanConfirmation';

type ReportConfirmation = ReportOnlyConfirmation | PlanConfirmation;
const validateReportConfirmation = (value: unknown, expected: { confirmation_id: string; conversation_id?: string; turn_id?: string; previous?: ReportConfirmation }): value is ReportConfirmation => {
  const plan = (value as PlanConfirmation | undefined)?.preview?.content_version === 'revision_plan.v1';
  if (expected.previous && isPlanConfirmation(expected.previous) !== plan) return false;
  return plan ? validatePlanConfirmation(value, { ...expected, previous: expected.previous as PlanConfirmation | undefined }) : validateReportOnly(value, { ...expected, previous: expected.previous as ReportOnlyConfirmation | undefined });
};
function confirmationRequest(previous: ReportConfirmation, context: Omit<AssistantConfirmationContext, 'expected'>, signal: AbortSignal, execute = false) {
  const expected = { conversation_id: previous.conversation_id, turn_id: previous.turn_id, previous };
  return isPlanConfirmation(previous)
    ? planConfirmationService[execute ? 'executeConfirmation' : 'getConfirmation'](previous.confirmation_id, { ...context, expected: { ...expected, previous } }, signal)
    : assistantService[execute ? 'executeConfirmation' : 'getConfirmation'](previous.confirmation_id, { ...context, expected: { ...expected, previous } }, signal);
}
type ConfirmationRecovery = { kind?: 'plan'; accountId: string; conversationId: string; confirmationId: string; turnId: string; body: { contract_version: string } };
export type ConfirmationOverlay = { confirmation: ReportConfirmation; phase: 'checking' | 'ready' | 'executing' | 'uncertain' | 'retryable' | 'invalid'; error: string };

type Recovery = { conversationId: string; request?: SendTurn; turnId?: string; planContext?: AssistantPlanContext };
type State = {
  conversationId: string;
  planContext?: AssistantPlanContext;
  messages: AssistantMessage[];
  conversations: Conversation[];
  listCursor?: string;
  beforeSequence: number;
  archived: boolean;
  pending: boolean;
  loadingConversation: boolean;
  error: string;
  historyError: string;
  latestTurn?: LatestAssistantTurn;
  failedTurns: LatestAssistantTurn[];
  confirmations: Record<string, ConfirmationOverlay>;
  confirmationLocked: boolean;
  recoveredConfirmation?: ReportConfirmation;
};
const emptyState = (): State => ({ conversationId: '', messages: [], conversations: [], beforeSequence: 0, archived: false, pending: false, loadingConversation: false, error: '', historyError: '', failedTurns: [], confirmations: {}, confirmationLocked: false });
const canonicalText = (messages: AssistantMessage[], turnId?: string) => {
  const user = messages.filter(m => m.role === 'user' && m.turn_id === turnId).sort((a, b) => b.sequence - a.sequence)[0];
  // Replay only canonical text, without trimming or reconstructing user input.
  return user?.blocks.length === 1 && user.blocks[0].type === 'text' ? user.blocks[0].text : undefined;
};
const identity = () => { try { return `${localStorage.getItem('user_id') || ''}\n${localStorage.getItem('access_token') || ''}`; } catch { return ''; } };
const storageKey = () => `rizhi-assistant:${identity().split('\n')[0] || 'anonymous'}`;
const merge = (a: AssistantMessage[], b: AssistantMessage[]) => [...new Map([...a, ...b].map(m => [m.message_id, m])).values()].sort((a, b) => a.sequence - b.sequence);
const errorText = (error: unknown) => {
  if (error instanceof Error && error.message === 'INVALID_PLAN_CONTEXT') return '方案讨论绑定不兼容，请重新打开会话。';
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 503) return '知之暂不可用，请稍后重试。';
  if (status === 409) return '会话状态已变化，请重新打开会话。';
  if (status === 404) return '会话已删除或无法访问。';
  return '连接中断，请重试。';
};
const conversationPlanContext = (conversation: Conversation, expected?: AssistantPlanContext) => {
  const value = conversation.plan_context;
  if (value !== undefined && !validAssistantPlanContext(value) || expected && (!value || value.plan_id !== expected.plan_id || value.version !== expected.version)) throw new Error('INVALID_PLAN_CONTEXT');
  return value ? { ...value } : undefined;
};

export function useAssistant() {
  const [state, setState] = useState<State>(emptyState);
  const current = useRef(state);
  current.current = state;
  const runtime = useRef({ identity: identity(), key: storageKey(), generation: 0, controller: new AbortController(), timer: undefined as ReturnType<typeof setTimeout> | undefined });
  const recovery = useRef<Recovery>({ conversationId: '' });
  const processing = useRef(false);
  const reconnecting = useRef(false);
  const managing = useRef(false);
  const loadingConversation = useRef(false);
  const historyArchived = useRef(false);
  const listRequest = useRef(0);
  const confirming = useRef(false);
  const unresolved = useRef<ConfirmationRecovery | undefined>(undefined);
  const confirmationEpoch = useRef(0);
  const confirmationReads = useRef(new Map<string, number>());
  const alive = useCallback((generation: number) => generation === runtime.current.generation && runtime.current.identity === identity() && !runtime.current.controller.signal.aborted, []);
  const save = useCallback(() => {
    try { window.sessionStorage.setItem(runtime.current.key, JSON.stringify({ ...recovery.current, planContext: recovery.current.conversationId || recovery.current.request ? current.current.planContext : undefined, confirmation: unresolved.current })); return true; } catch { return false; }
  }, []);
  const patch = useCallback((values: Partial<State>) => {
    current.current = { ...current.current, ...values };
    setState(previous => ({ ...previous, ...values }));
  }, []);
  const overlay = useCallback((value: ConfirmationOverlay) => {
    patch({ confirmations: { ...current.current.confirmations, [value.confirmation.confirmation_id]: value }, confirmationLocked: confirming.current || Boolean(unresolved.current) });
  }, [patch]);
  const checkConfirmation = useCallback(async (previous: ReportConfirmation, generation: number, epoch = confirmationEpoch.current) => {
    const id = previous.confirmation_id;
    const read = (confirmationReads.current.get(id) || 0) + 1;
    confirmationReads.current.set(id, read);
    const live = () => alive(generation) && epoch === confirmationEpoch.current && confirmationReads.current.get(id) === read && current.current.conversationId === previous.conversation_id;
    if (!live()) return;
    if (!matchesConfirmationPlanContext(previous, current.current.planContext)) {
      overlay({ confirmation: previous, phase: 'invalid', error: '此确认与当前方案讨论绑定不匹配。' });
      return;
    }
    overlay({ confirmation: previous, phase: 'checking', error: '' });
    const [accountId, token] = runtime.current.identity.split('\n');
    try {
      const value = await confirmationRequest(previous, { accountId, token, isCurrent: live }, runtime.current.controller.signal);
      if (!live()) return;
      if (!validateReportConfirmation(value, { confirmation_id: previous.confirmation_id, conversation_id: previous.conversation_id, turn_id: previous.turn_id, previous }) || !matchesConfirmationPlanContext(value, current.current.planContext)) throw new Error('INVALID_REPORT_CONFIRMATION');
      const latest = current.current.confirmations[id]?.confirmation;
      if (latest && !validateReportConfirmation(value, { confirmation_id: id, previous: latest })) return;
      if (value.status !== 'pending' && unresolved.current?.confirmationId === value.confirmation_id) { unresolved.current = undefined; save(); }
      overlay({ confirmation: value, phase: value.status === 'pending' ? unresolved.current?.confirmationId === value.confirmation_id ? 'retryable' : 'ready' : 'invalid', error: '' });
    } catch (error) {
      if (!live()) return;
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 404) {
        if (unresolved.current?.confirmationId === previous.confirmation_id) { unresolved.current = undefined; save(); }
        overlay({ confirmation: previous, phase: 'invalid', error: '此确认已删除或无法访问。' });
      } else overlay({ confirmation: previous, phase: 'uncertain', error: '结果尚未确认，请刷新确认状态。' });
    }
  }, [alive, overlay, save]);
  const hydrateConfirmations = useCallback(async (messages: AssistantMessage[], generation: number) => {
    const values = new Map<string, ReportConfirmation>();
    for (const message of messages) for (const block of message.blocks) {
      const value = canonicalConfirmation(block, current.current.conversationId, message.turn_id, message.role);
      if (!value || current.current.confirmations[value.confirmation_id]?.phase === 'executing') continue;
      const id = value.confirmation_id;
      const existing = current.current.confirmations[id]?.confirmation;
      if (existing && !validateReportConfirmation(existing, { confirmation_id: id, previous: value })) {
        if (validateReportConfirmation(value, { confirmation_id: id, previous: existing })) {
          values.set(id, value);
          continue;
        }
        values.delete(id);
        overlay({ confirmation: value, phase: 'invalid', error: '此确认内容已变化，请重新打开会话。' });
        continue;
      }
      values.set(id, existing || value);
    }
    await Promise.all([...values.values()].map(value => checkConfirmation(value, generation)));
  }, [checkConfirmation, overlay]);
  const refreshConfirmation = useCallback(async (id: string) => {
    const value = current.current.confirmations[id];
    if (!value || confirming.current || processing.current || managing.current || loadingConversation.current) return;
    confirming.current = true; patch({ confirmationLocked: true });
    const generation = runtime.current.generation;
    try { await checkConfirmation(value.confirmation, generation); }
    finally { if (alive(generation)) { confirming.current = false; patch({ confirmationLocked: Boolean(unresolved.current) }); } }
  }, [alive, checkConfirmation, patch]);
  const executeConfirmation = useCallback(async (id: string) => {
    const item = current.current.confirmations[id];
    if (item && !matchesConfirmationPlanContext(item.confirmation, current.current.planContext)) return;
    if (!item || !['ready', 'retryable'].includes(item.phase) || item.confirmation.status !== 'pending' || current.current.archived || processing.current || confirming.current || managing.current || loadingConversation.current || reconnecting.current || (unresolved.current && unresolved.current.confirmationId !== id)) return;
    const previous = item.confirmation;
    if (isPlanConfirmation(previous) && (!previous.preview.generation_available || Date.parse(previous.expires_at) <= Date.now() || current.current.latestTurn && current.current.latestTurn.turn_id !== previous.turn_id || current.current.messages.some(m => m.role === 'user' && m.turn_id !== previous.turn_id && m.sequence > (current.current.messages.find(source => source.turn_id === previous.turn_id)?.sequence ?? -1)))) return;
    const generation = runtime.current.generation;
    const epoch = confirmationEpoch.current;
    const live = () => alive(generation) && epoch === confirmationEpoch.current && current.current.conversationId === previous.conversation_id;
    if (!live() || !runtime.current.identity.split('\n').every(Boolean)) return;
    confirming.current = true;
    confirmationReads.current.set(id, (confirmationReads.current.get(id) || 0) + 1);
    const [accountId, token] = runtime.current.identity.split('\n');
    unresolved.current = { ...(isPlanConfirmation(previous) ? { kind: 'plan' as const } : {}), accountId, conversationId: previous.conversation_id, confirmationId: id, turnId: previous.turn_id, body: { contract_version: ASSISTANT_CONTRACT } };
    if (!save()) {
      unresolved.current = undefined; confirming.current = false;
      overlay({ confirmation: previous, phase: 'ready', error: '无法保存请求，请恢复会话存储后再确认。' }); return;
    }
    overlay({ confirmation: previous, phase: 'executing', error: '' });
    try {
      const value = await confirmationRequest(previous, { accountId, token, isCurrent: live }, runtime.current.controller.signal, true);
      if (!live()) return;
      if (value.status !== 'executed' || !validateReportConfirmation(value, { confirmation_id: id, conversation_id: previous.conversation_id, turn_id: previous.turn_id, previous }) || !matchesConfirmationPlanContext(value, current.current.planContext)) throw new Error('INVALID_REPORT_CONFIRMATION');
      unresolved.current = undefined; save(); overlay({ confirmation: value, phase: 'invalid', error: '' });
    } catch (error) {
      if (!live()) return;
      const failure = error as { status?: number; code?: unknown; response?: { status?: number; data?: { detail?: unknown } } };
      const status = failure.status ?? failure.response?.status;
      const detail = failure.response?.data?.detail;
      const code = typeof detail === 'string' && detail.length > 0 ? detail : typeof failure.code === 'string' ? failure.code : undefined;
      if (isPlanConfirmation(previous) && status === 503 && code === 'PLAN_GENERATION_DISABLED') {
        unresolved.current = undefined; save();
        overlay({ confirmation: { ...previous, preview: { ...previous.preview, generation_available: false } }, phase: 'ready', error: '方案生成暂不可用，请稍后刷新确认状态。' });
        return;
      }
      if (status === 402 || status === 404 || (status === 409 && ['ASSISTANT_CONFIRMATION_INVALID', 'ASSISTANT_CONFIRMATION_NOT_READY'].includes(code || ''))) {
        unresolved.current = undefined; save();
        overlay({ confirmation: previous, phase: status === 402 || code === 'ASSISTANT_CONFIRMATION_NOT_READY' ? 'ready' : 'invalid', error: status === 402 ? '报告券不足，请补充后再确认。' : code === 'ASSISTANT_CONFIRMATION_NOT_READY' ? '当前样本条件不足，请稍后再次确认。' : '此确认已失效，请刷新会话。' });
      } else {
        await checkConfirmation(previous, generation, epoch);
        if (live() && status === 503 && current.current.confirmations[id]?.confirmation.status === 'pending') {
          overlay({ ...current.current.confirmations[id], error: '知之暂不可用；请求结果尚未确认，请查询或重试同一确认。' });
        }
      }
    } finally { if (live()) { confirming.current = false; patch({ confirmationLocked: Boolean(unresolved.current) }); } }
  }, [alive, checkConfirmation, overlay, patch, save]);
  const recordTurn = useCallback((turn: LatestAssistantTurn) => {
    const previous = current.current;
    const latest = { ...(previous.latestTurn?.turn_id === turn.turn_id ? previous.latestTurn : {}), ...turn };
    patch({ latestTurn: latest, ...(turn.status === 'failed' ? { failedTurns: [...previous.failedTurns.filter(t => t.turn_id !== turn.turn_id), latest] } : {}) });
  }, [patch]);
  const reportError = useCallback((error: unknown) => {
    const response = (error as { response?: { status?: number; data?: { detail?: string } } }).response;
    const code = response?.data?.detail || '';
    const terminal = (response?.status === 400 && code === 'INVALID_ASSISTANT_INPUT') ||
      (response?.status === 404 && code === 'ASSISTANT_NOT_FOUND') ||
      (response?.status === 409 && ['CONVERSATION_ARCHIVED', 'CONVERSATION_BUSY', 'REQUEST_CONFLICT'].includes(code));
    if (terminal) {
      processing.current = false;
      clearTimeout(runtime.current.timer);
      recovery.current = { conversationId: code === 'ASSISTANT_NOT_FOUND' ? '' : recovery.current.conversationId };
      save();
    }
    patch({ error: errorText(error), ...(terminal ? { pending: false, latestTurn: undefined } : {}), ...(code === 'CONVERSATION_ARCHIVED' ? { archived: true } : {}), ...(code === 'ASSISTANT_NOT_FOUND' ? { conversationId: '', planContext: undefined, messages: [], failedTurns: [], beforeSequence: 0 } : {}) });
  }, [patch, save]);

  const list = useCallback(async (archived = historyArchived.current, cursor?: string) => {
    historyArchived.current = archived;
    const request = ++listRequest.current;
    const generation = runtime.current.generation;
    try {
      const page = await assistantService.list(archived ? 'archived' : 'active', cursor, runtime.current.controller.signal);
      if (!alive(generation) || request !== listRequest.current) return;
      setState(previous => ({ ...previous, conversations: cursor ? [...previous.conversations, ...page.items] : page.items, listCursor: page.next_cursor, historyError: '' }));
    } catch (error) { if (alive(generation) && request === listRequest.current) patch({ historyError: errorText(error) }); }
  }, [alive, patch]);

  const poll = useCallback(async function pollTurn(turnId: string, generation: number): Promise<void> {
    try {
      const turn = await assistantService.turn(turnId, runtime.current.controller.signal);
      if (!alive(generation)) return;
      recordTurn(turn);
      if (turn.status === 'processing') {
        runtime.current.timer = setTimeout(() => { void pollTurn(turnId, generation); }, 1500);
        return;
      }
      processing.current = false;
      recovery.current = { conversationId: turn.conversation_id };
      save();
      patch({ pending: false, messages: merge(current.current.messages, turn.messages || []), error: turn.status === 'failed' ? '知之未能完成这次回复。' : '' });
      await hydrateConfirmations(current.current.messages, generation);
      void list();
    } catch (error) {
      if (alive(generation)) reportError(error);
    }
  }, [alive, hydrateConfirmations, list, patch, recordTurn, reportError, save]);

  const restoreDetail = useCallback(async (detail: Awaited<ReturnType<typeof assistantService.detail>>, generation: number) => {
    if (!alive(generation)) return;
    const latest = detail.conversation.latest_turn;
    const planContext = conversationPlanContext(detail.conversation, current.current.planContext);
    patch({ planContext, messages: detail.messages, archived: detail.conversation.archived, beforeSequence: detail.next_before_sequence, latestTurn: latest });
    await hydrateConfirmations(detail.messages, generation);
    if (!alive(generation)) return;
    if (!latest) return;
    recordTurn(latest);
    if (latest.status !== 'processing' || detail.conversation.archived) {
      processing.current = false;
      recovery.current = { conversationId: detail.conversation.conversation_id };
      save();
      patch({ pending: false });
    } else {
      processing.current = true;
      recovery.current = { conversationId: detail.conversation.conversation_id, turnId: latest.turn_id };
      save();
      patch({ pending: true });
    }
    if (latest.retry_of_turn_id) {
      const failed = await assistantService.turn(latest.retry_of_turn_id, runtime.current.controller.signal);
      if (!alive(generation)) return;
      if (failed.conversation_id === detail.conversation.conversation_id && failed.status === 'failed') {
        patch({ failedTurns: [...current.current.failedTurns.filter(t => t.turn_id !== failed.turn_id), failed], messages: merge(current.current.messages, failed.messages || []) });
      }
    }
    if (latest.status === 'failed') {
      patch({ error: '知之未能完成这次回复。' });
      if (canonicalText(detail.messages, latest.turn_id) === undefined) {
        const turn = await assistantService.turn(latest.turn_id, runtime.current.controller.signal);
        if (!alive(generation)) return;
        patch({ messages: merge(current.current.messages, turn.messages || []) });
      }
    } else if (latest.status === 'processing' && !detail.conversation.archived) {
      await poll(latest.turn_id, generation);
    }
  }, [alive, hydrateConfirmations, patch, poll, recordTurn, save]);

  const recoverConfirmationWithoutSource = useCallback(async (action: ConfirmationRecovery, generation: number, canonicalBinding = false) => {
    const live = () => alive(generation) && current.current.conversationId === action.conversationId;
    const [accountId, token] = runtime.current.identity.split('\n');
    try {
      const value = await (action.kind === 'plan' ? planConfirmationService : assistantService).getConfirmation(action.confirmationId, { accountId, token, isCurrent: live, expected: { conversation_id: action.conversationId, turn_id: action.turnId } }, runtime.current.controller.signal);
      if (!live()) return;
      if (!validateReportConfirmation(value, { confirmation_id: action.confirmationId, conversation_id: action.conversationId, turn_id: action.turnId })) throw new Error('INVALID_REPORT_CONFIRMATION');
      if (!matchesConfirmationPlanContext(value, current.current.planContext) || isPlanConfirmation(value) && value.preview.target_plan_id !== undefined && !canonicalBinding) throw new Error('INVALID_PLAN_CONTEXT');
      if (value.status !== 'pending') { unresolved.current = undefined; save(); }
      patch({ recoveredConfirmation: value, error: '' });
      overlay({ confirmation: value, phase: value.status === 'pending' ? 'retryable' : 'invalid', error: '' });
    } catch (error) {
      if (!live()) return;
      if ((error as { response?: { status?: number } }).response?.status === 404) {
        unresolved.current = undefined; recovery.current = { conversationId: '' }; save();
        patch({ conversationId: '', messages: [], confirmations: {}, recoveredConfirmation: undefined, confirmationLocked: false, error: '上次确认已删除或无法访问。' });
      } else patch({ error: '无法核实上次确认，请重新加载会话。' });
    }
  }, [alive, overlay, patch, save]);

  const retryConfirmationRecovery = useCallback(async () => {
    const action = unresolved.current;
    if (!action || confirming.current || loadingConversation.current || managing.current || reconnecting.current || processing.current) return;
    const generation = runtime.current.generation;
    if (!alive(generation)) return;
    loadingConversation.current = true;
    patch({ conversationId: action.conversationId, confirmationLocked: true, loadingConversation: true, error: '' });
    try {
      const detail = await assistantService.detail(action.conversationId, undefined, runtime.current.controller.signal);
      if (!alive(generation)) return;
      if (detail.conversation.conversation_id !== action.conversationId) throw new Error('INVALID_CONFIRMATION_SOURCE');
      if (!detail.messages.some(m => m.turn_id === action.turnId)) {
        const turn = await assistantService.turn(action.turnId, runtime.current.controller.signal);
        if (!alive(generation)) return;
        if (turn.conversation_id !== action.conversationId || turn.turn_id !== action.turnId) throw new Error('INVALID_CONFIRMATION_SOURCE');
        detail.messages = merge(detail.messages, turn.messages || []);
      }
      await restoreDetail(detail, generation);
      if (alive(generation) && !current.current.confirmations[action.confirmationId]) await recoverConfirmationWithoutSource(action, generation, true);
    } catch (error) {
      if (alive(generation)) {
        if ((error as { response?: { status?: number } }).response?.status === 404) await recoverConfirmationWithoutSource(action, generation);
        else patch({ error: errorText(error) });
      }
    }
    finally { if (alive(generation)) { loadingConversation.current = false; patch({ loadingConversation: false }); } }
  }, [alive, patch, recoverConfirmationWithoutSource, restoreDetail]);

  const accept = useCallback(async (input: SendTurn) => {
    const generation = runtime.current.generation;
    patch({ error: '', pending: true });
    try {
      const turn = await assistantService.send(input, runtime.current.controller.signal);
      if (!alive(generation)) return;
      recordTurn({ ...turn, retry_of_turn_id: turn.retry_of_turn_id ?? input.retry_of_turn_id });
      recovery.current = { conversationId: turn.conversation_id, turnId: turn.turn_id };
      save();
      patch({ conversationId: turn.conversation_id });
      // Read canonical user messages, never invent a persisted message identity.
      const detail = await assistantService.detail(turn.conversation_id, undefined, runtime.current.controller.signal);
      if (!alive(generation)) return;
      patch({ planContext: conversationPlanContext(detail.conversation, input.plan_context), messages: merge(current.current.messages, detail.messages), beforeSequence: detail.next_before_sequence, archived: detail.conversation.archived });
      await poll(turn.turn_id, generation);
    } catch (error) {
      if (!alive(generation)) return;
      reportError(error);
    }
  }, [alive, patch, poll, recordTurn, reportError, save]);

  const send = useCallback(async (text: string) => {
    if (confirming.current || unresolved.current || processing.current || loadingConversation.current || managing.current || runtime.current.identity !== identity() || current.current.archived || !text.trim() || !localStorage.getItem('access_token')) return;
    processing.current = true;
    ++confirmationEpoch.current;
    patch({ confirmations: {}, recoveredConfirmation: undefined });
    const input: SendTurn = { conversation_id: current.current.conversationId, client_request_id: crypto.randomUUID(), text: text.trim(), ...(current.current.planContext ? { plan_context: { ...current.current.planContext } } : {}) };
    recovery.current = { conversationId: current.current.conversationId, request: input };
    save();
    await accept(input);
  }, [accept, patch, save]);

  const retryFailed = useCallback(async () => {
    const snapshot = current.current;
    const latest = snapshot.latestTurn;
    const text = canonicalText(snapshot.messages, latest?.turn_id);
    if (confirming.current || unresolved.current || processing.current || loadingConversation.current || managing.current || snapshot.archived || latest?.status !== 'failed' || !snapshot.conversationId || text === undefined || !localStorage.getItem('access_token') || runtime.current.identity !== identity()) return;
    processing.current = true;
    ++confirmationEpoch.current;
    patch({ confirmations: {}, recoveredConfirmation: undefined });
    const input: SendTurn = { conversation_id: snapshot.conversationId, client_request_id: crypto.randomUUID(), text, retry_of_turn_id: latest.turn_id, ...(snapshot.planContext ? { plan_context: { ...snapshot.planContext } } : {}) };
    recovery.current = { conversationId: snapshot.conversationId, request: input };
    save();
    await accept(input);
  }, [accept, patch, save]);

  const retry = useCallback(async () => {
    if (confirming.current || unresolved.current || reconnecting.current || !current.current.pending || !current.current.error || loadingConversation.current || managing.current || current.current.archived || runtime.current.identity !== identity()) return;
    reconnecting.current = true;
    loadingConversation.current = true;
    const generation = runtime.current.generation;
    const pending = recovery.current;
    patch({ error: '', loadingConversation: true });
    try {
      if (pending.turnId) {
        try {
          const detail = await assistantService.detail(pending.conversationId, undefined, runtime.current.controller.signal);
          if (!alive(generation)) return;
          if (detail.conversation.latest_turn) await restoreDetail(detail, generation);
          else {
            patch({ planContext: conversationPlanContext(detail.conversation, current.current.planContext), messages: merge(current.current.messages, detail.messages), beforeSequence: detail.next_before_sequence });
            await poll(pending.turnId, generation);
          }
        } catch (error) { if (alive(generation)) reportError(error); }
      }
      else if (pending.request) await accept(pending.request);
    } finally {
      if (alive(generation)) {
        reconnecting.current = false;
        loadingConversation.current = false;
        patch({ loadingConversation: false });
      }
    }
  }, [accept, alive, patch, poll, reportError, restoreDetail]);

  const openConversation = useCallback(async (id: string, expectedPlanContext?: AssistantPlanContext) => {
    if (confirming.current || unresolved.current || processing.current || managing.current || reconnecting.current) return;
    if (expectedPlanContext !== undefined && !validAssistantPlanContext(expectedPlanContext)) return;
    const generation = ++runtime.current.generation;
    loadingConversation.current = true;
    patch({ conversationId: id, planContext: expectedPlanContext ? { ...expectedPlanContext } : undefined, messages: [], confirmations: {}, recoveredConfirmation: undefined, failedTurns: [], latestTurn: undefined, error: '', beforeSequence: 0, archived: false, pending: false, loadingConversation: true });
    try {
      const detail = await assistantService.detail(id, undefined, runtime.current.controller.signal);
      if (!alive(generation)) return;
      recovery.current = { conversationId: id };
      save();
      await restoreDetail(detail, generation);
    } catch (error) { if (alive(generation)) reportError(error); }
    finally { if (alive(generation)) { loadingConversation.current = false; patch({ loadingConversation: false }); } }
  }, [alive, patch, reportError, restoreDetail, save]);

  const olderMessages = useCallback(async () => {
    const snapshot = current.current;
    if (!snapshot.beforeSequence || processing.current || confirming.current || unresolved.current || managing.current || loadingConversation.current) return;
    const generation = runtime.current.generation;
    try {
      const detail = await assistantService.detail(snapshot.conversationId, snapshot.beforeSequence, runtime.current.controller.signal);
      if (!alive(generation)) return;
      patch({ planContext: conversationPlanContext(detail.conversation, current.current.planContext), messages: merge(detail.messages, current.current.messages), beforeSequence: detail.next_before_sequence });
      await hydrateConfirmations(detail.messages, generation);
    } catch (error) { if (alive(generation)) patch({ error: errorText(error) }); }
  }, [alive, hydrateConfirmations, patch]);

  const newConversation = useCallback((planContext?: AssistantPlanContext) => {
    if (runtime.current.identity !== identity() || planContext !== undefined && !validAssistantPlanContext(planContext) || confirming.current || unresolved.current || processing.current || managing.current || reconnecting.current) return false;
    runtime.current.controller.abort();
    runtime.current.controller = new AbortController();
    clearTimeout(runtime.current.timer);
    ++runtime.current.generation;
    loadingConversation.current = false;
    recovery.current = { conversationId: '' };
    save();
    patch({ conversationId: '', planContext: planContext ? { ...planContext } : undefined, messages: [], confirmations: {}, recoveredConfirmation: undefined, failedTurns: [], latestTurn: undefined, beforeSequence: 0, archived: false, pending: false, error: '', loadingConversation: false });
    return true;
  }, [patch, save]);

  const updateConversation = useCallback(async (id: string, update: { title?: string; archived?: boolean }) => {
    if (confirming.current || unresolved.current || processing.current || loadingConversation.current || managing.current || reconnecting.current) return;
    managing.current = true;
    patch({ loadingConversation: true });
    const generation = runtime.current.generation;
    try {
      await assistantService.update(id, update, runtime.current.controller.signal);
      if (!alive(generation)) return;
      if (id === current.current.conversationId && update.archived !== undefined) patch({ archived: update.archived });
      await list();
    } catch (error) { if (alive(generation)) patch({ historyError: errorText(error) }); }
    finally { if (alive(generation)) { managing.current = false; patch({ loadingConversation: false }); } }
  }, [alive, list, patch]);
  const removeConversation = useCallback(async (id: string) => {
    if (confirming.current || unresolved.current || processing.current || loadingConversation.current || managing.current || reconnecting.current) return;
    managing.current = true;
    patch({ loadingConversation: true });
    let generation = runtime.current.generation;
    try {
      await assistantService.remove(id, runtime.current.controller.signal);
      if (!alive(generation)) return;
      if (id === current.current.conversationId) {
        // Deletion owns the mutation lock; invalidate without the guarded new-chat action.
        generation = ++runtime.current.generation;
        loadingConversation.current = false;
        recovery.current = { conversationId: '' };
        save();
        patch({ conversationId: '', planContext: undefined, messages: [], confirmations: {}, recoveredConfirmation: undefined, failedTurns: [], latestTurn: undefined, beforeSequence: 0, archived: false, pending: false, error: '' });
      }
      await list();
    } catch (error) { if (alive(generation)) patch({ historyError: errorText(error) }); }
    finally { if (alive(generation)) { managing.current = false; patch({ loadingConversation: false }); } }
  }, [alive, list, patch, save]);

  useEffect(() => {
    const reset = () => {
      runtime.current.controller.abort();
      clearTimeout(runtime.current.timer);
      // Uncertain actions remain isolated under their owning account across token/logout changes.
      if (!unresolved.current) { try { window.sessionStorage.removeItem(runtime.current.key); } catch { /* Optional storage. */ } }
      runtime.current = { identity: identity(), key: storageKey(), generation: runtime.current.generation + 1, controller: new AbortController(), timer: undefined };
      processing.current = false;
      reconnecting.current = false;
      managing.current = false;
      loadingConversation.current = false;
      confirming.current = false;
      unresolved.current = undefined;
      ++confirmationEpoch.current;
      recovery.current = { conversationId: '' };
      current.current = emptyState();
      setState(current.current);
      restoreSaved();
    };
    const onAuth = () => { if (runtime.current.identity !== identity()) reset(); };
    window.addEventListener('auth:changed', onAuth);
    window.addEventListener('storage', onAuth);
    const restoreSaved = () => {
    if (identity().split('\n')[1]) {
      runtime.current.controller = new AbortController();
      void list();
      try {
        const saved = JSON.parse(window.sessionStorage.getItem(runtime.current.key) || 'null') as (Recovery & { confirmation?: ConfirmationRecovery }) | null;
        if (saved?.planContext !== undefined && !validAssistantPlanContext(saved.planContext)) throw new Error('INVALID_PLAN_CONTEXT');
        const action = saved?.confirmation;
        if (action && (action.kind === undefined || action.kind === 'plan') && action.accountId === identity().split('\n')[0] && isConfirmationIdentifier(action.conversationId) && action.conversationId === saved?.conversationId && isConfirmationPathID(action.confirmationId) && isConfirmationIdentifier(action.turnId) && action.body?.contract_version === ASSISTANT_CONTRACT && Object.keys(action.body).length === 1) {
          recovery.current = { conversationId: action.conversationId };
          unresolved.current = action;
          patch({ planContext: saved.planContext ? { ...saved.planContext } : undefined });
          void retryConfirmationRecovery();
        } else if (saved?.turnId && saved.conversationId) {
          recovery.current = saved;
          processing.current = true;
          patch({ planContext: saved.planContext ? { ...saved.planContext } : undefined, conversationId: saved.conversationId, pending: true });
          const generation = runtime.current.generation;
          const restore = async () => {
            try {
              const detail = await assistantService.detail(saved.conversationId, undefined, runtime.current.controller.signal);
              if (!alive(generation)) return;
              if (detail.conversation.latest_turn) await restoreDetail(detail, generation);
              else {
                patch({ planContext: conversationPlanContext(detail.conversation, current.current.planContext), messages: detail.messages, beforeSequence: detail.next_before_sequence, archived: detail.conversation.archived });
                await poll(saved.turnId!, generation);
              }
            } catch (error) { if (alive(generation)) reportError(error); }
          };
          void restore();
        } else if (saved?.request) {
          if (saved.request.plan_context !== undefined && !validAssistantPlanContext(saved.request.plan_context)) throw new Error('INVALID_PLAN_CONTEXT');
          recovery.current = saved;
          processing.current = true;
          patch({ planContext: saved.request.plan_context ? { ...saved.request.plan_context } : undefined, conversationId: saved.conversationId, pending: true, error: '上次发送未确认，请重试以查询结果。' });
        } else if (saved?.conversationId) void openConversation(saved.conversationId, saved.planContext);
      } catch { /* Ignore corrupted or unavailable tab storage. */ }
    }
    };
    restoreSaved();
    const activeRuntime = runtime;
    return () => {
      activeRuntime.current.controller.abort();
      ++activeRuntime.current.generation;
      clearTimeout(activeRuntime.current.timer);
      window.removeEventListener('auth:changed', onAuth);
      window.removeEventListener('storage', onAuth);
    };
  }, [alive, list, openConversation, patch, poll, reportError, restoreDetail, retryConfirmationRecovery]);

  const canRetryFailed = state.latestTurn?.status === 'failed' && canonicalText(state.messages, state.latestTurn.turn_id) !== undefined && !state.pending && !state.archived && !state.loadingConversation && !state.confirmationLocked;
  const canNavigateConfirmation = () => runtime.current.identity === identity() && !runtime.current.controller.signal.aborted;
  return { ...state, retryConfirmationRecovery, canNavigateConfirmation, refreshConfirmation, executeConfirmation, canRetryFailed, send, retry, retryFailed, openConversation, olderMessages, newConversation, list, updateConversation, removeConversation };
}
