import type {
  AnswerMode,
  AnswerMapping,
  AnswerPayload,
  AnswerSlot,
  ArtifactContractProvenance,
  ArtifactWarningCode,
  CardState,
  EnglishErrorType,
  EvidenceKind,
  EvidenceOwnerType,
  EvidenceRecord,
  EvidenceRole,
  FeedbackMode,
  KnowledgeTagRole,
  KnowledgeTagItem,
  LearningArtifactsContract,
  LearningQuestion,
  LearningQuestionOption,
  LearningSubject,
  Material,
  MaterialGroup,
  MaterialKind,
  MaterialStatus,
  PresentationKind,
  PresentationNode,
  QuestionCard,
  QuestionType,
  RubricDimension,
  RubricJudgment,
  SimilarityMode,
  Verdict,
  VerdictSource,
} from '@/services/types';
import { isNonScoringCrossPageParent, isUnscoredQuestionRelation } from '@/utils/questionRelations';

type UnknownRecord = Record<string, unknown>;
type ConsumableLearningArtifactsContract = LearningArtifactsContract & {
  artifact_contract_status: 'complete' | 'degraded';
};

export interface FallbackQuestion extends UnknownRecord {
  item_id: string;
  question_number?: string;
  page_index?: number;
  verdict?: Verdict;
}

export type PresentationQuestion = LearningQuestion | FallbackQuestion;

export interface VerdictCounts {
  total: number;
  correct: number;
  incorrect: number;
  uncertain: number;
}

export interface QuestionPresentationNode {
  kind: PresentationKind;
  refId: string;
  displayOrder: number;
  question?: PresentationQuestion;
  group?: MaterialGroup;
  questions: PresentationQuestion[];
  verdictCounts: VerdictCounts;
}

export interface QuestionPresentation {
  source: 'learning_artifacts_v1' | 'fallback';
  contractStatus: 'complete' | 'degraded';
  warnings: ArtifactWarningCode[];
  materialGroups: MaterialGroup[];
  evidenceRegistry: EvidenceRecord[];
  nodes: QuestionPresentationNode[];
  questions: PresentationQuestion[];
}

const QUESTION_TYPES = [
  'phonetics_spelling',
  'vocabulary_word_form',
  'grammar_usage',
  'sentence_transform',
  'cloze_banked',
  'cloze_open',
  'reading_choice',
  'reading_true_false',
  'reading_matching',
  'reading_summary',
  'translation',
  'short_answer',
  'writing',
  'unknown',
] as const satisfies readonly QuestionType[];

const ANSWER_MODES = [
  'choice_single',
  'choice_multiple',
  'true_false',
  'matching',
  'fill_text',
  'fill_from_bank',
  'sentence_transform',
  'translation',
  'short_answer',
  'writing',
  'unknown',
] as const satisfies readonly AnswerMode[];

const VERDICTS = ['correct', 'incorrect', 'uncertain'] as const satisfies readonly Verdict[];
const ANSWER_STATES = ['blank', 'has_answer', 'unknown'] as const;
const VERDICT_SOURCES = ['model', 'review', 'manual', 'legacy'] as const satisfies readonly VerdictSource[];
const PROVENANCES = ['native_v1', 'mixed', 'legacy_fallback'] as const satisfies readonly ArtifactContractProvenance[];
const SIMILARITY_MODES = ['normal', 'strict', 'rubric', 'none'] as const satisfies readonly SimilarityMode[];
const FEEDBACK_MODES = ['answer_comparison', 'rubric', 'feedback_only'] as const satisfies readonly FeedbackMode[];
const ERROR_TYPES = [
  'missing_answer',
  'recognition_uncertain',
  'spelling',
  'word_form',
  'vocabulary',
  'grammar',
  'meaning',
  'evidence',
  'task_fulfillment',
  'coherence',
  'expression',
  'format',
  'other',
  'unknown',
] as const satisfies readonly EnglishErrorType[];
const MATERIAL_KINDS = [
  'passage',
  'dialogue',
  'instructions',
  'word_bank',
  'table',
  'diagram',
  'image',
  'mixed',
  'unknown',
] as const satisfies readonly MaterialKind[];
const MATERIAL_STATUSES = ['complete', 'degraded'] as const satisfies readonly MaterialStatus[];
const EVIDENCE_OWNER_TYPES = ['material', 'question', 'answer', 'feedback'] as const satisfies readonly EvidenceOwnerType[];
const EVIDENCE_ROLES = [
  'material',
  'instructions',
  'question',
  'options',
  'student_answer',
  'reference_answer',
  'grading_basis',
] as const satisfies readonly EvidenceRole[];
const EVIDENCE_KINDS = ['page', 'bbox', 'text_span', 'answer_fragment'] as const satisfies readonly EvidenceKind[];
const PRESENTATION_KINDS = ['question', 'material_group'] as const satisfies readonly PresentationKind[];
const KNOWLEDGE_TAG_ROLES = ['primary', 'secondary'] as const satisfies readonly KnowledgeTagRole[];
const RUBRIC_DIMENSIONS = [
  'task_completion',
  'content',
  'organization',
  'grammar',
  'vocabulary',
  'expression',
] as const satisfies readonly RubricDimension[];
const RUBRIC_JUDGMENTS = ['meets', 'partly_meets', 'does_not_meet', 'uncertain'] as const satisfies readonly RubricJudgment[];
const WARNING_CODES = [
  'legacy_fallback_v1',
  'unknown_contract_version',
  'provider_output_degraded',
  'invalid_enum',
  'duplicate_item_id',
  'duplicate_group_id',
  'orphan_group_item_ref',
  'orphan_evidence_ref',
  'cross_owner_evidence_ref',
  'missing_material',
  'partial_cross_page_group',
  'invalid_evidence_locator',
  'answer_payload_mismatch',
  'question_feedback_type_mismatch',
  'knowledge_tag_missing',
  'presentation_node_missing',
  'presentation_order_invalid',
] as const satisfies readonly ArtifactWarningCode[];
const CARD_STATES = ['placeholder', 'verdict_ready', 'review_pending', 'review_ready', 'review_failed'] as const satisfies readonly CardState[];
const CARD_PRESENTATION_KEYS = [
  'relation_type',
  'excluded_from_mistakes',
  'question_slice_image_url',
  'figure_slice_image_url',
  'image_refs',
  'visual_risk',
  'visual_risk_reasons',
  'card_state',
  'needs_review',
  'review_summary',
  'review_reasons',
  'review_slice_image_url',
  'review_bbox',
] as const satisfies readonly (keyof QuestionCard)[];

