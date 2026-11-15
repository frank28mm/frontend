import type { AppLanguage } from '@/i18n/types';
import { translateText } from '@/i18n/translator';
import type { KnowledgeTagItem, MistakeItem } from '@/services/types';
import { getCachedEnglishTagLabel, hasChinese } from '@/utils/knowledgeTagTranslationCache';

export interface ResolvedKnowledgeTag {
  id: string;
  nameZh: string;
  nameEn: string;
  canonicalPath?: string;
  primaryDomain?: string;
  categoryId?: string;
  categoryNameZh?: string;
  categoryNameEn?: string;
  leafNameZh?: string;
  leafNameEn?: string;
}

export interface ResolvedKnowledgeCategory {
  id: string;
  nameZh: string;
  nameEn: string;
  primaryDomain?: string;
}

const SUBJECT_STOP_WORDS = new Set([
  '数学',
  '英语',
  'math',
  'english',
  'subject.math',
  'subject.english',
]);

const normalize = (value: unknown): string => String(value || '').trim();

const resolveRawTagId = (tag: KnowledgeTagItem): string => {
  return (
    normalize(tag.canonical_path) ||
    normalize(tag.id) ||
    normalize(tag.tag_id) ||
    normalize(tag.key) ||
    normalize(tag.name_zh) ||
    normalize(tag.display_name_zh) ||
    normalize(tag.name) ||
    normalize(tag.label) ||
    normalize(tag.display_name) ||
    normalize(tag.name_en) ||
    normalize(tag.display_name_en) ||
    'uncategorized'
  );
};

const resolveRawTagNameZh = (tag: KnowledgeTagItem): string => {
  return (
    normalize(tag.leaf_name) ||
    normalize(tag.name_zh) ||
    normalize(tag.display_name_zh) ||
    normalize(tag.name) ||
    normalize(tag.label) ||
    normalize(tag.display_name) ||
    normalize(tag.name_en) ||
    normalize(tag.display_name_en) ||
    '未分类'
  );
};

const resolveRawTagNameEn = (tag: KnowledgeTagItem): string => {
  return (
    normalize(tag.leaf_name) ||
    normalize(tag.name_en) ||
    normalize(tag.display_name_en) ||
    normalize(tag.name) ||
    normalize(tag.label) ||
    normalize(tag.display_name) ||
    normalize(tag.name_zh) ||
    normalize(tag.display_name_zh) ||
    'Uncategorized'
  );
};

const dedupeTags = (tags: ResolvedKnowledgeTag[]): ResolvedKnowledgeTag[] => {
  const map = new Map<string, ResolvedKnowledgeTag>();
  tags.forEach((tag) => {
    if (!map.has(tag.id)) {
      map.set(tag.id, tag);
      return;
    }
    const existing = map.get(tag.id);
    if (!existing) return;
      map.set(tag.id, {
        id: tag.id,
        nameZh: existing.nameZh || tag.nameZh,
        nameEn: existing.nameEn || tag.nameEn,
        canonicalPath: existing.canonicalPath || tag.canonicalPath,
        primaryDomain: existing.primaryDomain || tag.primaryDomain,
        categoryId: existing.categoryId || tag.categoryId,
        categoryNameZh: existing.categoryNameZh || tag.categoryNameZh,
        categoryNameEn: existing.categoryNameEn || tag.categoryNameEn,
        leafNameZh: existing.leafNameZh || tag.leafNameZh,
        leafNameEn: existing.leafNameEn || tag.leafNameEn,
      });
    });
  return Array.from(map.values());
};

const fromStructuredTags = (items: KnowledgeTagItem[]): ResolvedKnowledgeTag[] => {
  return dedupeTags(
    items
      .map((item) => ({
        id: resolveRawTagId(item),
        nameZh: resolveRawTagNameZh(item),
        nameEn: resolveRawTagNameEn(item),
        canonicalPath: normalize(item.canonical_path) || resolveRawTagId(item),
        primaryDomain: normalize(item.primary_domain),
        categoryId: normalize(item.category_id),
        categoryNameZh: normalize(item.category_name),
        categoryNameEn: normalize(item.category_name),
        leafNameZh: normalize(item.leaf_name) || resolveRawTagNameZh(item),
        leafNameEn: normalize(item.leaf_name) || resolveRawTagNameEn(item),
      }))
      .filter((item) => item.id)
  );
};

