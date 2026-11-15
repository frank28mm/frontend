import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AssistantHost } from '@/components/assistant/AssistantHost';
import PlanDetail from '@/pages/PlanDetail';
import { apiClient } from '@/services/api';
import { savedPlanFixture } from '../unit/planFixture';
import type { InternalAxiosRequestConfig } from 'axios';
const setActiveProfile = vi.fn();
vi.mock('@/contexts/ProfileContext', () => ({ useProfile: () => ({ profiles: [{ profile_id: 'child-b', display_name: '乙孩子' }], setActiveProfile }) }));
const originalAdapter = apiClient.defaults.adapter;
let requests: InternalAxiosRequestConfig[];
let stored: Map<string, string>;
let binding: { plan_id: string; version: number } | undefined;
let message: string;
beforeEach(() => {
  vi.stubEnv('VITE_ASSISTANT_ENABLED', 'true'); requests = []; binding = undefined; message = ''; setActiveProfile.mockClear(); sessionStorage.clear();
  stored = new Map([['user_id', 'owner'], ['access_token', 'token'], ['active_profile_id', 'child-a']]);
  vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
  apiClient.defaults.adapter = async config => {
    requests.push(config); let payload: object; let contract = 'rizhi.assistant.v1';
    if (config.url === '/plans/plan_1') { payload = { plan: savedPlanFixture('math', Number(config.params?.version) || 5) }; contract = 'revision_plan.v1'; }
    else if (config.url === '/assistant/conversations') payload = { items: binding ? [{ conversation_id: 'discussion', title: '方案讨论', archived: false, plan_context: binding, created_at: '', updated_at: '' }] : [] };
    else if (config.url === '/assistant/turns' && config.method === 'post') {
      const input = JSON.parse(config.data); binding = input.plan_context; message = input.text;
      expect(config.headers.has('X-Profile-Id')).toBe(false); expect(config.headers.has('X-User-Id')).toBe(false);
      payload = { conversation_id: 'discussion', turn_id: 'turn', status: 'processing' };
    } else if (config.url === '/assistant/conversations/discussion') payload = { conversation: { conversation_id: 'discussion', archived: false, plan_context: binding, latest_turn: { turn_id: 'turn', status: 'completed' } }, messages: [{ message_id: 'user', turn_id: 'turn', sequence: 1, role: 'user', blocks: [{ type: 'text', text: message }] }], next_before_sequence: 0 };
    else if (config.url === '/assistant/turns/turn') payload = { conversation_id: 'discussion', turn_id: 'turn', status: 'completed', messages: [{ message_id: 'reply', turn_id: 'turn', sequence: 2, role: 'assistant', blocks: [{ type: 'text', text: '可以讨论这版方案。' }] }] };
    else throw new Error(`Unexpected ${config.method} ${config.url}`);
    return { config, status: 200, statusText: '', headers: {}, data: { contract_version: contract, ...payload } };
  };
});
afterEach(() => { cleanup(); apiClient.defaults.adapter = originalAdapter; sessionStorage.clear(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function mount(url = '/plan/plan_1?profileId=child-b') { render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/plan/:id" element={<PlanDetail />} /></Routes><AssistantHost /></MemoryRouter>); }
async function openDiscussion(url?: string) { mount(url); fireEvent.click(await screen.findByRole('button', { name: '与知之讨论' })); await screen.findByRole('dialog', { name: '与知之对话' }); }
async function send(text: string) { fireEvent.change(screen.getByRole('textbox', { name: '给知之的消息' }), { target: { value: text } }); fireEvent.click(screen.getByRole('button', { name: '发送' })); await waitFor(() => expect(screen.getByRole('textbox', { name: '给知之的消息' })).toBeEnabled()); }
it('latest opens a local-only draft pinned to actual loaded version, then creates and continues the dedicated conversation', async () => {
  await openDiscussion(); expect(screen.getByLabelText('方案讨论绑定')).toHaveTextContent('版本 5');
  expect(requests.some(r => r.method === 'post')).toBe(false); expect(requests.some(r => r.url === '/assistant/conversations/discussion')).toBe(false);
  await send('怎么安排复习'); await send('说说重点');
  const posts = requests.filter(r => r.method === 'post'); expect(posts).toHaveLength(2);
  expect(JSON.parse(posts[0].data)).toMatchObject({ conversation_id: '', plan_context: { plan_id: 'plan_1', version: 5 } });
  expect(JSON.parse(posts[1].data)).toMatchObject({ conversation_id: 'discussion', plan_context: { plan_id: 'plan_1', version: 5 } });
  expect(posts.every(r => r.url === '/assistant/turns')).toBe(true); expect(requests.some(r => /execute|plan-jobs/.test(r.url || ''))).toBe(false);
  const link = screen.getByRole('link', { name: '复习方案 · 版本 5' });
  expect(link).toHaveAttribute('href', '/plan/plan_1?version=5');
  expect(screen.getByLabelText('方案讨论绑定')).not.toHaveTextContent('plan_1');
  fireEvent.click(link);
  await waitFor(() => expect(requests.filter(r => r.url === '/plans/plan_1').at(-1)?.params).toEqual({ version: 5 }));
  await screen.findByText('复习目标');
  expect(setActiveProfile).not.toHaveBeenCalled(); expect(stored.get('active_profile_id')).toBe('child-a');
});
it('opening version one stays pinned when the page switches to latest', async () => {
  await openDiscussion('/plan/plan_1?profileId=child-b&version=1');
  fireEvent.change(screen.getByRole('combobox', { name: '方案版本' }), { target: { value: 'latest' } });
  await waitFor(() => expect(screen.getByRole('combobox', { name: '方案版本' })).toHaveValue('5'));
  expect(screen.getByLabelText('方案讨论绑定')).toHaveTextContent('版本 1'); await send('讨论这版');
  expect(JSON.parse(requests.find(r => r.method === 'post')!.data).plan_context).toEqual({ plan_id: 'plan_1', version: 1 });
});
it('ordinary new conversation clears binding and history restores the server pointer', async () => {
  await openDiscussion(); await send('讨论');
  fireEvent.click(screen.getByRole('button', { name: '新对话' })); expect(screen.queryByLabelText('方案讨论绑定')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '历史记录' }));
  fireEvent.click(await screen.findByRole('button', { name: '方案讨论' }));
  await waitFor(() => expect(screen.getByLabelText('方案讨论绑定')).toHaveTextContent('版本 5'));
  await send('继续讨论'); expect(JSON.parse(requests.filter(r => r.method === 'post').at(-1)!.data).plan_context).toEqual({ plan_id: 'plan_1', version: 5 });
});
it('account change clears draft/pointer and fences an already rendered bound link', async () => {
  await openDiscussion(); const link = screen.getByRole('link', { name: /版本 5/ });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '旧账号草稿' } }); stored.set('user_id', 'other');
  expect(fireEvent.click(link)).toBe(false);
  await act(async () => { window.dispatchEvent(new Event('auth:changed')); });
  expect(screen.getByRole('dialog', { name: '与知之对话' })).toBeInTheDocument();
  expect(screen.queryByLabelText('方案讨论绑定')).not.toBeInTheDocument(); expect(screen.getByRole('textbox')).toHaveValue('');
  expect(requests.some(r => r.method === 'post')).toBe(false);
});
it('does not offer discussion when assistant feature is off', async () => {
  vi.stubEnv('VITE_ASSISTANT_ENABLED', 'false'); mount(); await screen.findByText('复习目标'); expect(screen.queryByRole('button', { name: '与知之讨论' })).not.toBeInTheDocument();
});
