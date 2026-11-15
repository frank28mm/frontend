import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/ui/Header';
import { apiClient } from '@/services/api';

interface RedemptionItem {
  id: string;
  code?: string;
  redeemed_at?: string;
  card_type?: string;
  bt_amount?: number;
  coupon_amount?: number;
  granted_bt?: number;
  created_at: string;
}

const MineRedemptions: React.FC = () => {
  const navigate = useNavigate();
  const [redemptions, setRedemptions] = useState<RedemptionItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get('/subscriptions/redemptions');
        setRedemptions(res.data?.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return (
    <div className="min-h-screen w-full max-w-md mx-auto bg-neu-bg flex flex-col font-display text-[#2D3748]">
      <Header title="我的兑换" onBack={() => navigate(-1)} className="bg-neu-bg sticky top-0 z-10" />
      
      <div className="p-4 space-y-4">
        {loading ? (
          <div className="text-center py-8 text-neu-text-secondary">加载中...</div>
        ) : redemptions.length === 0 ? (
          <div className="text-center py-12 text-neu-text-secondary">暂无兑换记录</div>
        ) : (
          redemptions.map((r) => (
            <div key={r.id} className="p-4 rounded-xl bg-neu-bg shadow-neu-flat border border-white/40">
              <div className="flex justify-between items-center mb-2">
                <span className="font-mono font-bold text-lg text-primary">{String(r.code || '').trim() || '---'}</span>
                <span className="text-xs text-neu-text-secondary">
                  {new Date(r.redeemed_at || r.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="text-sm text-neu-text">
                {r.card_type === 'trial_pack'
                  ? '试用包'
                  : r.card_type === 'subscription_pack'
                    ? '订阅包'
                    : r.card_type === 'report_coupon'
                      ? '报告券'
                      : String(r.card_type || '')}
              </div>
              <div className="mt-2 flex gap-4 text-xs text-neu-text-secondary">
                {(r.bt_amount || 0) > 0 && <span>CP: {r.bt_amount}</span>}
                {(r.coupon_amount || 0) > 0 && <span>券: {r.coupon_amount}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MineRedemptions;