const FLAT_QUESTION_KEYS = [
  'item_id',
  'question_number',
  'page_index',
  'subject',
  'relation_type',
  'answer_state',
  'excluded_from_mistakes',
  'question_text',
  'question_content',
  'question_slice_image_url',
  'figure_slice_image_url',
  'image_refs',
  'visual_risk',
  'visual_risk_reasons',
  'card_state',
  'verdict',
  'verdict_source',
  'reason',
  'student_answer',
  'judgment_basis',
  'knowledge_tags',
  'needs_review',
  'review_summary',
  'review_reasons',
  'review_slice_image_url',
  'review_bbox',
] as const;
type FlatQuestionKey = (typeof FLAT_QUESTION_KEYS)[number];

const ANSWER_VARIANT_KEYS = ['selections', 'mappings', 'slots', 'text'] as const;
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/i;
const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cloneValue = <T>(value: T): T => structuredClone(value);

const isString = (value: unknown): value is string => typeof value === 'string';
const isNonEmptyString = (value: unknown): value is string => isString(value) && value.length > 0;
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isNonNegativeInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0;
const isPositiveInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;
const isOptionalString = (value: unknown): boolean => value === undefined || isString(value);
const isOptionalNonEmptyString = (value: unknown): boolean => value === undefined || isNonEmptyString(value);

const isEnumValue = <Value extends string>(
  value: unknown,
  allowed: readonly Value[],
): value is Value => typeof value === 'string' && allowed.some((candidate) => candidate === value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);

const isUniqueNonEmptyStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every(isNonEmptyString) &&
  new Set(value).size === value.length;

const isEnumArray = <Value extends string>(value: unknown, allowed: readonly Value[]): value is Value[] =>
  Array.isArray(value) && value.every((item) => isEnumValue(item, allowed));

const hasOwn = (value: UnknownRecord, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const hasForbiddenFields = (value: UnknownRecord, fields: readonly string[]): boolean =>
  fields.some((field) => hasOwn(value, field));

const normalizeNullableArray = (value: UnknownRecord, key: string): void => {
  if (value[key] === null || value[key] === undefined) value[key] = [];
};

const normalizeEvidenceRefOwner = (value: unknown): void => {
  if (!isRecord(value)) return;
  normalizeNullableArray(value, 'evidence_refs');
};

const normalizeAnswerPayloadEvidence = (value: unknown): void => {
  if (!isRecord(value)) return;
  normalizeEvidenceRefOwner(value);
  for (const key of ['selections', 'mappings', 'slots']) {
    const entries = value[key];
    if (Array.isArray(entries)) entries.forEach(normalizeEvidenceRefOwner);
  }
};

const normalizeEnglishFeedback = (value: unknown): void => {
  if (!isRecord(value)) return;
  for (const key of [
    'error_types',
    'accepted_answers',
    'keywords_used',
    'evidence',
    'evidence_refs',
    'slot_feedback',
    'rubric_feedback',
    'strengths',
    'representative_corrections',
  ]) {
    normalizeNullableArray(value, key);
  }
  if (value.semantic_score === undefined) value.semantic_score = null;

  if (Array.isArray(value.slot_feedback)) {
    for (const slot of value.slot_feedback) {
      if (!isRecord(slot)) continue;
      normalizeNullableArray(slot, 'accepted_answers');
      normalizeNullableArray(slot, 'error_types');
      normalizeNullableArray(slot, 'evidence_refs');
    }
  }
  if (Array.isArray(value.rubric_feedback)) {
    for (const rubric of value.rubric_feedback) {
      if (!isRecord(rubric)) continue;
      normalizeNullableArray(rubric, 'evidence_refs');
      if (rubric.score === undefined) rubric.score = null;
      if (rubric.max_score === undefined) rubric.max_score = null;
    }
  }
};

const normalizePersistedQuestion = (value: unknown): void => {
  if (!isRecord(value)) return;
  normalizeNullableArray(value, 'options');
  normalizeNullableArray(value, 'accepted_answer_payloads');
  normalizeNullableArray(value, 'evidence_refs');
  normalizeNullableArray(value, 'judgment_basis');
  normalizeNullableArray(value, 'knowledge_tags');
  normalizeNullableArray(value, 'knowledge_tag_items');
  normalizeNullableArray(value, 'degradation_reasons');
  if (value.answer_mode === null || value.answer_mode === undefined || value.answer_mode === '') {
    value.answer_mode = 'unknown';
  }
  if (value.verdict_source === null || value.verdict_source === undefined) {
    value.verdict_source = 'model';
  }

  if (Array.isArray(value.options)) value.options.forEach(normalizeEvidenceRefOwner);
  normalizeAnswerPayloadEvidence(value.student_answer_payload);
  normalizeAnswerPayloadEvidence(value.reference_answer_payload);
  if (Array.isArray(value.accepted_answer_payloads)) {
    value.accepted_answer_payloads.forEach(normalizeAnswerPayloadEvidence);
  }
  normalizeEnglishFeedback(value.english_feedback);
};

const normalizedPersistedContract = (payload: unknown): unknown => {
  if (!isRecord(payload) || payload.artifact_contract_version !== 'learning_artifacts_v1') {
    return payload;
  }
  const normalized = cloneValue(payload);
  if (Array.isArray(normalized.questions)) {
    normalized.questions.forEach(normalizePersistedQuestion);
  }
  return normalized;
};

const canonicalizeEvidenceText = (value: string): string =>
  value.replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/[ \t]+$/g, '')).join('\n');

const rotateRight = (value: number, amount: number): number =>
  (value >>> amount) | (value << (32 - amount));

