import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
const showToastMock = vi.fn();
vi.mock('@/contexts/ProfileContext', () => ({ useProfile: () => ({ activeProfileId: 'child-a', loading: false }) }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('@/services/api', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
  },
}));

vi.mock('@/hooks/useSubjectCapabilities', () => ({
  useSubjectCapabilities: () => ({
    isReadEnabled: () => true,
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock('@/components/ui/HomeButton', () => ({
  HomeButton: () => <button type="button">home</button>,
}));

describe('Analysis click-only knobs', () => {
  beforeEach(() => {
    const stored = new Map([['access_token', 'token-a'], ['user_id', 'account-a'], ['active_profile_id', 'child-a']]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null });
    window.sessionStorage.clear();
    getMock.mockReset();
    getMock.mockResolvedValue({ data: { eligible: true } });
    postMock.mockReset();
    showToastMock.mockReset();
  });
  afterEach(() => { vi.unstubAllGlobals(); window.sessionStorage.clear(); });

  it('makes the complete subject plate a clockwise four-step button', async () => {
    const { default: Analysis } = await import('@/pages/Analysis');
    const user = userEvent.setup();

    render(<Analysis />);

    let knob = screen.getByRole('button', { name: '学科：数学' });
    expect(within(knob).getByText('数学')).toBeInTheDocument();
    expect(within(knob).getByText('英语')).toBeInTheDocument();
    expect(within(knob).getByText('物理')).toBeInTheDocument();
    expect(within(knob).getByText('化学')).toBeInTheDocument();
    expect(screen.getByTestId('subject-knob-pointer')).toHaveClass('w-[48%]', 'h-[48%]');
    expect(within(knob).getByText('英语')).toHaveStyle({ left: '86%' });
    expect(screen.getByTestId('subject-knob-pointer')).toHaveStyle({ transform: 'rotate(0deg)' });

    for (const [label, angle, subject] of [
      ['英语', 90, 'english'],
      ['物理', 180, 'physics'],
      ['化学', 270, 'chemistry'],
      ['数学', 360, 'math'],
    ] as const) {
      await user.click(knob);
      knob = await screen.findByRole('button', { name: `学科：${label}` });
      await waitFor(() => {
        expect(screen.getByTestId('subject-knob-pointer')).toHaveStyle({
          transform: `rotate(${angle}deg)`,
        });
      });
      expect(getMock).toHaveBeenCalledWith('/reports/eligibility', expect.objectContaining({
        params: expect.objectContaining({ subject }),
      }));
    }
  });

  it('cycles the period clockwise and ignores drag gestures', async () => {
    const { default: Analysis } = await import('@/pages/Analysis');
    const user = userEvent.setup();

    render(<Analysis />);

    let knob = screen.getByRole('button', { name: '天数：3天' });
    fireEvent(knob, new MouseEvent('pointerdown', { bubbles: true, clientX: 64, clientY: 64 }));
    fireEvent(knob, new MouseEvent('pointermove', { bubbles: true, clientX: 64, clientY: 128 }));
    fireEvent(knob, new MouseEvent('pointerup', { bubbles: true, clientX: 64, clientY: 128 }));
    fireEvent.click(knob, { detail: 1 });
    expect(screen.getByRole('button', { name: '天数：3天' })).toBeInTheDocument();

    for (const [label, angle] of [
      ['7天', 120],
      ['30天', 240],
      ['3天', 360],
    ] as const) {
      await user.click(knob);
      knob = await screen.findByRole('button', { name: `天数：${label}` });
      await waitFor(() => {
        expect(screen.getByTestId('period-knob-pointer')).toHaveStyle({
          transform: `rotate(${angle}deg)`,
        });
      });
    }
  });
});
