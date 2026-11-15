import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AssistantHost } from '@/components/assistant/AssistantHost';
import { apiClient } from '@/services/api';
import type { AssistantMessage } from '@/services/assistant';
import type { PlanConfirmation } from '@/services/assistantPlanConfirmation';

const originalAdapter = apiClient.defaults.adapter;
let bound: boolean;
const binding = { plan_id: 'plan', version: 1 };
const proposal = (): PlanConfirmation => ({ confirmation_id: 'pc1', conversation_id: 'conv', turn_id: 't1', status: 'pending', expires_at: '2099-10-11T12:00:00Z', preview: { scope: { profile_id: 'selected/?', subject: 'physics', from_date: '2026-10-01', through_date: '2026-10-11' }, child_name: '孩子', time_zone: 'Asia/Shanghai', goal: '复习', content_version: 'revision_plan.v1', generation_available: true, ...(bound ? { target_plan_id: 'plan', base_version: 1 } : {}) } });
const source = (): AssistantMessage => ({ message_id: 'proposal', turn_id: 't1', sequence: 1, role: 'assistant', created_at: '', blocks: [{ type: 'plan_confirmation', plan_confirmation: proposal() }] });
const textReply = (): AssistantMessage => ({ message_id: 'text-reply', turn_id: 't2', sequence: 3, role: 'assistant', created_at: '', blocks: [{ type: 'text', text: '已处理本次请求。' }] });
let requests: InternalAxiosRequestConfig[];
let stored: Map<string, string>;
let text: string;
let finished: boolean;
let outcome: 'executed' | 'invalidated';
let turnStatus: 'completed' | 'canceled';
let confirmationReads: number;
let jobReads: number;
let jobStages: ('queued' | 'processing' | 'done')[];
let hold: 'turn' | 'confirmation' | 'job' | undefined;
let held: { config: InternalAxiosRequestConfig; resolve: (response: AxiosResponse) => void; reject: (error: unknown) => void } | undefined;

