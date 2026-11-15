import { PRODUCT_IDENTITY } from '@/content/productIdentity';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth';
import { apiClient } from '../services/api';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  PRIVACY_LAST_UPDATED,
  PRIVACY_SECTIONS,
  PRIVACY_SUMMARY,
} from '@/content/privacyPolicy';
import {
  AGREEMENT_LAST_UPDATED,
  AGREEMENT_SECTIONS,
  AGREEMENT_SUMMARY,
} from '@/content/userAgreement';

type LoginMethod = 'phone' | 'email';
type LegalDocType = 'privacy' | 'agreement';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [method, setMethod] = useState<LoginMethod>('phone');
  
  // Phone state
  const [phone, setPhone] = useState(import.meta.env.DEV ? (import.meta.env.VITE_DEV_SMS_PHONE || '') : '');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  
  // Email state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [legalOpen, setLegalOpen] = useState<LegalDocType | null>(null);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      if (!authService.isLoggedIn()) return;
      try {
        await apiClient.get('/me/quota');
        if (active) navigate('/');
      } catch {
        localStorage.removeItem('access_token');
        localStorage.removeItem('auth_user');
        localStorage.removeItem('user_id');
        localStorage.removeItem('user_phone');
      }
    };
    void checkSession();
    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    if (!phone || phone.length < 11) {
      setError('请输入正确的手机号码');
      return;
    }
    if (countdown > 0) return;

    setLoading(true);
    setError('');
    try {
      const response = await authService.sendSmsCode(phone);
      if (response.ok) {
        setCountdown(response.expires_in_seconds > 60 ? 60 : response.expires_in_seconds);
        if (response.code) {
          setCode(response.code);
        }
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number; data?: { detail?: string } } };
      if (errorObj.response?.status === 429) {
        setError('发送太频繁，请稍后再试');
        setCountdown(60);
      } else if (errorObj.response?.data?.detail === 'sms_service_unavailable') {
        setError('线上短信服务暂时不可用，请稍后重试');
      } else {
        setError(errorObj.response?.data?.detail || '发送失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!agreed) {
      setError('请阅读并同意《用户协议》和《隐私政策》');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (method === 'phone') {
        if (!phone || phone.length < 11) {
          throw new Error('请输入正确的手机号码');
        }
        if (!code || code.length < 4) {
          throw new Error('请输入验证码');
        }
        await authService.verifySmsCode(phone, code);
      } else {
        if (!email || !email.includes('@')) {
          throw new Error('请输入正确的邮箱地址');
        }
        if (!password || password.length < 6) {
          throw new Error('密码长度至少 6 位');
        }
        await authService.loginEmail(email, password);
      }
      navigate('/');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        const errorObj = err as { response?: { status?: number; data?: { detail?: string } } };
        if (errorObj.response?.status === 401) {
          setError(method === 'phone' ? '验证码错误或已过期' : '邮箱或密码错误');
        } else {
          setError(errorObj.response?.data?.detail || '登录失败，请重试');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const legalTitle = legalOpen === 'agreement'
    ? isEn
      ? 'User Agreement'
      : '用户协议'
    : isEn
      ? 'Privacy Policy'
      : '隐私政策';

  const legalSummary = legalOpen === 'agreement' ? AGREEMENT_SUMMARY : PRIVACY_SUMMARY;
  const legalSections = legalOpen === 'agreement' ? AGREEMENT_SECTIONS : PRIVACY_SECTIONS;
  const legalUpdatedAt = legalOpen === 'agreement' ? AGREEMENT_LAST_UPDATED : PRIVACY_LAST_UPDATED;

  return (
    <div className="bg-[#EFEEEE] font-display text-[#324054] antialiased selection:bg-[#3B82F6]/20 flex flex-col h-[100dvh] w-full max-w-md mx-auto overflow-hidden">
      <div className="relative w-full h-full flex flex-col px-8 py-4 overflow-hidden">
        <div className="flex flex-col items-center justify-center pt-[max(2rem,env(safe-area-inset-top))] pb-6 shrink-0">
          <div className="flex items-center justify-center gap-3">
            <img
              src="/tint-logo.svg"
              alt={PRODUCT_IDENTITY.logoAlt}
              className="h-10 w-10 shrink-0"
              loading="eager"
              decoding="async"
            />
            <h1 className="text-gray-400/80 text-2xl font-bold leading-tight text-center tracking-[0.2em] uppercase" style={{ textShadow: '3px 3px 6px #C5C9D2, -3px -3px 6px #FFFFFF' }}>
              {PRODUCT_IDENTITY.name}
            </h1>
          </div>
        </div>

        <div className="flex flex-col gap-4 shrink-0">
          {/* Toggle */}
          <div className="bg-[#EFEEEE] shadow-[inset_4px_4px_8px_#D1D5DB,inset_-4px_-4px_8px_#FFFFFF] rounded-2xl p-1 flex">
            <button 
              className={cn('flex-1 py-2 rounded-xl text-sm font-bold transition-all', method === 'phone' ? 'bg-[#EFEEEE] shadow-[4px_4px_8px_#D1D5DB,-4px_-4px_8px_#FFFFFF] text-[#324054]' : 'text-gray-400 hover:text-gray-500')} 
              onClick={() => { setMethod('phone'); setError(''); }}
            >
              验证码登录
            </button>
            <button 
              className={cn('flex-1 py-2 rounded-xl text-sm font-bold transition-all', method === 'email' ? 'bg-[#EFEEEE] shadow-[4px_4px_8px_#D1D5DB,-4px_-4px_8px_#FFFFFF] text-[#324054]' : 'text-gray-400 hover:text-gray-500')} 
              onClick={() => { setMethod('email'); setError(''); }}
            >
              密码登录
            </button>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50/50 py-2 rounded-xl border border-red-100">
              {error}
            </div>
          )}

          {method === 'phone' ? (
            <>
              <div className="relative group">
                <input
                  className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-2xl text-[#324054] focus:outline-none bg-[#EFEEEE] shadow-[inset_3px_3px_6px_#C5C9D2,inset_-3px_-3px_6px_#FFFFFF] border-none h-12 placeholder:text-gray-400/70 px-6 text-sm font-medium transition-all focus:ring-0 focus:shadow-[inset_6px_6px_12px_#C5C9D2,inset_-6px_-6px_12px_#FFFFFF]"
                  placeholder="手机号码"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  maxLength={11}
                />
              </div>

              <div className="relative group">
                <input
                  className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-2xl text-[#324054] focus:outline-none bg-[#EFEEEE] shadow-[inset_3px_3px_6px_#C5C9D2,inset_-3px_-3px_6px_#FFFFFF] border-none h-12 placeholder:text-gray-400/70 pl-6 pr-32 text-sm font-medium transition-all focus:ring-0 focus:shadow-[inset_6px_6px_12px_#C5C9D2,inset_-6px_-6px_12px_#FFFFFF]"
                  maxLength={6}
                  placeholder="验证码"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <button
                  className={`absolute right-2 top-1/2 -translate-y-1/2 h-10 px-5 rounded-xl text-xs font-bold transition-all border border-white/70 ${
                    countdown > 0 || loading
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-[#F9FAFB] shadow-[6px_6px_12px_#C5C9D2,-6px_-6px_12px_#FFFFFF] active:shadow-[inset_4px_4px_8px_#C5C9D2,inset_-4px_-4px_8px_#FFFFFF] text-[#FF3B30] hover:-translate-y-[calc(50%+1px)]'
                  }`}
                  type="button"
                  onClick={handleSendCode}
                  disabled={countdown > 0 || loading}
                >
                  {countdown > 0 ? `${countdown}s` : '获取验证码'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="relative group">
                <input
                  className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-2xl text-[#324054] focus:outline-none bg-[#EFEEEE] shadow-[inset_3px_3px_6px_#C5C9D2,inset_-3px_-3px_6px_#FFFFFF] border-none h-12 placeholder:text-gray-400/70 px-6 text-sm font-medium transition-all focus:ring-0 focus:shadow-[inset_6px_6px_12px_#C5C9D2,inset_-6px_-6px_12px_#FFFFFF]"
                  placeholder="邮箱地址"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="relative group">
                <input
                  className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-2xl text-[#324054] focus:outline-none bg-[#EFEEEE] shadow-[inset_3px_3px_6px_#C5C9D2,inset_-3px_-3px_6px_#FFFFFF] border-none h-12 placeholder:text-gray-400/70 px-6 text-sm font-medium transition-all focus:ring-0 focus:shadow-[inset_6px_6px_12px_#C5C9D2,inset_-6px_-6px_12px_#FFFFFF]"
                  placeholder="密码"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className={`flex w-full items-center justify-center rounded-2xl bg-[#EFEEEE] text-[#324054] h-12 text-base font-bold tracking-wide shadow-[8px_8px_16px_#C5C9D2,-8px_-8px_16px_#FFFFFF] hover:shadow-[10px_10px_20px_#C5C9D2,-10px_-10px_20px_#FFFFFF] active:shadow-[inset_4px_4px_8px_#C5C9D2,inset_-4px_-4px_8px_#FFFFFF] active:scale-[0.98] transition-all duration-300 border border-white/60 ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? '登录中...' : method === 'phone' ? '登录 / 注册' : '登录'}
          </button>
        </div>

        <div className="mt-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center pt-4 shrink-0">
          <div className="flex items-start justify-center gap-3 group select-none">
            <div className="relative flex items-center mt-0.5">
              <input
                className="peer h-5 w-5 rounded border-gray-300 text-[#3B82F6] focus:ring-[#3B82F6]/50 bg-[#EFEEEE] shadow-[inset_3px_3px_6px_#C5C9D2,inset_-3px_-3px_6px_#FFFFFF] checked:shadow-[inset_4px_4px_8px_#C5C9D2,inset_-4px_-4px_8px_#FFFFFF] cursor-pointer appearance-none checked:bg-[#3B82F6] checked:border-transparent transition-all"
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span className="material-symbols-outlined absolute inset-0 text-white text-[16px] pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity flex items-center justify-center">
                check
              </span>
            </div>
            <div className="text-xs text-gray-400 text-left leading-relaxed max-w-[260px]">
              <span>我已阅读并同意</span>
              <button
                type="button"
                onClick={() => setLegalOpen('agreement')}
                className="ml-1 text-[#324054] font-bold hover:underline decoration-2 underline-offset-2 transition-colors"
              >
                《用户协议》
              </button>
              <span className="mx-1">和</span>
              <button
                type="button"
                onClick={() => setLegalOpen('privacy')}
                className="text-[#324054] font-bold hover:underline decoration-2 underline-offset-2 transition-colors"
              >
                《隐私政策》
              </button>
            </div>
          </div>
        </div>
      </div>

      {legalOpen && (
        <div className="fixed inset-0 z-[120] bg-[#EFEEEE] flex flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-between px-6 pt-10 pb-4 bg-[#EFEEEE]/95 backdrop-blur-sm border-b border-white/60">
            <button
              type="button"
              onClick={() => setLegalOpen(null)}
              className="h-10 w-10 rounded-full bg-[#EFEEEE] shadow-[6px_6px_12px_#C5C9D2,-6px_-6px_12px_#FFFFFF] active:shadow-[inset_4px_4px_8px_#C5C9D2,inset_-4px_-4px_8px_#FFFFFF] text-[#324054] flex items-center justify-center"
              aria-label={isEn ? 'Close document' : '关闭文档'}
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
            <h2 className="text-base font-bold text-[#324054] tracking-wide">
              {legalTitle}
            </h2>
            <div className="w-10" />
          </header>

          <main className="flex-1 overflow-y-auto no-scrollbar px-6 pb-10 pt-5">
            <div className="rounded-2xl bg-[#EFEEEE] shadow-[6px_6px_12px_#C5C9D2,-6px_-6px_12px_#FFFFFF] border border-white/50 p-5 space-y-5">
              <div className="rounded-2xl bg-[#EFEEEE] shadow-[inset_4px_4px_8px_#C5C9D2,inset_-4px_-4px_8px_#FFFFFF] border border-white/40 p-4">
                <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                  {isEn ? 'Summary' : '摘要'}
                </div>
                <p className="mt-2 text-sm text-[#324054] leading-relaxed">
                  {isEn ? legalSummary.en : legalSummary.zh}
                </p>
              </div>

              {legalSections.map((section) => (
                <section key={section.title.zh} className="space-y-2">
                  <h3 className="text-sm font-bold text-[#324054]">
                    {isEn ? section.title.en : section.title.zh}
                  </h3>
                  <div className="space-y-2 text-sm text-[#324054] leading-relaxed">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph.zh}>{isEn ? paragraph.en : paragraph.zh}</p>
                    ))}
                  </div>
                </section>
              ))}

              <div className="h-px bg-black/5" />
              <p className="text-[12px] text-gray-500">
                {isEn
                  ? `Updated on: ${legalUpdatedAt}`
                  : `更新日期：${legalUpdatedAt}`}
              </p>
            </div>
          </main>
        </div>
      )}
    </div>
  );
};

export default Login;
