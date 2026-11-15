type QuestionRelationCarrier = {
  card_state?: unknown;
  relation_type?: unknown;
};

export const isNonScoringCrossPageParent = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const relation = value as QuestionRelationCarrier;
  return String(relation.relation_type || '').trim().toLowerCase() === 'cross_page_parent';
};

export const isUnscoredQuestionRelation = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const relation = String((value as QuestionRelationCarrier).relation_type || '').trim().toLowerCase();
  return relation === 'cross_page_parent' || relation === 'non_scoring_context';
};

export const hasBlockingPendingReview = (
  cards: readonly QuestionRelationCarrier[],
): boolean => cards.some((card) => (
  String(card.card_state || '').trim().toLowerCase() === 'review_pending' &&
  !isNonScoringCrossPageParent(card)
));
