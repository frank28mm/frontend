import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '@/components/ui/BackButton';
import { useToast } from '@/components/ui/Toast';
import { getSubscriptionPlanLink, type SubscriptionPlanLinkKey } from '@/config/subscriptionLinks';
import { useQuota } from '@/hooks/useQuota';
import { redeemCode } from '@/services/subscription';

type PlanId = SubscriptionPlanLinkKey;

type Plan = {
  id: PlanId;
  name: string;
  nameEn: string;
  priceLabel: string;
  cp: number;
  coupons: number;
  retention: string;
  desc: string;
  tag: string;
  tagClass: string;
  requiresSubscription?: boolean;
};

const SUBSCRIBED_TIERS = ['S1', 'S2', 'S3', 'S4', 'S5'];

const PLANS: Plan[] = [
  {
    id: 'S1',
    name: '基础版',
    nameEn: 'Basic / 基础版',
    priceLabel: '¥19.9',
    cp: 1000,
    coupons: 4,
    retention: '3个月',
    desc: '满足日常作业批改需求，错题保存 3 个月。',
    tag: '超值入门',
    tagClass: 'bg-green-100 text-green-700 border border-green-200',
  },
  {
    id: 'S2',
    name: '高级版',
    nameEn: 'Premium / 高级版',
    priceLabel: '¥29.9',
    cp: 1000,
    coupons: 4,
    retention: '12个月',
    desc: '更长数据保留期，适合长期备考复习。',
    tag: '最受欢迎',
    tagClass: 'bg-blue-100 text-blue-700 border border-blue-200',
  },
  {
    id: 'S5',
    name: '至尊版',
    nameEn: 'Supreme / 至尊版',
    priceLabel: '¥199',
    cp: 10000,
    coupons: 20,
    retention: '永久',
    desc: '全能旗舰，海量算力与永久数据资产。',
    tag: '性能之选',
    tagClass: 'bg-gradient-to-r from-yellow-200 via-yellow-300 to-yellow-400 text-yellow-900 border border-yellow-400/50 shadow-sm',
  },
  {
    id: 'ADDON',
    name: '加油包',
    nameEn: 'Add-on / 加油包',
    priceLabel: '¥10',
    cp: 200,
    coupons: 1,
    retention: '不含保留',
    desc: '临时补充算力与报告券，即买即用。',
    tag: '灵活补充',
    tagClass: 'bg-purple-100 text-purple-700 border border-purple-200',
    requiresSubscription: true,
  },
];

interface PlanCardProps {
  plan: Plan;
  isSelected: boolean;
  locked?: boolean;
  onSelect: () => void;
}

