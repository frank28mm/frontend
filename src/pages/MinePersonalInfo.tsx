import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { BackButton } from '@/components/ui/BackButton';
import { HomeFab } from '@/components/ui/HomeButton';
import { useToast } from '@/components/ui/Toast';
import { useProfile } from '@/contexts/ProfileContext';
import { apiClient } from '@/services/api';
import { PARENT_DISPLAY_NAME_CHANGED_EVENT } from '@/services/auth';

interface AccountInfo {
  user_id: string;
  phone: string;
  email: string | null;
  nickname: string | null;
  has_password: boolean;
}

const MinePersonalInfo: React.FC = () => {
  const navigate = useNavigate();
  const { activeProfile } = useProfile();
  const { showToast } = useToast();

  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [, setLoadingAccount] = useState(false);

  // Parent Nickname
  const [draftParentName, setDraftParentName] = useState(() => 
    (localStorage.getItem('parent_display_name') || '').trim() || '家长'
  );
  const [savingName, setSavingName] = useState(false);

  // Modals
  const [bindEmailOpen, setBindEmailOpen] = useState(false);
  const [setPasswordOpen, setSetPasswordOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    fetchAccountInfo();
  }, []);

  const fetchAccountInfo = async () => {
    setLoadingAccount(true);
    try {
      const res = await apiClient.get<AccountInfo>('/me/account');
      setAccountInfo(res.data);
      if (res.data.nickname) {
        setDraftParentName(res.data.nickname);
        localStorage.setItem('parent_display_name', res.data.nickname);
        window.dispatchEvent(new Event(PARENT_DISPLAY_NAME_CHANGED_EVENT));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAccount(false);
    }
  };

  const handleSaveName = async () => {
    const next = draftParentName.trim();
    if (!next) {
      showToast('昵称不能为空', 'warning');
      return;
    }
    if (next.length > 30) {
      showToast('昵称太长（最多 30 个字符）', 'warning');
      return;
    }
    setSavingName(true);
    try {
      // Sync to backend
      await apiClient.patch('/me/account', { nickname: next });
      // Sync to local
      localStorage.setItem('parent_display_name', next);
      window.dispatchEvent(new Event(PARENT_DISPLAY_NAME_CHANGED_EVENT));
      showToast('已保存', 'success');
      fetchAccountInfo(); // Refresh to ensure sync
    } catch (e: unknown) {
      console.error(e);
      const ax = e as { response?: { data?: { detail?: string } } };
      const msg = ax.response?.data?.detail || '保存失败，请重试';
      showToast(msg, 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleBindEmail = async () => {
    if (!emailInput || !emailInput.includes('@')) {
      showToast('请输入正确的邮箱', 'warning');
      return;
    }
    setModalLoading(true);
    try {
      await apiClient.post('/me/email/bind', { email: emailInput });
      showToast('邮箱绑定成功', 'success');
      setBindEmailOpen(false);
      fetchAccountInfo();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } };
      const msg = ax.response?.data?.detail;
      if (msg === 'email_already_bound') {
        showToast('该邮箱已被绑定', 'error');
      } else {
        showToast('绑定失败，请稍后重试', 'error');
      }
    } finally {
      setModalLoading(false);
    }
  };

  const handleSetPassword = async () => {
    if (!passwordInput || passwordInput.length < 6) {
      showToast('密码长度至少 6 位', 'warning');
      return;
    }
    setModalLoading(true);
    try {
      await apiClient.post('/me/password', { password: passwordInput });
      showToast('密码设置成功', 'success');
      setSetPasswordOpen(false);
      fetchAccountInfo();
    } catch {
      showToast('设置失败，请稍后重试', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col max-w-md mx-auto bg-neu-bg pb-32 overflow-hidden">
      <header className="sticky top-0 z-30 flex items-center justify-center px-6 pt-12 pb-6 bg-neu-bg/90 backdrop-blur-sm relative">
        <div className="absolute left-6">
          <BackButton onClick={() => navigate(-1)} />
        </div>
        <h1 className="text-xl font-bold text-neu-text-secondary tracking-tight">个人信息</h1>
      </header>

      <main className="flex-1 px-6 overflow-y-auto no-scrollbar pb-10 space-y-5">
        
        {/* Parent Info */}
        <div className="rounded-2xl bg-neu-bg shadow-neu-flat border border-white/40 p-5">
          <div className="text-[10px] font-bold tracking-widest text-neu-text-secondary uppercase">账号</div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-neu-text">家长昵称</div>
              <div className="flex items-center gap-2">
                <div className="bg-neu-bg shadow-neu-pressed rounded-xl px-3 py-2 border border-white/30">
                  <input
                    value={draftParentName}
                    onChange={(e) => setDraftParentName(e.target.value)}
                    placeholder="请输入昵称"
                    maxLength={30}
                    className="w-36 bg-transparent text-sm text-neu-text outline-none border-none focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={savingName}
                  onClick={handleSaveName}
                  className="w-10 h-10 rounded-full bg-neu-bg shadow-neu-icon-btn flex items-center justify-center text-neu-text-secondary hover:text-primary active:shadow-neu-pressed transition-all duration-300 disabled:opacity-60"
                  aria-label="Save nickname"
                  title="保存"
                >
                  <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    check
                  </span>
                </button>
              </div>
            </div>
            <div className="h-px bg-black/5" />
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-neu-text">手机号</div>
              <div className="text-sm text-neu-text-secondary">
                {accountInfo?.phone ? accountInfo.phone.replace('+86', '').replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '加载中...'}
              </div>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="rounded-2xl bg-neu-bg shadow-neu-flat border border-white/40 p-5">
          <div className="text-[10px] font-bold tracking-widest text-neu-text-secondary uppercase">账号安全</div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-neu-text">绑定邮箱</div>
              <button 
                onClick={() => { setEmailInput(accountInfo?.email || ''); setBindEmailOpen(true); }}
                className="text-sm text-blue-500 font-medium flex items-center gap-1"
                disabled={!accountInfo}
              >
                {accountInfo?.email || '未绑定'}
                <span className="material-symbols-outlined text-base">chevron_right</span>
              </button>
            </div>
            <div className="h-px bg-black/5" />
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-neu-text">登录密码</div>
              <button 
                onClick={() => { setPasswordInput(''); setSetPasswordOpen(true); }}
                className="text-sm text-blue-500 font-medium flex items-center gap-1"
                disabled={!accountInfo}
              >
                {accountInfo?.has_password ? '已设置' : '未设置'}
                <span className="material-symbols-outlined text-base">chevron_right</span>
              </button>
            </div>
          </div>
        </div>

        {/* Child Profile */}
        <button
          type="button"
          onClick={() => navigate('/profiles')}
          className="w-full rounded-2xl bg-neu-bg shadow-neu-flat border border-white/40 p-5 flex items-center justify-between active:shadow-neu-pressed transition-all duration-200"
        >
          <div>
            <div className="text-[10px] font-bold tracking-widest text-neu-text-secondary uppercase">当前孩子</div>
            <div className="mt-2 text-base font-bold text-neu-text">{activeProfile?.display_name || '默认'}</div>
            <div className="mt-1 text-[11px] text-neu-text-secondary">点击进入子账号管理</div>
          </div>
          <span className="material-symbols-outlined text-neu-text-secondary">chevron_right</span>
        </button>

        <div className="rounded-2xl bg-neu-bg shadow-neu-flat border border-white/40 p-5">
          <div className="text-[10px] font-bold tracking-widest text-neu-text-secondary uppercase">说明</div>
          <div className="mt-3 text-sm text-neu-text leading-relaxed">
            家庭配额按家长主账号共享；孩子用于隔离作业、批改与报告数据。
          </div>
        </div>
      </main>

      {/* Bind Email Modal */}
      {bindEmailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-neu-bg/60 backdrop-blur-[6px]">
          <div className="w-full max-w-[320px] bg-neu-popup rounded-[32px] shadow-popup-base p-6 border border-white/40 animate-in fade-in zoom-in-95 duration-300">
            <h3 className="text-lg font-bold text-neu-text mb-1 text-center">绑定邮箱</h3>
            <p className="text-xs text-neu-text-secondary text-center mb-6">绑定后可使用邮箱+密码登录</p>
            
            <div className="bg-neu-popup shadow-popup-pressed rounded-2xl px-4 py-3 mb-6">
              <input
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="请输入邮箱地址"
                className="w-full bg-transparent text-neu-text outline-none border-none text-sm"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setBindEmailOpen(false)}
                className="flex-1 h-10 rounded-xl bg-neu-popup text-neu-text-secondary text-sm font-bold shadow-popup-flat active:shadow-popup-pressed transition-all"
              >
                取消
              </button>
              <button 
                onClick={handleBindEmail}
                disabled={modalLoading}
                className="flex-1 h-10 rounded-xl bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-all disabled:opacity-70"
              >
                {modalLoading ? '提交中' : '确认绑定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set Password Modal */}
      {setPasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-neu-bg/60 backdrop-blur-[6px]">
          <div className="w-full max-w-[320px] bg-neu-popup rounded-[32px] shadow-popup-base p-6 border border-white/40 animate-in fade-in zoom-in-95 duration-300">
            <h3 className="text-lg font-bold text-neu-text mb-1 text-center">设置密码</h3>
            <p className="text-xs text-neu-text-secondary text-center mb-6">建议使用 6 位以上数字或字母</p>
            
            <div className="bg-neu-popup shadow-popup-pressed rounded-2xl px-4 py-3 mb-6">
              <input
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="请输入新密码"
                type="password"
                className="w-full bg-transparent text-neu-text outline-none border-none text-sm"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setSetPasswordOpen(false)}
                className="flex-1 h-10 rounded-xl bg-neu-popup text-neu-text-secondary text-sm font-bold shadow-popup-flat active:shadow-popup-pressed transition-all"
              >
                取消
              </button>
              <button 
                onClick={handleSetPassword}
                disabled={modalLoading}
                className="flex-1 h-10 rounded-xl bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-all disabled:opacity-70"
              >
                {modalLoading ? '提交中' : '确认设置'}
              </button>
            </div>
          </div>
        </div>
      )}

      <HomeFab to="/" containerClassName="z-40" />
    </div>
  );
};

export default MinePersonalInfo;
