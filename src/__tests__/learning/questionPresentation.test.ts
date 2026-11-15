import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type {
  EvidenceRecord,
  LearningArtifactsContract,
  LearningQuestion,
  QuestionCard,
} from '@/services/types';
import {
  buildQuestionPresentation,
  countVerdicts,
  findMaterialGroupForItem,
  findQuestionByItemId,
} from '@/utils/questionPresentation';

const sha256 = (value: string): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const MATERIAL_TEXT = 'Authoritative passage.';
const HASH = sha256(MATERIAL_TEXT);

const primaryTag = () => ({
  tag_id: 'engv1:language-skill:reading-detail',
  taxonomy_version: 'english_universal_v1',
  canonical_path: 'Language skills/Reading/Detail',
  role: 'primary' as const,
});

const secondaryTag = (suffix: string) => ({
  tag_id: `engv1:language-skill:${suffix}`,
  taxonomy_version: 'english_universal_v1',
  canonical_path: `Language skills/Reading/${suffix}`,
  role: 'secondary' as const,
});

const feedback = (questionType: 'reading_choice' | 'unknown') => ({
  question_type: questionType,
  error_type: 'evidence' as const,
  error_types: ['evidence' as const],
  accepted_answers: ['A'],
  feedback_mode: 'answer_comparison' as const,
  keywords_used: [],
  semantic_score: null,
  similarity_mode: 'none' as const,
  evidence: [MATERIAL_TEXT],
  evidence_refs: ['ev-material'],
  slot_feedback: [],
  rubric_feedback: [],
});

const materialQuestion = (
  itemId: string,
  verdict: 'incorrect' | 'uncertain',
  position: number,
): LearningQuestion => ({
  item_id: itemId,
  question_number: itemId,
  page_index: 0,
  subject: 'english',
  display_mode: 'material_group',
  material_group_id: 'group-reading',
  group_position: position,
  answer_mode: 'choice_single',
  question_type: 'reading_choice',
  question_text: `Question ${itemId}`,
  question_content: `Question ${itemId}`,
  options: [
    { option_id: 'A', text: 'Answer A', evidence_refs: [] },
    { option_id: 'B', text: 'Answer B', evidence_refs: [] },
  ],
  student_answer: 'B',
  student_answer_payload: {
    mode: 'choice_single',
    selections: [{ value: 'B', evidence_refs: [] }],
    evidence_refs: [],
  },
  reference_answer_payload: {
    mode: 'choice_single',
    selections: [{ value: 'A', evidence_refs: [] }],
    evidence_refs: [],
  },
  accepted_answer_payloads: [
    { mode: 'choice_single', selections: [{ value: 'A', evidence_refs: [] }], evidence_refs: [] },
  ],
  answer_state: 'has_answer',
  verdict,
  verdict_source: 'model',
  grading_confidence: 0.9,
  reason: 'The answer conflicts with the passage.',
  judgment_basis: ['Authoritative passage.'],
  knowledge_tags: [primaryTag().canonical_path],
  knowledge_tag_items: [primaryTag()],
  evidence_refs: ['ev-material'],
  contract_provenance: 'native_v1',
  degradation_reasons: [],
  english_feedback: feedback('reading_choice'),
});

const simpleQuestion = (): LearningQuestion => ({
  item_id: 'item-simple',
  question_number: '1',
  page_index: 0,
  subject: 'english',
  display_mode: 'simple_question',
  answer_mode: 'unknown',
  question_type: 'unknown',
  question_text: 'Standalone question',
  question_content: 'Standalone question',
  options: [],
  student_answer: 'legacy-safe',
  student_answer_payload: { mode: 'unknown', text: 'legacy-safe', evidence_refs: [] },
  accepted_answer_payloads: [],
  answer_state: 'has_answer',
  verdict: 'correct',
  verdict_source: 'model',
  judgment_basis: [],
  knowledge_tags: [primaryTag().canonical_path],
  knowledge_tag_items: [primaryTag()],
  evidence_refs: [],
  contract_provenance: 'native_v1',
  degradation_reasons: [],
  english_feedback: feedback('unknown'),
});

const completeContract = (): LearningArtifactsContract => ({
  artifact_contract_version: 'learning_artifacts_v1',
  artifact_contract_revision: 4,
  artifact_contract_provenance: 'native_v1',
  artifact_contract_status: 'complete',
  artifact_contract_warnings: [],
  material_groups: [
    {
      group_id: 'group-reading',
      title: 'Reading',
      material_type: 'passage',
      display_order: 1,
      page_indices: [0],
      status: 'complete',
      warnings: [],
      materials: [
        {
          material_id: 'material-reading',
          kind: 'passage',
          display_order: 1,
          text: MATERIAL_TEXT,
          evidence_refs: ['ev-material'],
        },
      ],
      item_ids: ['item-b', 'item-a'],
    },
  ],
  evidence_registry: [
    {
      evidence_id: 'ev-material',
      owner_type: 'material',
      owner_id: 'material-reading',
      role: 'material',
      kind: 'text_span',
      canonicalization_version: 'evidence_v1',
      source_text_id: 'material:material-reading:text',
      span_start: 0,
      span_end: 22,
      text: MATERIAL_TEXT,
      content_hash: HASH,
    },
  ],
  presentation_nodes: [
    { node_id: 'node-simple', kind: 'question', ref_id: 'item-simple', display_order: 2 },
    { node_id: 'node-group', kind: 'material_group', ref_id: 'group-reading', display_order: 1 },
  ],
  questions: [
    materialQuestion('item-a', 'incorrect', 2),
    simpleQuestion(),
    materialQuestion('item-b', 'uncertain', 1),
  ],
  question_cards: [],
});

const scienceTag = (subject: 'physics' | 'chemistry') => {
  const physics = subject === 'physics';
  const domain = physics ? '运动和相互作用' : '物质的性质与应用';
  const category = physics ? '电与磁' : '常见的物质';
  const leaf = physics ? '串并联电路' : '气体的制取';
  return {
    id: `${domain}/${category}/${leaf}`,
    tag_id: `${subject}:science-tag`,
    taxonomy_version: `${subject}_cn_secondary_v1`,
    name: leaf,
    canonical_path: `${domain}/${category}/${leaf}`,
    primary_domain: domain,
    category_id: `${domain}/${category}`,
    category_name: category,
    leaf_name: leaf,
  };
};

