import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ActionConfirmation } from '@/components/assistant/ActionConfirmation';
import { canonicalConfirmation, type ReportConfirmation } from '@/services/assistant';
const proposal: ReportConfirmation = { confirmation_id: 'c', conversation_id: 'conv', turn_id: 't', status: 'pending', expires_at: '2026-10-11T12:00:00Z', preview: { scope: { profile_id: '孩子/?', subject: 'english', from_date: '2026-10-01', through_date: '2026-10-11' }, child_name: '孩子', time_zone: 'Asia/Shanghai', goal: '观察写作', content_version: 'parent_report.v1', cost: { report_coupons: 1, bt: 0 }, eligibility: { eligible: false, submission_count: 0, required_count: 3, distinct_days: 0, required_days: 3 }, quota_available: false, scope_revision: 't' } };
afterEach(cleanup);
function mount(value = proposal, phase: 'ready' | 'retryable' | 'uncertain' | 'invalid' = 'ready', live = true) {
  const execute = vi.fn(), refresh = vi.fn();
  render(<MemoryRouter><ActionConfirmation proposal={value} overlay={{ confirmation: value, phase, error: '' }} disabled={false} onExecute={execute} onRefresh={refresh} onNavigate={vi.fn()} canNavigate={() => live} /></MemoryRouter>);
  return { execute, refresh };
}
it.each([375, 1280])('compact confirmation DOM at %s preserves frozen dates/cost and explicit execute', width => {
  vi.stubGlobal('innerWidth', width); const { execute } = mount();
  expect(screen.getByText(/2026-10-01/)).toHaveTextContent('2026-10-11'); expect(screen.getByText(/1 张报告券/)).toBeInTheDocument();
  expect(screen.getByText(/提议时/)).toBeInTheDocument(); const button = screen.getByRole('button', { name: '确认生成报告' }); expect(button).toBeEnabled(); fireEvent.click(button); expect(execute).toHaveBeenCalledWith('c'); vi.unstubAllGlobals();
});
it('uncertain result exposes GET refresh, not execution', () => {
  const { refresh } = mount(proposal, 'uncertain'); expect(screen.queryByRole('button', { name: '确认生成报告' })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: '刷新确认状态' })); expect(refresh).toHaveBeenCalledWith('c');
});
it('pending uncertainty explicitly retries the existing confirmation', () => {
  const { execute } = mount(proposal, 'retryable'); fireEvent.click(screen.getByRole('button', { name: '重试同一确认' })); expect(execute).toHaveBeenCalledWith('c');
});
it.each([false, true])('executed href encodes job/report and selected child (report=%s)', report => {
  mount({ ...proposal, status: 'executed', job_id: 'job/?', ...(report ? { report_id: 'report/?' } : {}) }, 'invalid');
  expect(screen.getByRole('link')).toHaveAttribute('href', `/${report ? 'report/report' : 'report-generating/job'}%2F%3F?profileId=${encodeURIComponent('孩子/?')}`);
});
it('late account identity prevents link navigation', () => {
  mount({ ...proposal, status: 'executed', job_id: 'job' }, 'invalid', false);
  expect(fireEvent.click(screen.getByRole('link'))).toBe(false);
});
it.each(['user', 'assistant'])('validates canonical enclosing conversation and turn for %s', role => {
  const block = { type: 'action_confirmation' as const, action_confirmation: proposal };
  expect(canonicalConfirmation(block, 'conv', 't', role)).toEqual(role === 'assistant' ? proposal : undefined);
  expect(canonicalConfirmation(block, 'other', 't', role)).toBeUndefined(); expect(canonicalConfirmation(block, 'conv', 'other', role)).toBeUndefined();
});
