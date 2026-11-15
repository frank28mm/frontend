import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { apiClient } from '@/services/api';
import PlanHistory from '@/pages/PlanHistory';
import PlanDetail from '@/pages/PlanDetail';
import Mine from '@/pages/Mine';
import { authService } from '@/services/auth';
import { savedPlanFixture } from '../unit/planFixture';

const setActiveProfile = vi.fn();
vi.mock('@/hooks/useQuota', () => ({ useQuota: () => ({ quota: null }) }));
vi.mock('@/hooks/useFeedbackUnread', () => ({ useFeedbackUnread: () => ({ hasUnread: false }) }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'zh', toggleLanguage: vi.fn() }) }));
vi.mock('@/contexts/ProfileContext', () => ({ useProfile: () => ({
  profiles: [{ profile_id: 'child-a', display_name: '甲孩子' }, { profile_id: 'child-b', display_name: '乙孩子' }],
  activeProfileId: 'child-a', activeProfile: { display_name: '甲孩子' }, setActiveProfile,
}) }));
const summary = (id = 'plan_1', profile = 'child-b') => {
  const plan = savedPlanFixture();
  return { plan_id: id, profile_id: profile, version: plan.version, subject: plan.subject,
    title: `方案 ${id}`, from_date: plan.from_date, through_date: plan.through_date, created_at: plan.created_at };
};
const response = (config: InternalAxiosRequestConfig, data: unknown): AxiosResponse => ({ config, data, status: 200, statusText: 'OK', headers: {} });
function Jump() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate('/plan/plan_1?profileId=child-b&version=1')}>切换到版本一</button>
    <button onClick={() => navigate('/plan/plan_2?profileId=child-c&version=1')}>切换方案</button>
    <button onClick={() => navigate('/plans?profileId=child-c')}>切换列表范围</button></>;
}
const open = (url: string) => render(<MemoryRouter initialEntries={[url]}><Jump /><Routes>
  <Route path="/mine" element={<Mine />} />
  <Route path="/plans" element={<PlanHistory />} /><Route path="/plan/:id" element={<PlanDetail />} />
</Routes></MemoryRouter>);

