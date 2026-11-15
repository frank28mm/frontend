import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANGUAGE_STORAGE_KEY, type AppLanguage } from '@/i18n/types';
import { startDomTranslator } from '@/i18n/dom-translator';
import { translateUnknown } from '@/i18n/translator';

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const readInitialLanguage = (): AppLanguage => {
  if (typeof window === 'undefined') return 'zh';
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return saved === 'en' ? 'en' : 'zh';
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(readInitialLanguage);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => {
      const next = prev === 'zh' ? 'en' : 'zh';
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  }, [language]);

  useEffect(() => startDomTranslator(language), [language]);

  useEffect(() => {
    const nativeAlert = window.alert.bind(window);
    const nativeConfirm = window.confirm.bind(window);
    const nativePrompt = window.prompt.bind(window);

    window.alert = (message?: unknown) => {
      nativeAlert(String(translateUnknown(message, language) ?? ''));
    };

    window.confirm = (message?: string) => {
      return nativeConfirm(String(translateUnknown(message, language) ?? ''));
    };

    window.prompt = (message?: string, defaultValue?: string) => {
      return nativePrompt(String(translateUnknown(message, language) ?? ''), defaultValue);
    };

    return () => {
      window.alert = nativeAlert;
      window.confirm = nativeConfirm;
      window.prompt = nativePrompt;
    };
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
    }),
    [language, setLanguage, toggleLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useLanguage = (): LanguageContextValue => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};
