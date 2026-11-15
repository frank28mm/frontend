import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsPresent } from 'framer-motion';
import { apiKeysService, validApiKeyName, type ApiKey } from '@/services/apiKeys';
import { AUTH_CHANGED_EVENT } from '@/services/auth';
import { BackButton } from '@/components/ui/BackButton';
import { NeuButton } from '@/components/ui/NeuButton';

const snapshot = () => JSON.stringify([localStorage.getItem('user_id') || '', localStorage.getItem('access_token') || '']);
const subscribe = (notify: () => void) => {
  const storage = (event: StorageEvent) => { if (!event.key || ['user_id', 'access_token'].includes(event.key)) notify(); };
  window.addEventListener(AUTH_CHANGED_EVENT, notify); window.addEventListener('storage', storage);
  return () => { window.removeEventListener(AUTH_CHANGED_EVENT, notify); window.removeEventListener('storage', storage); };
};
const messages: Record<string, string> = {
  UNAUTHORIZED: '登录已失效，请重新登录。', INVALID_INPUT: '名称需为 1–64 个字符，不能含控制字符。',
  KEY_LIMIT_REACHED: '最多可保留 10 个有效 Key，请先撤销不再使用的 Key。',
  KEY_NOT_FOUND: 'Key 不存在，请刷新列表。', KEY_REVOKED: 'Key 已撤销，请刷新列表。',
};
const codeOf = (error: unknown) => error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'REQUEST_FAILED';

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-5">
    <div ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      className="w-full max-w-sm max-h-[85dvh] overflow-y-auto rounded-lg bg-neu-bg p-5 shadow-neu-flat space-y-4 text-sm"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key === 'Tab') {
          const nodes = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
          if (!nodes?.length) { event.preventDefault(); return; }
          const first = nodes[0], last = nodes[nodes.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
        }
      }}>
      <h2 className="text-lg font-bold">{title}</h2>{children}
    </div>
  </div>;
}