const scienceQuestion = (
  subject: 'physics' | 'chemistry',
  fields: Record<string, unknown> = {},
) => ({
  item_id: `p1:q:${subject === 'physics' ? '12(1)' : '8'}`,
  question_number: subject === 'physics' ? '12(1)' : '8',
  page_index: 0,
  subject,
  display_mode: 'simple_question',
  answer_mode: 'unknown',
  question_type: subject === 'physics' ? 'experiment' : 'apparatus_selection',
  question_text: subject === 'physics' ? '根据电路图判断灯泡亮度。' : '选择正确的气体收集装置。',
  question_content: subject === 'physics' ? '根据电路图判断灯泡亮度。' : '选择正确的气体收集装置。',
  student_answer: subject === 'physics' ? 'L1 更亮' : '向上排空气法',
  answer_state: 'has_answer',
  verdict: 'correct',
  verdict_source: 'model',
  reason: '作答与实验条件一致。',
  judgment_basis: ['依据来源：题干与装置图'],
  knowledge_tags: [scienceTag(subject).canonical_path],
  knowledge_tag_items: [scienceTag(subject)],
  evidence_refs: [],
  contract_provenance: 'native_v1',
  ...fields,
});

const scienceMaterialContract = (): unknown => {
  const question = scienceQuestion('physics', {
    display_mode: 'material_group',
    material_group_id: 'mg:science:experiment-12',
    group_position: 1,
    evidence_refs: ['ev-question-diagram'],
  });
  return {
    subject: 'physics',
    artifact_contract_version: 'learning_artifacts_v1',
    artifact_contract_revision: 1,
    artifact_contract_provenance: 'native_v1',
    artifact_contract_status: 'complete',
    artifact_contract_warnings: [],
    material_groups: [{
      group_id: 'mg:science:experiment-12',
      title: '电路实验',
      material_type: 'diagram',
      display_order: 1,
      page_indices: [0],
      status: 'complete',
      warnings: [],
      materials: [{
        material_id: 'mat:science:circuit',
        kind: 'diagram',
        display_order: 1,
        text: '闭合开关后观察两个灯泡。',
        evidence_refs: ['ev-material-diagram'],
      }],
      item_ids: [question.item_id],
    }],
    evidence_registry: [
      {
        evidence_id: 'ev-material-diagram',
        owner_type: 'material',
        owner_id: 'mat:science:circuit',
        role: 'material',
        kind: 'bbox',
        canonicalization_version: 'evidence_v1',
        page_index: 0,
        storage_ref: '/api/v1/files/circuit.png',
        image_url: '/api/v1/files/circuit-slice.png',
        bbox: { x: 0.1, y: 0.1, width: 0.7, height: 0.35, unit: 'normalized' },
        content_hash: sha256('material-diagram'),
      },
      {
        evidence_id: 'ev-question-diagram',
        owner_type: 'question',
        owner_id: question.item_id,
        role: 'question',
        kind: 'bbox',
        canonicalization_version: 'evidence_v1',
        page_index: 0,
        storage_ref: '/api/v1/files/circuit.png',
        image_url: '/api/v1/files/question-slice.png',
        bbox: { x: 0.1, y: 0.5, width: 0.7, height: 0.25, unit: 'normalized' },
        content_hash: sha256('question-diagram'),
      },
    ],
    presentation_nodes: [{
      node_id: 'node:science:experiment-12',
      kind: 'material_group',
      ref_id: 'mg:science:experiment-12',
      display_order: 1,
    }],
    questions: [question],
    question_cards: [],
  };
};

const standaloneScienceContract = (): unknown => {
  const question = scienceQuestion('chemistry', { evidence_refs: ['ev-question-apparatus'] });
  return {
    subject: 'chemistry',
    artifact_contract_version: 'learning_artifacts_v1',
    artifact_contract_revision: 1,
    artifact_contract_provenance: 'native_v1',
    artifact_contract_status: 'complete',
    artifact_contract_warnings: [],
    material_groups: [],
    evidence_registry: [{
      evidence_id: 'ev-question-apparatus',
      owner_type: 'question',
      owner_id: question.item_id,
      role: 'question',
      kind: 'bbox',
      canonicalization_version: 'evidence_v1',
      page_index: 0,
      storage_ref: '/api/v1/files/apparatus.png',
      image_url: '/api/v1/files/apparatus-slice.png',
      bbox: { x: 0.15, y: 0.15, width: 0.65, height: 0.45, unit: 'normalized' },
      content_hash: sha256('apparatus'),
    }],
    presentation_nodes: [{
      node_id: 'node:science:question-8',
      kind: 'question',
      ref_id: question.item_id,
      display_order: 1,
    }],
    questions: [question],
    question_cards: [],
  };
};

const realCoreNilSliceContract = (): unknown => {
  const contract = completeContract();
  const questionNumbers: Record<string, string> = {
    'item-b': 'I.1',
    'item-a': 'I.2',
    'item-simple': 'II.1',
  };
  return {
    ...contract,
    submission_id: 'upl_cc7f6757bb2089cf',
    questions: contract.questions.map((question) => {
      const persisted = {
        ...question,
        question_number: questionNumbers[question.item_id],
        options: question.item_id === 'item-a'
          ? question.options.map((option) => ({
              option_id: option.option_id,
              text: option.text,
              evidence_candidate_refs: [],
            }))
          : null,
        evidence_refs: null,
        english_feedback: {
          question_type: question.english_feedback?.question_type,
          reference_answer: 'A',
          explanation: '答案正确。',
          feedback_mode: 'answer_comparison',
          similarity_mode: 'none',
          evidence_refs: [],
        },
      } as Record<string, unknown>;
      delete persisted.accepted_answer_payloads;
      delete persisted.verdict_source;
      return persisted;
    }),
  };
};

const safeCard = (): QuestionCard => ({
  item_id: 'safe-card',
  question_number: '1',
  page_index: 0,
  verdict: 'uncertain',
});

const withSafeFallback = (payload: object): unknown => ({ ...payload, question_cards: [safeCard()] });

const replaceQuestion = (itemId: string, fields: Record<string, unknown>): unknown => {
  const contract = completeContract();
  return withSafeFallback({
    ...contract,
    questions: contract.questions.map((question) =>
      question.item_id === itemId ? { ...question, ...fields } : question,
    ),
  });
};

const replaceFeedback = (fields: Record<string, unknown>): unknown => {
  const contract = completeContract();
  return withSafeFallback({
    ...contract,
    questions: contract.questions.map((question) =>
      question.item_id === 'item-a'
        ? { ...question, english_feedback: { ...question.english_feedback, ...fields } }
        : question,
    ),
  });
};

