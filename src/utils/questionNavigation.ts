import type { QuestionCard } from '@/services/types';
import { compareQuestionNumbers } from '@/utils/questionOrder';

export const QUESTION_NAV_FILTERS = ['wrong', 'uncertain', 'correct', 'all'] as const;

export type QuestionNavFilter = (typeof QUESTION_NAV_FILTERS)[number];

export interface QuestionNavigationState {
  filter?: QuestionNavFilter;
  itemIds?: string[];
}

export const isQuestionNavFilter = (value: unknown): value is QuestionNavFilter =>
  QUESTION_NAV_FILTERS.includes(value as QuestionNavFilter);

export const questionNavLabel = (filter: QuestionNavFilter): string => {
  if (filter === 'wrong') return '错题';
  if (filter === 'correct') return '对题';
  if (filter === 'uncertain') return '待定';
  return '全部';
};

export const matchesQuestionNavFilter = (card: QuestionCard, filter: QuestionNavFilter): boolean => {
  const verdict = String(card.verdict || '').toLowerCase();
  if (filter === 'wrong') return verdict === 'incorrect';
  if (filter === 'correct') return verdict === 'correct';
  if (filter === 'uncertain') return verdict === 'uncertain';
  return true;
};

export const sortQuestionCardsByOrder = (cards: QuestionCard[]): QuestionCard[] =>
  [...cards].sort((a, b) => {
    const byQ = compareQuestionNumbers(a.question_number, b.question_number);
    if (byQ !== 0) return byQ;
    return String(a.item_id || '').localeCompare(String(b.item_id || ''));
  });

export const normalizeQuestionNavItemIds = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    const itemId = String(value || '').trim();
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    out.push(itemId);
  }
  return out;
};
