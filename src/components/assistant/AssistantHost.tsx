import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, History as HistoryIcon, Plus } from 'lucide-react';
import { useAssistant, type ConfirmationOverlay } from '@/hooks/useAssistant';
import { canonicalConfirmation, assistantService, OPEN_ASSISTANT_HISTORY_EVENT, PLAN_DISCUSSION_EVENT, type PlanDiscussionRequest, type AssistantBlock, type ReferencePage, type MistakeReference } from '@/services/assistant';
import { validReportProfileId } from '@/services/reportNavigationScope';
import { MathText } from '@/components/ui/MathText';
import { ReportReferences } from './ReportReferences';
import { ActionConfirmation } from './ActionConfirmation';
import { PlanConfirmation } from './PlanConfirmation';
import { isPlanConfirmation, matchesConfirmationPlanContext } from '@/services/assistantPlanConfirmation';

function assistantSurface(pathname: string) {
  return pathname === '/' || pathname === '/history' || pathname === '/data' || pathname === '/analysis' ||
    pathname === '/report-history' || pathname === '/plans' || pathname.startsWith('/plan/') || pathname.startsWith('/report/');
}

function safeReference(item: MistakeReference): string | undefined {
  if (!item.href || item.navigation_unavailable || !item.href.startsWith('/question/')) return;
  try {
    const url = new URL(item.href, window.location.origin);
    const path = url.pathname.slice('/question/'.length);
    if (url.origin !== window.location.origin || path.includes('/') || decodeURIComponent(path) !== item.item_id || url.searchParams.get('submissionId') !== item.submission_id || [...url.searchParams.keys()].some(key => key !== 'submissionId') || url.hash) return;
    return item.href;
  } catch { return; }
}

function formatMessageTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return sameDay ? `今天 ${time}` : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function References({ initial, turnId, onNavigate }: { initial: ReferencePage; turnId?: string; onNavigate: () => void }) {
  const [page, setPage] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef(new AbortController());
  useEffect(() => {
    controller.current = new AbortController();
    const active = controller.current;
    return () => active.abort();
  }, []);
  const more = async () => {
    if (!turnId || !page.next_cursor || busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await assistantService.references(turnId, page.next_cursor, 12, controller.current.signal);
      if (controller.current.signal.aborted) return;
      setPage(previous => ({ ...next, items: [...new Map([...previous.items, ...next.items].map(item => [`${item.submission_id}\n${item.item_id}`, item])).values()] }));
    } catch { if (!controller.current.signal.aborted) setError('错题列表暂时无法加载，请重试。'); }
    finally { if (!controller.current.signal.aborted) setBusy(false); }
  };
  return <div>
    <ul className="divide-y divide-neu-text/10">
      {page.items.map(item => {
        const href = safeReference(item);
        const content = <><span className="font-medium">{item.display_number}</span>{item.question_text && <MathText text={item.question_text} className="mt-1 text-sm" />}{item.reason && <p className="mt-1 text-xs text-neu-text-secondary">{item.reason}</p>}</>;
        return <li key={`${item.submission_id}:${item.item_id}`} className="py-3 break-words">{href ? <Link to={href} onClick={onNavigate} className="block text-primary">{content}</Link> : <div>{content}<p className="text-xs text-neu-text-secondary">原题暂不可跳转</p></div>}</li>;
      })}
    </ul>
    {page.next_cursor && <button type="button" disabled={busy || !turnId} onClick={() => void more()} className="text-primary py-2 text-sm">{busy ? '加载中' : '查看更多错题'}</button>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}

function MessageBlock({ block, turnId, conversationId, role, confirmations, disabled, onExecute, onRefresh, canNavigate, onChoose, onNavigate }: { block: AssistantBlock; turnId?: string; conversationId: string; role: string; confirmations?: Record<string, ConfirmationOverlay>; disabled: boolean; onExecute: (id: string) => void; onRefresh: (id: string) => void; canNavigate: () => boolean; onChoose: (name: string) => void; onNavigate: () => void }) {
  if (block.type === 'text') return <MathText text={block.text} className="whitespace-pre-wrap break-words leading-relaxed" />;
  if (block.type === 'clarification') return <div><p>{block.question}</p><div className="flex flex-wrap gap-2 mt-2">{block.choices?.map(choice => <button type="button" key={choice.profile_id} onClick={() => onChoose(choice.display_name)} className="text-primary underline py-2">{choice.display_name}</button>)}</div></div>;
  if (block.type === 'references') return <References initial={block.references} turnId={turnId} onNavigate={onNavigate} />;
  if (block.type === 'report_references') return validReportProfileId(block.report_scope?.profile_id) ? <ReportReferences initial={block.report_references} turnId={turnId} profileId={block.report_scope.profile_id} onNavigate={onNavigate} /> : <p className="text-neu-text-secondary">当前版本无法显示此消息。</p>;
  if (block.type === 'action_confirmation') {
    const proposal = canonicalConfirmation(block, conversationId, turnId, role);
    if (proposal) return <ActionConfirmation proposal={proposal} overlay={confirmations?.[proposal.confirmation_id]} disabled={disabled} onExecute={onExecute} onRefresh={onRefresh} canNavigate={canNavigate} onNavigate={onNavigate} />;
  }
  if (block.type === 'plan_confirmation') {
    const proposal = canonicalConfirmation(block, conversationId, turnId, role);
    if (proposal && isPlanConfirmation(proposal)) return <PlanConfirmation proposal={proposal} overlay={confirmations?.[proposal.confirmation_id]} disabled={disabled} onExecute={onExecute} onRefresh={onRefresh} canNavigate={canNavigate} onNavigate={onNavigate} />;
  }
  return <p className="text-neu-text-secondary">当前版本无法显示此消息。</p>;
}

function AssistantPanel() {
  const assistant = useAssistant();
  const [open, setOpen] = useState(true);
  const [history, setHistory] = useState(false);
  const [archivedHistory, setArchivedHistory] = useState(false);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState('');
  const [title, setTitle] = useState('');
  const [deleting, setDeleting] = useState('');
  const [discussionError, setDiscussionError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [returnedToEntry, setReturnedToEntry] = useState(false);
  const startConversation = assistant.newConversation;
  const input = useRef<HTMLTextAreaElement>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const blocked = assistant.pending || assistant.loadingConversation || assistant.confirmationLocked;
  const actionDisabled = (block: AssistantBlock, turnId: string | undefined, sequence: number) => assistant.pending || assistant.loadingConversation || assistant.archived ||
    (block.type === 'plan_confirmation' || block.type === 'action_confirmation') && !matchesConfirmationPlanContext(block.type === 'plan_confirmation' ? block.plan_confirmation : block.action_confirmation, assistant.planContext) ||
    Object.values(assistant.confirmations || {}).some(item => item.phase === 'executing' || item.phase === 'checking') ||
    block.type === 'plan_confirmation' && (Boolean(assistant.latestTurn && assistant.latestTurn.turn_id !== turnId) || assistant.messages.some(m => m.role === 'user' && m.sequence > sequence));
  useEffect(() => {
    const discuss = (event: Event) => {
      const request = (event as CustomEvent<PlanDiscussionRequest>).detail;
      if (!request || request.accountId !== localStorage.getItem('user_id') || request.token !== localStorage.getItem('access_token')) { event.preventDefault(); return; }
      setOpen(true);
      setExpanded(true);
      setReturnedToEntry(false);
      if (!startConversation(request.plan_context)) { event.preventDefault(); setDiscussionError('当前对话尚未结束，请完成后再讨论方案。'); return; }
      setDiscussionError(''); setHistory(false); setDraft(''); setRenaming(''); setDeleting('');
    };
    window.addEventListener(PLAN_DISCUSSION_EVENT, discuss);
    return () => window.removeEventListener(PLAN_DISCUSSION_EVENT, discuss);
  }, [startConversation]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  const submit = async (text: string) => {
    if (!text.trim() || blocked || assistant.archived) return;
    setExpanded(true);
    setReturnedToEntry(false);
    setDraft('');
    await assistant.send(text);
  };
  const conversationView = !returnedToEntry && (history || expanded || assistant.messages.length > 0 || assistant.pending || assistant.loadingConversation || Boolean(assistant.failedTurns?.length) || assistant.canRetryFailed || Boolean(assistant.latestTurn?.retry_of_turn_id) || Boolean(assistant.error));
  useEffect(() => {
    if (!conversationView || history) return;
    const frame = window.requestAnimationFrame(() => {
      const target = transcriptEnd.current;
      if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversationView, history, assistant.messages, assistant.pending, assistant.loadingConversation, assistant.error, assistant.failedTurns, assistant.latestTurn?.status]);
  const openHistory = useCallback(() => {
    setOpen(true);
    setHistory(true);
    setExpanded(true);
    setReturnedToEntry(false);
    void assistant.list(archivedHistory);
  }, [archivedHistory, assistant]);
  useEffect(() => {
    const openFromHome = () => openHistory();
    window.addEventListener(OPEN_ASSISTANT_HISTORY_EVENT, openFromHome);
    return () => window.removeEventListener(OPEN_ASSISTANT_HISTORY_EVENT, openFromHome);
  }, [openHistory]);
  const leaveConversation = () => {
    assistant.newConversation();
    setHistory(false);
    setExpanded(false);
    setReturnedToEntry(true);
    setDraft('');
  };
  return <div className={conversationView ? 'fixed inset-0 z-50 pointer-events-none flex justify-center' : 'fixed inset-x-0 bottom-0 z-40 pointer-events-none px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]'}>
    <button type="button" aria-label="知之" className="sr-only" onClick={() => setOpen(true)}>知之</button>
    {open && <section role="dialog" aria-label="与知之对话" data-view={conversationView ? 'conversation' : 'entry'} className={conversationView
      ? 'pointer-events-auto min-h-[100dvh] w-full max-w-md mx-auto bg-neu-bg text-neu-text flex flex-col overflow-hidden text-sm selection:bg-primary/20'
      : 'pointer-events-auto w-full max-w-sm mx-auto rounded-2xl bg-neu-bg text-neu-text shadow-neu-flat p-2 flex flex-col overflow-visible text-sm'}>
      {conversationView && <header className="flex items-center justify-between p-6 bg-neu-bg/90 backdrop-blur-sm sticky top-0 z-20 shrink-0">
        <div className="w-10">
          <button type="button" aria-label="返回主页面" title="返回主页面" onClick={leaveConversation} className="w-10 h-10 rounded-full bg-neu-bg shadow-neu-icon-btn flex items-center justify-center text-neu-text-secondary hover:text-neu-text active:text-primary active:shadow-neu-pressed transition-all duration-300">
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <h1 className="text-xl font-bold text-neu-text tracking-wide text-center flex-1">知之</h1>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" aria-label={history ? '返回对话' : '历史记录'} title={history ? '返回对话' : '历史记录'} onClick={() => { if (history) setHistory(false); else openHistory(); }} className="w-9 h-9 rounded-full flex items-center justify-center text-neu-text-secondary hover:text-primary hover:bg-white/30 transition-colors">
            <HistoryIcon className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="新对话" title="新对话" disabled={blocked} onClick={() => { assistant.newConversation(); setHistory(false); setExpanded(true); setReturnedToEntry(false); setDiscussionError(''); setDraft(''); }} className="w-9 h-9 rounded-full flex items-center justify-center text-neu-text-secondary hover:text-primary hover:bg-white/30 transition-colors disabled:opacity-40">
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </header>}
      {conversationView && <div className="flex items-center gap-3 px-4 pt-3 text-xs text-neu-text-secondary" aria-label="知之 AI 学习助理">
        <div className="w-9 h-9 rounded-full bg-neu-bg shadow-neu-icon flex items-center justify-center shrink-0">
          <img src="/tint-logo-hd-neu.png" alt="知之头像" className="rizhi-avatar-float w-7 h-7 object-contain" />
        </div>
        <span>知之 · AI 学习助理</span>
      </div>}
      {conversationView && discussionError && <p role="alert" className="px-4 py-2 text-red-700 text-xs">{discussionError}</p>}
      {conversationView && !history && assistant.planContext && <div aria-label="方案讨论绑定" className="shrink-0 px-4 py-2 border-b border-neu-text/10 text-xs break-words">
        <Link className="text-primary" to={`/plan/${encodeURIComponent(assistant.planContext.plan_id)}?version=${assistant.planContext.version}`} onClick={event => { if (!assistant.canNavigateConfirmation()) { event.preventDefault(); return; } setOpen(false); }}>复习方案 · 版本 {assistant.planContext.version}</Link>
      </div>}
      {conversationView && (history ? <div className="flex-1 min-h-0 w-full max-w-md mx-auto overflow-y-auto px-4 py-6 pb-[calc(10rem+env(safe-area-inset-bottom))]">
        <div role="tablist" aria-label="会话状态" className="flex gap-5 mb-3">{[false, true].map(value => <button key={String(value)} role="tab" aria-selected={archivedHistory === value} onClick={() => { setArchivedHistory(value); void assistant.list(value); }} className={archivedHistory === value ? 'text-primary font-semibold' : 'text-neu-text-secondary'}>{value ? '已归档' : '近期会话'}</button>)}</div>
        {assistant.historyError && <p role="alert">{assistant.historyError}</p>}
        {!assistant.conversations.length && !assistant.historyError && <p className="py-6 text-neu-text-secondary">暂无会话</p>}
        <ul className="divide-y divide-neu-text/10">{assistant.conversations.map(conversation => <li key={conversation.conversation_id} className="py-3">
          <button className="block w-full text-left break-words font-medium" disabled={blocked} onClick={() => { void assistant.openConversation(conversation.conversation_id); setHistory(false); setReturnedToEntry(false); }}>{conversation.title}</button>
          <p className="text-xs text-neu-text-secondary mt-1">{new Date(conversation.updated_at).toLocaleDateString('zh-CN')}</p>
          <div className="flex gap-4 mt-2 text-xs">
            <button disabled={blocked} onClick={() => { setRenaming(conversation.conversation_id); setTitle(conversation.title); }}>重命名</button>
            <button disabled={blocked} onClick={() => void assistant.updateConversation(conversation.conversation_id, { archived: !conversation.archived })}>{conversation.archived ? '取消归档' : '归档'}</button>
            <button disabled={blocked} onClick={() => setDeleting(conversation.conversation_id)}>删除</button>
          </div>
          {renaming === conversation.conversation_id && <form className="flex gap-2 mt-2" onSubmit={event => { event.preventDefault(); void assistant.updateConversation(renaming, { title }); setRenaming(''); }}><input aria-label="会话名称" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} className="min-w-0 flex-1 bg-transparent border-b border-neu-text/20" /><button disabled={!title.trim()}>保存</button><button type="button" onClick={() => setRenaming('')}>取消</button></form>}
          {deleting === conversation.conversation_id && <div className="mt-2"><p>删除后无法恢复此会话。</p><button className="text-red-700 mr-4 py-2" onClick={() => { void assistant.removeConversation(deleting); setDeleting(''); }}>确认删除</button><button onClick={() => setDeleting('')}>取消</button></div>}
        </li>)}</ul>
        {assistant.listCursor && <button className="text-primary py-3" onClick={() => void assistant.list(archivedHistory, assistant.listCursor)}>更多会话</button>}
      </div> : <div className="flex-1 min-h-0 overflow-y-auto w-full no-scrollbar" aria-live="polite">
        <div className="w-full max-w-md mx-auto px-4 py-6 space-y-6 pb-[calc(10rem+env(safe-area-inset-bottom))]">
        {assistant.beforeSequence > 0 && <button onClick={() => void assistant.olderMessages()} className="text-primary">更早的消息</button>}
        {assistant.recoveredConfirmation && (isPlanConfirmation(assistant.recoveredConfirmation)
          ? <PlanConfirmation proposal={assistant.recoveredConfirmation} overlay={assistant.confirmations[assistant.recoveredConfirmation.confirmation_id]} disabled={assistant.pending || assistant.loadingConversation || assistant.archived} onExecute={id => void assistant.executeConfirmation(id)} onRefresh={id => void assistant.refreshConfirmation(id)} canNavigate={assistant.canNavigateConfirmation} onNavigate={() => setOpen(false)} />
          : <ActionConfirmation proposal={assistant.recoveredConfirmation} overlay={assistant.confirmations[assistant.recoveredConfirmation.confirmation_id]} disabled={assistant.pending || assistant.loadingConversation || assistant.archived} onExecute={id => void assistant.executeConfirmation(id)} onRefresh={id => void assistant.refreshConfirmation(id)} canNavigate={assistant.canNavigateConfirmation} onNavigate={() => setOpen(false)} />)}
        {assistant.messages.map(message => {
          const timestamp = formatMessageTime(message.created_at);
          const userMessage = message.role === 'user';
          return <article key={message.message_id} className={`flex w-full ${userMessage ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[86%] sm:max-w-[70%] space-y-1">
              <div className={`p-4 rounded-2xl text-sm leading-relaxed border border-white/40 overflow-x-auto break-words ${userMessage ? 'rounded-br-none bg-neu-bg shadow-neu-pressed' : 'rounded-bl-none bg-neu-bg shadow-neu-flat'}`}>
                <div className="space-y-3">{message.blocks.map((block, index) => <MessageBlock key={index} block={block} turnId={message.turn_id} conversationId={assistant.conversationId} role={message.role} confirmations={assistant.confirmations} disabled={actionDisabled(block, message.turn_id, message.sequence)} onExecute={id => void assistant.executeConfirmation(id)} onRefresh={id => void assistant.refreshConfirmation(id)} canNavigate={assistant.canNavigateConfirmation} onChoose={name => void submit(name)} onNavigate={() => setOpen(false)} />)}</div>
              </div>
              {timestamp && <time dateTime={message.created_at} className={`block text-[10px] text-neu-text-secondary/70 ${userMessage ? 'text-right' : 'text-left'}`}>{timestamp}</time>}
            </div>
          </article>;
        })}
        {assistant.latestTurn?.status === 'failed' && assistant.failedTurns?.filter(turn => turn.turn_id === assistant.latestTurn?.turn_id).map(turn => <p key={turn.turn_id} data-turn-id={turn.turn_id} className="text-red-700 break-words">这次回复未完成{turn.error_code ? `（${turn.error_code}）` : ''}</p>)}
        {assistant.latestTurn?.status === 'failed' && assistant.latestTurn.retry_of_turn_id && <p data-retry-of-turn-id={assistant.latestTurn.retry_of_turn_id} className="text-neu-text-secondary">此次回复是对上次未完成回复的重新尝试</p>}
        {assistant.canRetryFailed && <button type="button" className="text-primary py-2" onClick={() => void assistant.retryFailed()}>重新尝试回复</button>}
        {assistant.loadingConversation && <p role="status" className="text-neu-text-secondary">正在加载会话</p>}
        {assistant.pending && !assistant.error && <p role="status" className="text-neu-text-secondary">知之正在思考…</p>}
        {assistant.error && <div role="alert"><p className="text-red-700">{assistant.error}</p>{assistant.pending && <button className="text-primary py-2" onClick={() => void assistant.retry()}>重试连接</button>}</div>}
        {assistant.confirmationLocked && assistant.error && !Object.keys(assistant.confirmations || {}).length && <button type="button" disabled={assistant.loadingConversation} className="text-primary py-2" onClick={() => void assistant.retryConfirmationRecovery()}>重新加载确认会话</button>}
        {assistant.archived && <p className="text-neu-text-secondary">此会话已归档</p>}
        <div ref={transcriptEnd} aria-hidden="true" className="h-px" />
        </div>
      </div>)}
      {(!conversationView || !history) && (conversationView ? <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-center pointer-events-none w-full max-w-md mx-auto">
        <div className="pointer-events-auto w-full bg-neu-bg/95 backdrop-blur-sm shadow-[0_-12px_28px_rgba(0,0,0,0.06)] border-t border-white/50 rounded-t-[28px] border-x border-white/40 border-b-0">
          <div className="px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <form className="flex items-end gap-3" onSubmit={event => { event.preventDefault(); void submit(draft); }}>
              <div className="flex-1 bg-neu-bg rounded-[1.5rem] shadow-neu-input transition-all flex items-center min-h-[52px] border border-transparent">
                <textarea ref={input} aria-label="给知之的消息" placeholder="问问你的学习情况，或输入你想生成的内容" rows={1} value={draft} maxLength={6000} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(draft); } }} disabled={blocked || assistant.archived} className="w-full bg-transparent border-none focus:ring-0 outline-none focus:outline-none text-sm px-5 py-3 placeholder:text-neu-text-secondary/50 text-neu-text leading-relaxed resize-none max-h-32" />
              </div>
              <button aria-label="发送" title="发送" type="submit" disabled={blocked || assistant.archived || !draft.trim()} className="size-12 shrink-0 rounded-full bg-neu-bg shadow-neu-flat active:shadow-neu-pressed transition-all flex items-center justify-center border border-white/50 text-neu-text disabled:opacity-50 disabled:grayscale">
                <span className="material-symbols-outlined text-[24px] ml-0.5" aria-hidden="true">send</span>
              </button>
            </form>
          </div>
        </div>
      </div> : <div className="p-0">
        <form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); void submit(draft); }}>
          <textarea ref={input} aria-label="给知之的消息" placeholder="问问你的学习情况，或输入你想生成的内容" rows={1} value={draft} maxLength={6000} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(draft); } }} disabled={blocked || assistant.archived} className="min-w-0 flex-1 h-10 min-h-10 max-h-10 resize-none overflow-y-auto rounded-xl bg-neu-bg shadow-neu-pressed px-3 py-2 outline-none focus:ring-1 focus:ring-primary placeholder:text-neu-text-secondary/60" />
          <button aria-label="发送" title="发送" type="submit" disabled={blocked || assistant.archived || !draft.trim()} className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-primary shadow-neu-flat active:shadow-neu-pressed disabled:opacity-40 transition-all">
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">send</span>
          </button>
        </form>
      </div>)}
    </section>}
  </div>;
}

export function AssistantHost() {
  const { pathname } = useLocation();
  const accountIdentity = () => `${localStorage.getItem('user_id') || ''}\n${localStorage.getItem('access_token') || ''}`;
  const [auth, setAuth] = useState(accountIdentity);
  const token = auth.split('\n')[1];
  useEffect(() => {
    const sync = () => setAuth(`${localStorage.getItem('user_id') || ''}\n${localStorage.getItem('access_token') || ''}`);
    window.addEventListener('auth:changed', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('auth:changed', sync); window.removeEventListener('storage', sync); };
  }, []);
  if (import.meta.env.VITE_ASSISTANT_ENABLED !== 'true' || !token || !assistantSurface(pathname)) return null;
  return <AssistantPanel key={auth} />;
}
