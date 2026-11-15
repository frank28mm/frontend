import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, Link, useLocation, Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { PageTransition } from '@/components/ui/PageTransition';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MineApiKeys from '@/pages/MineApiKeys';
import { apiKeysService, API_KEY_SCOPES, ApiKeysError, type ApiKey } from '@/services/apiKeys';
import { AUTH_CHANGED_EVENT } from '@/services/auth';
import Mine from '@/pages/Mine';
import { authService } from '@/services/auth';

vi.mock('@/hooks/useQuota', () => ({ useQuota: () => ({ quota: null }) }));
vi.mock('@/hooks/useFeedbackUnread', () => ({ useFeedbackUnread: () => ({ hasUnread: false }) }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'zh', toggleLanguage: vi.fn() }) }));

const secret = `rz_ro_${'A'.repeat(43)}`;
const key = (key_id = 'a'.repeat(32)): ApiKey => ({ key_id, name: 'Agent', prefix: 'rz_ro_AAAAAAAA', last_four: 'AAAA', scopes: [...API_KEY_SCOPES], status: 'active', created_at: '2026-10-11T12:00:00Z' });
function Host() { const location = useLocation(); return <><Link to="/mine">离开</Link><span>{location.pathname}</span><MineApiKeys /></>; }
function open() { return render(<MemoryRouter initialEntries={['/mine/api-keys']}><Host /></MemoryRouter>); }
async function create() { await act(async () => { fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Agent' } }); fireEvent.click(screen.getByRole('button', { name: '创建 Key' })); }); }
beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: vi.fn((k: string, v: string) => stored.set(k, v)), clear: () => stored.clear() });
  localStorage.clear(); localStorage.setItem('user_id', 'owner'); localStorage.setItem('access_token', 'session');
  vi.spyOn(apiKeysService, 'list').mockResolvedValue([]);
  vi.spyOn(apiKeysService, 'create').mockResolvedValue({ key: key(), secret });
  vi.spyOn(apiKeysService, 'rotate').mockResolvedValue({ key: key('b'.repeat(32)), secret, replaces_key_id: key().key_id });
  vi.spyOn(apiKeysService, 'revoke').mockResolvedValue();
  vi.spyOn(authService, 'refreshParentDisplayName').mockResolvedValue(null);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('shows secret only once, explicitly copies, and never stores or logs it', async () => {
  const storage = vi.mocked(localStorage.setItem); const log = vi.spyOn(console, 'log'); const error = vi.spyOn(console, 'error');
  open(); await screen.findByText('暂无 API Key'); await create();
  await screen.findByRole('dialog', { name: '保存 API Key' }); expect(screen.getByText(secret)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '复制 Key' })); await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(secret));
  fireEvent.click(screen.getByRole('button', { name: '已保存，关闭' })); expect(screen.queryByText(secret)).not.toBeInTheDocument();
  expect(JSON.stringify(storage.mock.calls)).not.toContain(secret); expect(JSON.stringify(log.mock.calls)).not.toContain(secret); expect(JSON.stringify(error.mock.calls)).not.toContain(secret);
});
function changeVisibility() {
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  act(() => {
    visibility.mockReturnValue('hidden'); document.dispatchEvent(new Event('visibilitychange'));
    visibility.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange'));
  });
}
it('keeps the once-only secret available for copy across visibilitychange', async () => {
  open(); await screen.findByText('暂无 API Key'); await create(); await screen.findByText(secret);
  changeVisibility();
  expect(screen.getByRole('dialog', { name: '保存 API Key' })).toHaveTextContent(secret);
  fireEvent.click(screen.getByRole('button', { name: '复制 Key' })); await screen.findByText('已复制');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(secret);
  fireEvent.click(screen.getByRole('button', { name: '已保存，关闭' }));
  changeVisibility(); expect(screen.queryByText(secret)).not.toBeInTheDocument();
  expect(apiKeysService.create).toHaveBeenCalledTimes(1);
});
it.each(['轮换', '撤销'] as const)('keeps the %s confirmation usable across visibilitychange', async action => {
  vi.mocked(apiKeysService.list).mockResolvedValue([key()]); open(); await screen.findByText('Agent');
  fireEvent.click(screen.getByRole('button', { name: `${action} Agent` }));
  changeVisibility();
  expect(screen.getByRole('dialog', { name: `${action} API Key` })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: `确认${action}` }));
  if (action === '轮换') { await screen.findByText(secret); expect(apiKeysService.rotate).toHaveBeenCalledTimes(1); expect(apiKeysService.revoke).not.toHaveBeenCalled(); }
  else { await screen.findByText('已撤销'); expect(apiKeysService.revoke).toHaveBeenCalledTimes(1); }
});
it('keeps both keys active on rotation and requires an explicit revocation', async () => {
  vi.mocked(apiKeysService.list).mockResolvedValue([key()]); open(); await screen.findByText('Agent');
  fireEvent.click(screen.getByRole('button', { name: '轮换 Agent' }));
  expect(screen.getByRole('dialog', { name: '轮换 API Key' })).toHaveTextContent('旧 Key 仍然有效');
  fireEvent.click(screen.getByRole('button', { name: '确认轮换' })); await screen.findByText(secret);
  expect(apiKeysService.revoke).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: '已保存，关闭' }));
  expect(screen.getAllByText('有效')).toHaveLength(2);
  fireEvent.click(screen.getAllByRole('button', { name: '撤销 Agent' })[0]); fireEvent.click(screen.getByRole('button', { name: '确认撤销' }));
  await waitFor(() => expect(apiKeysService.revoke).toHaveBeenCalledTimes(1)); await screen.findByText('已撤销');
});
it('locks uncertain issuance until successful explicit metadata refresh, without repeating POST', async () => {
  vi.mocked(apiKeysService.create).mockRejectedValue(new ApiKeysError('REQUEST_FAILED'));
  open(); await screen.findByText('暂无 API Key'); await create(); expect(screen.getByRole('alert')).toHaveTextContent('签发结果未知');
  expect(screen.getByRole('button', { name: '创建 Key' })).toBeDisabled(); expect(apiKeysService.create).toHaveBeenCalledTimes(1);
  vi.mocked(apiKeysService.list).mockRejectedValueOnce(new ApiKeysError('REQUEST_FAILED'));
  fireEvent.click(screen.getByRole('button', { name: '刷新列表' })); await screen.findByText('无法读取 API Key，请重试。');
  expect(screen.getByRole('button', { name: '创建 Key' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '刷新列表' })); await waitFor(() => expect(screen.getByRole('button', { name: '创建 Key' })).toBeEnabled());
  expect(apiKeysService.create).toHaveBeenCalledTimes(1);
});
it.each(['auth', 'navigation', 'pagehide'])('clears displayed secret on %s', async event => {
  open(); await screen.findByText('暂无 API Key'); await create(); await screen.findByText(secret);
  if (event === 'auth') await act(async () => { localStorage.setItem('user_id', 'other'); window.dispatchEvent(new Event(AUTH_CHANGED_EVENT)); });
  if (event === 'navigation') fireEvent.click(screen.getByText('离开'));
  if (event === 'pagehide') act(() => window.dispatchEvent(new Event('pagehide')));
  expect(screen.queryByText(secret)).not.toBeInTheDocument();
});
it.each(['auth', 'navigation'])('discards a late issuance after %s and prevents duplicate clicks', async event => {
  let resolve!: (v: {key: ApiKey; secret: string}) => void;
  vi.mocked(apiKeysService.create).mockImplementation(() => new Promise(yes => { resolve = yes; }));
  open(); await screen.findByText('暂无 API Key'); await create(); fireEvent.click(screen.getByRole('button', { name: '创建 Key' }));
  expect(apiKeysService.create).toHaveBeenCalledTimes(1);
  if (event === 'auth') act(() => { localStorage.setItem('user_id', 'other'); window.dispatchEvent(new Event(AUTH_CHANGED_EVENT)); });
  else fireEvent.click(screen.getByText('离开'));
  await act(async () => resolve({ key: key(), secret })); expect(screen.queryByText(secret)).not.toBeInTheDocument();
});
it('handles clipboard failure without closing the once-only secret dialog', async () => {
  vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error(secret));
  open(); await screen.findByText('暂无 API Key'); await create(); await screen.findByText(secret);
  fireEvent.click(screen.getByRole('button', { name: '复制 Key' })); await screen.findByText('复制失败，请手动保存。');
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }); expect(screen.queryByText(secret)).not.toBeInTheDocument();
});
it('requires login and shows fixed scopes/account-wide authorization', async () => {
  localStorage.clear(); open(); expect(screen.getByText('请先登录后管理 API Key。')).toBeInTheDocument(); expect(apiKeysService.list).not.toHaveBeenCalled();
});
it('removes secret immediately while the actual route exit animation retains the old location', async () => {
  function Animated() {
    const location = useLocation();
    return <><Link to="/mine">离开</Link><AnimatePresence mode="wait"><Routes location={location} key={location.pathname}>
      <Route path="/mine/api-keys" element={<PageTransition><MineApiKeys /></PageTransition>} />
      <Route path="/mine" element={<PageTransition>个人中心</PageTransition>} />
    </Routes></AnimatePresence></>;
  }
  render(<MemoryRouter initialEntries={['/mine/api-keys']}><Animated /></MemoryRouter>);
  await screen.findByText('暂无 API Key'); await create(); await screen.findByText(secret);
  fireEvent.click(screen.getByText('离开')); expect(screen.queryByText(secret)).not.toBeInTheDocument();
});
it('opens the account-wide key page from the personal center', async () => {
  render(<MemoryRouter initialEntries={['/mine']}><Routes><Route path="/mine" element={<Mine />} /><Route path="/mine/api-keys" element={<MineApiKeys />} /></Routes></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'API Key' }));
  await screen.findByText('授权范围：本账号所有现有及未来的孩子。');
  await waitFor(() => expect(apiKeysService.list).toHaveBeenCalledTimes(1));
  expect(vi.mocked(apiKeysService.list).mock.calls[0][0]).toMatchObject({ accountId: 'owner', token: 'session' });
  expect(vi.mocked(apiKeysService.list).mock.calls[0][0]).not.toHaveProperty('profileId');
});
it('cleans up on cross-tab account changes even with the same token', async () => {
  open(); await screen.findByText('暂无 API Key'); await create(); await screen.findByText(secret);
  await act(async () => { localStorage.setItem('user_id', 'other'); window.dispatchEvent(new StorageEvent('storage', { key: 'user_id' })); });
  expect(screen.queryByText(secret)).not.toBeInTheDocument();
});
it('blocks issuance at the limit but still allows explicit revocation', async () => {
  vi.mocked(apiKeysService.list).mockResolvedValue(Array.from({ length: 10 }, (_, i) => key(i.toString(16).padStart(32, '0'))));
  open(); await screen.findByText(/最多可保留/); fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Another' } });
  expect(screen.getByRole('button', { name: '创建 Key' })).toBeDisabled();
  expect(screen.getAllByRole('button', { name: '轮换 Agent' }).every(button => button.hasAttribute('disabled'))).toBe(true);
  expect(screen.getAllByRole('button', { name: '撤销 Agent' })[0]).toBeEnabled();
});
it('discards old-account list errors without contaminating the new account', async () => {
  let reject!: (error: unknown) => void;
  vi.mocked(apiKeysService.list).mockImplementationOnce(() => new Promise((_, no) => { reject = no; }));
  open(); await waitFor(() => expect(apiKeysService.list).toHaveBeenCalledTimes(1));
  await act(async () => { localStorage.setItem('user_id', 'other'); window.dispatchEvent(new Event(AUTH_CHANGED_EVENT)); });
  await act(async () => reject(new ApiKeysError('UNAUTHORIZED')));
  expect(screen.queryByText('登录已失效，请重新登录。')).not.toBeInTheDocument(); expect(localStorage.getItem('access_token')).toBe('session');
});
it('cancels pending issuance on pagehide and requires reconciliation before new issuance', async () => {
  let resolve!: (v: {key: ApiKey; secret: string}) => void;
  vi.mocked(apiKeysService.create).mockImplementation(() => new Promise(yes => { resolve = yes; }));
  open(); await screen.findByText('暂无 API Key'); await create();
  act(() => window.dispatchEvent(new Event('pagehide')));
  await act(async () => resolve({ key: key(), secret }));
  expect(screen.queryByText(secret)).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: '创建 Key' })).toBeDisabled();
  expect(apiKeysService.create).toHaveBeenCalledTimes(1);
});
it('uses a fixed denied message and never displays raw failure text', async () => {
  vi.mocked(apiKeysService.list).mockRejectedValue(new ApiKeysError('UNAUTHORIZED')); open();
  await screen.findByText('登录已失效，请重新登录。'); expect(screen.getByRole('button', { name: '创建 Key' })).toBeDisabled();
});
it('reloads after StrictMode effect replay while the first list is still pending', async () => {
  const resolve: ((keys: ApiKey[]) => void)[] = [];
  vi.mocked(apiKeysService.list).mockImplementation(() => new Promise(yes => { resolve.push(yes); }));
  render(<StrictMode><MemoryRouter initialEntries={['/mine/api-keys']}><MineApiKeys /></MemoryRouter></StrictMode>);
  await waitFor(() => expect(apiKeysService.list).toHaveBeenCalledTimes(2));
  expect(vi.mocked(apiKeysService.list).mock.calls[0][1]?.aborted).toBe(true);
  await act(async () => resolve[1]([key()])); await screen.findByText('Agent');
  await act(async () => resolve[0]([])); expect(screen.getByText('Agent')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Another' } }); expect(screen.getByRole('button', { name: '创建 Key' })).toBeEnabled();
});