const sha256 = (value: string): string => {
  const input = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = input.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const word15 = words[index - 15]!;
      const word2 = words[index - 2]!;
      const sigma0 = rotateRight(word15, 7) ^ rotateRight(word15, 18) ^ (word15 >>> 3);
      const sigma1 = rotateRight(word2, 17) ^ rotateRight(word2, 19) ^ (word2 >>> 10);
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choice = (e! & f!) ^ (~e! & g!);
      const temp1 = (h! + sum1 + choice + SHA256_CONSTANTS[index]! + words[index]!) >>> 0;
      const sum0 = rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d! + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0]! + a!) >>> 0;
    hash[1] = (hash[1]! + b!) >>> 0;
    hash[2] = (hash[2]! + c!) >>> 0;
    hash[3] = (hash[3]! + d!) >>> 0;
    hash[4] = (hash[4]! + e!) >>> 0;
    hash[5] = (hash[5]! + f!) >>> 0;
    hash[6] = (hash[6]! + g!) >>> 0;
    hash[7] = (hash[7]! + h!) >>> 0;
  }
  return `sha256:${hash.map((word) => word.toString(16).padStart(8, '0')).join('')}`;
};

const hasValidOptionalEvidenceRefs = (value: UnknownRecord): boolean =>
  value.evidence_refs === undefined || isStringArray(value.evidence_refs);

const isSelection = (value: unknown): boolean =>
  isRecord(value) && isNonEmptyString(value.value) && hasValidOptionalEvidenceRefs(value);

const isMapping = (value: unknown): value is AnswerMapping =>
  isRecord(value) &&
  isNonEmptyString(value.left_id) &&
  isNonEmptyString(value.right_id) &&
  hasValidOptionalEvidenceRefs(value);

const isSlot = (value: unknown): value is AnswerSlot =>
  isRecord(value) &&
  isNonEmptyString(value.slot_id) &&
  isString(value.value) &&
  hasValidOptionalEvidenceRefs(value);

const isAnswerPayload = (value: unknown, expectedMode: AnswerMode): value is AnswerPayload => {
  if (!isRecord(value) || value.mode !== expectedMode || !hasValidOptionalEvidenceRefs(value)) return false;
  const presentVariants = ANSWER_VARIANT_KEYS.filter((key) => hasOwn(value, key));

  switch (expectedMode) {
    case 'choice_single':
    case 'true_false': {
      if (presentVariants.length !== 1 || presentVariants[0] !== 'selections') return false;
      if (!Array.isArray(value.selections) || value.selections.length !== 1 || !value.selections.every(isSelection)) return false;
      return expectedMode !== 'true_false' || ['true', 'false'].includes(String(value.selections[0]?.value));
    }
    case 'choice_multiple':
      return presentVariants.length === 1 &&
        presentVariants[0] === 'selections' &&
        Array.isArray(value.selections) &&
        value.selections.length > 0 &&
        value.selections.every(isSelection);
    case 'matching': {
      if (presentVariants.length !== 1 || presentVariants[0] !== 'mappings') return false;
      if (!Array.isArray(value.mappings) || value.mappings.length === 0 || !value.mappings.every(isMapping)) return false;
      const leftIDs = value.mappings.map((mapping) => mapping.left_id);
      return new Set(leftIDs).size === leftIDs.length;
    }
    case 'fill_text':
    case 'fill_from_bank': {
      if (presentVariants.length !== 1 || presentVariants[0] !== 'slots') return false;
      if (!Array.isArray(value.slots) || value.slots.length === 0 || !value.slots.every(isSlot)) return false;
      const slotIDs = value.slots.map((slot) => slot.slot_id);
      return new Set(slotIDs).size === slotIDs.length;
    }
    case 'sentence_transform':
    case 'translation':
    case 'short_answer':
    case 'writing':
      return presentVariants.length === 1 && presentVariants[0] === 'text' && isString(value.text);
    case 'unknown':
      return presentVariants.every((field) => field === 'text') && isOptionalString(value.text);
  }
};

const isQuestionOption = (value: unknown): value is LearningQuestionOption =>
  isRecord(value) &&
  isNonEmptyString(value.option_id) &&
  isOptionalString(value.text) &&
  isStringArray(value.evidence_refs);

const isKnowledgeTag = (value: unknown): boolean =>
  isRecord(value) &&
  isNonEmptyString(value.tag_id) &&
  isNonEmptyString(value.taxonomy_version) &&
  isNonEmptyString(value.canonical_path) &&
  isEnumValue(value.role, KNOWLEDGE_TAG_ROLES);

const SCIENCE_TAXONOMY_VERSIONS = {
  physics: 'physics_cn_secondary_v1',
  chemistry: 'chemistry_cn_secondary_v1',
} as const;

const isLearningSubject = (value: unknown): value is LearningSubject =>
  value === 'english' || value === 'physics' || value === 'chemistry';

const isScienceKnowledgeTag = (
  value: unknown,
  subject: 'physics' | 'chemistry',
): value is KnowledgeTagItem => {
  if (!isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.tag_id) ||
    value.taxonomy_version !== SCIENCE_TAXONOMY_VERSIONS[subject] ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.canonical_path) ||
    !isNonEmptyString(value.primary_domain) ||
    !isNonEmptyString(value.category_id) ||
    !isNonEmptyString(value.category_name) ||
    !isNonEmptyString(value.leaf_name)) {
    return false;
  }
  const path = value.canonical_path.split('/').map((part) => part.trim());
  return path.length === 3 && path.every(Boolean) &&
    value.primary_domain === path[0] &&
    value.category_name === path[1] &&
    value.leaf_name === path[2] &&
    value.name === path[2];
};

const hasUniqueKnowledgeTagIDs = (value: unknown[]): boolean => {
  const tagIDs = value
    .filter(isRecord)
    .map((tag) => String(tag.tag_id || '').trim());
  return tagIDs.length === value.length && new Set(tagIDs).size === tagIDs.length;
};

const hasValidKnowledgeTagCardinality = (value: unknown[]): boolean => {
  if (value.length === 0) return true;
  const tags = value.filter(isRecord);
  const primaryCount = tags.filter((tag) => tag.role === 'primary').length;
  const secondaryCount = tags.filter((tag) => tag.role === 'secondary').length;
  const tagIDs = tags.map((tag) => tag.tag_id);
  return primaryCount === 1 && secondaryCount <= 2 && new Set(tagIDs).size === tagIDs.length;
};

const isSlotFeedback = (value: unknown): boolean =>
  isRecord(value) &&
  isNonEmptyString(value.slot_id) &&
  isEnumValue(value.verdict, VERDICTS) &&
  isOptionalString(value.reference_answer) &&
  isStringArray(value.accepted_answers) &&
  isEnumArray(value.error_types, ERROR_TYPES) &&
  isOptionalString(value.explanation) &&
  isStringArray(value.evidence_refs);

