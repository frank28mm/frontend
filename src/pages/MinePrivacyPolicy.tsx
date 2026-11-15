import React from 'react';
import { useNavigate } from 'react-router-dom';

import { BackButton } from '@/components/ui/BackButton';
import { HomeFab } from '@/components/ui/HomeButton';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  PRIVACY_LAST_UPDATED,
  PRIVACY_SECTIONS,
  PRIVACY_SUMMARY,
} from '@/content/privacyPolicy';

const MinePrivacyPolicy: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEn = language === 'en';

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col max-w-md mx-auto bg-neu-bg pb-32 overflow-hidden">
      <header className="sticky top-0 z-30 flex items-center justify-center px-6 pt-12 pb-6 bg-neu-bg/90 backdrop-blur-sm relative">
        <div className="absolute left-6">
          <BackButton onClick={() => navigate(-1)} />
        </div>
        <h1 className="text-xl font-bold text-neu-text-secondary tracking-tight">
          {isEn ? 'Privacy Policy' : '隐私政策'}
        </h1>
      </header>

      <main className="flex-1 px-6 overflow-y-auto no-scrollbar pb-10">
        <div className="rounded-2xl bg-neu-bg shadow-neu-flat border border-white/40 p-6 space-y-6">
          <div className="rounded-2xl bg-neu-bg shadow-neu-pressed border border-white/30 p-4">
            <div className="text-[10px] font-bold tracking-widest text-neu-text-secondary uppercase">
              {isEn ? 'Summary' : '摘要'}
            </div>
            <p className="mt-2 text-sm text-neu-text leading-relaxed">
              {isEn ? PRIVACY_SUMMARY.en : PRIVACY_SUMMARY.zh}
            </p>
          </div>

          {PRIVACY_SECTIONS.map((section) => (
            <section key={section.title.zh} className="space-y-2">
              <h2 className="text-sm font-bold text-neu-text">
                {isEn ? section.title.en : section.title.zh}
              </h2>
              <div className="text-sm text-neu-text leading-relaxed space-y-2">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph.zh}>{isEn ? paragraph.en : paragraph.zh}</p>
                ))}
              </div>
            </section>
          ))}

          <div className="h-px bg-black/5" />
          <div className="text-[12px] text-neu-text-secondary leading-relaxed">
            <p>{isEn ? `Updated on: ${PRIVACY_LAST_UPDATED}` : `更新日期：${PRIVACY_LAST_UPDATED}`}</p>
          </div>
        </div>
      </main>

      <HomeFab to="/" containerClassName="z-40" />
    </div>
  );
};

export default MinePrivacyPolicy;