const PlanCard: React.FC<PlanCardProps> = ({ plan, isSelected, locked, onSelect }) => {
  const activeClass = isSelected
    ? 'border-red-500 shadow-[6px_6px_12px_#D1D5DB,-6px_-6px_12px_#FFFFFF]'
    : 'border-transparent hover:border-gray-300/50 shadow-[6px_6px_12px_#D1D5DB,-6px_-6px_12px_#FFFFFF]';
  const lockedClass = locked ? 'opacity-75 border-dashed border-gray-300' : '';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative w-full text-left bg-[#EFEEEE] rounded-[1.25rem] p-6 flex flex-col gap-3 border-2 transition-all ${activeClass} ${lockedClass}`}
    >
      <div className="absolute -top-3 left-6">
        <span
          className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
            locked ? 'bg-gray-200 text-gray-500 border border-gray-300' : plan.tagClass
          }`}
        >
          {locked ? '仅会员可购买' : plan.tag}
        </span>
      </div>

      <div className="flex justify-between items-baseline mt-1 gap-3">
        <div className="flex flex-col">
          <h3 className="text-lg font-bold text-gray-900">{plan.nameEn}</h3>
          <p className="text-xs text-gray-500 mt-1">{plan.desc}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-gray-900">{plan.priceLabel}</div>
          <div className="text-[10px] text-gray-400 mt-1">{plan.name}</div>
        </div>
      </div>

      <div className="w-full h-px bg-gray-300/50 my-1" />

      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-gray-500 font-medium text-center">
        <div className="flex flex-col items-center justify-center bg-gray-100/50 rounded-lg py-2">
          <span className="text-gray-900 font-bold">{plan.cp}</span>
          <span className="text-[9px] text-gray-400">CP</span>
        </div>
        <div className="flex flex-col items-center justify-center bg-gray-100/50 rounded-lg py-2">
          <span className="text-gray-900 font-bold">{plan.coupons}</span>
          <span className="text-[9px] text-gray-400">报告券</span>
        </div>
        <div className="flex flex-col items-center justify-center bg-gray-100/50 rounded-lg py-2">
          <span className="text-gray-900 font-bold">{plan.retention}</span>
          <span className="text-[9px] text-gray-400">数据保留</span>
        </div>
      </div>
    </button>
  );
};

const Subscribe: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { quota } = useQuota();

  const isSubscribed = Boolean(quota?.plan_tier && SUBSCRIBED_TIERS.includes(quota.plan_tier));
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>('S2');
  const [redeemCodeInput, setRedeemCodeInput] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);

  const selectedPlan = useMemo(
    () => PLANS.find((plan) => plan.id === selectedPlanId) ?? PLANS[1],
    [selectedPlanId]
  );
  const addonLocked = selectedPlan.id === 'ADDON' && !isSubscribed;

  const handlePurchase = () => {
    if (addonLocked) {
      showToast('仅会员可购买加油包，请先升级会员', 'error');
      return;
    }

    const url = getSubscriptionPlanLink(selectedPlan.id);
    if (!url) {
      showToast('购买链接暂未配置，请稍后再试', 'error');
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    showToast('已跳转到闲鱼，购买后请回到这里输入卡密兑换', 'success');
  };

  const handleRedeemSubmit = async () => {
    if (!redeemCodeInput.trim() || redeemCodeInput.length < 8) {
      showToast('请输入有效的兑换码', 'error');
      return;
    }
    setRedeemLoading(true);
    try {
      const res = await redeemCode(redeemCodeInput.trim());
      if (res.ok) {
        showToast(`激活成功！获得 ${res.granted_bt / 12400} CP`, 'success');
        setRedeemCodeInput('');
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '激活失败';
      showToast(msg === 'invalid_code' ? '无效的兑换码' : msg, 'error');
    } finally {
      setRedeemLoading(false);
    }
  };

  return (
    <div className="bg-[#EFEEEE] text-gray-800 font-display antialiased min-h-screen w-full max-w-md mx-auto flex flex-col relative overflow-x-hidden selection:bg-gray-300 pb-36">
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-[#EFEEEE]/90 backdrop-blur-sm">
        <BackButton
          onClick={() => navigate(-1)}
          className="-ml-1 neu-outset-sm w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors !bg-[#EFEEEE] !shadow-[5px_5px_10px_#D1D5DB,-5px_-5px_10px_#FFFFFF] !rounded-full"
        />
        <h1 className="text-xl font-bold text-gray-800 tracking-wide">会员升级与兑换</h1>
        <div className="w-10" />
      </div>

      <div className="flex-1 flex flex-col w-full max-w-md mx-auto px-6 pt-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">先选套餐，再点“去购买”</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            购买后会获得卡密，在本页进行兑换即可。
          </p>
        </div>

        <div className="space-y-6">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isSelected={selectedPlan.id === plan.id}
              locked={plan.id === 'ADDON' && !isSubscribed}
              onSelect={() => setSelectedPlanId(plan.id)}
            />
          ))}
        </div>

        <div className="mt-12 mb-8">
          <div className="text-center mb-3">
            <div className="text-sm font-bold text-gray-700">已有卡密</div>
            <div className="text-xs text-gray-400 mt-1">购买后回到这里统一兑换</div>
          </div>
          <div className="bg-[#EFEEEE] shadow-[inset_4px_4px_8px_#D1D5DB,inset_-4px_-4px_8px_#FFFFFF] rounded-2xl p-2 flex gap-2">
            <input
              type="text"
              value={redeemCodeInput}
              onChange={(e) => setRedeemCodeInput(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              className="flex-1 bg-transparent h-10 px-3 text-sm font-mono text-gray-700 placeholder:text-gray-400 outline-none text-center tracking-widest uppercase"
            />
            <button
              onClick={handleRedeemSubmit}
              disabled={redeemLoading || !redeemCodeInput}
              className="bg-[#3B82F6] text-white text-xs font-bold px-4 rounded-xl shadow-md active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {redeemLoading ? '...' : '兑换'}
            </button>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 p-6 bg-gradient-to-t from-[#EFEEEE] to-transparent pointer-events-none">
        <div className="max-w-md mx-auto pointer-events-auto">
          <button
            onClick={handlePurchase}
            disabled={addonLocked}
            className="w-full h-14 bg-white rounded-2xl shadow-[8px_8px_20px_#D1D5DB,-8px_-8px_20px_#FFFFFF] flex items-center justify-center gap-2 group active:scale-[0.98] transition-transform border border-white/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-black font-bold text-lg">去购买</span>
            <span
              className="material-symbols-outlined text-black group-hover:translate-x-1 transition-transform"
              aria-hidden="true"
              style={{ fontSize: '20px' }}
            >
              arrow_forward
            </span>
          </button>
          {addonLocked && (
            <div className="mt-3 text-center text-xs text-amber-600 font-medium">
              仅会员可购买加油包，请先升级会员
            </div>
          )}
          <div className="mt-4 flex justify-center items-center text-[10px] text-gray-400 text-center leading-relaxed">
            <span>通过闲鱼购买后，由运营发放卡密，在本页统一兑换</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Subscribe;