function Management({ accountId, token }: { accountId: string; token: string }) {
  const [items, setItems] = useState<ApiKey[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState('');
  const [issued, setIssued] = useState<{ secret: string; replaces?: string } | null>(null);
  const [confirm, setConfirm] = useState<{ action: 'rotate' | 'revoke'; key: ApiKey } | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const scope = useRef({ live: false, epoch: 0, controller: new AbortController(), locked: false, issuing: false });
  const context = useCallback(() => {
    const epoch = scope.current.epoch;
    return { accountId, token, isCurrent: () => scope.current.live && scope.current.epoch === epoch &&
      localStorage.getItem('user_id') === accountId && localStorage.getItem('access_token') === token };
  }, [accountId, token]);
  const refresh = useCallback(async (explicit = false) => {
    if (scope.current.locked) return;
    const account = context();
    scope.current.locked = true; setLoading(true); setError('');
    try {
      const keys = await apiKeysService.list(account, scope.current.controller.signal);
      if (!account.isCurrent()) return;
      setItems(keys);
      if (explicit) { setUncertain(false); setNotice('列表已更新。若上次签发未保存 Key，请撤销对应记录后重新创建。'); }
    } catch (failure) {
      if (account.isCurrent()) setError(messages[codeOf(failure)] || '无法读取 API Key，请重试。');
    } finally { if (account.isCurrent()) { scope.current.locked = false; setLoading(false); } }
  }, [context]);
  useLayoutEffect(() => {
    const state = scope.current;
    state.live = true; state.locked = false; state.issuing = false; state.controller = new AbortController();
    void refresh();
    const clear = () => {
      state.epoch++; state.controller.abort(); state.controller = new AbortController();
      setIssued(null); setConfirm(null); setCopyStatus('');
      if (state.issuing) setUncertain(true);
      state.issuing = false; state.locked = false; setBusy(false); setLoading(false);
    };
    window.addEventListener('pagehide', clear);
    return () => { state.live = false; state.epoch++; state.controller.abort(); state.locked = false; window.removeEventListener('pagehide', clear); };
  }, [refresh]);

  const mutate = async (action: 'create' | 'rotate' | 'revoke', key?: ApiKey) => {
    if (scope.current.locked || (action !== 'revoke' && uncertain)) return;
    const account = context();
    scope.current.locked = true; scope.current.issuing = action !== 'revoke'; setBusy(true); setError(''); setNotice(''); setConfirm(null);
    try {
      if (action === 'revoke' && key) {
        await apiKeysService.revoke(key.key_id, account, scope.current.controller.signal);
        if (account.isCurrent()) setItems(current => current.map(item => item.key_id === key.key_id ? { ...item, status: 'revoked' } : item));
      } else {
        const result = action === 'rotate' && key ? await apiKeysService.rotate(key, account, scope.current.controller.signal) : await apiKeysService.create(name, account, scope.current.controller.signal);
        if (!account.isCurrent()) return;
        setItems(current => [...current.filter(item => item.key_id !== result.key.key_id), result.key]);
        setCopyStatus(''); setIssued({ secret: result.secret, ...(action === 'rotate' && key ? { replaces: key.key_id } : {}) }); setName('');
      }
    } catch (failure) {
      if (!account.isCurrent()) return;
      const code = codeOf(failure);
      if (action !== 'revoke' && !messages[code]) setUncertain(true);
      setError(messages[code] || (action === 'revoke' ? '撤销结果未知，请刷新列表确认。' : '签发结果未知，请先刷新列表确认，勿重复创建。'));
    } finally { if (account.isCurrent()) { scope.current.locked = false; scope.current.issuing = false; setBusy(false); } }
  };
  const close = () => { setIssued(null); setCopyStatus(''); };
  const copy = async () => {
    if (!issued) return;
    const account = context(); const secret = issued.secret;
    try { await navigator.clipboard.writeText(secret); if (account.isCurrent()) setCopyStatus('已复制'); }
    catch { if (account.isCurrent()) setCopyStatus('复制失败，请手动保存。'); }
  };
  const active = items.filter(item => item.status === 'active').length;
  const blocked = busy || loading || !!issued || !!error || uncertain || active >= 10;
  return <main className="flex-1 min-h-0 overflow-y-auto px-6 pb-10 space-y-5 text-sm">
    <section className="space-y-2 text-neu-text-secondary">
      <p>授权范围：本账号所有现有及未来的孩子。</p>
      <p>仅限读取：孩子资料、错题、知识点、证据和已完成报告。</p>
      <p className="text-xs">外部数据 API 尚未开放；当前仅管理访问凭证。</p>
    </section>
    <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); void mutate('create'); }}>
      <label className="font-medium" htmlFor="api-key-name">名称</label>
      <input id="api-key-name" value={name} onChange={event => setName(event.target.value)} placeholder="例如：我的 Agent" autoComplete="off" disabled={busy || !!issued}
        className="min-w-0 w-full rounded-lg bg-neu-bg shadow-neu-inset p-3 outline-none focus:ring-2 focus:ring-primary/30" />
      <NeuButton type="submit" variant="secondary" disabled={blocked || !validApiKeyName(name)} className="rounded-lg disabled:opacity-40 gap-2">
        <span aria-hidden="true" className="material-symbols-outlined">add</span>创建 Key
      </NeuButton>
    </form>
    <div className="flex justify-between items-center gap-3"><h2 className="font-bold">API Key <span className="text-xs font-normal text-neu-text-secondary">有效 {active}/10</span></h2>
      <NeuButton variant="icon" aria-label="刷新列表" title="刷新列表" disabled={busy || loading || !!issued} onClick={() => void refresh(true)}>
        <span aria-hidden="true" className="material-symbols-outlined">refresh</span>
      </NeuButton>
    </div>
    {active >= 10 && <p className="text-amber-700">最多可保留 10 个有效 Key，请先撤销不再使用的 Key。</p>}
    {loading && <p role="status">加载中...</p>}
    {busy && <p role="status">处理中...</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {uncertain && <p className="text-amber-700">签发结果未知。刷新后核对记录；未保存的 Key 无法再次查看，请撤销后重新创建。</p>}
    {notice && <p role="status" className="text-neu-text-secondary">{notice}</p>}
    {!loading && !error && items.length === 0 && <p className="py-8 text-center text-neu-text-secondary">暂无 API Key</p>}
    <ul className="space-y-4">{items.map(key => <li key={key.key_id} className="rounded-lg shadow-neu-flat p-4 space-y-3">
      <div className="flex items-start justify-between gap-3"><h3 className="font-bold min-w-0 break-words [overflow-wrap:anywhere]">{key.name}</h3><span className="shrink-0 text-xs text-neu-text-secondary">{key.status === 'active' ? '有效' : '已撤销'}</span></div>
      <p className="font-mono break-all">{key.prefix}…{key.last_four}</p>
      <p className="text-xs text-neu-text-secondary break-all">ID：{key.key_id}</p>
      <p className="text-xs text-neu-text-secondary">创建：{key.created_at.replace('T', ' ')}</p>
      <p className="text-xs text-neu-text-secondary">最近使用：{key.last_used_at?.replace('T', ' ') || '尚未使用'}</p>
      {key.revoked_at && <p className="text-xs text-neu-text-secondary">撤销：{key.revoked_at.replace('T', ' ')}</p>}
      {key.status === 'active' && <div className="flex gap-3">
        <NeuButton variant="secondary" className="rounded-lg gap-1 disabled:opacity-40" aria-label={`轮换 ${key.name}`} disabled={blocked} onClick={() => setConfirm({ action: 'rotate', key })}><span aria-hidden="true" className="material-symbols-outlined">sync</span>轮换</NeuButton>
        <NeuButton variant="secondary" className="rounded-lg gap-1 text-red-700 disabled:opacity-40" aria-label={`撤销 ${key.name}`} disabled={busy || loading || !!issued} onClick={() => setConfirm({ action: 'revoke', key })}><span aria-hidden="true" className="material-symbols-outlined">block</span>撤销</NeuButton>
      </div>}
    </li>)}</ul>
    {confirm && <Modal title={confirm.action === 'rotate' ? '轮换 API Key' : '撤销 API Key'} close={() => setConfirm(null)}>
      <p className="break-words [overflow-wrap:anywhere]">{confirm.key.name}</p>
      <p>{confirm.action === 'rotate' ? '旧 Key 仍然有效。保存新 Key 并替换 Agent 配置后，再手动撤销旧 Key。' : '撤销后立即失效，使用此 Key 的 Agent 将无法访问。此操作不可恢复。'}</p>
      <NeuButton variant="secondary" className="w-full rounded-lg" onClick={() => void mutate(confirm.action, confirm.key)}>{confirm.action === 'rotate' ? '确认轮换' : '确认撤销'}</NeuButton>
      <NeuButton variant="ghost" className="w-full" onClick={() => setConfirm(null)}>取消</NeuButton>
    </Modal>}
    {issued && <Modal title="保存 API Key" close={close}>
      <p>完整 Key 仅展示这一次。关闭后无法找回，请安全保存。</p>
      {issued.replaces && <p className="text-amber-700 break-all">旧 Key 仍然有效（{issued.replaces}）。换好 Agent 配置后，请手动撤销旧 Key。</p>}
      <code className="block p-3 rounded-lg shadow-neu-inset break-all select-all">{issued.secret}</code>
      {copyStatus && <p role="status">{copyStatus}</p>}
      <NeuButton variant="secondary" className="w-full rounded-lg gap-2" onClick={() => void copy()}><span aria-hidden="true" className="material-symbols-outlined">content_copy</span>复制 Key</NeuButton>
      <NeuButton variant="secondary" className="w-full rounded-lg" onClick={close}>已保存，关闭</NeuButton>
    </Modal>}
  </main>;
}

export default function MineApiKeys() {
  const identity = useSyncExternalStore(subscribe, snapshot);
  const [accountId, token] = JSON.parse(identity) as [string, string];
  const location = useLocation();
  const present = useIsPresent();
  // Exiting route animations must not retain the one-time credential screen.
  if (!present || location.pathname !== '/mine/api-keys') return null;
  return <div className="relative flex h-[100dvh] w-full max-w-md mx-auto flex-col bg-neu-bg text-neu-text antialiased">
    <header className="relative flex shrink-0 items-center justify-center px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-5">
      <div className="absolute left-6"><BackButton to="/mine" ariaLabel="返回个人中心" /></div><h1 className="text-xl font-bold text-neu-text-secondary">API Key</h1>
    </header>
    {accountId && token ? <Management key={identity} accountId={accountId} token={token} /> : <p role="alert" className="px-6 py-8">请先登录后管理 API Key。</p>}
  </div>;
}