const isRubricFeedback = (value: unknown): boolean => {
  if (!isRecord(value) ||
    !isEnumValue(value.dimension, RUBRIC_DIMENSIONS) ||
    !isEnumValue(value.judgment, RUBRIC_JUDGMENTS) ||
    !isNonEmptyString(value.feedback) ||
    !hasValidOptionalEvidenceRefs(value)) {
    return false;
  }
  const scoreValid = value.score === null || (isFiniteNumber(value.score) && value.score >= 0);
  const maxScoreValid = value.max_score === null || (isFiniteNumber(value.max_score) && value.max_score >= 0);
  return scoreValid && maxScoreValid && ((value.score === null) === (value.max_score === null));
};

const isWritingCorrection = (value: unknown): boolean =>
  isRecord(value) &&
  isNonEmptyString(value.original) &&
  isNonEmptyString(value.corrected) &&
  isNonEmptyString(value.explanation);

const isEnglishFeedback = (
  value: unknown,
  questionType: QuestionType,
  studentAnswerPayload: unknown,
): boolean => {
  if (!isRecord(value) ||
    value.question_type !== questionType ||
    (value.error_type !== undefined && !isEnumValue(value.error_type, ERROR_TYPES)) ||
    !isEnumArray(value.error_types, ERROR_TYPES) ||
    !isOptionalString(value.reference_answer) ||
    !isStringArray(value.accepted_answers) ||
    !isOptionalString(value.improved_answer) ||
    !isOptionalString(value.student_issue) ||
    !isOptionalString(value.explanation) ||
    !(value.evaluation_status === undefined || value.evaluation_status === 'complete' || value.evaluation_status === 'failed') ||
    !isOptionalString(value.overall_assessment) ||
    !(value.strengths === undefined || isStringArray(value.strengths)) ||
    !(value.representative_corrections === undefined ||
      (Array.isArray(value.representative_corrections) && value.representative_corrections.every(isWritingCorrection))) ||
    !isEnumValue(value.feedback_mode, FEEDBACK_MODES) ||
    !isStringArray(value.keywords_used) ||
    !(value.semantic_score === null || (isFiniteNumber(value.semantic_score) && value.semantic_score >= 0 && value.semantic_score <= 1)) ||
    !isEnumValue(value.similarity_mode, SIMILARITY_MODES) ||
    !isStringArray(value.evidence) ||
    !isStringArray(value.evidence_refs) ||
    !Array.isArray(value.slot_feedback) ||
    !value.slot_feedback.every(isSlotFeedback) ||
    !Array.isArray(value.rubric_feedback) ||
    !value.rubric_feedback.every(isRubricFeedback)) {
    return false;
  }

  if (value.slot_feedback.length === 0) return true;
  if (!isRecord(studentAnswerPayload) || !Array.isArray(studentAnswerPayload.slots)) return false;
  const studentSlotIDs = new Set(
    studentAnswerPayload.slots.filter(isRecord).map((slot) => slot.slot_id),
  );
  return value.slot_feedback.every((slot) => isRecord(slot) && studentSlotIDs.has(slot.slot_id));
};

const isLearningQuestion = (value: unknown): value is LearningQuestion => {
  if (!isRecord(value) ||
    !isNonEmptyString(value.item_id) ||
    !isString(value.question_number) ||
    !isNonNegativeInteger(value.page_index) ||
    !isNonEmptyString(value.subject) ||
    !isEnumValue(value.answer_mode, ANSWER_MODES) ||
    !isString(value.question_text) ||
    !isOptionalString(value.question_content) ||
    !Array.isArray(value.options) ||
    !value.options.every(isQuestionOption) ||
    !isOptionalString(value.student_answer) ||
    !isEnumValue(value.answer_state, ANSWER_STATES) ||
    !isEnumValue(value.verdict, VERDICTS) ||
    !isEnumValue(value.verdict_source, VERDICT_SOURCES) ||
    !(value.grading_confidence === undefined || value.grading_confidence === null ||
      (isFiniteNumber(value.grading_confidence) && value.grading_confidence >= 0 && value.grading_confidence <= 1)) ||
    !isOptionalString(value.reason) ||
    !isStringArray(value.judgment_basis) ||
    !isStringArray(value.knowledge_tags) ||
    !Array.isArray(value.knowledge_tag_items) ||
    !isStringArray(value.evidence_refs) ||
    !isEnumValue(value.contract_provenance, PROVENANCES) ||
    !isStringArray(value.degradation_reasons)) {
    return false;
  }

  const englishQuestion = value.subject === 'english';
  const scienceQuestion = value.subject === 'physics' || value.subject === 'chemistry';
  if (!englishQuestion && !scienceQuestion) return false;
  if (englishQuestion) {
    if (!isEnumValue(value.question_type, QUESTION_TYPES) ||
      !value.knowledge_tag_items.every(isKnowledgeTag) ||
      !hasValidKnowledgeTagCardinality(value.knowledge_tag_items)) {
      return false;
    }
  } else {
    const subject = value.subject as 'physics' | 'chemistry';
    const canonicalPaths = value.knowledge_tag_items
      .filter((tag) => isScienceKnowledgeTag(tag, subject))
      .map((tag) => tag.canonical_path);
    const rawPaths = [...value.knowledge_tags].sort();
    const normalizedPaths = [...canonicalPaths].sort();
    if (!isNonEmptyString(value.question_type) ||
      canonicalPaths.length !== value.knowledge_tag_items.length ||
      !hasUniqueKnowledgeTagIDs(value.knowledge_tag_items) ||
      rawPaths.length !== normalizedPaths.length ||
      rawPaths.some((path, index) => path !== normalizedPaths[index])) {
      return false;
    }
  }

  const answerMode = value.answer_mode;
  const optionIDs = value.options.map((option) => option.option_id);
  if (new Set(optionIDs).size !== optionIDs.length) return false;
  if (value.student_answer_payload !== undefined && !isAnswerPayload(value.student_answer_payload, answerMode)) return false;
  if (value.reference_answer_payload !== undefined && !isAnswerPayload(value.reference_answer_payload, answerMode)) return false;
  if (!Array.isArray(value.accepted_answer_payloads) ||
    !value.accepted_answer_payloads.every((payload) => isAnswerPayload(payload, answerMode))) {
    return false;
  }

  if (value.display_mode === 'simple_question') {
    if (value.material_group_id !== undefined || value.group_position !== undefined) return false;
  } else if (value.display_mode === 'material_group') {
    if (!isNonEmptyString(value.material_group_id) || !isPositiveInteger(value.group_position)) return false;
  } else {
    return false;
  }

  if (englishQuestion) {
    if (!isEnglishFeedback(value.english_feedback, value.question_type as QuestionType, value.student_answer_payload)) return false;
  } else if (value.english_feedback !== undefined) {
    return false;
  }
  return true;
};

