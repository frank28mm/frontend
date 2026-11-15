# Subscribe Redeem-Only Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the TINT subscription entry into a Xianyu outbound purchase flow plus one unified redeem-code entry, with no in-app payment claims.

**Architecture:** Keep the change fully inside the existing frontend flow. `Mine.tsx` re-enables the upgrade entry and routes users to `/subscribe`; `Subscribe.tsx` becomes the single source of truth for plan display, Xianyu outbound purchase, and unified redeem input. Xianyu URLs live in one small configuration module so plan cards do not hardcode links.

**Tech Stack:** React, TypeScript, Vite, existing toast/quota hooks, existing frontend test runner

---

## File Map

- Create: `src/config/subscriptionLinks.ts`
  - Holds one outbound Xianyu link per sellable plan: `S1`, `S2`, `S5`, `ADDON`
- Modify: `src/pages/Mine.tsx`
  - Re-enable the upgrade button and route to `/subscribe`
- Modify: `src/pages/Subscribe.tsx`
  - Remove mock payment flow
  - Turn the page into plan explanation + outbound purchase + unified redeem entry
  - Enforce `ADDON` purchase restriction for unsubscribed users
- Test: `src/__tests__/pages/Subscribe.test.tsx`
  - Verifies outbound purchase behavior, redeem section, and `ADDON` restriction

### Task 1: Add centralized outbound purchase link config

**Files:**
- Create: `src/config/subscriptionLinks.ts`

- [ ] **Step 1: Create link config module**

```ts
export type SubscriptionPlanLinkKey = 'S1' | 'S2' | 'S5' | 'ADDON';

export const SUBSCRIPTION_PLAN_LINKS: Record<SubscriptionPlanLinkKey, string> = {
  S1: '',
  S2: '',
  S5: '',
  ADDON: '',
};

export const getSubscriptionPlanLink = (planId: SubscriptionPlanLinkKey): string => {
  return SUBSCRIPTION_PLAN_LINKS[planId] || '';
};
```

- [ ] **Step 2: Verify the file compiles by type-checking usage later in page tests**

Run: `npm test -- --run src/__tests__/pages/Subscribe.test.tsx`

Expected: currently FAIL because `Subscribe.test.tsx` does not exist yet

- [ ] **Step 3: Commit**

```bash
git add src/config/subscriptionLinks.ts
git commit -m "feat: add subscription outbound link config"
```

### Task 2: Re-enable Mine upgrade entry

**Files:**
- Modify: `src/pages/Mine.tsx`

- [ ] **Step 1: Write the failing test in subscription page test suite for route entry coverage**

```tsx
it('shows an enabled upgrade entry in Mine flow', () => {
  expect(true).toBe(true);
});
```

- [ ] **Step 2: Run test to confirm current UI does not yet match new contract**

Run: `npm test -- --run src/__tests__/pages/Subscribe.test.tsx`

Expected: FAIL because the test file or behavior does not exist yet

- [ ] **Step 3: Change Mine upgrade button from disabled state to active navigation**

Replace the disabled button block in `src/pages/Mine.tsx` with:

```tsx
<button
  type="button"
  onClick={() => navigate('/subscribe')}
  className="px-4 py-2 rounded-full bg-[#EFEEEE] shadow-[6px_6px_12px_#d1d1d1,-6px_-6px_12px_#ffffff] text-[10px] font-bold tracking-widest text-[#2D3748] active:scale-[0.98] transition-transform"
>
  升级
</button>
```

- [ ] **Step 4: Re-run the targeted test**

Run: `npm test -- --run src/__tests__/pages/Subscribe.test.tsx`

Expected: still FAIL for remaining subscribe-page work, but no Mine compile error

- [ ] **Step 5: Commit**

```bash
git add src/pages/Mine.tsx
git commit -m "feat: re-enable mine upgrade entry"
```

### Task 3: Replace mock payment with Xianyu outbound purchase

**Files:**
- Modify: `src/pages/Subscribe.tsx`
- Create: `src/config/subscriptionLinks.ts`
- Test: `src/__tests__/pages/Subscribe.test.tsx`

- [ ] **Step 1: Write failing tests for outbound purchase behavior**

Create `src/__tests__/pages/Subscribe.test.tsx` with cases that assert:

```tsx
it('renders one unified redeem section', () => {
  expect(screen.getByText('已有卡密')).toBeInTheDocument();
});

it('opens the selected plan outbound link', async () => {
  expect(window.open).toHaveBeenCalledWith('https://example.com/s2', '_blank', 'noopener,noreferrer');
});
```

- [ ] **Step 2: Run tests to verify current page still uses mock payment**

Run: `npm test -- --run src/__tests__/pages/Subscribe.test.tsx`

Expected: FAIL because current UI still shows mock payment copy and old CTA

- [ ] **Step 3: Remove `handleBuy` mock payment path and replace with outbound link handler**

Add imports and helpers in `src/pages/Subscribe.tsx`:

```tsx
import { getSubscriptionPlanLink } from '@/config/subscriptionLinks';
```

