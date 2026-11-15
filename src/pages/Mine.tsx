import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HomeFab } from '@/components/ui/HomeButton';
import { useQuota } from '@/hooks/useQuota';
import { useFeedbackUnread } from '@/hooks/useFeedbackUnread';
import { useToast } from '@/components/ui/Toast';
import {
  AUTH_CHANGED_EVENT,
  PARENT_DISPLAY_NAME_CHANGED_EVENT,
  authService,
} from '@/services/auth';
import { useLanguage } from '@/contexts/LanguageContext';

const Mine: React.FC = () => {
  const navigate = useNavigate();
  const { quota } = useQuota();
  const { hasUnread } = useFeedbackUnread();
  const { showToast } = useToast();
  const { language, toggleLanguage } = useLanguage();

  const [parentDisplayName, setParentDisplayName] = useState(() => {
    const cached = (localStorage.getItem('parent_display_name') || '').trim();
    return cached || '家长';
  });

  useEffect(() => {
    let mounted = true;

    const syncFromCache = () => {
      const cached = (localStorage.getItem('parent_display_name') || '').trim();
      if (mounted) {
        setParentDisplayName(cached || '家长');
      }
    };

    const refreshFromServer = async () => {
      const latest = await authService.refreshParentDisplayName();
      if (mounted && latest?.trim()) {
        setParentDisplayName(latest.trim());
      } else if (mounted) {
        syncFromCache();
      }
    };

    syncFromCache();
    void refreshFromServer();

    const handleAuthChanged = () => {
      syncFromCache();
      void refreshFromServer();
    };

    const handleParentDisplayNameChanged = () => {
      syncFromCache();
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    window.addEventListener(PARENT_DISPLAY_NAME_CHANGED_EVENT, handleParentDisplayNameChanged);

    return () => {
      mounted = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
      window.removeEventListener(PARENT_DISPLAY_NAME_CHANGED_EVENT, handleParentDisplayNameChanged);
    };
  }, []);

  const firstLetter = (parentDisplayName[0] || 'P').toUpperCase();

  return (
    <div className="bg-[#EFEEEE] min-h-screen relative w-full max-w-md mx-auto flex flex-col font-display text-[#2D3748] pb-32">
      {/* Profile Header */}
      <div className="pt-16 pb-8 flex flex-col items-center justify-center">
        <div className="bg-[#EFEEEE] shadow-[9px_9px_18px_#d1d1d1,-9px_-9px_18px_#ffffff] rounded-full p-3 flex items-center justify-center mb-5 relative border border-white/40">
          <div
            className="rounded-full h-28 w-28 bg-[#EFEEEE] shadow-neu-inset flex items-center justify-center border-4 border-[#EFEEEE] overflow-hidden"
          >
            <span className="text-5xl font-bold text-gray-400 select-none">
              {firstLetter}
            </span>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-[#2D3748] tracking-tight">{parentDisplayName}</h1>
      </div>

      {/* Quota */}
      <div className="px-6 mb-8">
        <div className="w-full p-4 rounded-[1rem] bg-[#EFEEEE] shadow-[6px_6px_12px_#d1d1d1,-6px_-6px_12px_#ffffff] border border-white/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#EFEEEE] shadow-[inset_5px_5px_10px_#d1d1d1,inset_-5px_-5px_10px_#ffffff] flex items-center justify-center text-red-500">
                <span className="material-symbols-outlined text-[20px]">wallet</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold tracking-widest text-gray-500 uppercase">家庭配额</span>
                <span className="text-[10px] text-gray-400 font-medium">按家长主账号共享（不按孩子分开计费）</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => navigate('/subscribe')}
                className="px-4 py-2 rounded-full bg-[#EFEEEE] shadow-[6px_6px_12px_#d1d1d1,-6px_-6px_12px_#ffffff] text-[10px] font-bold tracking-widest text-[#2D3748] active:scale-[0.98] transition-transform"
              >
                升级
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="rounded-[0.9rem] bg-[#EFEEEE] shadow-[inset_4px_4px_8px_#d1d1d1,inset_-4px_-4px_8px_#ffffff] p-4">
              <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">CP 余额</div>
              <div className="text-2xl font-bold text-gray-900 mt-2">{quota ? quota.cp_left : '--'}</div>
            </div>
            <div className="rounded-[0.9rem] bg-[#EFEEEE] shadow-[inset_4px_4px_8px_#d1d1d1,inset_-4px_-4px_8px_#ffffff] p-4">
              <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">报告券</div>
              <div className="text-2xl font-bold text-gray-900 mt-2">{quota ? quota.report_coupons_left : '--'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Menu List */}
      <div className="px-6 flex flex-col gap-5 mb-10">
        <button
          type="button"
          onClick={() => navigate('/mine/api-keys')}
          className="w-full p-4 flex items-center justify-between group rounded-[1rem] bg-[#EFEEEE] shadow-[6px_6px_12px_#d1d1d1,-6px_-6px_12px_#ffffff] border border-white/40 transition-all duration-200 active:scale-[0.99]"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full shadow-neu-inset flex items-center justify-center text-emerald-600"><span aria-hidden="true" className="material-symbols-outlined text-[20px]">key</span></div>
            <span className="font-medium text-[#2D3748]">API Key</span>
          </div>
          <span aria-hidden="true" className="material-symbols-outlined text-gray-400">chevron_right</span>
        </button>
        <button
          onClick={() => navigate('/mine/personal')}
          className="w-full p-4 flex items-center justify-between group rounded-[1rem] bg-[#EFEEEE] shadow-[6px_6px_12px_#d1d1d1,-6px_-6px_12px_#ffffff] border border-white/40 transition-all duration-200 active:scale-[0.99] active:shadow-[inset_3px_3px_6px_#d1d1d1,inset_-3px_-3px_6px_#ffffff]"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#EFEEEE] shadow-[inset_5px_5px_10px_#d1d1d1,inset_-5px_-5px_10px_#ffffff] flex items-center justify-center text-blue-500">
              <span className="material-symbols-outlined text-[20px]">person</span>
            </div>
            <span className="font-medium text-[#2D3748]">个人信息</span>
          </div>
          <span className="material-symbols-outlined text-gray-400 group-hover:text-blue-500 transition-colors">chevron_right</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const nextLanguage = language === 'zh' ? 'en' : 'zh';
            toggleLanguage();
            showToast(nextLanguage === 'en' ? 'Switched to English' : '已切换到中文', 'success');
          }}
          className="w-full p-4 flex items-center justify-between rounded-[1rem] bg-[#EFEEEE] shadow-[6px_6px_12px_#d1d1d1,-6px_-6px_12px_#ffffff] border border-white/40 transition-all duration-200 active:scale-[0.99] active:shadow-[inset_3px_3px_6px_#d1d1d1,inset_-3px_-3px_6px_#ffffff]"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#EFEEEE] shadow-[inset_5px_5px_10px_#d1d1d1,inset_-5px_-5px_10px_#ffffff] flex items-center justify-center text-orange-500">
              <span className="material-symbols-outlined text-[20px]">translate</span>
            </div>
            <span className="font-medium text-[#2D3748]">语言</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#718096] font-medium">
              {language === 'zh' ? 'English' : '中文'}
            </span>
            <span className="material-symbols-outlined text-gray-400 group-hover:text-blue-500 transition-colors">chevron_right</span>
          </div>
        </button>

        <button
          onClick={() => navigate('/plans')}
          className="w-full p-4 flex items-center justify-between group rounded-[1rem] bg-[#EFEEEE] shadow-[6px_6px_12px_#d1d1d1,-6px_-6px_12px_#ffffff] border border-white/40 transition-all duration-200 active:scale-[0.99] active:shadow-[inset_3px_3px_6px_#d1d1d1,inset_-3px_-3px_6px_#ffffff]"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#EFEEEE] shadow-[inset_5px_5px_10px_#d1d1d1,inset_-5px_-5px_10px_#ffffff] flex items-center justify-center text-emerald-600">
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">event_note</span>
            </div>
            <span className="font-medium text-[#2D3748]">复习方案</span>
          </div>
          <span aria-hidden="true" className="material-symbols-outlined text-gray-400 group-hover:text-emerald-600 transition-colors">chevron_right</span>
        </button>

        <button
          onClick={() => navigate('/profiles')}
          className="w-full p-4 flex items-center justify-between group rounded-[1rem] bg-[#EFEEEE] shadow-[6px_6px_12px_#d1d1d1,-6px_-6px_12px_#ffffff] border border-white/40 transition-all duration-200 active:scale-[0.99] active:shadow-[inset_3px_3px_6px_#d1d1d1,inset_-3px_-3px_6px_#ffffff]"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#EFEEEE] shadow-[inset_5px_5px_10px_#d1d1d1,inset_-5px_-5px_10px_#ffffff] flex items-center justify-center text-gray-600">
              <span className="material-symbols-outlined text-[20px]">manage_accounts</span>
            </div>
            <span className="font-medium text-[#2D3748]">子账号管理</span>
          </div>
          <span className="material-symbols-outlined text-gray-400 group-hover:text-blue-500 transition-colors">chevron_right</span>
        </button>

        <button
          onClick={() => navigate('/mine/help')}
          className="w-full p-4 flex items-center justify-between group rounded-[1rem] bg-[#EFEEEE] shadow-[6px_6px_12px_#d1d1d1,-6px_-6px_12px_#ffffff] border border-white/40 transition-all duration-200 active:scale-[0.99] active:shadow-[inset_3px_3px_6px_#d1d1d1,inset_-3px_-3px_6px_#ffffff]"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#EFEEEE] shadow-[inset_5px_5px_10px_#d1d1d1,inset_-5px_-5px_10px_#ffffff] flex items-center justify-center text-purple-500 relative">
              <span className="material-symbols-outlined text-[20px]">help_center</span>
              {hasUnread && <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-[#EFEEEE]" />}
            </div>
            <span className="font-medium text-[#2D3748]">帮助与反馈</span>
          </div>
          <span className="material-symbols-outlined text-gray-400 group-hover:text-blue-500 transition-colors">chevron_right</span>
        </button>

        <button
          onClick={() => navigate('/mine/agreement')}
          className="w-full p-4 flex items-center justify-between group rounded-[1rem] bg-[#EFEEEE] shadow-[6px_6px_12px_#d1d1d1,-6px_-6px_12px_#ffffff] border border-white/40 transition-all duration-200 active:scale-[0.99] active:shadow-[inset_3px_3px_6px_#d1d1d1,inset_-3px_-3px_6px_#ffffff]"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#EFEEEE] shadow-[inset_5px_5px_10px_#d1d1d1,inset_-5px_-5px_10px_#ffffff] flex items-center justify-center text-indigo-500">
              <span className="material-symbols-outlined text-[20px]">gavel</span>
            </div>
            <span className="font-medium text-[#2D3748]">用户协议</span>
          </div>
          <span className="material-symbols-outlined text-gray-400 group-hover:text-indigo-500 transition-colors">chevron_right</span>
        </button>

        <button
          onClick={() => navigate('/mine/privacy')}
          className="w-full p-4 flex items-center justify-between group rounded-[1rem] bg-[#EFEEEE] shadow-[6px_6px_12px_#d1d1d1,-6px_-6px_12px_#ffffff] border border-white/40 transition-all duration-200 active:scale-[0.99] active:shadow-[inset_3px_3px_6px_#d1d1d1,inset_-3px_-3px_6px_#ffffff]"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#EFEEEE] shadow-[inset_5px_5px_10px_#d1d1d1,inset_-5px_-5px_10px_#ffffff] flex items-center justify-center text-green-500">
              <span className="material-symbols-outlined text-[20px]">policy</span>
            </div>
            <span className="font-medium text-[#2D3748]">隐私政策</span>
          </div>
          <span className="material-symbols-outlined text-gray-400 group-hover:text-blue-500 transition-colors">chevron_right</span>
        </button>

        <button
          onClick={() => navigate('/mine/about')}
          className="w-full p-4 flex items-center justify-between group rounded-[1rem] bg-[#EFEEEE] shadow-[6px_6px_12px_#d1d1d1,-6px_-6px_12px_#ffffff] border border-white/40 transition-all duration-200 active:scale-[0.99] active:shadow-[inset_3px_3px_6px_#d1d1d1,inset_-3px_-3px_6px_#ffffff]"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#EFEEEE] shadow-[inset_5px_5px_10px_#d1d1d1,inset_-5px_-5px_10px_#ffffff] flex items-center justify-center text-teal-500">
              <span className="material-symbols-outlined text-[20px]">info</span>
            </div>
            <span className="font-medium text-[#2D3748]">关于</span>
          </div>
          <span className="material-symbols-outlined text-gray-400 group-hover:text-blue-500 transition-colors">chevron_right</span>
        </button>

        <button
          onClick={() => navigate('/mine/redemptions')}
          className="w-full p-4 flex items-center justify-between group rounded-[1rem] bg-[#EFEEEE] shadow-[6px_6px_12px_#d1d1d1,-6px_-6px_12px_#ffffff] border border-white/40 transition-all duration-200 active:scale-[0.99] active:shadow-[inset_3px_3px_6px_#d1d1d1,inset_-3px_-3px_6px_#ffffff]"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#EFEEEE] shadow-[inset_5px_5px_10px_#d1d1d1,inset_-5px_-5px_10px_#ffffff] flex items-center justify-center text-emerald-500">
              <span className="material-symbols-outlined text-[20px]">redeem</span>
            </div>
            <span className="font-medium text-[#2D3748]">我的兑换</span>
          </div>
          <span className="material-symbols-outlined text-gray-400 group-hover:text-emerald-500 transition-colors">chevron_right</span>
        </button>
      </div>

      {/* Logout */}
      <div className="px-6 -mt-2">
        <button
          type="button"
          onClick={async () => {
            const ok = window.confirm('确定要退出登录吗？');
            if (!ok) return;
            const keysToDelete: string[] = [];
            for (let i = 0; i < localStorage.length; i += 1) {
              const k = localStorage.key(i);
              if (!k) continue;
              if (
                k.startsWith('chat_session_') ||
                k.startsWith('chat_history_') ||
                k.startsWith('active_job_') ||
                k.startsWith('active_report_') ||
                k === 'last_quota_error' ||
                k === 'active_profile_id' ||
                k === 'mine_avatar_dataurl' ||
                k === 'parent_display_name'
              ) {
                keysToDelete.push(k);
              }
            }
            keysToDelete.forEach((k) => localStorage.removeItem(k));
            await authService.logout();
            showToast('已退出登录', 'success');
            navigate('/login');
          }}
          className="w-full p-4 flex items-center justify-between group rounded-[1rem] bg-[#EFEEEE] shadow-[6px_6px_12px_#d1d1d1,-6px_-6px_12px_#ffffff] border border-white/40 transition-all duration-200 active:scale-[0.99] active:shadow-[inset_3px_3px_6px_#d1d1d1,inset_-3px_-3px_6px_#ffffff]"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#EFEEEE] shadow-[inset_5px_5px_10px_#d1d1d1,inset_-5px_-5px_10px_#ffffff] flex items-center justify-center text-red-500">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                logout
              </span>
            </div>
            <span className="font-medium text-[#2D3748]">退出登录</span>
          </div>
          <span className="material-symbols-outlined text-gray-400 group-hover:text-red-500 transition-colors">chevron_right</span>
        </button>
      </div>

      <HomeFab to="/" containerClassName="z-50" />
    </div>
  );
};

export default Mine;
