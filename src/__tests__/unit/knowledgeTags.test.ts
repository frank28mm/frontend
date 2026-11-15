import { describe, expect, it } from 'vitest';

import {
  getKnowledgeCategory,
  getKnowledgeCategoryDisplayName,
  getKnowledgeTags,
} from '@/utils/knowledgeTags';
import type { MistakeItem } from '@/services/types';

describe('knowledgeTags taxonomy', () => {
  it('prefers backend normalized category contract when present', () => {
    const item: MistakeItem = {
      submission_id: 'sub-1',
      item_id: 'q:1',
      knowledge_tags: ['幂运算'],
      knowledge_category_id: '代数/整式运算',
      knowledge_category_name: '整式运算',
      primary_knowledge_tag: '代数/整式运算/幂的运算',
      knowledge_tag_items: [
        {
          id: '代数/整式运算/幂的运算',
          canonical_path: '代数/整式运算/幂的运算',
          category_id: '代数/整式运算',
          category_name: '整式运算',
          leaf_name: '幂的运算',
        },
      ],
    };

    const tags = getKnowledgeTags(item);
    expect(tags[0].id).toBe('代数/整式运算/幂的运算');

    const category = getKnowledgeCategory(item, tags);
    expect(category.id).toBe('代数/整式运算');
    expect(getKnowledgeCategoryDisplayName(category, 'zh')).toBe('整式运算');
  });

  it('falls back to same category for equivalent normalized tags', () => {
    const item: MistakeItem = {
      submission_id: 'sub-2',
      item_id: 'q:2',
      knowledge_tag_items: [
        {
          id: '代数/不等式/不等式求解',
          canonical_path: '代数/不等式/不等式求解',
          category_id: '代数/不等式',
          category_name: '不等式',
          leaf_name: '不等式求解',
        },
      ],
    };

    const category = getKnowledgeCategory(item, getKnowledgeTags(item));
    expect(category.id).toBe('代数/不等式');
    expect(category.nameZh).toBe('不等式');
  });
});