const isMaterial = (value: unknown): value is Material =>
  isRecord(value) &&
  !hasOwn(value, 'questions') &&
  isNonEmptyString(value.material_id) &&
  isEnumValue(value.kind, MATERIAL_KINDS) &&
  isPositiveInteger(value.display_order) &&
  isOptionalString(value.text) &&
  isStringArray(value.evidence_refs) &&
  ((isString(value.text) && value.text.length > 0) || value.evidence_refs.length > 0);

const isStrictlyAscendingNonNegativeIntegers = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item, index) =>
    isNonNegativeInteger(item) && (index === 0 || item > value[index - 1]),
  );

const isMaterialGroup = (value: unknown): value is MaterialGroup => {
  if (!isRecord(value) ||
    hasOwn(value, 'questions') ||
    !isNonEmptyString(value.group_id) ||
    !isOptionalString(value.title) ||
    !isEnumValue(value.material_type, MATERIAL_KINDS) ||
    !isPositiveInteger(value.display_order) ||
    !isStrictlyAscendingNonNegativeIntegers(value.page_indices) ||
    value.page_indices.length === 0 ||
    !isEnumValue(value.status, MATERIAL_STATUSES) ||
    !isEnumArray(value.warnings, WARNING_CODES) ||
    !Array.isArray(value.materials) ||
    !value.materials.every(isMaterial) ||
    !isUniqueNonEmptyStringArray(value.item_ids) ||
    value.item_ids.length === 0) {
    return false;
  }
  const orders = value.materials.map((material) => material.display_order);
  return orders.every((order, index) => order === index + 1);
};

const isBBox = (value: unknown): boolean => {
  if (!isRecord(value) || value.unit !== 'normalized') return false;
  const { x, y, width, height } = value;
  return isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(width) && isFiniteNumber(height) &&
    x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 1.000000001 && y + height <= 1.000000001;
};

const hasValidEvidenceBase = (value: UnknownRecord): boolean =>
  isNonEmptyString(value.evidence_id) &&
  isEnumValue(value.owner_type, EVIDENCE_OWNER_TYPES) &&
  isNonEmptyString(value.owner_id) &&
  isEnumValue(value.role, EVIDENCE_ROLES) &&
  isEnumValue(value.kind, EVIDENCE_KINDS) &&
  value.canonicalization_version === 'evidence_v1' &&
  isString(value.content_hash) &&
  HASH_PATTERN.test(value.content_hash);

const hasValidOptionalPageTextFields = (value: UnknownRecord): boolean =>
  isOptionalString(value.text) && isOptionalNonEmptyString(value.image_url);

const isTextLocator = (value: UnknownRecord): boolean =>
  isNonEmptyString(value.source_text_id) &&
  isNonNegativeInteger(value.span_start) &&
  isPositiveInteger(value.span_end) &&
  value.span_start < value.span_end &&
  isString(value.text) &&
  Array.from(value.text).length === value.span_end - value.span_start;

const isEvidenceRecord = (value: unknown): value is EvidenceRecord => {
  if (!isRecord(value) || !hasValidEvidenceBase(value)) return false;
  switch (value.kind) {
    case 'page':
      return isNonNegativeInteger(value.page_index) &&
        isNonEmptyString(value.storage_ref) &&
        hasValidOptionalPageTextFields(value) &&
        !hasForbiddenFields(value, ['bbox', 'source_text_id', 'span_start', 'span_end', 'bbox_evidence_ref']);
    case 'bbox':
      return isNonNegativeInteger(value.page_index) &&
        isNonEmptyString(value.storage_ref) &&
        isBBox(value.bbox) &&
        hasValidOptionalPageTextFields(value) &&
        !hasForbiddenFields(value, ['source_text_id', 'span_start', 'span_end', 'bbox_evidence_ref']);
    case 'text_span':
      return isTextLocator(value) &&
        (value.page_index === undefined || isNonNegativeInteger(value.page_index)) &&
        isOptionalNonEmptyString(value.bbox_evidence_ref) &&
        !hasForbiddenFields(value, ['storage_ref', 'bbox', 'image_url']);
    case 'answer_fragment': {
      if (value.owner_type !== 'answer' ||
        (value.role !== 'student_answer' && value.role !== 'reference_answer') ||
        !isNonEmptyString(value.text) ||
        hasOwn(value, 'bbox_evidence_ref')) {
        return false;
      }
      const bboxLocator = isNonNegativeInteger(value.page_index) && isBBox(value.bbox) &&
        isOptionalNonEmptyString(value.storage_ref) && isOptionalNonEmptyString(value.image_url) &&
        !hasForbiddenFields(value, ['source_text_id', 'span_start', 'span_end']);
      const textLocator = isTextLocator(value) &&
        !hasForbiddenFields(value, ['page_index', 'storage_ref', 'bbox', 'image_url']);
      return bboxLocator !== textLocator;
    }
  }
  return false;
};

const isPresentationNode = (value: unknown): value is PresentationNode =>
  isRecord(value) &&
  isNonEmptyString(value.node_id) &&
  isEnumValue(value.kind, PRESENTATION_KINDS) &&
  isNonEmptyString(value.ref_id) &&
  isPositiveInteger(value.display_order);

