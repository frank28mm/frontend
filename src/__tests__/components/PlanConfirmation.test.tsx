import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PlanConfirmation } from '@/components/assistant/PlanConfirmation';
import type { PlanConfirmation as Proposal } from '@/services/assistantPlanConfirmation';
const service = vi.hoisted(() => ({ job: vi.fn() }));
vi.mock('@/services/assistantPlanConfirmation', async original => ({ ...await original<object>(), planConfirmationService: service }));
const proposal = (): Proposal => ({ confirmation_id: 'pc', conversation_id: 'conv', turn_id: 'turn', status: 'pending', expires_at: '2099-10-11T12:00:00Z', preview: { scope: { profile_id: 'child/?', subject: 'math', from_date: '2026-10-01', through_date: '2026-10-11' }, child_name: '孩子', time_zone: 'Asia/Shanghai', goal: '复习', content_version: 'revision_plan.v1', generation_available: true } });
const props = (p = proposal()) => ({ proposal: p, overlay: { confirmation: p, phase: 'ready' as const, error: '' }, disabled: false, onExecute: vi.fn(), onRefresh: vi.fn(), onNavigate: vi.fn(), canNavigate: () => true });
beforeEach(() => { vi.resetAllMocks(); const stored = new Map([['user_id', 'owner'], ['access_token', 'token']]); vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v) }); service.job.mockResolvedValue({ job_id: 'job', plan_id: 'plan/?', status: 'done', version: 2 }); });
afterEach(() => vi.unstubAllGlobals());
it('shows update source and fresh-data semantics with the current scope and goal', () => {
  const p = proposal(); const options = props({ ...p, preview: { ...p.preview, target_plan_id: 'plan', base_version: 1 } });
  render(<MemoryRouter><PlanConfirmation {...options} /></MemoryRouter>);
  expect(screen.getByText('来源版本 1 · 更新原方案')).toBeInTheDocument();
  expect(screen.getByText('确认后将采集最新数据，生成原方案的新版本。')).toBeInTheDocument();
  expect(screen.getByText('孩子 · 数学复习方案')).toBeInTheDocument();
  expect(screen.getByText('复习')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '确认更新复习方案' })); expect(options.onExecute).toHaveBeenCalledWith('pc');
});
it('executes only a click and makes no price/free claim', () => {
  const p = props(); render(<MemoryRouter><PlanConfirmation {...p} /></MemoryRouter>);
  expect(p.onExecute).not.toHaveBeenCalled(); expect(service.job).not.toHaveBeenCalled();
  expect(screen.queryByText(/券|免费|BT/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '确认生成复习方案' })); expect(p.onExecute).toHaveBeenCalledWith('pc');
});
it('disabled generation keeps confirmation disabled and permits GET refresh', () => {
  const p = proposal(); p.preview.generation_available = false; const options = props(p);
  render(<MemoryRouter><PlanConfirmation {...options} /></MemoryRouter>);
  expect(screen.getByRole('button', { name: '确认生成复习方案' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '刷新确认状态' })); expect(options.onRefresh).toHaveBeenCalledWith('pc');
});
it('links only a completed matched version using proposal child not global child', async () => {
  const p = { ...proposal(), status: 'executed' as const, job_id: 'job', plan_id: 'plan/?' };
  render(<MemoryRouter><PlanConfirmation {...props(p)} /></MemoryRouter>);
  const link = await screen.findByRole('link', { name: '查看复习方案' });
  expect(link).toHaveAttribute('href', '/plan/plan%2F%3F?profileId=child%2F%3F&version=2');
  expect(service.job.mock.calls[0][0].preview.scope.profile_id).toBe('child/?');
});
it.each(['queued', 'processing', 'failed'])('does not link %s jobs', async status => {
  service.job.mockResolvedValue({ job_id: 'job', plan_id: 'plan/?', status });
  render(<MemoryRouter><PlanConfirmation {...props({ ...proposal(), status: 'executed', job_id: 'job', plan_id: 'plan/?' })} /></MemoryRouter>);
  await waitFor(() => expect(service.job).toHaveBeenCalled()); expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
it('stale account result and navigation are fenced', async () => {
  let resolve!: (v: unknown) => void; service.job.mockImplementation(() => new Promise(r => { resolve = r; }));
  render(<MemoryRouter><PlanConfirmation {...props({ ...proposal(), status: 'executed', job_id: 'job', plan_id: 'plan/?' })} /></MemoryRouter>);
  await waitFor(() => expect(resolve).toBeDefined()); localStorage.setItem('user_id', 'other');
  await act(async () => { resolve({ job_id: 'job', plan_id: 'plan/?', status: 'done', version: 2 }); }); expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
it.each([{ job_id: 'foreign', plan_id: 'plan/?', status: 'done', version: 2 }, { job_id: 'job', plan_id: 'foreign', status: 'done', version: 2 }, { job_id: 'job', plan_id: 'plan/?', status: 'done', version: 0 }])('fails closed even on a malformed job service result', async job => {
  service.job.mockResolvedValue(job); render(<MemoryRouter><PlanConfirmation {...props({ ...proposal(), status: 'executed', job_id: 'job', plan_id: 'plan/?' })} /></MemoryRouter>);
  await waitFor(() => expect(service.job).toHaveBeenCalled()); expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
it('executed history cannot show results while confirmation GET is unverified or refused', async () => {
  const p = { ...proposal(), status: 'executed' as const, job_id: 'job', plan_id: 'plan/?' };
  const options = props(p);
  const view = render(<MemoryRouter><PlanConfirmation {...options} overlay={{ confirmation: p, phase: 'checking', error: '' }} /></MemoryRouter>);
  await act(async () => {}); expect(service.job).not.toHaveBeenCalled();
  view.rerender(<MemoryRouter><PlanConfirmation {...options} overlay={{ confirmation: p, phase: 'invalid', error: '此确认已删除或无法访问。' }} /></MemoryRouter>);
  await act(async () => {}); expect(service.job).not.toHaveBeenCalled(); expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