const fromLegacyTags = (tags: string[]): ResolvedKnowledgeTag[] => {
  return dedupeTags(
    tags
      .map((raw) => normalize(raw))
      .filter(Boolean)
      .map((name) => ({
        id: name,
        nameZh: name,
        nameEn: name,
        canonicalPath: name,
        leafNameZh: name,
        leafNameEn: name,
      }))
  );
};

export const getKnowledgeTags = (item: MistakeItem): ResolvedKnowledgeTag[] => {
  const structured = item.knowledge_tag_items || [];
  if (structured.length) {
    const resolved = fromStructuredTags(structured);
    if (resolved.length) return resolved;
  }

  const legacy = item.knowledge_tags || [];
  if (legacy.length) {
    const resolved = fromLegacyTags(legacy);
    if (resolved.length) return resolved;
  }

  return [{ id: 'uncategorized', nameZh: '未分类', nameEn: 'Uncategorized' }];
};

export const getPrimaryKnowledgeTag = (tags: ResolvedKnowledgeTag[]): ResolvedKnowledgeTag => {
  const preferred = tags.find((tag) => {
    const candidates = [tag.id, tag.nameZh, tag.nameEn].map((v) => v.toLowerCase());
    return !candidates.some((v) => SUBJECT_STOP_WORDS.has(v));
  });
  return preferred || tags[0] || { id: 'uncategorized', nameZh: '未分类', nameEn: 'Uncategorized' };
};

export const getKnowledgeCategory = (item: MistakeItem, tags?: ResolvedKnowledgeTag[]): ResolvedKnowledgeCategory => {
  const categoryId = normalize(item.knowledge_category_id);
  const categoryName = normalize(item.knowledge_category_name);
  if (categoryId || categoryName) {
    return {
      id: categoryId || categoryName || 'uncategorized',
      nameZh: categoryName || '未分类',
      nameEn: categoryName || 'Uncategorized',
    };
  }

  const resolvedTags = tags || getKnowledgeTags(item);
  const primary = getPrimaryKnowledgeTag(resolvedTags);
  const categoryLabel =
    normalize(primary.categoryNameZh) ||
    normalize(primary.categoryNameEn) ||
    normalize(primary.nameZh) ||
    normalize(primary.nameEn) ||
    '未分类';

  return {
    id: normalize(primary.categoryId) || normalize(primary.id) || categoryLabel,
    nameZh: categoryLabel,
    nameEn: categoryLabel,
    primaryDomain: normalize(primary.primaryDomain),
  };
};

export const getKnowledgeCategoryDisplayName = (
  category: ResolvedKnowledgeCategory,
  language: AppLanguage
): string => {
  if (language === 'en') {
    const preferred = normalize(category.nameEn) || normalize(category.nameZh);
    if (!preferred) return 'Uncategorized';
    const translated = translateText(preferred, 'en');
    if (!hasChinese(translated)) return translated;
    const cached = getCachedEnglishTagLabel(category.nameZh) || getCachedEnglishTagLabel(preferred);
    return cached || translated;
  }
  return normalize(category.nameZh) || normalize(category.nameEn) || '未分类';
};

export const getKnowledgeTagDisplayName = (
  tag: ResolvedKnowledgeTag,
  language: AppLanguage
): string => {
  if (language === 'en') {
    const preferred = normalize(tag.nameEn) || normalize(tag.nameZh);
    if (!preferred) return 'Uncategorized';
    const translated = translateText(preferred, 'en');
    if (!hasChinese(translated)) return translated;

    const cached =
      getCachedEnglishTagLabel(tag.nameZh) ||
      getCachedEnglishTagLabel(tag.nameEn) ||
      getCachedEnglishTagLabel(preferred);
    return cached || translated;
  }
  return normalize(tag.nameZh) || normalize(tag.nameEn) || '未分类';
};

export const matchKnowledgeTagQuery = (tag: ResolvedKnowledgeTag, rawQuery: string): boolean => {
  const query = normalize(rawQuery).toLowerCase();
  if (!query) return true;
  return [tag.id, tag.nameZh, tag.nameEn].some((value) => value.toLowerCase().includes(query));
};
