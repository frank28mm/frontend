import { apiClient } from './api';

export interface Order {
  order_id: string;
  order_no: string;
  amount: number;
  pay_url: string;
}

export const createOrder = async (
  planTier: string, 
  billingCycle: 'monthly' | 'yearly', 
  multiplier: number
): Promise<Order> => {
  const res = await apiClient.post<Order>('/subscriptions/orders', {
    plan_tier: planTier,
    billing_cycle: billingCycle,
    multiplier,
  });
  return res.data;
};

export const mockPayOrder = async (orderId: string): Promise<void> => {
  await apiClient.post(`/subscriptions/orders/${orderId}/mock_pay`);
};

export interface RedeemResponse {
  ok: boolean;
  granted_bt: number;
  granted_coupons: number;
}

export const redeemCode = async (code: string): Promise<RedeemResponse> => {
  const res = await apiClient.post<RedeemResponse>('/subscriptions/redeem', { code });
  return res.data;
};
