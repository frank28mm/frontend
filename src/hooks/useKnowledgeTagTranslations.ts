import { useEffect, useMemo, useState } from 'react';
import type { AppLanguage } from '@/i18n/types';
import type { MistakeItem } from '@/services/types';
import { getKnowledgeTags } from '@/utils/knowledgeTags';
import { hasChinese, translateAndCacheTagLabels } from '@/utils/knowledgeTagTranslationCache';

export const useKnowledgeTagTranslations = (items: MistakeItem[], language: AppLanguage): void => {
  const [, setVersion] = useState(0);

  const translationCandidates = useMemo(() => {
    if (language !== 'en') return [];

    const candidates = new Set<string>();
    items.forEach((item) => {
      getKnowledgeTags(item).forEach((tag) => {
        const source = (tag.nameZh || tag.nameEn || '').trim();
        if (source && hasChinese(source)) {
          candidates.add(source);
        }
      });
    });
    return Array.from(candidates);
  }, [items, language]);

  useEffect(() => {
    if (language !== 'en' || !translationCandidates.length) return;

    let mounted = true;

    const run = async () => {
      const updates = await translateAndCacheTagLabels(translationCandidates);
      if (!mounted) return;
      if (Object.keys(updates).length > 0) {
        setVersion((value) => value + 1);
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [language, translationCandidates]);
};
