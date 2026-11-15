import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AssistantHost } from '@/components/assistant/AssistantHost';
import type { ReportConfirmation } from '@/services/assistant';
const service = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), getConfirmation: vi.fn(), executeConfirmation: vi.fn() }));
vi.mock('@/services/assistant', async original => ({ ...await original<object>(), assistantService: service }));
const value = (): ReportConfirmation => ({ confirmation_id: 'c1', conversation_id: 'conv', turn_id: 't1', status: 'pending', expires_at: '2026-10-11T12:00:00Z', preview: { scope: { profile_id: 'selected/?', subject: 'physics', from_date: '2026-10-01', through_date: '2026-10-11' }, child_name: '孩子', time_zone: 'Asia/Shanghai', goal: '观察', content_version: 'parent_report.v1', cost: { report_coupons: 1, bt: 0 }, eligibility: { eligible: false, submission_count: 0, distinct_days: 0, required_count: 3, required_days: 3 }, quota_available: false, scope_revision: 't1' } });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('VITE_ASSISTANT_ENABLED', 'true');
  const stored = new Map([['access_token', 'token'], ['user_id', 'owner'], ['active_profile_id', 'unrelated']]); vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null });
  sessionStorage.clear(); sessionStorage.setItem('rizhi-assistant:owner', JSON.stringify({ conversationId: 'conv' }));
  service.list.mockResolvedValue({ items: [] }); service.getConfirmation.mockResolvedValue(value());
  service.detail.mockResolvedValue({ conversation: { conversation_id: 'conv', archived: false }, messages: [{ message_id: 'canonical', turn_id: 't1', sequence: 1, role: 'assistant', blocks: [{ type: 'action_confirmation', action_confirmation: value() }] }], next_before_sequence: 0 });
});
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function mount() { render(<MemoryRouter><AssistantHost /></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: '知之' })); }
it('canonical history GET enables explicit execution, blocks composer and preserves selected-child job link', async () => {
  mount(); await waitFor(() => expect(screen.getByRole('button', { name: '确认生成报告' })).toBeEnabled()); expect(service.executeConfirmation).not.toHaveBeenCalled();
  let resolve!: (c: ReportConfirmation) => void; service.executeConfirmation.mockImplementation(() => new Promise(r => { resolve = r; }));
  fireEvent.click(screen.getByRole('button', { name: '确认生成报告' }));
  expect(screen.getByRole('textbox', { name: '给知之的消息' })).toBeDisabled(); expect(screen.getByRole('button', { name: '新对话' })).toBeDisabled();
  await act(async () => { resolve({ ...value(), status: 'executed', job_id: 'job/?' }); });
  expect(screen.getByRole('link')).toHaveAttribute('href', '/report-generating/job%2F%3F?profileId=selected%2F%3F');
});
it('unknown POST does one GET and shows only deliberate same-confirmation retry', async () => {
  service.executeConfirmation.mockRejectedValue(new Error('lost')); mount(); await screen.findByRole('button', { name: '确认生成报告' }); fireEvent.click(screen.getByRole('button', { name: '确认生成报告' }));
  await screen.findByRole('button', { name: '重试同一确认' }); expect(service.executeConfirmation).toHaveBeenCalledTimes(1); expect(service.getConfirmation).toHaveBeenCalledTimes(2); expect(screen.getByRole('textbox')).toBeDisabled();
});
it.each(['user', 'wrong-turn', 'wrong-conversation', 'malformed', 'unknown'])('fails closed for %s canonical block', kind => {
  const c = value(); if (kind === 'wrong-conversation') c.conversation_id = 'other';
  service.detail.mockResolvedValue({ conversation: { conversation_id: 'conv', archived: false }, messages: [{ message_id: 'canonical', turn_id: kind === 'wrong-turn' ? 'other' : 't1', sequence: 1, role: kind === 'user' ? 'user' : 'assistant', blocks: [{ type: kind === 'unknown' ? 'future_action' : 'action_confirmation', action_confirmation: kind === 'malformed' ? {} : c }] }], next_before_sequence: 0 });
  mount(); return waitFor(() => { expect(screen.getByText('当前版本无法显示此消息。')).toBeInTheDocument(); expect(service.getConfirmation).not.toHaveBeenCalled(); expect(service.executeConfirmation).not.toHaveBeenCalled(); });
});
