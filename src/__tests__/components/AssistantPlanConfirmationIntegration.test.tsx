import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AssistantHost } from '@/components/assistant/AssistantHost';
import { apiClient } from '@/services/api';
import type { PlanConfirmation } from '@/services/assistantPlanConfirmation';
const originalAdapter = apiClient.defaults.adapter;
const value = (): PlanConfirmation => ({ confirmation_id: 'pc1', conversation_id: 'conv', turn_id: 't1', status: 'pending', expires_at: '2099-10-11T12:00:00Z', preview: { scope: { profile_id: 'selected/?', subject: 'physics', from_date: '2026-10-01', through_date: '2026-10-11' }, child_name: '孩子', time_zone: 'Asia/Shanghai', goal: '复习', content_version: 'revision_plan.v1', generation_available: true } });
let executed: boolean;
let newerTurn: boolean;
let posts: string[];
let source: { plan_id: string; version: number } | undefined;
let target: { target_plan_id: string; base_version: number } | undefined;
const currentValue = () => ({ ...value(), preview: { ...value().preview, ...target } });
beforeEach(() => {
  vi.stubEnv('VITE_ASSISTANT_ENABLED', 'true'); executed = false; newerTurn = false; posts = []; source = undefined; target = undefined;
  const stored = new Map([['access_token', 'token'], ['user_id', 'owner'], ['active_profile_id', 'unrelated']]); vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null });
  sessionStorage.clear(); sessionStorage.setItem('rizhi-assistant:owner', JSON.stringify({ conversationId: 'conv' }));
  apiClient.defaults.adapter = async config => {
    const url = config.url;
    let payload: object;
    if (url === '/assistant/conversations') payload = { items: [] };
    else if (url === '/assistant/conversations/conv') payload = { conversation: { conversation_id: 'conv', archived: false, plan_context: source, latest_turn: { turn_id: newerTurn ? 't2' : 't1', status: 'completed' } }, messages: [{ message_id: 'canonical', turn_id: 't1', sequence: 1, role: 'assistant', blocks: [{ type: 'plan_confirmation', plan_confirmation: currentValue() }] }, ...(newerTurn ? [{ message_id: 'new', turn_id: 't2', sequence: 2, role: 'user', blocks: [{ type: 'text', text: '改成英语' }] }] : [])], next_before_sequence: 0 };
    else if (url?.startsWith('/assistant/plan-confirmations/')) {
      expect(config.headers.has('X-Profile-Id')).toBe(false); expect(config.headers.has('X-User-Id')).toBe(false); expect(config.params).toBeUndefined();
      if (config.method === 'post') { posts.push(config.data); executed = true; }
      payload = { confirmation: { ...currentValue(), ...(executed ? { status: 'executed', job_id: 'job', plan_id: 'plan' } : {}) } };
    } else if (url === '/plan-jobs/job') {
      expect(config.params).toEqual({ profile_id: 'selected/?' }); expect(config.headers.has('X-Profile-Id')).toBe(false);
      return { config, status: 200, statusText: '', headers: {}, data: { contract_version: 'revision_plan.v1', job: { job_id: 'job', plan_id: 'plan', status: 'done', version: 3 } } };
    } else throw new Error(`Unexpected ${url}`);
    return { config, status: 200, statusText: '', headers: {}, data: { contract_version: 'rizhi.assistant.v1', ...payload } };
  };
});
afterEach(() => { cleanup(); apiClient.defaults.adapter = originalAdapter; sessionStorage.clear(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function mount() { render(<MemoryRouter><AssistantHost /></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: '知之' })); }
it('bound original-family update is enabled and actual job version never replaces the old source pointer', async () => {
  source = { plan_id: 'plan', version: 1 }; target = { target_plan_id: 'plan', base_version: 1 };
  mount(); const button = await screen.findByRole('button', { name: '确认更新复习方案' });
  await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
  const result = await screen.findByRole('link', { name: '查看复习方案' });
  expect(result).toHaveAttribute('href', '/plan/plan?profileId=selected%2F%3F&version=3');
  expect(screen.getByRole('link', { name: '复习方案 · 版本 1' })).toHaveAttribute('href', '/plan/plan?version=1');
  expect(posts).toEqual([JSON.stringify({ contract_version: 'rizhi.assistant.v1' })]);
});
it('real hook/service/interceptors render only explicit execution and a matched job version link', async () => {
  mount(); const button = await screen.findByRole('button', { name: '确认生成复习方案' }); expect(posts).toEqual([]); expect(screen.queryByRole('link')).not.toBeInTheDocument();
  fireEvent.click(button); await screen.findByRole('link', { name: '查看复习方案' });
  expect(posts).toEqual([JSON.stringify({ contract_version: 'rizhi.assistant.v1' })]);
  expect(screen.getByRole('link')).toHaveAttribute('href', '/plan/plan?profileId=selected%2F%3F&version=3');
});
it('older source plan action is visibly disabled after a newer canonical user turn', async () => {
  newerTurn = true; mount(); await waitFor(() => expect(screen.getByRole('button', { name: '确认生成复习方案' })).toBeDisabled()); expect(posts).toEqual([]);
});