const completeWritingFeedback = () => ({
  question_type: 'writing',
  error_types: ['grammar', 'vocabulary'],
  accepted_answers: [],
  feedback_mode: 'rubric',
  keywords_used: [],
  semantic_score: null,
  similarity_mode: 'none',
  evidence: [],
  evidence_refs: [],
  slot_feedback: [],
  evaluation_status: 'complete',
  overall_assessment: '文章完成了主要任务。',
  strengths: ['主要信息完整'],
  representative_corrections: [
    { original: 'I am agree.', corrected: 'I agree.', explanation: 'agree 是动词。' },
    { original: 'It make me happy.', corrected: 'It makes me happy.', explanation: '注意主谓一致。' },
    { original: 'I very like it.', corrected: 'I like it very much.', explanation: '调整副词位置。' },
  ],
  improved_answer: 'I agree. It makes me happy, and I like it very much.',
  rubric_feedback: [
    { dimension: 'task_completion', judgment: 'meets', feedback: '完成任务。', score: null, max_score: null },
    { dimension: 'content', judgment: 'partly_meets', feedback: '可增加细节。', score: null, max_score: null },
    { dimension: 'organization', judgment: 'meets', feedback: '顺序清楚。', score: null, max_score: null },
    { dimension: 'grammar', judgment: 'partly_meets', feedback: '注意主谓一致。', score: null, max_score: null },
    { dimension: 'vocabulary', judgment: 'partly_meets', feedback: '改善搭配。', score: null, max_score: null },
  ],
});

const replaceGroup = (fields: Record<string, unknown>): unknown => {
  const contract = completeContract();
  return withSafeFallback({
    ...contract,
    material_groups: contract.material_groups.map((group) => ({ ...group, ...fields })),
  });
};

const replaceMaterial = (fields: Record<string, unknown>): unknown => {
  const contract = completeContract();
  return withSafeFallback({
    ...contract,
    material_groups: contract.material_groups.map((group) => ({
      ...group,
      materials: group.materials.map((material) => ({ ...material, ...fields })),
    })),
  });
};

const replaceEvidence = (evidence: unknown): unknown => {
  const contract = completeContract();
  return withSafeFallback({ ...contract, evidence_registry: [evidence] });
};

const contractWithEmptyMaterials = (): LearningArtifactsContract => {
  const contract = completeContract();
  const questionText = 'Question item-a';
  return {
    ...contract,
    material_groups: contract.material_groups.map((group) => ({ ...group, materials: [] })),
    evidence_registry: [{
      evidence_id: 'ev-material',
      owner_type: 'question',
      owner_id: 'item-a',
      role: 'question',
      kind: 'text_span',
      canonicalization_version: 'evidence_v1',
      source_text_id: 'question:item-a:text',
      span_start: 0,
      span_end: Array.from(questionText).length,
      text: questionText,
      content_hash: sha256(questionText),
    }],
  };
};

const degradedMissingMaterialContract = (): LearningArtifactsContract => {
  const contract = contractWithEmptyMaterials();
  return {
    ...contract,
    artifact_contract_status: 'degraded',
    artifact_contract_warnings: ['missing_material'],
    material_groups: contract.material_groups.map((group) => ({
      ...group,
      status: 'degraded',
      warnings: ['missing_material'],
    })),
    questions: contract.questions.map((question) => question.display_mode === 'material_group'
      ? { ...question, verdict: 'uncertain', degradation_reasons: ['missing_material'] }
      : question),
  };
};

const expectConservativeFallback = (payload: unknown): void => {
  const presentation = buildQuestionPresentation(payload);
  expect(presentation.source).toBe('fallback');
  expect(presentation.contractStatus).toBe('degraded');
  expect(presentation.questions.map((item) => item.item_id)).toEqual(['safe-card']);
  expect(presentation.materialGroups).toEqual([]);
  expect(presentation.evidenceRegistry).toEqual([]);
};

const deepFreeze = (value: unknown): unknown => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

