export type SubscriptionPlanLinkKey = 'S1' | 'S2' | 'S5' | 'ADDON';

const normalizeLink = (value: string | undefined): string => value?.trim() || '';

export const SUBSCRIPTION_PLAN_LINKS: Record<SubscriptionPlanLinkKey, string> = {
  S1: normalizeLink(import.meta.env.VITE_SUBSCRIBE_LINK_S1),
  S2: normalizeLink(import.meta.env.VITE_SUBSCRIBE_LINK_S2),
  S5: normalizeLink(import.meta.env.VITE_SUBSCRIBE_LINK_S5),
  ADDON: normalizeLink(import.meta.env.VITE_SUBSCRIBE_LINK_ADDON),
};

export const getSubscriptionPlanLink = (planId: SubscriptionPlanLinkKey): string => {
  return SUBSCRIPTION_PLAN_LINKS[planId] || '';
};
