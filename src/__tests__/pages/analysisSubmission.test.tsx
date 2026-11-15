import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Analysis from '@/pages/Analysis';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), navigate: vi.fn(), profile: { activeProfileId: 'child-a', loading: false } }));
vi.mock('@/services/api', () => ({ apiClient: { get: mocks.get, post: mocks.post } }));
vi.mock('react-router-dom', async () => ({ ...await vi.importActual('react-router-dom'), useNavigate: () => mocks.navigate }));
vi.mock('@/contexts/ProfileContext', () => ({ useProfile: () => mocks.profile }));
vi.mock('@/hooks/useSubjectCapabilities', () => ({ useSubjectCapabilities: () => ({ isReadEnabled: () => true }) }));
vi.mock('@/components/ui/HomeButton', () => ({ HomeButton: () => null }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const storage = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key), clear: () => data.clear() };
};

describe('report submission reliability', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('localStorage', storage());
    localStorage.setItem('access_token', 'token-a');
    localStorage.setItem('user_id', 'account-a');
    localStorage.setItem('active_profile_id', 'child-a');
    window.sessionStorage.clear();
    mocks.profile = { activeProfileId: 'child-a', loading: false };
    mocks.get.mockResolvedValue({ data: { eligible: true } });
    mocks.post.mockResolvedValue({ data: { job_id: 'job-a' } });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.sessionStorage.clear(); });
  const ready = async () => { await waitFor(() => expect(screen.getByRole('button', { name: '生成报告' })).toBeEnabled()); };

  it('checks eligibility for selected window and fences stale selection before generation', async () => {
    const next = deferred<{ data: { eligible: boolean } }>();
    mocks.get.mockResolvedValueOnce({ data: { eligible: true } }).mockReturnValueOnce(next.promise);
    render(<Analysis />);
    await ready();
    expect(mocks.get.mock.calls[0][1].params).toMatchObject({ subject: 'math', window_days: 3, content_version: 'parent_report.v1' });
    fireEvent.click(screen.getByRole('button', { name: '天数：3天' }));
    expect(screen.getByRole('button', { name: '生成报告' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '生成报告' }));
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.get.mock.calls[1][1].params.window_days).toBe(7);
    await act(async () => { next.resolve({ data: { eligible: true } }); });
    await ready();
  });

  it('locks synchronous double clicks and submits an explicit child with request identity', async () => {
    const work = deferred<{ data: { job_id: string } }>();
    mocks.post.mockReturnValue(work.promise);
    render(<Analysis />);
    await ready();
    const button = screen.getByRole('button', { name: '生成报告' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post.mock.calls[0][1]).toEqual({ subject: 'math', window_days: 3, content_version: 'parent_report.v1', client_request_id: expect.any(String), from_date: expect.any(String), through_date: expect.any(String) });
    expect(mocks.post.mock.calls[0][2].headers['X-Profile-Id']).toBe('child-a');
    await act(async () => { work.resolve({ data: { job_id: 'job-a' } }); });
    expect(mocks.navigate).toHaveBeenCalledWith('/report-generating/job-a');
  });

  it('restores uncertain submission after refresh and replays the frozen body despite new knobs', async () => {
    mocks.post.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ data: { job_id: 'job-a' } });
    const first = render(<Analysis />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '生成报告' }));
    await screen.findByRole('button', { name: '重试已有请求' });
    const input = mocks.post.mock.calls[0][1];
    first.unmount();
    mocks.get.mockResolvedValue({ data: { eligible: false } });
    render(<Analysis />);
    const retry = await screen.findByRole('button', { name: '重试已有请求' });
    expect(mocks.post).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '天数：3天' }));
    fireEvent.click(screen.getByRole('button', { name: '学科：数学' }));
    await waitFor(() => expect(retry).toBeEnabled());
    expect(screen.queryByText('数据不足，暂不可生成')).not.toBeInTheDocument();
    expect(screen.getByText(`${input.from_date} 至 ${input.through_date}`)).toBeInTheDocument();
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/report-generating/job-a'));
    expect(mocks.post.mock.calls[1][1]).toEqual(input);
    expect(mocks.post.mock.calls[1][2].headers['X-Profile-Id']).toBe('child-a');
  });

  it('replays an existing legacy request without silently switching its content version', async () => {
    const input = { subject: 'english', window_days: 7, client_request_id: 'legacy-request', from_date: '2026-10-05', through_date: '2026-10-11' };
    window.sessionStorage.setItem('tint-report-request:["account-a","child-a"]', JSON.stringify({ accountId: 'account-a', profileId: 'child-a', input }));
    render(<Analysis />);
    const retry = await screen.findByRole('button', { name: '重试已有请求' });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post.mock.calls[0][1]).toEqual(input);
    expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('content_version');
  });

  it.each(['', 'parent_report.v2', null])('rejects a saved unsupported content version %s without dispatch', async contentVersion => {
    const input = { subject: 'math', window_days: 3, client_request_id: 'invalid-version', from_date: '2026-10-09', through_date: '2026-10-11', content_version: contentVersion };
    window.sessionStorage.setItem('tint-report-request:["account-a","child-a"]', JSON.stringify({ accountId: 'account-a', profileId: 'child-a', input }));
    render(<Analysis />);
    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取已有请求');
    expect(screen.getByRole('button', { name: '生成报告' })).toBeDisabled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('freezes Shanghai inclusive dates checked before midnight and replays after midnight and refresh', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-11T15:59:59Z'));
    mocks.post.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ data: { job_id: 'job-a' } });
    const view = render(<Analysis />);
    await ready();
    expect(mocks.get.mock.calls[0][1].params).toMatchObject({ window_days: 3, from_date: '2026-10-09', through_date: '2026-10-11' });
    vi.setSystemTime(new Date('2026-10-11T16:00:01Z'));
    fireEvent.click(screen.getByRole('button', { name: '生成报告' }));
    await screen.findByRole('button', { name: '重试已有请求' });
    const input = mocks.post.mock.calls[0][1];
    expect(input).toMatchObject({ window_days: 3, from_date: '2026-10-09', through_date: '2026-10-11' });
    view.unmount();
    render(<Analysis />);
    const retry = await screen.findByRole('button', { name: '重试已有请求' });
    expect(mocks.post).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    expect(mocks.post.mock.calls[1][1]).toEqual(input);
  });

  it.each(['account', 'logout', 'profile', 'unmount'])('ignores late POST navigation and global storage after %s', async boundary => {
    const work = deferred<{ data: { job_id: string } }>();
    mocks.post.mockReturnValue(work.promise);
    const view = render(<Analysis />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '生成报告' }));
    act(() => {
      if (boundary === 'unmount') view.unmount();
      else if (boundary === 'profile') {
        localStorage.setItem('active_profile_id', 'child-b');
        mocks.profile = { activeProfileId: 'child-b', loading: false };
        view.rerender(<Analysis />);
      } else {
        localStorage.setItem('access_token', boundary === 'logout' ? '' : 'token-b');
        localStorage.setItem('user_id', boundary === 'logout' ? '' : 'account-b');
        window.dispatchEvent(new Event('auth:changed'));
      }
    });
    await act(async () => { work.resolve({ data: { job_id: 'private-job-a' } }); });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('active_report_job_id')).toBeNull();
  });

  it('refetches eligibility on profile and auth changes without restoring another owner request', async () => {
    mocks.post.mockRejectedValue(new Error('network'));
    const view = render(<Analysis />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '生成报告' }));
    await screen.findByRole('button', { name: '重试已有请求' });
    act(() => {
      localStorage.setItem('active_profile_id', 'child-b');
      mocks.profile = { activeProfileId: 'child-b', loading: false };
      view.rerender(<Analysis />);
    });
    await ready();
    expect(mocks.get.mock.calls.at(-1)?.[1].headers['X-Profile-Id']).toBe('child-b');
    expect(screen.queryByRole('button', { name: '重试已有请求' })).not.toBeInTheDocument();
    const count = mocks.get.mock.calls.length;
    act(() => {
      localStorage.setItem('access_token', 'token-b');
      localStorage.setItem('user_id', 'account-b');
      window.dispatchEvent(new Event('auth:changed'));
    });
    await waitFor(() => expect(mocks.get.mock.calls.length).toBeGreaterThan(count));
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it('keeps request conflict blocked across refresh instead of creating a fresh identity', async () => {
    mocks.post.mockRejectedValue({ response: { status: 409, data: { detail: 'report_request_conflict' } } });
    const view = render(<Analysis />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '生成报告' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('冲突'));
    expect(screen.getByRole('button', { name: '重试已有请求' })).toBeDisabled();
    view.unmount();
    render(<Analysis />);
    expect(await screen.findByRole('button', { name: '重试已有请求' })).toBeDisabled();
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it('fails closed without dispatch or misleading recovery when persistence fails', async () => {
    vi.stubGlobal('sessionStorage', storage());
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => { throw new Error('storage disabled'); });
    render(<Analysis />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '生成报告' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('无法保存请求'));
    expect(mocks.post).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '重试已有请求' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成报告' })).toBeDisabled();
  });
});