describe('buildQuestionPresentation', () => {
  it('consumes a Core-native Physics material group with generic taxonomy tags', () => {
    const presentation = buildQuestionPresentation(scienceMaterialContract());

    expect(presentation.source).toBe('learning_artifacts_v1');
    expect(presentation.materialGroups).toHaveLength(1);
    expect(presentation.evidenceRegistry).toHaveLength(2);
    expect(presentation.nodes[0]?.kind).toBe('material_group');
    expect(presentation.questions[0]).toMatchObject({
      subject: 'physics',
      question_type: 'experiment',
      options: [],
      accepted_answer_payloads: [],
      degradation_reasons: [],
      knowledge_tag_items: [{
        taxonomy_version: 'physics_cn_secondary_v1',
        canonical_path: '运动和相互作用/电与磁/串并联电路',
      }],
    });
    expect(findMaterialGroupForItem(presentation, 'p1:q:12(1)')?.group_id).toBe(
      'mg:science:experiment-12',
    );
  });

  it.each(['physics', 'chemistry'] as const)(
    'preserves a %s uncertain result without discarding its canonical evidence',
    (subject) => {
      const payload = subject === 'physics'
        ? scienceMaterialContract()
        : standaloneScienceContract();
      const contract = payload as {
        questions: Array<Record<string, unknown>>;
      };
      contract.questions[0] = {
        ...contract.questions[0],
        verdict: 'uncertain',
        degradation_reasons: ['recognition_uncertain'],
      };

      const presentation = buildQuestionPresentation(payload);

      expect(presentation.source).toBe('learning_artifacts_v1');
      expect(presentation.questions[0]?.verdict).toBe('uncertain');
      expect(presentation.evidenceRegistry).not.toHaveLength(0);
    },
  );

  it.each([
    ['envelope and question subjects disagree', () => ({
      ...(scienceMaterialContract() as Record<string, unknown>),
      subject: 'chemistry',
    })],
    ['questions contain mixed science subjects', () => {
      const contract = scienceMaterialContract() as Record<string, unknown> & {
        questions: Array<Record<string, unknown>>;
      };
      contract.questions = [
        ...contract.questions,
        scienceQuestion('chemistry', {
          item_id: 'p1:q:13',
          question_number: '13',
          page_index: 0,
        }),
      ];
      contract.presentation_nodes = [
        ...((contract.presentation_nodes as Array<Record<string, unknown>>) || []),
        { node_id: 'node:science:question-13', kind: 'question', ref_id: 'p1:q:13', display_order: 2 },
      ];
      return contract;
    }],
    ['Physics question uses Chemistry taxonomy', () => {
      const contract = scienceMaterialContract() as Record<string, unknown> & {
        questions: Array<Record<string, unknown>>;
      };
      contract.questions[0] = {
        ...contract.questions[0],
        knowledge_tag_items: [scienceTag('chemistry')],
        knowledge_tags: [scienceTag('chemistry').canonical_path],
      };
      return contract;
    }],
    ['science canonical path is not three levels', () => {
      const contract = scienceMaterialContract() as Record<string, unknown> & {
        questions: Array<Record<string, unknown>>;
      };
      contract.questions[0] = {
        ...contract.questions[0],
        knowledge_tag_items: [{
          ...scienceTag('physics'),
          canonical_path: '电磁学/串并联',
        }],
        knowledge_tags: ['电磁学/串并联'],
      };
      return contract;
    }],
    ['science raw tags disagree with structured tags', () => {
      const contract = scienceMaterialContract() as Record<string, unknown> & {
        questions: Array<Record<string, unknown>>;
      };
      contract.questions[0] = {
        ...contract.questions[0],
        knowledge_tags: ['力学/运动定律/牛顿第二定律'],
      };
      return contract;
    }],
  ])('rejects an incoherent science contract: %s', (_name, payload) => {
    expect(buildQuestionPresentation(payload()).source).toBe('fallback');
  });

  it('consumes standalone Chemistry question evidence without an English payload', () => {
    const presentation = buildQuestionPresentation(standaloneScienceContract());

    expect(presentation.source).toBe('learning_artifacts_v1');
    expect(presentation.nodes[0]?.kind).toBe('question');
    expect(presentation.evidenceRegistry[0]).toMatchObject({
      owner_type: 'question',
      role: 'question',
      image_url: '/api/v1/files/apparatus-slice.png',
    });
    expect(presentation.questions[0]).toMatchObject({
      subject: 'chemistry',
      question_type: 'apparatus_selection',
      options: [],
      accepted_answer_payloads: [],
    });
  });

  it('accepts the structured qualitative writing evaluation contract', () => {
    const payload = replaceQuestion('item-simple', {
      answer_mode: 'writing',
      question_type: 'writing',
      question_text: 'Write an email about your school trip.',
      question_content: 'Write an email about your school trip.',
      student_answer: 'I am agree. It make me happy. I very like it.',
      student_answer_payload: {
        mode: 'writing', text: 'I am agree. It make me happy. I very like it.', evidence_refs: [],
      },
      verdict: 'uncertain',
      english_feedback: completeWritingFeedback(),
    });

    const presentation = buildQuestionPresentation(payload);

    expect(presentation.source).toBe('learning_artifacts_v1');
    expect(findQuestionByItemId(presentation, 'item-simple')?.english_feedback).toMatchObject({
      evaluation_status: 'complete',
      overall_assessment: '文章完成了主要任务。',
    });
  });

  it('rejects incomplete representative writing corrections', () => {
    const feedback = completeWritingFeedback();
    feedback.representative_corrections[0] = {
      original: 'I am agree.', corrected: '', explanation: 'agree 是动词。',
    };
    const payload = replaceQuestion('item-simple', {
      answer_mode: 'writing',
      question_type: 'writing',
      student_answer_payload: { mode: 'writing', text: 'I am agree.', evidence_refs: [] },
      english_feedback: feedback,
    });

    expect(buildQuestionPresentation(payload).source).toBe('fallback');
  });
  it('consumes complete v1 using presentation and group ordering as authoritative', () => {
    const presentation = buildQuestionPresentation(completeContract());

    expect(presentation.source).toBe('learning_artifacts_v1');
    expect(presentation.contractStatus).toBe('complete');
    expect(presentation.nodes.map((node) => node.refId)).toEqual(['group-reading', 'item-simple']);
    expect(presentation.questions.map((item) => item.item_id)).toEqual(['item-b', 'item-a', 'item-simple']);
    expect(presentation.nodes[0]?.questions.map((item) => item.item_id)).toEqual(['item-b', 'item-a']);
    expect(presentation.nodes[0]?.verdictCounts).toEqual({ total: 2, correct: 0, incorrect: 1, uncertain: 1 });
    expect(countVerdicts(presentation.questions)).toEqual({ total: 3, correct: 1, incorrect: 1, uncertain: 1 });
  });

  it('does not count a structural cross-page parent as a scored question', () => {
    expect(countVerdicts([
      {
        item_id: 'p1:q:5', question_number: '5', page_index: 0,
        relation_type: 'cross_page_parent', verdict: 'uncertain',
      },
      {
        item_id: 'p2:q:5(A)', question_number: '5(A)', page_index: 1,
        relation_type: 'cross_page_continuation', verdict: 'correct',
      },
      {
        item_id: 'p2:q:5(B)', question_number: '5(B)', page_index: 1,
        relation_type: 'cross_page_continuation', verdict: 'incorrect',
      },
    ])).toEqual({ total: 2, correct: 1, incorrect: 1, uncertain: 0 });
  });

  it('does not count a science background stem as a scored question', () => {
    expect(countVerdicts([
      {
        item_id: 'p1:q:3', question_number: '3', page_index: 0,
        relation_type: 'non_scoring_context', verdict: 'incorrect',
      },
      {
        item_id: 'p1:q:4', question_number: '4', page_index: 0,
        verdict: 'correct',
      },
    ])).toEqual({ total: 1, correct: 1, incorrect: 0, uncertain: 0 });
  });

  it('omits a structural Science parent from material-group question navigation', () => {
    const contract = scienceMaterialContract() as {
      questions: Array<Record<string, unknown>>;
      material_groups: Array<Record<string, unknown>>;
    };
    const childItemID = 'p1:q:12(1)';
    const child = { ...contract.questions[0]!, group_position: 2 };
    const parent = scienceQuestion('physics', {
      item_id: 'p1:q:12',
      question_number: '12',
      display_mode: 'material_group',
      material_group_id: 'mg:science:experiment-12',
      group_position: 1,
      relation_type: 'cross_page_parent',
      student_answer: '',
      answer_state: 'blank',
      verdict: 'uncertain',
      needs_review: true,
      evidence_refs: [],
    });
    contract.questions = [parent, child];
    contract.material_groups[0] = {
      ...contract.material_groups[0],
      item_ids: [parent.item_id, childItemID],
    };

    const presentation = buildQuestionPresentation(contract);

    expect(presentation.source).toBe('learning_artifacts_v1');
    expect(presentation.questions.map((question) => question.item_id)).toEqual([childItemID]);
    expect(presentation.nodes[0]?.questions.map((question) => question.item_id)).toEqual([childItemID]);
    expect(presentation.materialGroups[0]?.item_ids).toEqual([childItemID]);
  });

  it('omits a standalone structural Science parent from result navigation', () => {
    const contract = standaloneScienceContract() as Record<string, unknown> & {
      questions: Array<Record<string, unknown>>;
      presentation_nodes: Array<Record<string, unknown>>;
    };
    contract.questions[0] = {
      ...contract.questions[0],
      relation_type: 'cross_page_parent',
      student_answer: '',
      answer_state: 'blank',
      verdict: 'uncertain',
    };

    const presentation = buildQuestionPresentation(contract);

    expect(presentation.source).toBe('learning_artifacts_v1');
    expect(presentation.questions).toEqual([]);
    expect(presentation.nodes).toEqual([]);
  });

  it('normalizes persisted Go nil slices and keeps presentation_nodes order authoritative', () => {
    const presentation = buildQuestionPresentation(realCoreNilSliceContract());

    expect(presentation.source).toBe('learning_artifacts_v1');
    expect(presentation.questions.map((question) => question.question_number)).toEqual([
      'I.1',
      'I.2',
      'II.1',
    ]);
    expect(presentation.questions[0]).toMatchObject({
      options: [],
      accepted_answer_payloads: [],
      evidence_refs: [],
      verdict_source: 'model',
      english_feedback: {
        error_types: [],
        accepted_answers: [],
        keywords_used: [],
        semantic_score: null,
        evidence: [],
        evidence_refs: [],
        slot_feedback: [],
        rubric_feedback: [],
      },
    });
    expect((presentation.questions[1] as LearningQuestion).options[0]?.evidence_refs).toEqual([]);
  });

  it('carries canonical question-card review lifecycle without replacing structured question text', () => {
    const contract = completeContract();
    contract.question_cards = [{
      item_id: 'item-a',
      question_number: 'item-a',
      page_index: 0,
      verdict: 'incorrect',
      card_state: 'review_pending',
      question_content: 'Flattened card text must not replace the canonical question.',
      needs_review: true,
      review_summary: '题目图片切片正在生成。',
    }];

    const presentation = buildQuestionPresentation(contract);
    const question = findQuestionByItemId(presentation, 'item-a') as LearningQuestion & QuestionCard;

    expect(question.question_text).toBe('Question item-a');
    expect(question.question_content).toBe('Question item-a');
    expect(question).toMatchObject({
      card_state: 'review_pending',
      needs_review: true,
      review_summary: '题目图片切片正在生成。',
    });
  });

  it('consumes degraded v1 while keeping every collection non-null', () => {
    const contract = completeContract();
    const payload: LearningArtifactsContract = {
      ...contract,
      artifact_contract_status: 'degraded',
      artifact_contract_provenance: 'mixed',
      artifact_contract_warnings: ['provider_output_degraded'],
    };

    const presentation = buildQuestionPresentation(payload);

    expect(presentation.source).toBe('learning_artifacts_v1');
    expect(presentation.contractStatus).toBe('degraded');
    expect(presentation.warnings).toEqual(['provider_output_degraded']);
    expect(presentation.materialGroups).toBeInstanceOf(Array);
    expect(presentation.evidenceRegistry).toBeInstanceOf(Array);
    expect(presentation.nodes).toBeInstanceOf(Array);
    expect(presentation.questions).toBeInstanceOf(Array);
  });

  it('consumes a valid degraded legacy-fallback v1 projection without re-inferring it', () => {
    const contract = completeContract();
    const payload: LearningArtifactsContract = {
      ...contract,
      artifact_contract_status: 'degraded',
      artifact_contract_provenance: 'legacy_fallback',
      artifact_contract_revision: 0,
      artifact_contract_warnings: ['legacy_fallback_v1'],
    };

    const presentation = buildQuestionPresentation(payload);

    expect(presentation.source).toBe('learning_artifacts_v1');
    expect(presentation.contractStatus).toBe('degraded');
    expect(presentation.questions.map((item) => item.item_id)).toEqual(['item-b', 'item-a', 'item-simple']);
  });

  it.each([
    ['mixed provenance marked complete', () => withSafeFallback({
      ...completeContract(), artifact_contract_provenance: 'mixed', artifact_contract_status: 'complete',
    })],
    ['complete envelope with warnings', () => withSafeFallback({
      ...completeContract(), artifact_contract_warnings: ['provider_output_degraded'],
    })],
    ['complete envelope with a degraded group', () => replaceGroup({ status: 'degraded' })],
    ['complete group carrying warnings', () => replaceGroup({ warnings: ['partial_cross_page_group'] })],
    ['complete group without materials', () => withSafeFallback(contractWithEmptyMaterials())],
    ['group without persisted page indices', () => replaceGroup({ page_indices: [] })],
    ['degraded envelope without a degradation cause', () => withSafeFallback({
      ...completeContract(), artifact_contract_status: 'degraded',
    })],
  ])('rejects impossible persisted status semantics: %s', (_name, payload) => {
    expectConservativeFallback(payload());
  });

  it('accepts a normalized degraded empty-material group', () => {
    const presentation = buildQuestionPresentation(degradedMissingMaterialContract());

    expect(presentation.source).toBe('learning_artifacts_v1');
    expect(presentation.contractStatus).toBe('degraded');
    expect(presentation.materialGroups[0]?.materials).toEqual([]);
    expect(presentation.nodes[0]?.questions.map((question) => question.verdict)).toEqual(['uncertain', 'uncertain']);
  });

  it.each([
    ['missing group and envelope warnings', () => {
      const contract = degradedMissingMaterialContract();
      return withSafeFallback({
        ...contract,
        artifact_contract_warnings: [],
        material_groups: contract.material_groups.map((group) => ({ ...group, warnings: [] })),
      });
    }],
    ['non-uncertain dependent question', () => {
      const contract = degradedMissingMaterialContract();
      return withSafeFallback({
        ...contract,
        questions: contract.questions.map((question) => question.item_id === 'item-a'
          ? { ...question, verdict: 'incorrect' }
          : question),
      });
    }],
    ['missing dependent degradation reason', () => {
      const contract = degradedMissingMaterialContract();
      return withSafeFallback({
        ...contract,
        questions: contract.questions.map((question) => question.item_id === 'item-a'
          ? { ...question, degradation_reasons: [] }
          : question),
      });
    }],
    ['empty page indices despite available questions', () => {
      const contract = degradedMissingMaterialContract();
      return withSafeFallback({
        ...contract,
        material_groups: contract.material_groups.map((group) => ({ ...group, page_indices: [] })),
      });
    }],
  ])('rejects malformed degraded empty-material semantics: %s', (_name, payload) => {
    expectConservativeFallback(payload());
  });

  it.each([
    ['invalid status', () => withSafeFallback({ ...completeContract(), artifact_contract_status: 'invalid' })],
    ['unknown version', () => withSafeFallback({ ...completeContract(), artifact_contract_version: 'learning_artifacts_v2' })],
    ['malformed complete core array', () => withSafeFallback({ ...completeContract(), material_groups: null })],
    ['malformed degraded nested array', () => {
      const contract = completeContract();
      return withSafeFallback({
        ...contract,
        artifact_contract_status: 'degraded',
        artifact_contract_provenance: 'mixed',
        questions: contract.questions.map((question) =>
          question.item_id === 'item-a' ? { ...question, options: 'invalid' } : question,
        ),
      });
    }],
  ])('falls back safely for %s', (_name, payload) => {
    expectConservativeFallback(payload());
  });

  it('does not interpret canonical questions from an unknown contract version without safe cards', () => {
    const payload = {
      ...completeContract(),
      artifact_contract_version: 'learning_artifacts_v2',
      question_cards: [],
    };

    const presentation = buildQuestionPresentation(payload);

    expect(presentation.source).toBe('fallback');
    expect(presentation.questions).toEqual([]);
    expect(presentation.nodes).toEqual([]);
  });

  it.each([
    ['answer mode', () => replaceQuestion('item-a', { answer_mode: 'essay' })],
    ['question type', () => replaceQuestion('item-a', { question_type: 'reading_magic' })],
    ['answer state', () => replaceQuestion('item-a', { answer_state: 'answered' })],
    ['verdict source', () => replaceQuestion('item-a', { verdict_source: 'teacher_guess' })],
    ['question provenance', () => replaceQuestion('item-a', { contract_provenance: 'generated' })],
    ['feedback mode', () => replaceFeedback({ feedback_mode: 'comparison' })],
    ['similarity mode', () => replaceFeedback({ similarity_mode: 'loose' })],
    ['feedback error type', () => replaceFeedback({ error_type: 'syntax_magic' })],
    ['material type', () => replaceGroup({ material_type: 'article' })],
    ['material status', () => replaceGroup({ status: 'partial' })],
    ['material kind', () => replaceMaterial({ kind: 'article' })],
    ['warning code', () => replaceGroup({ warnings: ['free_text_warning'] })],
    ['presentation kind', () => {
      const contract = completeContract();
      return withSafeFallback({
        ...contract,
        presentation_nodes: contract.presentation_nodes.map((node, index) =>
          index === 0 ? { ...node, kind: 'section' } : node,
        ),
      });
    }],
  ])('rejects invalid enum: %s', (_name, payload) => {
    expectConservativeFallback(payload());
  });

  it.each([
    ['matching payload without mappings', () => replaceQuestion('item-a', {
      answer_mode: 'matching',
      student_answer_payload: { mode: 'matching', mappings: null },
      reference_answer_payload: { mode: 'matching', mappings: [{ left_id: 'L1', right_id: 'R1' }] },
      accepted_answer_payloads: [],
    })],
    ['fill payload with malformed slots', () => replaceQuestion('item-a', {
      answer_mode: 'fill_text',
      student_answer_payload: { mode: 'fill_text', slots: [{ slot_id: 'blank-1', value: 42 }] },
      reference_answer_payload: { mode: 'fill_text', slots: [{ slot_id: 'blank-1', value: 'went' }] },
      accepted_answer_payloads: [],
    })],
    ['text payload without text', () => replaceQuestion('item-a', {
      answer_mode: 'translation',
      student_answer_payload: { mode: 'translation' },
      reference_answer_payload: { mode: 'translation', text: 'Reference' },
      accepted_answer_payloads: [],
    })],
    ['payload mode mismatch', () => replaceQuestion('item-a', {
      student_answer_payload: { mode: 'translation', text: 'Answer' },
    })],
    ['multiple one-of fields', () => replaceQuestion('item-a', {
      student_answer_payload: { mode: 'choice_single', selections: [{ value: 'A' }], text: 'A' },
    })],
    ['invalid accepted payloads', () => replaceQuestion('item-a', { accepted_answer_payloads: 'A' })],
    ['accepted payload mode mismatch', () => replaceQuestion('item-a', {
      accepted_answer_payloads: [{ mode: 'translation', text: 'A' }],
    })],
  ])('rejects malformed answer payload: %s', (_name, payload) => {
    expectConservativeFallback(payload());
  });

  it.each([
    ['invalid required feedback array', () => replaceFeedback({ error_types: 'evidence' })],
    ['question type mismatch', () => replaceFeedback({ question_type: 'translation' })],
    ['invalid slot feedback', () => replaceFeedback({
      slot_feedback: [{
        slot_id: '', verdict: 'incorrect', accepted_answers: [], error_types: [], evidence_refs: [],
      }],
    })],
    ['invalid rubric dimension', () => replaceFeedback({
      rubric_feedback: [{
        dimension: 'style_magic', judgment: 'meets', feedback: 'Clear.', score: null, max_score: null,
      }],
    })],
    ['incomplete rubric score pair', () => replaceFeedback({
      rubric_feedback: [{
        dimension: 'grammar', judgment: 'partly_meets', feedback: 'Review tense.', score: 1, max_score: null,
      }],
    })],
    ['invalid knowledge tag', () => replaceQuestion('item-a', {
      knowledge_tag_items: [{ tag_id: '', taxonomy_version: 'english_universal_v1', canonical_path: '', role: 'primary' }],
    })],
  ])('rejects malformed feedback or knowledge metadata: %s', (_name, payload) => {
    expectConservativeFallback(payload());
  });

  it.each([
    ['empty tags in a complete envelope', () => replaceQuestion('item-simple', {
      knowledge_tags: [], knowledge_tag_items: [],
    })],
    ['no primary tag', () => replaceQuestion('item-simple', {
      knowledge_tag_items: [secondaryTag('secondary-only')],
    })],
    ['multiple primary tags', () => replaceQuestion('item-simple', {
      knowledge_tag_items: [primaryTag(), { ...secondaryTag('other-primary'), role: 'primary' }],
    })],
    ['more than two secondary tags', () => replaceQuestion('item-simple', {
      knowledge_tag_items: [
        primaryTag(), secondaryTag('secondary-1'), secondaryTag('secondary-2'), secondaryTag('secondary-3'),
      ],
    })],
  ])('rejects impossible persisted knowledge tags: %s', (_name, payload) => {
    expectConservativeFallback(payload());
  });

  it('accepts empty knowledge tags only with degraded knowledge_tag_missing semantics', () => {
    const contract = completeContract();
    const presentation = buildQuestionPresentation({
      ...contract,
      artifact_contract_status: 'degraded',
      artifact_contract_warnings: ['knowledge_tag_missing'],
      questions: contract.questions.map((question) => question.item_id === 'item-simple'
        ? {
          ...question,
          knowledge_tags: [],
          knowledge_tag_items: [],
          degradation_reasons: ['knowledge_tag_missing'],
        }
        : question),
    });

    expect(presentation.source).toBe('learning_artifacts_v1');
    expect(presentation.contractStatus).toBe('degraded');
  });

  it.each([
    ['group position does not match item_ids', () => replaceQuestion('item-a', { group_position: 1 })],
    ['group ID does not match group', () => replaceQuestion('item-a', { material_group_id: 'group-other' })],
    ['simple question retains group ID', () => replaceQuestion('item-simple', { material_group_id: 'group-reading' })],
    ['simple question retains group position', () => replaceQuestion('item-simple', { group_position: 1 })],
    ['null group materials', () => replaceGroup({ materials: null })],
    ['null material evidence refs', () => replaceMaterial({ evidence_refs: null })],
    ['malformed presentation node', () => {
      const contract = completeContract();
      return withSafeFallback({
        ...contract,
        presentation_nodes: contract.presentation_nodes.map((node, index) =>
          index === 0 ? { ...node, node_id: '', display_order: '1' } : node,
        ),
      });
    }],
    ['copied questions on a group', () => replaceGroup({ questions: [materialQuestion('copied', 'uncertain', 1)] })],
    ['copied questions on a material', () => replaceMaterial({ questions: [materialQuestion('copied', 'uncertain', 1)] })],
  ])('rejects malformed graph shape: %s', (_name, payload) => {
    expectConservativeFallback(payload());
  });

  it.each([
    ['page missing storage_ref', () => replaceEvidence({
      evidence_id: 'ev-material', owner_type: 'material', owner_id: 'material-reading', role: 'material',
      kind: 'page', canonicalization_version: 'evidence_v1', page_index: 0, content_hash: HASH,
    })],
    ['bbox outside normalized bounds', () => replaceEvidence({
      evidence_id: 'ev-material', owner_type: 'material', owner_id: 'material-reading', role: 'material',
      kind: 'bbox', canonicalization_version: 'evidence_v1', page_index: 0, storage_ref: 'page.jpg',
      bbox: { x: 0.9, y: 0, width: 0.2, height: 0.2, unit: 'normalized' }, content_hash: HASH,
    })],
    ['bbox with text-span fields', () => replaceEvidence({
      evidence_id: 'ev-material', owner_type: 'material', owner_id: 'material-reading', role: 'material',
      kind: 'bbox', canonicalization_version: 'evidence_v1', page_index: 0, storage_ref: 'page.jpg',
      bbox: { x: 0, y: 0, width: 0.2, height: 0.2, unit: 'normalized' }, content_hash: HASH,
      source_text_id: 'material:material-reading:text', span_start: 0, span_end: 2,
    })],
    ['text span missing text', () => replaceEvidence({
      evidence_id: 'ev-material', owner_type: 'material', owner_id: 'material-reading', role: 'material',
      kind: 'text_span', canonicalization_version: 'evidence_v1', source_text_id: 'material:material-reading:text',
      span_start: 0, span_end: 2, content_hash: HASH,
    })],
    ['text span with invalid offsets', () => replaceEvidence({
      evidence_id: 'ev-material', owner_type: 'material', owner_id: 'material-reading', role: 'material',
      kind: 'text_span', canonicalization_version: 'evidence_v1', source_text_id: 'material:material-reading:text',
      span_start: 2, span_end: 2, text: 'x', content_hash: HASH,
    })],
    ['answer fragment without locator', () => replaceEvidence({
      evidence_id: 'ev-material', owner_type: 'answer', owner_id: 'item-a', role: 'student_answer',
      kind: 'answer_fragment', canonicalization_version: 'evidence_v1', text: 'A', content_hash: HASH,
    })],
    ['answer fragment with both locator families', () => replaceEvidence({
      evidence_id: 'ev-material', owner_type: 'answer', owner_id: 'item-a', role: 'student_answer',
      kind: 'answer_fragment', canonicalization_version: 'evidence_v1', text: 'A', content_hash: HASH,
      page_index: 0, bbox: { x: 0, y: 0, width: 0.2, height: 0.2, unit: 'normalized' },
      source_text_id: 'answer:item-a:student', span_start: 0, span_end: 1,
    })],
    ['orphan bbox evidence ref', () => replaceEvidence({
      ...completeContract().evidence_registry[0], bbox_evidence_ref: 'missing-evidence',
    })],
    ['unresolved source text ID', () => replaceEvidence({
      ...completeContract().evidence_registry[0], source_text_id: 'material:missing:text',
    })],
    ['source ID pointing at the wrong canonical owner text', () => replaceEvidence({
      ...completeContract().evidence_registry[0], source_text_id: 'question:item-a:text',
    })],
    ['span text not equal to the canonical substring', () => replaceEvidence({
      ...completeContract().evidence_registry[0], text: 'Authoritative answer.',
    })],
    ['text-span hash not equal to the canonical source hash', () => replaceEvidence({
      ...completeContract().evidence_registry[0], content_hash: sha256('wrong source'),
    })],
    ['answer fragment owned by a question', () => replaceEvidence({
      evidence_id: 'ev-material', owner_type: 'question', owner_id: 'item-a', role: 'question',
      kind: 'answer_fragment', canonicalization_version: 'evidence_v1', text: 'B', content_hash: sha256('B'),
      source_text_id: 'answer:item-a:student', span_start: 0, span_end: 1,
    })],
    ['answer fragment using a non-answer role', () => replaceEvidence({
      evidence_id: 'ev-material', owner_type: 'answer', owner_id: 'item-a', role: 'grading_basis',
      kind: 'answer_fragment', canonicalization_version: 'evidence_v1', text: 'B', content_hash: sha256('B'),
      source_text_id: 'answer:item-a:student', span_start: 0, span_end: 1,
    })],
    ['answer fragment hash not equal to the canonical fragment hash', () => replaceEvidence({
      evidence_id: 'ev-material', owner_type: 'answer', owner_id: 'item-a', role: 'student_answer',
      kind: 'answer_fragment', canonicalization_version: 'evidence_v1', text: 'B', content_hash: sha256('wrong'),
      source_text_id: 'answer:item-a:student', span_start: 0, span_end: 1,
    })],
  ])('rejects malformed evidence locator: %s', (_name, payload) => {
    expectConservativeFallback(payload());
  });

  it('validates canonicalized Unicode code-point spans for every backend source family', () => {
    const contract = completeContract();
    const materialText = 'Line one  \r\nA😀B\t\rEnd';
    const canonicalMaterial = 'Line one\nA😀B\nEnd';
    const questionText = 'Question item-a';
    const feedbackText = 'The answer conflicts with the passage.';
    const evidence: EvidenceRecord[] = [
      {
        evidence_id: 'ev-material', owner_type: 'material', owner_id: 'material-reading', role: 'material',
        kind: 'text_span', canonicalization_version: 'evidence_v1', source_text_id: 'material:material-reading:text',
        span_start: 9, span_end: 12, text: 'A😀B', content_hash: sha256(canonicalMaterial),
      },
      {
        evidence_id: 'ev-question', owner_type: 'question', owner_id: 'item-a', role: 'question',
        kind: 'text_span', canonicalization_version: 'evidence_v1', source_text_id: 'question:item-a:text',
        span_start: 0, span_end: Array.from(questionText).length, text: questionText, content_hash: sha256(questionText),
      },
      {
        evidence_id: 'ev-student', owner_type: 'answer', owner_id: 'item-a', role: 'student_answer',
        kind: 'answer_fragment', canonicalization_version: 'evidence_v1', source_text_id: 'answer:item-a:student',
        span_start: 0, span_end: 1, text: 'B', content_hash: sha256('B'),
      },
      {
        evidence_id: 'ev-reference', owner_type: 'answer', owner_id: 'item-a', role: 'reference_answer',
        kind: 'answer_fragment', canonicalization_version: 'evidence_v1', source_text_id: 'answer:item-a:reference',
        span_start: 0, span_end: 1, text: 'A', content_hash: sha256('A'),
      },
      {
        evidence_id: 'ev-feedback', owner_type: 'feedback', owner_id: 'item-a', role: 'grading_basis',
        kind: 'text_span', canonicalization_version: 'evidence_v1', source_text_id: 'feedback:item-a:text',
        span_start: 0, span_end: Array.from(feedbackText).length, text: feedbackText, content_hash: sha256(feedbackText),
      },
    ];
    const payload = {
      ...contract,
      material_groups: contract.material_groups.map((group) => ({
        ...group,
        materials: group.materials.map((material) => ({
          ...material, text: materialText, evidence_refs: ['ev-material'],
        })),
      })),
      evidence_registry: evidence,
      questions: contract.questions.map((question) => question.item_id === 'item-a'
        ? {
          ...question,
          evidence_refs: ['ev-question'],
          english_feedback: {
            ...question.english_feedback!, explanation: feedbackText, evidence_refs: ['ev-feedback'],
          },
          student_answer_payload: {
            ...question.student_answer_payload!, evidence_refs: ['ev-student'],
            selections: [{ value: 'B', evidence_refs: ['ev-student'] }],
          },
          reference_answer_payload: {
            ...question.reference_answer_payload!, evidence_refs: ['ev-reference'],
            selections: [{ value: 'A', evidence_refs: ['ev-reference'] }],
          },
        }
        : question),
    };

    const presentation = buildQuestionPresentation(payload);

    expect(presentation.source).toBe('learning_artifacts_v1');
    expect(presentation.evidenceRegistry).toHaveLength(5);
  });

  it('accepts strict valid evidence locator variants', () => {
    const base = completeContract();
    const validEvidence: EvidenceRecord[] = [
      {
        evidence_id: 'ev-page', owner_type: 'question', owner_id: 'item-a', role: 'question', kind: 'page',
        canonicalization_version: 'evidence_v1', page_index: 0, storage_ref: 'page.jpg', content_hash: HASH,
      },
      {
        evidence_id: 'ev-bbox', owner_type: 'question', owner_id: 'item-a', role: 'question', kind: 'bbox',
        canonicalization_version: 'evidence_v1', page_index: 0, storage_ref: 'page.jpg', content_hash: HASH,
        bbox: { x: 0, y: 0, width: 0.2, height: 0.2, unit: 'normalized' },
      },
      {
        evidence_id: 'ev-answer', owner_type: 'answer', owner_id: 'item-a', role: 'student_answer',
        kind: 'answer_fragment', canonicalization_version: 'evidence_v1', text: 'B', content_hash: sha256('B'),
        page_index: 0, bbox: { x: 0, y: 0, width: 0.2, height: 0.2, unit: 'normalized' },
      },
      ...base.evidence_registry,
    ];
    const presentation = buildQuestionPresentation({ ...base, evidence_registry: validEvidence });

    expect(presentation.source).toBe('learning_artifacts_v1');
    expect(presentation.evidenceRegistry).toHaveLength(4);
  });

  it('falls back when a v1 graph contains orphan references instead of fabricating links', () => {
    expectConservativeFallback(replaceGroup({ item_ids: ['missing-item'] }));
  });

  it('uses exact item IDs for deep links', () => {
    const presentation = buildQuestionPresentation(completeContract());

    expect(findQuestionByItemId(presentation, 'item-a')?.item_id).toBe('item-a');
    expect(findQuestionByItemId(presentation, ' ITEM-A ')).toBeUndefined();
    expect(findMaterialGroupForItem(presentation, 'item-a')?.group_id).toBe('group-reading');
    expect(findMaterialGroupForItem(presentation, 'item-simple')).toBeUndefined();
  });

  it('keeps legacy fallback flat without inventing material, answers, modes, or types', () => {
    const payload = {
      questions: [
        {
          item_id: 'legacy-2(A)',
          question_number: '2(A)',
          page_index: 0,
          question_content: 'Read the passage and answer (1) and (2).',
          student_answer: 'B',
          reason: '根据材料可知参考答案是A。',
          verdict: 'incorrect',
        },
      ],
    };

    const presentation = buildQuestionPresentation(payload);
    const item = presentation.questions[0];

    expect(presentation.source).toBe('fallback');
    expect(item).toMatchObject({ item_id: 'legacy-2(A)', question_content: payload.questions[0]!.question_content });
    expect(item).not.toHaveProperty('material_group_id');
    expect(item).not.toHaveProperty('reference_answer_payload');
    expect(item).not.toHaveProperty('answer_mode');
    expect(item).not.toHaveProperty('question_type');
    expect(presentation.materialGroups).toEqual([]);
  });

  it('drops malformed fields from a legacy flat fallback item', () => {
    const presentation = buildQuestionPresentation({
      questions: [{
        item_id: 'legacy-malformed',
        question_number: 7,
        page_index: '0',
        subject: { name: 'english' },
        question_content: { text: 'unsafe' },
        reason: ['unsafe'],
        judgment_basis: [42],
        knowledge_tags: ['safe', 42],
        image_refs: [],
        visual_risk: 'true',
        visual_risk_reasons: ['safe', 42],
        card_state: 'invented',
        verdict: 'incorrect',
        verdict_source: 'invented',
        needs_review: 'true',
        review_bbox: [0, '1'],
      }],
    });

    expect(presentation.questions).toEqual([{ item_id: 'legacy-malformed', verdict: 'incorrect' }]);
  });

  it('does not mutate frozen input payloads', () => {
    const payload = completeContract();
    const before = JSON.stringify(payload);
    deepFreeze(payload);

    const presentation = buildQuestionPresentation(payload);

    expect(JSON.stringify(payload)).toBe(before);
    expect(presentation.questions).not.toBe(payload.questions);
  });
});
