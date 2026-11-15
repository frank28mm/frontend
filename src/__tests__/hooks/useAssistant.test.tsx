import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssistant } from '@/hooks/useAssistant';

const service = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), send: vi.fn(), turn: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('@/services/assistant', async original => ({ ...await original<object>(), assistantService: service }));

describe('persistent account conversation state', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.sessionStorage.clear();
    const stored = new Map([['access_token', 'token-a'], ['user_id', 'owner-a']]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
    service.list.mockResolvedValue({ items: [], next_cursor: '' });
    service.detail.mockResolvedValue({ conversation: { conversation_id: 'conv-a', title: 'hello', archived: false }, messages: [], next_before_sequence: 0 });
    service.turn.mockResolvedValue({ conversation_id: 'conv-a', turn_id: 'turn-a', status: 'completed', messages: [{ message_id: 'm2', sequence: 2, role: 'assistant', blocks: [{ type: 'text', text: 'answer' }] }] });
  });
  afterEach(() => { vi.unstubAllGlobals(); window.sessionStorage.clear(); });

  const failedUser = { message_id: 'canonical-user', turn_id: 'failed-turn', sequence: 1, role: 'user', blocks: [{ type: 'text', text: '  canonical text  ' }] };
  const failedDetail = (archived = false) => ({ conversation: { conversation_id: 'conv-a', archived, latest_turn: { turn_id: 'failed-turn', status: 'failed', error_code: 'MODEL_FAILED', created_at: '' } }, messages: [failedUser], next_before_sequence: 0 });

  it('restores failure and explicitly retries canonical text, retaining the failure relation', async () => {
    service.detail.mockResolvedValue(failedDetail());
    service.send.mockResolvedValue({ conversation_id: 'conv-a', turn_id: 'retry-turn', status: 'processing', retry_of_turn_id: 'failed-turn' });
    service.turn.mockResolvedValue({ conversation_id: 'conv-a', turn_id: 'retry-turn', status: 'completed', retry_of_turn_id: 'failed-turn', messages: [] });
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.openConversation('conv-a'); });
    expect(result.current.canRetryFailed).toBe(true);
    expect(service.send).not.toHaveBeenCalled();
    await act(async () => { await result.current.retryFailed(); });
    expect(service.send).toHaveBeenCalledExactlyOnceWith({ conversation_id: 'conv-a', client_request_id: expect.any(String), text: '  canonical text  ', retry_of_turn_id: 'failed-turn' }, expect.any(AbortSignal));
    expect(result.current.failedTurns).toEqual([expect.objectContaining({ turn_id: 'failed-turn', error_code: 'MODEL_FAILED' })]);
    expect(result.current.latestTurn).toMatchObject({ turn_id: 'retry-turn', retry_of_turn_id: 'failed-turn' });
    expect(result.current.canRetryFailed).toBe(false);
  });

  it('fetches canonical failed user from GET when detail excludes it after refresh', async () => {
    window.sessionStorage.setItem('rizhi-assistant:owner-a', JSON.stringify({ conversationId: 'conv-a' }));
    service.detail.mockResolvedValue({ ...failedDetail(), messages: [] });
    service.turn.mockResolvedValue({ conversation_id: 'conv-a', turn_id: 'failed-turn', status: 'failed', messages: [failedUser] });
    const { result } = renderHook(() => useAssistant());
    await waitFor(() => expect(result.current.canRetryFailed).toBe(true));
    expect(result.current.messages.map(m => m.message_id)).toEqual(['canonical-user']);
    expect(service.send).not.toHaveBeenCalled();
  });

  it('deduplicates deliberate clicks and reuses retry body after uncertain POST', async () => {
    service.detail.mockResolvedValue(failedDetail());
    service.send.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.openConversation('conv-a'); });
    await act(async () => { await Promise.all([result.current.retryFailed(), result.current.retryFailed()]); });
    expect(service.send).toHaveBeenCalledTimes(1);
    await act(async () => { await Promise.all([result.current.retry(), result.current.retry()]); });
    expect(service.send).toHaveBeenCalledTimes(2);
    expect(service.send.mock.calls[0][0]).toEqual(service.send.mock.calls[1][0]);
  });

  it('allocates a new request identity for each deliberate retry and only targets the latest failure', async () => {
    service.detail.mockResolvedValue(failedDetail());
    service.send.mockResolvedValueOnce({ conversation_id: 'conv-a', turn_id: 'retry-one', status: 'processing', retry_of_turn_id: 'failed-turn' })
      .mockResolvedValueOnce({ conversation_id: 'conv-a', turn_id: 'retry-two', status: 'processing', retry_of_turn_id: 'retry-one' });
    service.turn.mockResolvedValueOnce({ conversation_id: 'conv-a', turn_id: 'retry-one', status: 'failed', retry_of_turn_id: 'failed-turn', messages: [{ ...failedUser, message_id: 'canonical-retry', turn_id: 'retry-one', sequence: 2 }] })
      .mockResolvedValueOnce({ conversation_id: 'conv-a', turn_id: 'retry-two', status: 'completed', retry_of_turn_id: 'retry-one', messages: [] });
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.openConversation('conv-a'); await result.current.retryFailed(); });
    await act(async () => { await result.current.retryFailed(); });
    const first = service.send.mock.calls[0][0];
    const second = service.send.mock.calls[1][0];
    expect(first.client_request_id).not.toBe(second.client_request_id);
    expect(second).toMatchObject({ conversation_id: 'conv-a', text: failedUser.blocks[0].text, retry_of_turn_id: 'retry-one' });
    expect(result.current.failedTurns.map(t => t.turn_id)).toEqual(['failed-turn', 'retry-one']);
  });

  it('connection recovery uses latest detail rather than resurrecting an older failed turn', async () => {
    service.send.mockResolvedValue({ conversation_id: 'conv-a', turn_id: 'old-turn', status: 'processing' });
    service.turn.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ conversation_id: 'conv-a', turn_id: 'old-turn', status: 'failed', messages: [failedUser] });
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.send('hello'); });
    service.detail.mockResolvedValue({ ...failedDetail(), conversation: { ...failedDetail().conversation, latest_turn: { turn_id: 'new-turn', status: 'completed' } } });
    await act(async () => { await result.current.retry(); });
    expect(result.current.latestTurn?.turn_id).toBe('new-turn');
    expect(result.current.canRetryFailed).toBe(false);
    expect(service.turn).toHaveBeenCalledTimes(1);
  });

  it('blocks a new POST while connection recovery is still hydrating failure context', async () => {
    service.send.mockResolvedValue({ conversation_id: 'conv-a', turn_id: 'failed-turn', status: 'processing' });
    service.turn.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.send('hello'); });
    service.detail.mockResolvedValue({ ...failedDetail(), conversation: { ...failedDetail().conversation, latest_turn: { ...failedDetail().conversation.latest_turn, retry_of_turn_id: 'parent-failure' } } });
    let resolve!: (value: unknown) => void;
    service.turn.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    let work!: Promise<void>;
    act(() => { work = result.current.retry(); });
    await waitFor(() => expect(service.turn).toHaveBeenCalledTimes(2));
    await act(async () => { await result.current.retryFailed(); await result.current.send('new input'); });
    expect(service.send).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ conversation_id: 'conv-a', turn_id: 'parent-failure', status: 'failed', messages: [] }); await work; });
    expect(result.current.canRetryFailed).toBe(true);
  });

  it('does not retry archived or superseded failure', async () => {
    service.detail.mockResolvedValue(failedDetail(true));
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.openConversation('conv-a'); });
    expect(result.current.canRetryFailed).toBe(false);
    await act(async () => { await result.current.retryFailed(); });
    expect(service.send).not.toHaveBeenCalled();
    service.detail.mockResolvedValue(failedDetail());
    await act(async () => { await result.current.openConversation('conv-a'); });
    service.send.mockRejectedValue({ response: { status: 409, data: { detail: 'REQUEST_CONFLICT' } } });
    await act(async () => { await result.current.retryFailed(); });
    expect(result.current.pending).toBe(false);
    expect(result.current.canRetryFailed).toBe(false);
    expect(result.current.failedTurns).toHaveLength(1);
  });

  it('restores latest processing from history without posting', async () => {
    service.detail.mockResolvedValue({ ...failedDetail(), conversation: { ...failedDetail().conversation, latest_turn: { turn_id: 'turn-a', status: 'processing', created_at: '' } } });
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.openConversation('conv-a'); });
    expect(service.turn).toHaveBeenCalledWith('turn-a', expect.any(AbortSignal));
    expect(service.send).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });

  it('restores the failure record and retry relation after opening a completed retry', async () => {
    service.detail.mockResolvedValue({ ...failedDetail(), conversation: { ...failedDetail().conversation, latest_turn: { turn_id: 'retry-turn', status: 'completed', retry_of_turn_id: 'failed-turn', created_at: '' } } });
    service.turn.mockResolvedValue({ conversation_id: 'conv-a', turn_id: 'failed-turn', status: 'failed', error_code: 'MODEL_FAILED', messages: [failedUser] });
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.openConversation('conv-a'); });
    expect(result.current.failedTurns).toEqual([expect.objectContaining({ turn_id: 'failed-turn', status: 'failed' })]);
    expect(result.current.latestTurn?.retry_of_turn_id).toBe('failed-turn');
    expect(result.current.canRetryFailed).toBe(false);
  });

  it('prefers latest detail failure over a superseded tab recovery turn', async () => {
    window.sessionStorage.setItem('rizhi-assistant:owner-a', JSON.stringify({ conversationId: 'conv-a', turnId: 'old-processing' }));
    service.detail.mockResolvedValue(failedDetail());
    const { result } = renderHook(() => useAssistant());
    await waitFor(() => expect(result.current.canRetryFailed).toBe(true));
    expect(service.turn).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });

  it('does not leave an archived latest processing restoration locked', async () => {
    window.sessionStorage.setItem('rizhi-assistant:owner-a', JSON.stringify({ conversationId: 'conv-a', turnId: 'turn-a' }));
    service.detail.mockResolvedValue({ ...failedDetail(true), conversation: { ...failedDetail(true).conversation, latest_turn: { turn_id: 'turn-a', status: 'processing' } } });
    const { result } = renderHook(() => useAssistant());
    await waitFor(() => expect(result.current.archived).toBe(true));
    expect(result.current.pending).toBe(false);
    expect(service.turn).not.toHaveBeenCalled();
    act(() => result.current.newConversation());
    expect(result.current.conversationId).toBe('');
  });

  it('keeps a known processing retry locked if failure-source hydration has a network error', async () => {
    service.detail.mockResolvedValue({ ...failedDetail(), conversation: { ...failedDetail().conversation, latest_turn: { turn_id: 'retry-turn', status: 'processing', retry_of_turn_id: 'failed-turn' } } });
    service.turn.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.openConversation('conv-a'); });
    expect(result.current.pending).toBe(true);
    await act(async () => { await result.current.send('new message'); });
    expect(service.send).not.toHaveBeenCalled();
  });

  it('locks failed retry during archive mutation, then rejects it once archived', async () => {
    service.detail.mockResolvedValue(failedDetail());
    let resolve!: (value: unknown) => void;
    service.update.mockReturnValue(new Promise(r => { resolve = r; }));
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.openConversation('conv-a'); });
    let work!: Promise<void>;
    act(() => { work = result.current.updateConversation('conv-a', { archived: true }); });
    await act(async () => { await result.current.retryFailed(); });
    expect(service.send).not.toHaveBeenCalled();
    await act(async () => { resolve({}); await work; await result.current.retryFailed(); });
    expect(service.send).not.toHaveBeenCalled();
    expect(result.current.canRetryFailed).toBe(false);
  });

  it.each([{ archived: true }, { title: 'renamed' }])('serializes deferred PATCH %j before DELETE and clears selected failure on deletion', async update => {
    service.detail.mockResolvedValue(failedDetail());
    let resolvePatch!: (value: unknown) => void;
    let resolveDelete!: (value: unknown) => void;
    service.update.mockReturnValue(new Promise(r => { resolvePatch = r; }));
    service.remove.mockReturnValue(new Promise(r => { resolveDelete = r; }));
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.openConversation('conv-a'); });
    let patchWork!: Promise<void>;
    act(() => { patchWork = result.current.updateConversation('conv-a', update); });
    act(() => { void result.current.removeConversation('conv-a'); });
    expect(service.remove).not.toHaveBeenCalled();
    expect(result.current.conversationId).toBe('conv-a');
    await act(async () => { resolvePatch({}); await patchWork; });
    let deleteWork!: Promise<void>;
    act(() => { deleteWork = result.current.removeConversation('conv-a'); });
    expect(service.remove).toHaveBeenCalledTimes(1);
    await act(async () => { resolveDelete({ ok: true }); await deleteWork; });
    expect(result.current.conversationId).toBe('');
    expect(result.current.messages).toEqual([]);
    expect(result.current.failedTurns).toEqual([]);
    expect(result.current.latestTurn).toBeUndefined();
    expect(result.current.canRetryFailed).toBe(false);
    expect(result.current.loadingConversation).toBe(false);
    expect(JSON.parse(window.sessionStorage.getItem('rizhi-assistant:owner-a') || '{}')).toEqual({ conversationId: '' });
  });

  it('locks deferred DELETE against PATCH, duplicate deletion, retry and conversation switches', async () => {
    service.detail.mockResolvedValue(failedDetail());
    let resolve!: (value: unknown) => void;
    service.remove.mockReturnValue(new Promise(r => { resolve = r; }));
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.openConversation('conv-a'); });
    let work!: Promise<void>;
    act(() => { work = result.current.removeConversation('conv-a'); });
    expect(result.current.loadingConversation).toBe(true);
    await act(async () => {
      await result.current.updateConversation('conv-a', { archived: true });
      void result.current.removeConversation('conv-a');
      await result.current.retryFailed();
      await result.current.openConversation('conv-b');
      result.current.newConversation();
    });
    expect(service.update).not.toHaveBeenCalled();
    expect(service.send).not.toHaveBeenCalled();
    expect(service.remove).toHaveBeenCalledTimes(1);
    expect(result.current.conversationId).toBe('conv-a');
    await act(async () => { resolve({ ok: true }); await work; });
    expect(result.current.conversationId).toBe('');
    expect(result.current.failedTurns).toEqual([]);
    expect(result.current.loadingConversation).toBe(false);
    await act(async () => { await result.current.openConversation('conv-b'); });
    expect(result.current.conversationId).toBe('conv-b');
  });

  it('releases the deletion lock on failure without erasing the selected failure context', async () => {
    service.detail.mockResolvedValue(failedDetail());
    service.remove.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.openConversation('conv-a'); await result.current.removeConversation('conv-a'); });
    expect(result.current.conversationId).toBe('conv-a');
    expect(result.current.failedTurns).toHaveLength(1);
    expect(result.current.canRetryFailed).toBe(true);
    expect(result.current.loadingConversation).toBe(false);
    expect(result.current.historyError).toBeTruthy();
    act(() => result.current.newConversation());
    expect(result.current.conversationId).toBe('');
  });

  it('ignores canonical recovery arriving after a different conversation opens', async () => {
    service.detail.mockResolvedValueOnce({ ...failedDetail(), messages: [] });
    let resolve!: (value: unknown) => void;
    service.turn.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const { result } = renderHook(() => useAssistant());
    let work!: Promise<void>;
    act(() => { work = result.current.openConversation('conv-a'); });
    await waitFor(() => expect(service.turn).toHaveBeenCalledTimes(1));
    await act(async () => { await result.current.retryFailed(); });
    expect(service.send).not.toHaveBeenCalled();
    service.detail.mockResolvedValue({ conversation: { conversation_id: 'conv-b', archived: false }, messages: [], next_before_sequence: 0 });
    await act(async () => { await result.current.openConversation('conv-b'); resolve({ conversation_id: 'conv-a', turn_id: 'failed-turn', status: 'failed', messages: [failedUser] }); await work; });
    expect(result.current.conversationId).toBe('conv-b');
    expect(result.current.messages).toEqual([]);
    expect(result.current.canRetryFailed).toBe(false);
  });

  it('ignores late explicit retry acceptance after account change', async () => {
    service.detail.mockResolvedValue(failedDetail());
    let resolve!: (value: unknown) => void;
    service.send.mockReturnValue(new Promise(r => { resolve = r; }));
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.openConversation('conv-a'); });
    let work!: Promise<void>;
    act(() => { work = result.current.retryFailed(); });
    act(() => { localStorage.setItem('access_token', 'token-b'); localStorage.setItem('user_id', 'owner-b'); window.dispatchEvent(new Event('auth:changed')); });
    await act(async () => { resolve({ conversation_id: 'conv-a', turn_id: 'retry-turn', status: 'processing', retry_of_turn_id: 'failed-turn' }); await work; });
    expect(result.current.failedTurns).toEqual([]);
    expect(result.current.messages).toEqual([]);
    expect(result.current.pending).toBe(false);
  });

  it('loads server conversations and sends a version-independent input with stable request identity', async () => {
    service.send.mockResolvedValue({ conversation_id: 'conv-a', turn_id: 'turn-a', status: 'processing' });
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.send('hello'); });
    await waitFor(() => expect(result.current.messages.some(m => m.message_id === 'm2')).toBe(true));
    expect(service.send.mock.calls[0][0]).toMatchObject({ conversation_id: '', text: 'hello', client_request_id: expect.any(String) });
    expect(result.current.conversationId).toBe('conv-a');
  });

  it('retries an uncertain acceptance with the same request body', async () => {
    service.send.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ conversation_id: 'conv-a', turn_id: 'turn-a', status: 'processing' });
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.send('hello'); });
    expect(result.current.error).toBeTruthy();
    await act(async () => { await result.current.retry(); });
    expect(service.send.mock.calls[0][0]).toEqual(service.send.mock.calls[1][0]);
    await waitFor(() => expect(result.current.pending).toBe(false));
  });

  it('ignores a late response after account change', async () => {
    let resolve!: (value: unknown) => void;
    service.send.mockReturnValue(new Promise(r => { resolve = r; }));
    const { result } = renderHook(() => useAssistant());
    let work!: Promise<void>;
    act(() => { work = result.current.send('private'); });
    expect(service.send).toHaveBeenCalledTimes(1);
    act(() => { localStorage.setItem('access_token', 'token-b'); localStorage.setItem('user_id', 'owner-b'); window.dispatchEvent(new Event('auth:changed')); });
    await act(async () => { resolve({ conversation_id: 'conv-a', turn_id: 'turn-a', status: 'processing' }); await work; });
    expect(result.current.conversationId).toBe('');
    expect(result.current.messages).toEqual([]);
    expect(result.current.pending).toBe(false);
  });

  it('prepends older history and deduplicates messages by stable identity', async () => {
    const message = (sequence: number) => ({ message_id: `m${sequence}`, sequence, role: 'user', blocks: [{ type: 'text', text: 'text' }] });
    service.detail.mockResolvedValueOnce({ conversation: { conversation_id: 'conv-a', archived: false }, messages: [message(3)], next_before_sequence: 3 })
      .mockResolvedValueOnce({ conversation: { conversation_id: 'conv-a', archived: false }, messages: [message(1), message(2), message(3)], next_before_sequence: 0 });
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.openConversation('conv-a'); });
    await act(async () => { await result.current.olderMessages(); });
    expect(result.current.messages.map(m => m.sequence)).toEqual([1, 2, 3]);
    expect(service.detail.mock.calls[1][1]).toBe(3);
  });

  it('shows executor failure rather than a fabricated assistant answer', async () => {
    service.send.mockResolvedValue({ conversation_id: 'conv-a', turn_id: 'turn-a', status: 'processing' });
    service.turn.mockResolvedValue({ conversation_id: 'conv-a', turn_id: 'turn-a', status: 'failed', error_code: 'ASSISTANT_UNAVAILABLE', messages: [] });
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.send('hello'); });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.messages.filter(m => m.role === 'assistant')).toEqual([]);
  });

  it('restores both user history and a pending turn after remount', async () => {
    window.sessionStorage.setItem('rizhi-assistant:owner-a', JSON.stringify({ conversationId: 'conv-a', turnId: 'turn-a' }));
    service.detail.mockResolvedValue({ conversation: { conversation_id: 'conv-a', archived: false }, messages: [{ message_id: 'm1', sequence: 1, role: 'user', blocks: [{ type: 'text', text: 'hello' }] }], next_before_sequence: 0 });
    const { result } = renderHook(() => useAssistant());
    await waitFor(() => expect(result.current.messages.map(m => m.message_id)).toEqual(['m1', 'm2']));
    expect(service.send).not.toHaveBeenCalled();
  });

  it('does not lock the conversation after a definitive invalid-input rejection', async () => {
    service.send.mockRejectedValue({ response: { status: 400, data: { detail: 'INVALID_ASSISTANT_INPUT' } } });
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.send('hello'); });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeTruthy();
  });

  it('recovers user history when acceptance succeeded but detail loading failed', async () => {
    service.send.mockResolvedValue({ conversation_id: 'conv-a', turn_id: 'turn-a', status: 'processing' });
    service.detail.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ conversation: { conversation_id: 'conv-a', archived: false }, messages: [{ message_id: 'm1', sequence: 1, role: 'user', blocks: [{ type: 'text', text: 'hello' }] }], next_before_sequence: 0 });
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.send('hello'); });
    await act(async () => { await result.current.retry(); });
    expect(result.current.messages.map(m => m.message_id)).toEqual(['m1', 'm2']);
    expect(service.send).toHaveBeenCalledTimes(1);
  });
  it.each([[404, 'ASSISTANT_NOT_FOUND'], [409, 'CONVERSATION_ARCHIVED'], [409, 'CONVERSATION_BUSY']])('allows escaping a definitive %s/%s rejection', async (status, detail) => {
    service.send.mockRejectedValue({ response: { status, data: { detail } } });
    const { result } = renderHook(() => useAssistant());
    await act(async () => { await result.current.send('hello'); });
    expect(result.current.pending).toBe(false);
    act(() => result.current.newConversation());
    expect(result.current.conversationId).toBe('');
    expect(JSON.parse(window.sessionStorage.getItem('rizhi-assistant:owner-a') || '{}').request).toBeUndefined();
  });
  it('allows escaping a recovered turn deleted elsewhere', async () => {
    window.sessionStorage.setItem('rizhi-assistant:owner-a', JSON.stringify({ conversationId: 'conv-a', turnId: 'turn-a' }));
    service.turn.mockRejectedValue({ response: { status: 404, data: { detail: 'ASSISTANT_NOT_FOUND' } } });
    const { result } = renderHook(() => useAssistant());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.pending).toBe(false);
    act(() => result.current.newConversation());
    expect(result.current.conversationId).toBe('');
  });
  it('does not send while a selected conversation is loading', async () => {
    let resolve!: (value: unknown) => void;
    service.detail.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const { result } = renderHook(() => useAssistant());
    let work!: Promise<void>;
    act(() => { work = result.current.openConversation('conv-a'); });
    await act(async () => { await result.current.send('hello'); });
    expect(service.send).not.toHaveBeenCalled();
    await act(async () => { resolve({ conversation: { conversation_id: 'conv-a', archived: false }, messages: [], next_before_sequence: 0 }); await work; });
  });
});
