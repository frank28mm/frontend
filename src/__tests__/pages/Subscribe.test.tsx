import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
const showToastMock = vi.fn();
const redeemCodeMock = vi.fn();
let quotaMock: {
  cp_left: number;
  report_coupons_left: number;
  plan_tier?: string | null;
} | null = null;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/components/ui/BackButton', () => ({
  BackButton: (props: { onClick?: () => void }) => <button onClick={props.onClick}>back</button>,
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

vi.mock('@/hooks/useQuota', () => ({
  useQuota: () => ({
    quota: quotaMock,
    loading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/services/subscription', () => ({
  redeemCode: (...args: unknown[]) => redeemCodeMock(...args),
}));

vi.mock('@/config/subscriptionLinks', () => ({
  getSubscriptionPlanLink: (planId: string) =>
    ({
      S1: 'https://example.com/s1',
      S2: 'https://example.com/s2',
      S5: 'https://example.com/s5',
      ADDON: 'https://example.com/addon',
    })[planId] || '',
}));

describe('Subscribe', () => {
  const openSpy = vi.fn();

  beforeEach(() => {
    navigateMock.mockReset();
    showToastMock.mockReset();
    redeemCodeMock.mockReset();
    quotaMock = null;
    openSpy.mockReset();
    vi.stubGlobal('open', openSpy);
  });

  it('renders one unified redeem section', async () => {
    const { default: Subscribe } = await import('@/pages/Subscribe');

    render(<Subscribe />);

    expect(screen.getByText('已有卡密')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('XXXX-XXXX-XXXX')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '兑换' })).toBeInTheDocument();
  });

  it('opens the selected plan outbound link', async () => {
    const { default: Subscribe } = await import('@/pages/Subscribe');
    const user = userEvent.setup();

    render(<Subscribe />);

    await user.click(screen.getByRole('button', { name: '去购买' }));

    expect(openSpy).toHaveBeenCalledWith('https://example.com/s2', '_blank', 'noopener,noreferrer');
    expect(showToastMock).toHaveBeenCalledWith('已跳转到闲鱼，购买后请回到这里输入卡密兑换', 'success');
  });

  it('blocks addon purchase for unsubscribed users', async () => {
    const { default: Subscribe } = await import('@/pages/Subscribe');
    const user = userEvent.setup();

    render(<Subscribe />);

    await user.click(screen.getByRole('button', { name: /Add-on \/ 加油包/i }));
    expect(screen.getByText('仅会员可购买加油包，请先升级会员')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '去购买' }));
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('allows addon purchase for subscribed users', async () => {
    quotaMock = {
      cp_left: 1000,
      report_coupons_left: 4,
      plan_tier: 'S2',
    };
    const { default: Subscribe } = await import('@/pages/Subscribe');
    const user = userEvent.setup();

    render(<Subscribe />);

    await user.click(screen.getByRole('button', { name: /Add-on \/ 加油包/i }));
    await user.click(screen.getByRole('button', { name: '去购买' }));

    expect(openSpy).toHaveBeenCalledWith('https://example.com/addon', '_blank', 'noopener,noreferrer');
  });

  it('submits redeem codes through the unified entry', async () => {
    redeemCodeMock.mockResolvedValue({
      ok: true,
      granted_bt: 12400,
      granted_coupons: 1,
    });
    const { default: Subscribe } = await import('@/pages/Subscribe');
    const user = userEvent.setup();

    render(<Subscribe />);

    await user.type(screen.getByPlaceholderText('XXXX-XXXX-XXXX'), 'abcd-1234');
    await user.click(screen.getByRole('button', { name: '兑换' }));

    expect(redeemCodeMock).toHaveBeenCalledWith('ABCD-1234');
  });
});