describe('saved revision plan surfaces', () => {
  const adapter = apiClient.defaults.adapter;
  let stored: Map<string, string>;
  let requests: InternalAxiosRequestConfig[];
  beforeEach(() => {
    requests = [];
    setActiveProfile.mockClear();
    vi.spyOn(authService, 'refreshParentDisplayName').mockResolvedValue(null);
    stored = new Map([['user_id', 'account-a'], ['access_token', 'token-a'], ['active_profile_id', 'child-a']]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null });
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      return response(config, { contract_version: 'revision_plan.v1', ...(config.url === '/plans' ? { items: [summary()] } : { plan: savedPlanFixture('math', Number(config.params?.version) || 2) }) });
    };
  });
  afterEach(() => { cleanup(); apiClient.defaults.adapter = adapter; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('opens the account-wide list from Mine', async () => {
    open('/mine');
    fireEvent.click(screen.getByRole('button', { name: '复习方案' }));
    await screen.findByRole('link', { name: /方案 plan_1/ });
    expect(requests[0].params).toEqual({ limit: 20, offset: 0 });
    expect(setActiveProfile).not.toHaveBeenCalled();
  });

  it('lists account-wide, labels the actual child and links the pinned scope', async () => {
    open('/plans');
    const link = await screen.findByRole('link', { name: /方案 plan_1/ });
    expect(link.getAttribute('href')).toBe('/plan/plan_1?profileId=child-b&version=2');
    expect(screen.getByText('乙孩子')).toBeInTheDocument();
    expect(screen.queryByText('甲孩子')).not.toBeInTheDocument();
    expect(requests[0].params).toEqual({ limit: 20, offset: 0 });
    expect(setActiveProfile).not.toHaveBeenCalled();
  });
  it('preserves explicit list child without selecting it globally', async () => {
    open('/plans?profileId=child-b');
    await screen.findByRole('link', { name: /方案 plan_1/ });
    expect(requests[0].params.profile_id).toBe('child-b');
    expect(setActiveProfile).not.toHaveBeenCalled();
  });
  it.each(['/plans?profileId=', '/plans?profileId=child-b&profileId=child-b', '/plans?version=2',
    '/plan/plan_1?version=1&version=2', '/plan/plan_1?version=-1', '/plan/plan_1?version=1.5',
    '/plan/plan_1?version=1000001', '/plan/plan_1?profileId=', '/plan/plan_1?other=x'])('rejects invalid query %s without transport', async url => {
    open(url);
    expect(await screen.findByRole('alert')).toHaveTextContent('链接参数无效');
    expect(requests).toHaveLength(0);
  });
  it('rejects a wrong-child service result without displaying its content', async () => {
    open('/plan/plan_1?profileId=child-a&version=2');
    expect(await screen.findByRole('alert')).toHaveTextContent('保存的方案数据不兼容');
    expect(screen.queryByText('基于所选作业')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument();
  });
  it.each([
    ['/plans', 'missing'], ['/plans', 'foreign'],
    ['/plan/plan_1?version=2', 'missing'], ['/plan/plan_1?version=2', 'foreign'],
  ])('shows the same safe non-retryable 404 for %s (%s)', async (url, reason) => {
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      throw new AxiosError(`private ${reason}`, 'ERR_BAD_REQUEST', config, undefined,
        { ...response(config, { reason, account: 'secret-owner' }), status: 404 });
    };
    open(url);
    expect(await screen.findByRole('alert')).toHaveTextContent('方案不存在或暂不可用。');
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument();
    expect(screen.queryByText(/private|secret-owner|foreign|missing/)).not.toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
  it.each([
    ['/plans', 'contract'], ['/plans', 'data'],
    ['/plan/plan_1?version=2', 'contract'], ['/plan/plan_1?version=2', 'data'],
  ])('shows non-retryable incompatible saved data for %s (%s)', async (url, kind) => {
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      return response(config, { contract_version: kind === 'contract' ? 'revision_plan.private' : 'revision_plan.v1',
        ...(config.url === '/plans' ? { items: [{ private: 'secret' }] } : { plan: { private: 'secret' } }) });
    };
    open(url);
    expect(await screen.findByRole('alert')).toHaveTextContent('保存的方案数据不兼容，暂无法展示。');
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument();
    expect(screen.queryByText(/revision_plan.private|secret/)).not.toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
  it('keeps server errors generic and retryable without exposing their body', async () => {
    apiClient.defaults.adapter = async config => {
      throw new AxiosError('private server trace', 'ERR_BAD_RESPONSE', config, undefined,
        { ...response(config, { message: 'secret-owner' }), status: 503 });
    };
    open('/plan/plan_1?version=2');
    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取保存的复习方案，请重试。');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
    expect(screen.queryByText(/private|secret-owner/)).not.toBeInTheDocument();
  });
  it('shows escaped content, goal, metadata and separate supported/general sections', async () => {
    const plan = savedPlanFixture();
    plan.content.overview = '<img src=x onerror=alert(1)><script>bad()</script>';
    apiClient.defaults.adapter = async config => response(config, { contract_version: 'revision_plan.v1', plan });
    const view = open('/plan/plan_1?profileId=child-b&version=2');
    expect(await screen.findByText(plan.content.overview)).toBeInTheDocument();
    expect(view.container.querySelector('script, img')).toBeNull();
    expect(screen.getByText(plan.goal)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '数据支持的重点' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '一般建议' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '适用边界' })).toBeInTheDocument();
    expect(screen.getByText('数据依据')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /原题/ })).not.toBeInTheDocument();
  });
  it('uses returned latest version and pins menu changes with child scope', async () => {
    open('/plan/plan_1?profileId=child-b');
    const menu = await screen.findByRole('combobox', { name: '方案版本' });
    expect(menu).toHaveValue('2');
    expect(requests[0].params.version).toBeUndefined();
    fireEvent.change(menu, { target: { value: '1' } });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].params).toEqual({ profile_id: 'child-b', version: 1 });
    await waitFor(() => expect(screen.getByRole('combobox', { name: '方案版本' })).toHaveValue('1'));
  });
  it('keeps known newer versions after selecting an old version without extra requests', async () => {
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      return response(config, { contract_version: 'revision_plan.v1', plan: savedPlanFixture('math', Number(config.params?.version) || 3) });
    };
    open('/plan/plan_1?profileId=child-b');
    const menu = await screen.findByRole('combobox', { name: '方案版本' });
    expect(menu).toHaveValue('3');
    fireEvent.change(menu, { target: { value: '1' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: '方案版本' })).toHaveValue('1'));
    const oldMenu = screen.getByRole('combobox', { name: '方案版本' });
    expect([...oldMenu.querySelectorAll('option')].map(option => option.value)).toEqual(['latest', '3', '2', '1']);
    expect(requests).toHaveLength(2);
    fireEvent.change(oldMenu, { target: { value: '2' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: '方案版本' })).toHaveValue('2'));
    fireEvent.change(screen.getByRole('combobox', { name: '方案版本' }), { target: { value: '3' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: '方案版本' })).toHaveValue('3'));
    expect(requests.map(r => r.params?.version)).toEqual([undefined, 1, 2, 3]);
  });
  it('resets known versions after an auth event', async () => {
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      return response(config, { contract_version: 'revision_plan.v1', plan: savedPlanFixture('math', requests.length === 1 ? 3 : 1) });
    };
    open('/plan/plan_1?profileId=child-b');
    expect(await screen.findByRole('combobox', { name: '方案版本' })).toHaveValue('3');
    act(() => { stored.set('user_id', 'account-b'); stored.set('access_token', 'token-b'); window.dispatchEvent(new Event('auth:changed')); });
    await waitFor(() => expect(screen.getByRole('combobox', { name: '方案版本' })).toHaveValue('1'));
    expect(screen.queryByRole('option', { name: '版本 3' })).not.toBeInTheDocument();
  });
  it('ignores unrelated storage events while preserving loaded pages and a pending next page', async () => {
    let complete!: () => void;
    apiClient.defaults.adapter = config => {
      requests.push(config);
      if (config.params.offset === 20) return new Promise(resolve => { complete = () => resolve(response(config,
        { contract_version: 'revision_plan.v1', items: [summary('last')] })); });
      return Promise.resolve(response(config, { contract_version: 'revision_plan.v1', items: Array.from({ length: 20 }, (_, i) => summary(`plan_${i}`)) }));
    };
    open('/plans');
    await screen.findByRole('button', { name: '加载更多' });
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'language', newValue: 'en' })));
    expect(screen.getAllByRole('link', { name: /方案 / })).toHaveLength(20);
    expect(requests).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'language', newValue: 'zh' })));
    expect(requests[1].signal?.aborted).toBe(false);
    expect(requests).toHaveLength(2);
    await act(async () => complete());
    expect(screen.getAllByRole('link', { name: /方案 / })).toHaveLength(21);
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'language', newValue: 'en' })));
    expect(screen.getAllByRole('link', { name: /方案 / })).toHaveLength(21);
    expect(requests).toHaveLength(2);
  });
  it.each(['user_id', 'access_token', null])('still aborts pending work on auth storage key %s', async key => {
    let complete!: () => void;
    apiClient.defaults.adapter = config => {
      requests.push(config);
      if (requests.length === 1) return new Promise(resolve => { complete = () => resolve(response(config,
        { contract_version: 'revision_plan.v1', items: [summary('private')] })); });
      return Promise.resolve(response(config, { contract_version: 'revision_plan.v1', items: [] }));
    };
    open('/plans');
    await waitFor(() => expect(requests).toHaveLength(1));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key })));
    expect(requests[0].signal?.aborted).toBe(true);
    await act(async () => complete());
    await screen.findByText('暂无保存的复习方案');
    expect(screen.queryByRole('link', { name: /方案 private/ })).not.toBeInTheDocument();
    expect(requests).toHaveLength(2);
  });
  it('does not silently replace an unavailable pinned version with latest', async () => {
    apiClient.defaults.adapter = async config => { requests.push(config); throw new Error('not found'); };
    open('/plan/plan_1?version=10');
    await screen.findByRole('alert');
    expect(requests).toHaveLength(1);
    expect(requests[0].params.version).toBe(10);
  });
  it('paginates at offset 20 and retries the same failed page without duplicates', async () => {
    let fail = true;
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      if (config.params.offset === 20 && fail) { fail = false; throw new Error('offline'); }
      return response(config, { contract_version: 'revision_plan.v1', items: config.params.offset === 0 ? Array.from({ length: 20 }, (_, i) => summary(`plan_${i}`)) : [summary('last')] });
    };
    open('/plans');
    fireEvent.click(await screen.findByRole('button', { name: '加载更多' }));
    fireEvent.click(await screen.findByRole('button', { name: '重试' }));
    await screen.findByRole('link', { name: /方案 last/ });
    expect(requests.map(r => r.params.offset)).toEqual([0, 20, 20]);
    expect(screen.getAllByRole('link', { name: /方案 / })).toHaveLength(21);
    expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument();
  });
  it('renders empty state', async () => {
    apiClient.defaults.adapter = async config => response(config, { contract_version: 'revision_plan.v1', items: [] });
    open('/plans');
    expect(await screen.findByText('暂无保存的复习方案')).toBeInTheDocument();
  });
  it('uses an unknown child ID instead of the selected child name', async () => {
    apiClient.defaults.adapter = async config => response(config, { contract_version: 'revision_plan.v1', items: [summary('unknown', 'child-c')] });
    open('/plans');
    expect(await screen.findByText('孩子 child-c')).toBeInTheDocument();
    expect(screen.queryByText('甲孩子')).not.toBeInTheDocument();
  });
  it('clears already displayed private content immediately on logout without another request', async () => {
    open('/plan/plan_1?version=2');
    await screen.findByText('基于所选作业');
    act(() => { stored.delete('user_id'); stored.delete('access_token'); window.dispatchEvent(new Event('auth:changed')); });
    expect(screen.queryByText('基于所选作业')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('请登录');
    expect(requests).toHaveLength(1);
  });
  it('bounds the version menu even for the largest supported pinned version', async () => {
    open('/plan/plan_1?version=1000000');
    const menu = await screen.findByRole('combobox', { name: '方案版本' });
    expect(menu).toHaveValue('1000000');
    expect(menu.querySelectorAll('option')).toHaveLength(21);
  });
  it('retries a detail failure using the same pinned version and explicit scope', async () => {
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      if (requests.length === 1) throw new Error('offline');
      return response(config, { contract_version: 'revision_plan.v1', plan: savedPlanFixture('math', 1) });
    };
    open('/plan/plan_1?profileId=child-b&version=1');
    fireEvent.click(await screen.findByRole('button', { name: '重试' }));
    await screen.findByText('基于所选作业');
    expect(requests.map(r => r.params)).toEqual([{ profile_id: 'child-b', version: 1 }, { profile_id: 'child-b', version: 1 }]);
  });
  it.each(['success', 'error'])('ignores late old-route %s when both plan and child change', async kind => {
    let complete!: () => void;
    apiClient.defaults.adapter = config => {
      requests.push(config);
      if (requests.length === 1) return new Promise((resolve, reject) => { complete = () => kind === 'success'
        ? resolve(response(config, { contract_version: 'revision_plan.v1', plan: savedPlanFixture() })) : reject(new Error('private')); });
      const plan = savedPlanFixture('math', 1);
      plan.plan_id = 'plan_2'; plan.profile_id = 'child-c'; plan.content.title = '新范围方案';
      return Promise.resolve(response(config, { contract_version: 'revision_plan.v1', plan }));
    };
    open('/plan/plan_1?profileId=child-b&version=2');
    await waitFor(() => expect(requests).toHaveLength(1));
    fireEvent.click(screen.getByText('切换方案'));
    await screen.findByRole('heading', { name: '新范围方案' });
    await act(async () => complete());
    expect(screen.getByRole('heading', { name: '新范围方案' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '版本 2' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(requests[0].signal?.aborted).toBe(true);
    expect(setActiveProfile).not.toHaveBeenCalled();
  });
  it('resets pagination and hides old items on a list scope change', async () => {
    apiClient.defaults.adapter = async config => {
      requests.push(config);
      return response(config, { contract_version: 'revision_plan.v1', items: config.params.profile_id === 'child-c' ? [] : [summary('private')] });
    };
    open('/plans?profileId=child-b');
    await screen.findByRole('link', { name: /方案 private/ });
    fireEvent.click(screen.getByText('切换列表范围'));
    expect(screen.queryByRole('link', { name: /方案 private/ })).not.toBeInTheDocument();
    await screen.findByText('暂无保存的复习方案');
    expect(requests[1].params).toEqual({ limit: 20, offset: 0, profile_id: 'child-c' });
  });
  it.each(['success', 'error'])('fences late old-account %s and aborts on auth change', async kind => {
    let complete!: () => void;
    let oldSignal: AbortSignal | undefined;
    apiClient.defaults.adapter = config => {
      requests.push(config);
      if (requests.length === 1) {
        oldSignal = config.signal as AbortSignal;
        return new Promise((resolve, reject) => { complete = () => kind === 'success' ? resolve(response(config, { contract_version: 'revision_plan.v1', items: [summary('private')] })) : reject(new Error('private error')); });
      }
      return Promise.resolve(response(config, { contract_version: 'revision_plan.v1', items: [] }));
    };
    open('/plans');
    await waitFor(() => expect(requests).toHaveLength(1));
    act(() => { stored.set('user_id', 'account-b'); stored.set('access_token', 'token-b'); window.dispatchEvent(new Event('auth:changed')); });
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => complete());
    expect(await screen.findByText('暂无保存的复习方案')).toBeInTheDocument();
    expect(screen.queryByText(/private/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('fences a late detail result after version navigation and aborts on unmount', async () => {
    let complete!: () => void;
    let firstSignal: AbortSignal | undefined;
    apiClient.defaults.adapter = config => {
      requests.push(config);
      if (requests.length === 1) {
        firstSignal = config.signal as AbortSignal;
        return new Promise(resolve => { complete = () => resolve(response(config, { contract_version: 'revision_plan.v1', plan: savedPlanFixture('math', 2) })); });
      }
      return Promise.resolve(response(config, { contract_version: 'revision_plan.v1', plan: savedPlanFixture('math', 1) }));
    };
    const view = open('/plan/plan_1?profileId=child-b&version=2');
    await waitFor(() => expect(requests).toHaveLength(1));
    fireEvent.click(screen.getByText('切换到版本一'));
    await screen.findByRole('combobox', { name: '方案版本' });
    await act(async () => complete());
    expect(firstSignal?.aborted).toBe(true);
    expect(screen.getByRole('combobox', { name: '方案版本' })).toHaveValue('1');
    view.unmount();
    expect(requests[1].signal?.aborted).toBe(true);
  });
});
