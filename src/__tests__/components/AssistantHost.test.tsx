import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantHost } from '@/components/assistant/AssistantHost';
import { assistantService, OPEN_ASSISTANT_HISTORY_EVENT, type Conversation } from '@/services/assistant';

const state = vi.hoisted(() => ({ conversationId: '', messages: [] as unknown[], conversations: [] as Conversation[], pending: false, archived: false, error: '', historyError: '', beforeSequence: 0, send: vi.fn(), retry: vi.fn(), list: vi.fn(), newConversation: vi.fn(), openConversation: vi.fn(), olderMessages: vi.fn(), updateConversation: vi.fn(), removeConversation: vi.fn(), retryFailed: vi.fn(), canRetryFailed: false, loadingConversation: false, failedTurns: [] as { turn_id: string; error_code?: string }[], latestTurn: undefined as { turn_id: string; status: string; retry_of_turn_id?: string } | undefined }));
vi.mock('@/hooks/useAssistant', () => ({ useAssistant: () => state }));
describe('Zhizhi persistent entrance', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => 'token' });
    vi.stubEnv('VITE_ASSISTANT_ENABLED', 'true');
    state.messages = [];
    state.conversations = [];
    state.archived = false;
    state.send.mockReset();
    state.list.mockReset();
    state.newConversation.mockReset();
    state.openConversation.mockReset();
    Object.assign(state, { pending: false, error: '', loadingConversation: false, canRetryFailed: false, failedTurns: [], latestTurn: undefined });
    state.retryFailed.mockReset();
    state.retry.mockReset();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  const mount = (path = '/') => render(<MemoryRouter initialEntries={[path]}><AssistantHost /></MemoryRouter>);
  it('clears the previous failure status once an explicit reply retry starts', () => {
    Object.assign(state, { canRetryFailed: true, failedTurns: [{ turn_id: 'failed', error_code: 'MODEL_FAILED' }], latestTurn: { turn_id: 'failed', status: 'failed' }, error: '知之未能完成这次回复。' });
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: '知之' }));
    fireEvent.click(screen.getByRole('button', { name: '重新尝试回复' }));
    expect(state.retryFailed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '重试连接' })).not.toBeInTheDocument();
    Object.assign(state, { canRetryFailed: false, pending: true, error: '连接中断', latestTurn: { turn_id: 'retry', status: 'processing', retry_of_turn_id: 'failed' } });
    view.rerender(<MemoryRouter><AssistantHost /></MemoryRouter>);
    expect(screen.queryByText(/MODEL_FAILED/)).not.toBeInTheDocument();
    expect(screen.queryByText('正在重新尝试上次未完成的回复')).not.toBeInTheDocument();
    expect(screen.queryByText('此次回复是对上次未完成回复的重新尝试')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新尝试回复' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试连接' }));
    expect(state.retry).toHaveBeenCalledTimes(1);
  });
  it('opens its own dialogue and sends natural-language input', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: '知之' }));
    fireEvent.change(screen.getByRole('textbox', { name: '给知之的消息' }), { target: { value: '昨天的英语怎么样' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(state.send).toHaveBeenCalledWith('昨天的英语怎么样');
  });
  it('keeps the latest conversation content in view while messages arrive', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const view = mount();
    state.messages = [{ message_id: 'm1', sequence: 1, role: 'user', blocks: [{ type: 'text', text: '最近数学怎么样？' }] }];
    state.pending = true;
    view.rerender(<MemoryRouter><AssistantHost /></MemoryRouter>);
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    const firstCallCount = scrollIntoView.mock.calls.length;
    state.messages = [...state.messages, { message_id: 'm2', sequence: 2, role: 'assistant', blocks: [{ type: 'text', text: '正在分析' }] }];
    state.pending = false;
    view.rerender(<MemoryRouter><AssistantHost /></MemoryRouter>);
    await waitFor(() => expect(scrollIntoView.mock.calls.length).toBeGreaterThan(firstCallCount));
  });
  it('shows a compact home entry with an enter-to-send input', () => {
    mount();
    expect(screen.getByRole('dialog', { name: '与知之对话' })).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: '给知之的消息' });
    expect(input).toHaveAttribute('placeholder', '问问你的学习情况，或输入你想生成的内容');
    expect(screen.queryByRole('button', { name: '学习概览' })).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: '最近的物理学习情况怎么样？' } });
    expect(input).toHaveValue('最近的物理学习情况怎么样？');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(state.send).toHaveBeenCalledWith('最近的物理学习情况怎么样？');
  });
  it('keeps the home entry compact and promotes an active conversation to a full screen surface', () => {
    mount();
    const entry = screen.getByRole('dialog', { name: '与知之对话' });
    expect(entry).toHaveAttribute('data-view', 'entry');
    expect(screen.queryByRole('button', { name: '学习概览' })).not.toBeInTheDocument();

    cleanup();
    state.messages = [{ message_id: 'm1', sequence: 1, role: 'user', blocks: [{ type: 'text', text: '最近数学怎么样？' }] }];
    mount();
    fireEvent.click(screen.getByRole('button', { name: '知之' }));
    const conversation = screen.getByRole('dialog', { name: '与知之对话' });
    expect(conversation).toHaveAttribute('data-view', 'conversation');
    expect(conversation.className).toContain('h-[100dvh]');
    expect(conversation.parentElement).toHaveClass('fixed', 'inset-0', 'z-50');
    fireEvent.click(screen.getByRole('button', { name: '返回主页面' }));
    expect(screen.getByRole('dialog', { name: '与知之对话' })).toHaveAttribute('data-view', 'entry');
    expect(screen.queryByRole('button', { name: '返回主页面' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '学习概览' })).not.toBeInTheDocument();
  });
  it('shows message timestamps and keeps history inside the conversation surface', () => {
    state.messages = [];
    mount();
    expect(screen.queryByText('学习记录助手')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '历史记录' })).not.toBeInTheDocument();

    cleanup();
    state.messages = [{
      message_id: 'm1',
      sequence: 1,
      role: 'assistant',
      created_at: '2026-01-02T03:04:05.000Z',
      blocks: [{ type: 'text', text: '本周期结论' }],
    }];
    mount();
    fireEvent.click(screen.getByRole('button', { name: '知之' }));
    expect(document.querySelector('time[datetime="2026-01-02T03:04:05.000Z"]')).toBeInTheDocument();

    cleanup();
    state.messages = [{ message_id: 'm2', sequence: 1, role: 'assistant', blocks: [{ type: 'text', text: '准备查询' }] }];
    mount();
    fireEvent.click(screen.getByRole('button', { name: '历史记录' }));
    expect(state.list).toHaveBeenCalledWith(false);
    expect(screen.getByText('暂无会话')).toBeInTheDocument();
  });
  it('opens conversation history from the home menu event', () => {
    mount();
    act(() => window.dispatchEvent(new Event(OPEN_ASSISTANT_HISTORY_EVENT)));
    expect(state.list).toHaveBeenCalledWith(false);
    expect(screen.getByRole('tablist', { name: '会话状态' })).toBeInTheDocument();
  });
  it('opens a selected history conversation so the user can continue chatting', () => {
    state.conversations = [{ conversation_id: 'conversation-1', title: '最近数学怎么样？', updated_at: '2026-11-15T04:00:00.000Z', created_at: '2026-11-15T03:00:00.000Z', archived: false }];
    mount();
    act(() => window.dispatchEvent(new Event(OPEN_ASSISTANT_HISTORY_EVENT)));
    fireEvent.click(screen.getByRole('button', { name: '最近数学怎么样？' }));
    expect(state.openConversation).toHaveBeenCalledWith('conversation-1');
    expect(screen.getByRole('textbox', { name: '给知之的消息' })).toBeInTheDocument();
  });
  it('starts a fresh assistant conversation after returning to the entry surface', () => {
    state.messages = [{ message_id: 'm1', sequence: 1, role: 'assistant', blocks: [{ type: 'text', text: '已完成' }] }];
    mount();
    fireEvent.click(screen.getByRole('button', { name: '知之' }));
    fireEvent.click(screen.getByRole('button', { name: '返回主页面' }));
    expect(state.newConversation).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: '与知之对话' })).toHaveAttribute('data-view', 'entry');
  });
  it('renders separate message blocks and safely links question evidence', () => {
    state.messages = [{ message_id: 'm1', sequence: 1, role: 'assistant', blocks: [
      { type: 'text', text: '本周期结论' },
      { type: 'references', references: { items: [
        { item_id: 'p2:q:V(1)', submission_id: 'upl_1', display_number: 'V(1)', href: '/question/p2%3Aq%3AV(1)?submissionId=upl_1' },
        { item_id: 'evil', submission_id: 'upl_1', display_number: 'unsafe', href: 'https://example.com/' },
      ], submission_counts: {} } },
    ] }];
    mount();
    fireEvent.click(screen.getByRole('button', { name: '知之' }));
    expect(screen.getByText('本周期结论')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /V\(1\)/ })).toHaveAttribute('href', '/question/p2%3Aq%3AV(1)?submissionId=upl_1');
    expect(screen.queryByRole('link', { name: /unsafe/ })).not.toBeInTheDocument();
  });
  it('does not appear on login and does not let archived conversations send', () => {
    const view = mount('/login');
    expect(screen.queryByRole('button', { name: '知之' })).not.toBeInTheDocument();
    view.unmount();
    state.archived = true;
    mount();
    fireEvent.click(screen.getByRole('button', { name: '知之' }));
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled();
  });
  it('does not appear on personal center while remaining available on history', () => {
    const view = mount('/mine');
    expect(screen.queryByRole('dialog', { name: '与知之对话' })).not.toBeInTheDocument();
    view.unmount();
    mount('/history');
    expect(screen.getByRole('dialog', { name: '与知之对话' })).toBeInTheDocument();
  });
  it('stays disabled until explicitly enabled', () => {
    vi.stubEnv('VITE_ASSISTANT_ENABLED', 'false');
    mount();
    expect(screen.queryByRole('button', { name: '知之' })).not.toBeInTheDocument();
  });
  it('paginates using the original historical message turn', async () => {
    const references = vi.spyOn(assistantService, 'references').mockResolvedValue({ items: [{ item_id: 'q2', submission_id: 'upl_1', display_number: 'Q2', href: '/question/q2?submissionId=upl_1', created_at: '' }], submission_counts: {} });
    state.messages = [{ message_id: 'old-message', turn_id: 'old-turn', sequence: 1, role: 'assistant', blocks: [{ type: 'references', references: { items: [], next_cursor: 'original-scope', submission_counts: {} } }] }];
    mount();
    fireEvent.click(screen.getByRole('button', { name: '知之' }));
    fireEvent.click(screen.getByRole('button', { name: '查看更多错题' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Q2' })).toBeInTheDocument());
    expect(references).toHaveBeenCalledWith('old-turn', 'original-scope', 12, expect.any(AbortSignal));
  });
});