const isQuestionCard = (value: unknown): value is QuestionCard => {
  if (!isRecord(value) ||
    !isNonEmptyString(value.item_id) ||
    !isString(value.question_number) ||
    !isNonNegativeInteger(value.page_index) ||
    (value.answer_state !== undefined && !isEnumValue(value.answer_state, ANSWER_STATES)) ||
    (value.card_state !== undefined && !isEnumValue(value.card_state, CARD_STATES)) ||
    (value.verdict !== undefined && !isEnumValue(value.verdict, VERDICTS))) {
    return false;
  }
  return isOptionalString(value.question_content) &&
    isOptionalString(value.question_slice_image_url) &&
    isOptionalString(value.figure_slice_image_url) &&
    isOptionalString(value.reason) &&
    isOptionalString(value.review_summary) &&
    isOptionalString(value.review_slice_image_url) &&
    (value.excluded_from_mistakes === undefined || isBoolean(value.excluded_from_mistakes)) &&
    (value.visual_risk === undefined || isBoolean(value.visual_risk)) &&
    (value.needs_review === undefined || isBoolean(value.needs_review)) &&
    (value.visual_risk_reasons === undefined || isStringArray(value.visual_risk_reasons)) &&
    (value.review_reasons === undefined || isStringArray(value.review_reasons)) &&
    (value.review_bbox === undefined || (Array.isArray(value.review_bbox) && value.review_bbox.every(isFiniteNumber))) &&
    (value.image_refs === undefined || isRecord(value.image_refs));
};

const isSafeFlatQuestionField = (key: FlatQuestionKey, value: unknown): boolean => {
  switch (key) {
    case 'item_id':
      return isNonEmptyString(value);
    case 'question_number':
    case 'subject':
    case 'relation_type':
    case 'question_text':
    case 'question_content':
    case 'question_slice_image_url':
    case 'figure_slice_image_url':
    case 'reason':
    case 'student_answer':
    case 'review_summary':
    case 'review_slice_image_url':
      return isString(value);
    case 'page_index':
      return isNonNegativeInteger(value);
    case 'answer_state':
      return isEnumValue(value, ANSWER_STATES);
    case 'card_state':
      return isEnumValue(value, CARD_STATES);
    case 'verdict':
      return isEnumValue(value, VERDICTS);
    case 'verdict_source':
      return isEnumValue(value, VERDICT_SOURCES);
    case 'excluded_from_mistakes':
    case 'visual_risk':
    case 'needs_review':
      return isBoolean(value);
    case 'visual_risk_reasons':
    case 'judgment_basis':
    case 'knowledge_tags':
    case 'review_reasons':
      return isStringArray(value);
    case 'review_bbox':
      return Array.isArray(value) && value.every(isFiniteNumber);
    case 'image_refs':
      return isRecord(value);
  }
};

const uniqueRecordsByID = <RecordType>(
  records: readonly RecordType[],
  getID: (record: RecordType) => string,
): Map<string, RecordType> | null => {
  const byID = new Map<string, RecordType>();
  for (const record of records) {
    const id = getID(record);
    if (byID.has(id)) return null;
    byID.set(id, record);
  }
  return byID;
};

const collectEvidenceRefs = (value: unknown, refs: string[]): boolean => {
  if (Array.isArray(value)) return value.every((item) => collectEvidenceRefs(item, refs));
  if (!isRecord(value)) return true;
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'evidence_refs') {
      if (!isStringArray(nested)) return false;
      refs.push(...nested);
    } else if (!collectEvidenceRefs(nested, refs)) {
      return false;
    }
  }
  return true;
};

const firstNonEmpty = (...values: Array<string | undefined>): string | undefined =>
  values.find((value) => value !== undefined && value.length > 0);

const answerPayloadProjection = (payload: AnswerPayload): string => {
  switch (payload.mode) {
    case 'choice_single':
    case 'choice_multiple':
    case 'true_false':
      return payload.selections.map((selection) => selection.value).join(',');
    case 'matching':
      return payload.mappings.map((mapping) => `${mapping.left_id}:${mapping.right_id}`).join('; ');
    case 'fill_text':
    case 'fill_from_bank':
      return payload.slots.map((slot) => slot.value).join('; ');
    default:
      return payload.text ?? '';
  }
};

const buildCanonicalSourceTexts = (
  groups: readonly MaterialGroup[],
  questions: readonly LearningQuestion[],
): Map<string, string> => {
  const sources = new Map<string, string>();
  for (const group of groups) {
    for (const material of group.materials) {
      if (material.text !== undefined && material.text.length > 0) {
        sources.set(`material:${material.material_id}:text`, canonicalizeEvidenceText(material.text));
      }
    }
  }
  for (const question of questions) {
    const questionText = firstNonEmpty(question.question_text, question.question_content);
    if (questionText !== undefined) {
      sources.set(`question:${question.item_id}:text`, canonicalizeEvidenceText(questionText));
    }
    if (question.student_answer_payload !== undefined) {
      sources.set(
        `answer:${question.item_id}:student`,
        canonicalizeEvidenceText(answerPayloadProjection(question.student_answer_payload)),
      );
    }
    if (question.reference_answer_payload !== undefined) {
      sources.set(
        `answer:${question.item_id}:reference`,
        canonicalizeEvidenceText(answerPayloadProjection(question.reference_answer_payload)),
      );
    }
    const feedbackText = firstNonEmpty(
      question.english_feedback?.explanation,
      question.english_feedback?.student_issue,
    );
    if (feedbackText !== undefined) {
      sources.set(`feedback:${question.item_id}:text`, canonicalizeEvidenceText(feedbackText));
    }
  }
  return sources;
};

const expectedSourceTextID = (evidence: EvidenceRecord): string => {
  switch (evidence.owner_type) {
    case 'material':
      return `material:${evidence.owner_id}:text`;
    case 'question':
      return `question:${evidence.owner_id}:text`;
    case 'feedback':
      return `feedback:${evidence.owner_id}:text`;
    case 'answer':
      return evidence.role === 'reference_answer'
        ? `answer:${evidence.owner_id}:reference`
        : `answer:${evidence.owner_id}:student`;
  }
};

const hasValidCanonicalEvidence = (
  evidence: EvidenceRecord,
  sources: ReadonlyMap<string, string>,
): boolean => {
  if (evidence.kind === 'page' || evidence.kind === 'bbox') return true;
  if (evidence.kind === 'answer_fragment' && evidence.source_text_id === undefined) {
    const fragment = canonicalizeEvidenceText(evidence.text);
    return evidence.text === fragment && evidence.content_hash.toLowerCase() === sha256(fragment);
  }

  const sourceID = evidence.source_text_id;
  if (sourceID !== expectedSourceTextID(evidence)) return false;
  const source = sources.get(sourceID);
  if (source === undefined) return false;
  const runes = Array.from(source);
  if (evidence.span_end > runes.length) return false;
  const span = runes.slice(evidence.span_start, evidence.span_end).join('');
  if (evidence.text !== span) return false;
  const hashText = evidence.kind === 'text_span' ? source : span;
  return evidence.content_hash.toLowerCase() === sha256(hashText);
};