const response = (config: InternalAxiosRequestConfig, payload: object, version = 'rizhi.assistant.v1'): AxiosResponse => ({ config, status: 200, statusText: 'OK', headers: {}, data: { contract_version: version, ...payload } });
const confirmation = (): PlanConfirmation => ({ ...proposal(), ...(finished ? outcome === 'executed' ? { status: 'executed', job_id: 'job/?', plan_id: bound ? 'plan' : 'plan/?' } : { status: 'invalidated' } : {}) });
beforeEach(() => {
  vi.stubEnv('VITE_ASSISTANT_ENABLED', 'true'); bound = false; requests = []; text = ''; finished = false; outcome = 'executed'; turnStatus = 'completed'; confirmationReads = 0; jobReads = 0; jobStages = ['done']; hold = undefined; held = undefined;
  stored = new Map([['access_token', 'token'], ['user_id', 'owner'], ['active_profile_id', 'unrelated-child']]);
  vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
  sessionStorage.clear(); sessionStorage.setItem('rizhi-assistant:owner', JSON.stringify({ conversationId: 'conv' }));
  apiClient.defaults.adapter = async config => {
    requests.push(config);
    const url = config.url;
    if (url === '/assistant/conversations') return response(config, { items: [] });
    if (url === '/assistant/conversations/conv') return response(config, {
      conversation: { conversation_id: 'conv', archived: false, ...(bound ? { plan_context: binding } : {}), latest_turn: { turn_id: text ? 't2' : 't1', status: text && !finished ? 'processing' : 'completed' } },
      messages: [source(), ...(text ? [{ message_id: 'confirm-user', turn_id: 't2', sequence: 2, role: 'user', created_at: '', blocks: [{ type: 'text', text }] }, ...(finished ? [textReply()] : [])] : [])], next_before_sequence: 0,
    });
    if (url === '/assistant/turns' && config.method === 'post') {
      const input = JSON.parse(config.data);
      expect(input).toEqual({ contract_version: 'rizhi.assistant.v1', conversation_id: 'conv', client_request_id: expect.any(String), text: expect.any(String), ...(bound ? { plan_context: binding } : {}) });
      text = input.text;
      return response(config, { conversation_id: 'conv', turn_id: 't2', status: 'processing' });
    }
    if (url === '/assistant/turns/t2' && config.method === 'get') {
      if (hold === 'turn') return new Promise<AxiosResponse>((resolve, reject) => { held = { config, resolve, reject }; });
      finished = true;
      return response(config, { conversation_id: 'conv', turn_id: 't2', status: turnStatus, messages: [textReply()] });
    }
    if (url === '/assistant/plan-confirmations/pc1' && config.method === 'get') {
      confirmationReads++;
      expect(config.headers.has('X-Profile-Id')).toBe(false); expect(config.headers.has('X-User-Id')).toBe(false); expect(config.params).toBeUndefined();
      if (hold === 'confirmation' && confirmationReads > 1) return new Promise<AxiosResponse>((resolve, reject) => { held = { config, resolve, reject }; });
      return response(config, { confirmation: confirmation() });
    }
    if (url === '/plan-jobs/job%2F%3F' && config.method === 'get') {
      jobReads++;
      expect(config.params).toEqual({ profile_id: 'selected/?' }); expect(config.headers.has('X-Profile-Id')).toBe(false); expect(config.headers.has('X-User-Id')).toBe(false);
      if (hold === 'job') return new Promise<AxiosResponse>((resolve, reject) => { held = { config, resolve, reject }; });
      const status = jobStages[Math.min(jobReads - 1, jobStages.length - 1)];
      return response(config, { job: { job_id: 'job/?', plan_id: bound ? 'plan' : 'plan/?', status, ...(status === 'done' ? { version: 3 } : {}) } }, 'revision_plan.v1');
    }
    throw new Error(`Unexpected request: ${config.method} ${url}`);
  };
});
afterEach(() => { cleanup(); apiClient.defaults.adapter = originalAdapter; sessionStorage.clear(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function mountAndSend(input = '确认生成') {
  render(<MemoryRouter><AssistantHost /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: '知之' }));
  await waitFor(() => expect(screen.getByRole('button', { name: bound ? '确认更新复习方案' : '确认生成复习方案' })).toBeEnabled());
  fireEvent.change(screen.getByRole('textbox', { name: '给知之的消息' }), { target: { value: input } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
}
function expectOnlyTextTurnPost() {
  const posts = requests.filter(r => r.method === 'post');
  expect(posts.map(r => r.url)).toEqual(['/assistant/turns']);
  expect(JSON.parse(posts[0].data).text).toBe(text);
  expect(requests.some(r => r.url?.endsWith('/execute'))).toBe(false);
}
it('bound natural confirmation preserves text and source while hydrating actual version across refresh', async () => {
  bound = true; await mountAndSend('确认更新');
  await screen.findByText('已处理本次请求。');
  const result = await screen.findByRole('link', { name: '查看复习方案' });
  expect(result).toHaveAttribute('href', '/plan/plan?profileId=selected%2F%3F&version=3');
  expect(screen.getByRole('link', { name: '复习方案 · 版本 1' })).toHaveAttribute('href', '/plan/plan?version=1');
  expectOnlyTextTurnPost(); expect(stored.get('active_profile_id')).toBe('unrelated-child');
  cleanup(); render(<MemoryRouter><AssistantHost /></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: '知之' }));
  expect(await screen.findByRole('link', { name: '查看复习方案' })).toHaveAttribute('href', '/plan/plan?profileId=selected%2F%3F&version=3');
  expect(screen.getByRole('link', { name: '复习方案 · 版本 1' })).toHaveAttribute('href', '/plan/plan?version=1');
  expectOnlyTextTurnPost();
});
it('bound late natural confirmation cannot hydrate into another account', async () => {
  bound = true; hold = 'confirmation'; await mountAndSend('确认更新'); await waitFor(() => expect(held).toBeDefined());
  await act(async () => { stored.set('user_id', 'other'); window.dispatchEvent(new Event('auth:changed')); });
  await act(async () => { held!.resolve(response(held!.config, { confirmation: confirmation() })); });
  expect(jobReads).toBe(0); expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(sessionStorage.getItem('rizhi-assistant:other')).toBeNull(); expectOnlyTextTurnPost();
});
it('text-only t2 completion hydrates the sole original t1 proposal and polls its exact child/version despite latest turn t2', async () => {
  jobStages = ['queued', 'processing', 'done'];
  await mountAndSend();
  await screen.findByText('已处理本次请求。');
  await screen.findByText('方案已排队');
  expect(screen.queryByRole('link', { name: '查看复习方案' })).not.toBeInTheDocument();
  await screen.findByText('正在生成复习方案', {}, { timeout: 3000 });
  const link = await screen.findByRole('link', { name: '查看复习方案' }, { timeout: 3000 });
  expect(link).toHaveAttribute('href', '/plan/plan%2F%3F?profileId=selected%2F%3F&version=3');
  expect(screen.getAllByText('孩子 · 物理复习方案')).toHaveLength(1);
  expect(confirmation().turn_id).toBe('t1'); expect(textReply().blocks).toEqual([{ type: 'text', text: '已处理本次请求。' }]);
  expect(confirmationReads).toBe(2); expect(jobReads).toBe(3); expectOnlyTextTurnPost();
}, 10000);
it.each([['不生成', 'completed'], ['取消', 'completed'], ['取消本轮', 'canceled'], ['改成英语', 'completed']] as const)('server invalidates the original source after %s without frontend execution or job requests', async (input, status) => {
  outcome = 'invalidated'; turnStatus = status;
  await mountAndSend(input);
  await screen.findByText('此确认已失效');
  expect(confirmationReads).toBe(2); expect(jobReads).toBe(0);
  expect(screen.queryByRole('link', { name: '查看复习方案' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '确认生成复习方案' })).not.toBeInTheDocument();
  expectOnlyTextTurnPost();
});
it('a late completed natural confirmation turn cannot hydrate results into a new account', async () => {
  hold = 'turn'; await mountAndSend(); await waitFor(() => expect(held).toBeDefined());
  await act(async () => { stored.set('user_id', 'other'); window.dispatchEvent(new Event('auth:changed')); });
  await act(async () => { held!.resolve(response(held!.config, { conversation_id: 'conv', turn_id: 't2', status: 'completed', messages: [textReply()] })); });
  expect(confirmationReads).toBe(1); expect(jobReads).toBe(0);
  expect(screen.queryByText('已处理本次请求。')).not.toBeInTheDocument(); expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(sessionStorage.getItem('rizhi-assistant:other')).toBeNull(); expectOnlyTextTurnPost();
});
it.each(['confirmation', 'job'] as const)('late %s 401 after textual completion cannot logout a new account with the same token', async stage => {
  hold = stage; await mountAndSend(); await waitFor(() => expect(held).toBeDefined());
  await act(async () => { stored.set('user_id', 'other'); window.dispatchEvent(new Event('auth:changed')); });
  await act(async () => { held!.reject(new AxiosError('Unauthorized', AxiosError.ERR_BAD_REQUEST, held!.config, undefined, { ...response(held!.config, {}), status: 401 })); });
  expect(stored.get('user_id')).toBe('other'); expect(stored.get('access_token')).toBe('token');
  expect(screen.queryByRole('link')).not.toBeInTheDocument(); expect(screen.queryByText('孩子 · 物理复习方案')).not.toBeInTheDocument();
  expect(sessionStorage.getItem('rizhi-assistant:other')).toBeNull(); expectOnlyTextTurnPost();
});