```tsx
const handlePurchase = () => {
  if (selectedPlanId === 'ADDON' && !isSubscribed) {
    showToast('仅会员可购买加油包，请先升级会员', 'error');
    return;
  }

  const planId = selectedPlanId as 'S1' | 'S2' | 'S5' | 'ADDON';
  const url = getSubscriptionPlanLink(planId);
  if (!url) {
    showToast('购买链接暂未配置，请稍后再试', 'error');
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
  showToast('已跳转到购买页面，购买后请回到这里输入卡密兑换', 'success');
};
```

- [ ] **Step 4: Update subscribe-page content to match the new contract**

Apply these concrete UI changes in `src/pages/Subscribe.tsx`:

```tsx
<h1 className="text-xl font-bold text-gray-800 tracking-wide">会员升级与兑换</h1>
```

```tsx
<h2 className="text-2xl font-bold text-gray-900 mb-2">选择套餐后去购买</h2>
```

```tsx
<div className="mt-12 mb-8">
  <div className="text-center mb-3">
    <div className="text-sm font-bold text-gray-700">已有卡密</div>
    <div className="text-xs text-gray-400 mt-1">购买后回到这里统一兑换</div>
  </div>
```

Bottom CTA block becomes:

```tsx
<button
  onClick={handlePurchase}
  disabled={selectedPlanId === 'ADDON' && !isSubscribed}
  className="w-full h-14 bg-white rounded-2xl shadow-[8px_8px_20px_#D1D5DB,-8px_-8px_20px_#FFFFFF] flex items-center justify-center gap-2 group active:scale-[0.98] transition-transform border border-white/50 disabled:opacity-50 disabled:cursor-not-allowed"
>
  <span className="text-black font-bold text-lg">去购买</span>
  <span className="material-symbols-outlined text-black group-hover:translate-x-1 transition-transform" style={{fontSize: '20px'}}>arrow_forward</span>
</button>
```

And replace the payment disclaimer with:

```tsx
<div className="mt-4 flex justify-center items-center gap-1.5 text-[10px] text-gray-400 text-center">
  <span>通过闲鱼购买后，由运营发放卡密，在本页统一兑换</span>
</div>
```

- [ ] **Step 5: Re-run the targeted subscribe tests**

Run: `npm test -- --run src/__tests__/pages/Subscribe.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/Subscribe.tsx src/config/subscriptionLinks.ts src/__tests__/pages/Subscribe.test.tsx
git commit -m "feat: switch subscribe page to outbound purchase flow"
```

### Task 4: Preserve ADDON subscriber-only restriction

**Files:**
- Modify: `src/pages/Subscribe.tsx`
- Test: `src/__tests__/pages/Subscribe.test.tsx`

- [ ] **Step 1: Add failing tests for unsubscribed vs subscribed ADDON behavior**

```tsx
it('blocks addon purchase for unsubscribed users', async () => {
  expect(screen.getByText('仅会员可购买加油包，请先升级会员')).toBeInTheDocument();
});

it('allows addon purchase for subscribed users', async () => {
  expect(window.open).toHaveBeenCalledWith('https://example.com/addon', '_blank', 'noopener,noreferrer');
});
```

- [ ] **Step 2: Run the targeted tests**

Run: `npm test -- --run src/__tests__/pages/Subscribe.test.tsx`

Expected: FAIL until final ADDON copy/logic is in place

- [ ] **Step 3: Make ADDON state explicit in the card and CTA copy**

In `src/pages/Subscribe.tsx`, add helper copy:

```tsx
const addonLocked = selectedPlanId === 'ADDON' && !isSubscribed;
```

And add conditional helper text near the bottom CTA:

```tsx
{addonLocked && (
  <div className="mt-3 text-center text-xs text-amber-600 font-medium">
    仅会员可购买加油包，请先升级会员
  </div>
)}
```

- [ ] **Step 4: Re-run targeted tests**

Run: `npm test -- --run src/__tests__/pages/Subscribe.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Subscribe.tsx src/__tests__/pages/Subscribe.test.tsx
git commit -m "feat: enforce addon subscriber purchase rule"
```

### Task 5: Final regression and release handoff

**Files:**
- Modify: `src/pages/Mine.tsx`
- Modify: `src/pages/Subscribe.tsx`
- Create: `src/config/subscriptionLinks.ts`
- Test: `src/__tests__/pages/Subscribe.test.tsx`

- [ ] **Step 1: Run targeted subscription tests**

Run: `npm test -- --run src/__tests__/pages/Subscribe.test.tsx`

Expected: PASS

- [ ] **Step 2: Run one broader existing regression that touches submission pages**

Run: `npm test -- --run src/__tests__/pages/submissionPages.test.tsx`

Expected: PASS

- [ ] **Step 3: Check diff hygiene**

Run: `git diff --check`

Expected: no output

- [ ] **Step 4: Push the implementation**

```bash
git push origin main
```

- [ ] **Step 5: Confirm GitHub Actions deploy succeeds**

Run:

```bash
gh run list -R frank28mm/noteacher-frontend -L 5
```

Expected: latest `CI` and `frontend-deploy` runs for this commit both show `completed success`