const isConsumableLearningArtifactsContract = (
  payload: unknown,
): payload is ConsumableLearningArtifactsContract => {
  if (!isRecord(payload) ||
    payload.artifact_contract_version !== 'learning_artifacts_v1' ||
    (payload.artifact_contract_status !== 'complete' && payload.artifact_contract_status !== 'degraded') ||
    !isNonNegativeInteger(payload.artifact_contract_revision) ||
    !isEnumValue(payload.artifact_contract_provenance, PROVENANCES) ||
    !isEnumArray(payload.artifact_contract_warnings, WARNING_CODES) ||
    !Array.isArray(payload.material_groups) ||
    !payload.material_groups.every(isMaterialGroup) ||
    !Array.isArray(payload.evidence_registry) ||
    !payload.evidence_registry.every(isEvidenceRecord) ||
    !Array.isArray(payload.presentation_nodes) ||
    !payload.presentation_nodes.every(isPresentationNode) ||
    !Array.isArray(payload.questions) ||
    !payload.questions.every(isLearningQuestion) ||
    !Array.isArray(payload.question_cards) ||
    !payload.question_cards.every(isQuestionCard)) {
    return false;
  }

  if (payload.artifact_contract_provenance === 'legacy_fallback') {
    if (payload.artifact_contract_status !== 'degraded' || payload.artifact_contract_revision !== 0) return false;
  } else if (payload.artifact_contract_revision < 1) {
    return false;
  }

  const questionSubjects = new Set(payload.questions.map((question) => question.subject));
  if (questionSubjects.size !== 1) return false;
  const questionSubject = payload.questions[0]?.subject;
  if (payload.subject !== undefined &&
    (!isLearningSubject(payload.subject) || payload.subject !== questionSubject)) {
    return false;
  }

  const contractWarnings = payload.artifact_contract_warnings;
  const statusMustBeDegraded = payload.artifact_contract_provenance !== 'native_v1' ||
    contractWarnings.length > 0 ||
    payload.material_groups.some((group) => group.status === 'degraded');
  if ((payload.artifact_contract_status === 'degraded') !== statusMustBeDegraded) return false;

  for (const group of payload.material_groups) {
    if (group.status === 'complete') {
      if (group.warnings.length > 0 || group.materials.length === 0) return false;
    } else {
      if (group.warnings.length === 0 ||
        group.warnings.some((warning) => !contractWarnings.includes(warning))) {
        return false;
      }
    }
  }

  for (const question of payload.questions) {
    if (question.subject !== 'english' || question.knowledge_tag_items.length > 0) continue;
    if (payload.artifact_contract_status !== 'degraded' ||
      !contractWarnings.includes('knowledge_tag_missing') ||
      !question.degradation_reasons.includes('knowledge_tag_missing')) {
      return false;
    }
  }

  const groupRecords = payload.material_groups;
  const evidenceRecords = payload.evidence_registry;
  const nodeRecords = payload.presentation_nodes;
  const questionRecords = payload.questions;
  const groupsByID = uniqueRecordsByID(groupRecords, (group) => group.group_id);
  const evidenceByID = uniqueRecordsByID(evidenceRecords, (evidence) => evidence.evidence_id);
  const nodesByID = uniqueRecordsByID(nodeRecords, (node) => node.node_id);
  const questionsByID = uniqueRecordsByID(questionRecords, (question) => question.item_id);
  if (!groupsByID || !evidenceByID || !nodesByID || !questionsByID) return false;

  const materialIDs = new Set<string>();
  const groupedItemIDs = new Set<string>();
  for (const group of payload.material_groups) {
    for (const material of group.materials) {
      if (materialIDs.has(material.material_id)) return false;
      materialIDs.add(material.material_id);
    }
    for (let index = 0; index < group.item_ids.length; index += 1) {
      const itemID = group.item_ids[index]!;
      const question = questionsByID.get(itemID);
      if (!question || groupedItemIDs.has(itemID) ||
        question.display_mode !== 'material_group' ||
        question.material_group_id !== group.group_id ||
        question.group_position !== index + 1) {
        return false;
      }
      groupedItemIDs.add(itemID);
    }
    if (group.item_ids.some((itemID) => !group.page_indices.includes(questionsByID.get(itemID)!.page_index))) {
      return false;
    }
    if (group.materials.length === 0) {
      if (group.status !== 'degraded' ||
        !group.warnings.includes('missing_material') ||
        !contractWarnings.includes('missing_material')) {
        return false;
      }
      for (const itemID of group.item_ids) {
        const question = questionsByID.get(itemID)!;
        const expectedVerdict = question.answer_state === 'blank' ? 'incorrect' : 'uncertain';
        if (
          (question.verdict_source !== 'manual' && question.verdict !== expectedVerdict) ||
          !question.degradation_reasons.includes('missing_material')
        ) {
          return false;
        }
      }
    }
  }

  for (const question of payload.questions) {
    if (question.display_mode === 'material_group' && !groupedItemIDs.has(question.item_id)) return false;
    if (question.display_mode === 'simple_question' && groupedItemIDs.has(question.item_id)) return false;
  }

  const orderedNodes = [...payload.presentation_nodes].sort((left, right) => left.display_order - right.display_order);
  const seenRefs = new Set<string>();
  for (let index = 0; index < orderedNodes.length; index += 1) {
    const node = orderedNodes[index]!;
    if (node.display_order !== index + 1 || seenRefs.has(node.ref_id)) return false;
    seenRefs.add(node.ref_id);
    if (node.kind === 'question') {
      const question = questionsByID.get(node.ref_id);
      if (!question || question.display_mode !== 'simple_question') return false;
    } else {
      const group = groupsByID.get(node.ref_id);
      if (!group || group.display_order !== node.display_order) return false;
    }
  }
  if (orderedNodes.length !== payload.material_groups.length + payload.questions.length - groupedItemIDs.size) return false;
  if (payload.material_groups.some((group) => !seenRefs.has(group.group_id))) return false;
  if (payload.questions.some((question) => question.display_mode === 'simple_question' && !seenRefs.has(question.item_id))) return false;

  for (const evidence of payload.evidence_registry) {
    const ownerExists = evidence.owner_type === 'material'
      ? materialIDs.has(evidence.owner_id)
      : questionsByID.has(evidence.owner_id);
    if (!ownerExists) return false;
    if (evidence.kind === 'text_span' && evidence.bbox_evidence_ref !== undefined) {
      const bboxEvidence = evidenceByID.get(evidence.bbox_evidence_ref);
      if (!bboxEvidence || bboxEvidence.kind !== 'bbox') return false;
    }
  }

  const canonicalSources = buildCanonicalSourceTexts(payload.material_groups, payload.questions);
  if (payload.evidence_registry.some((evidence) => !hasValidCanonicalEvidence(evidence, canonicalSources))) {
    return false;
  }

  const evidenceRefs: string[] = [];
  if (!collectEvidenceRefs(payload.material_groups, evidenceRefs) ||
    !collectEvidenceRefs(payload.questions, evidenceRefs) ||
    evidenceRefs.some((ref) => !evidenceByID.has(ref))) {
    return false;
  }
  return true;
};

const validatedContract = (payload: unknown): ConsumableLearningArtifactsContract | null => {
  const normalized = normalizedPersistedContract(payload);
  return isConsumableLearningArtifactsContract(normalized) ? normalized : null;
};

export const countVerdicts = (questions: readonly PresentationQuestion[]): VerdictCounts => {
  const scoredQuestions = questions.filter((question) => !isUnscoredQuestionRelation(question));
  const counts: VerdictCounts = { total: scoredQuestions.length, correct: 0, incorrect: 0, uncertain: 0 };
  for (const question of scoredQuestions) {
    if (isEnumValue(question.verdict, VERDICTS)) counts[question.verdict] += 1;
  }
  return counts;
};

const buildV1Presentation = (contract: ConsumableLearningArtifactsContract): QuestionPresentation => {
  const cardsByID = new Map(contract.question_cards.map((card) => [card.item_id, card]));
  const questionsByID = new Map(contract.questions.map((question) => {
    const card = cardsByID.get(question.item_id);
    if (!card) return [question.item_id, question] as const;
    const enriched = { ...question } as LearningQuestion & UnknownRecord;
    for (const key of CARD_PRESENTATION_KEYS) {
      if (card[key] !== undefined) (enriched as UnknownRecord)[key] = cloneValue(card[key]);
    }
    return [question.item_id, enriched] as const;
  }));
  const groupsByID = new Map(contract.material_groups.map((group) => [group.group_id, {
    ...group,
    item_ids: group.item_ids.filter((itemID) => !isNonScoringCrossPageParent(questionsByID.get(itemID))),
  }]));
  const orderedNodes = [...contract.presentation_nodes].sort((left, right) => left.display_order - right.display_order);
  const nodes = orderedNodes.flatMap<QuestionPresentationNode>((node) => {
    if (node.kind === 'question') {
      const question = questionsByID.get(node.ref_id)!;
      if (isNonScoringCrossPageParent(question)) return [];
      return [{
        kind: 'question',
        refId: node.ref_id,
        displayOrder: node.display_order,
        question,
        questions: [question],
        verdictCounts: countVerdicts([question]),
      }];
    }
    const group = groupsByID.get(node.ref_id)!;
    const questions = group.item_ids.map((itemID) => questionsByID.get(itemID)!);
    if (questions.length === 0) return [];
    return [{
      kind: 'material_group',
      refId: node.ref_id,
      displayOrder: node.display_order,
      group,
      questions,
      verdictCounts: countVerdicts(questions),
    }];
  });

  return {
    source: 'learning_artifacts_v1',
    contractStatus: contract.artifact_contract_status,
    warnings: [...contract.artifact_contract_warnings],
    materialGroups: [...groupsByID.values()].filter((group) => group.item_ids.length > 0),
    evidenceRegistry: contract.evidence_registry,
    nodes,
    questions: nodes.flatMap((node) => node.questions),
  };
};

const safeFlatQuestions = (payload: unknown): FallbackQuestion[] => {
  if (!isRecord(payload)) return [];
  const candidates = hasOwn(payload, 'artifact_contract_version')
    ? [payload.question_cards]
    : [payload.question_cards, payload.questions];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const seen = new Set<string>();
    const questions: FallbackQuestion[] = [];
    for (const value of candidate) {
      if (!isRecord(value) || !isNonEmptyString(value.item_id) || seen.has(value.item_id) ||
        isNonScoringCrossPageParent(value)) continue;
      seen.add(value.item_id);
      const safe: UnknownRecord = {};
      for (const key of FLAT_QUESTION_KEYS) {
        if (value[key] !== undefined && isSafeFlatQuestionField(key, value[key])) {
          safe[key] = cloneValue(value[key]);
        }
      }
      questions.push(safe as FallbackQuestion);
    }
    if (questions.length > 0) return questions;
  }
  return [];
};

const buildFallbackPresentation = (payload: unknown): QuestionPresentation => {
  const questions = safeFlatQuestions(payload);
  const nodes = questions.map<QuestionPresentationNode>((question, index) => ({
    kind: 'question',
    refId: question.item_id,
    displayOrder: index + 1,
    question,
    questions: [question],
    verdictCounts: countVerdicts([question]),
  }));
  const warnings = isRecord(payload) && isEnumArray(payload.artifact_contract_warnings, WARNING_CODES)
    ? [...payload.artifact_contract_warnings]
    : [];
  return {
    source: 'fallback',
    contractStatus: 'degraded',
    warnings,
    materialGroups: [],
    evidenceRegistry: [],
    nodes,
    questions,
  };
};

export const buildQuestionPresentation = (payload: unknown): QuestionPresentation => {
  const contract = validatedContract(payload);
  return contract ? buildV1Presentation(contract) : buildFallbackPresentation(payload);
};

export const findQuestionByItemId = (
  presentation: QuestionPresentation,
  itemId: string,
): PresentationQuestion | undefined => presentation.questions.find((question) => question.item_id === itemId);

export const findMaterialGroupForItem = (
  presentation: QuestionPresentation,
  itemId: string,
): MaterialGroup | undefined => presentation.materialGroups.find((group) => group.item_ids.includes(itemId));

export const createQuestionPresentation = buildQuestionPresentation;
