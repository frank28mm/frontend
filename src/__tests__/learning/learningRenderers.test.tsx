import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EnglishFeedbackPanel } from '@/components/learning/EnglishFeedbackPanel';
import { MaterialGroupDetail } from '@/components/learning/MaterialGroupDetail';
import { MaterialText } from '@/components/learning/MaterialText';
import { SimpleQuestionDetail } from '@/components/learning/SimpleQuestionDetail';
import type {
  AnswerPayload,
  EnglishFeedback,
  EvidenceRecord,
  LearningQuestion,
  Material,
  MaterialGroup,
} from '@/services/types';

const baseFeedback = (fields: Partial<EnglishFeedback> = {}): EnglishFeedback => ({
  question_type: 'reading_choice',
  error_type: 'evidence',
  error_types: ['evidence'],
  accepted_answers: [],
  feedback_mode: 'answer_comparison',
  keywords_used: [],
  semantic_score: null,
  similarity_mode: 'none',
  evidence: [],
  evidence_refs: [],
  slot_feedback: [],
  rubric_feedback: [],
  ...fields,
});

const questionWithAnswer = (
  payload: AnswerPayload,
  fields: Partial<LearningQuestion> = {},
): LearningQuestion => ({
  item_id: 'item-1',
  question_number: '1',
  page_index: 0,
  subject: 'english',
  display_mode: 'simple_question',
  answer_mode: payload.mode,
  question_type: 'reading_choice',
  question_text: 'Choose the best answer.',
  options: [],
  student_answer_payload: payload,
  accepted_answer_payloads: [],
  answer_state: 'has_answer',
  verdict: 'incorrect',
  verdict_source: 'model',
  judgment_basis: [],
  knowledge_tags: [],
  knowledge_tag_items: [],
  evidence_refs: [],
  contract_provenance: 'native_v1',
  degradation_reasons: [],
  english_feedback: baseFeedback(),
  ...fields,
} as LearningQuestion);

const material: Material = {
  material_id: 'material-1',
  kind: 'passage',
  display_order: 1,
  text: 'Keep (A) exactly as written.\nDo not turn \\frac{1}{2} into math.',
  evidence_refs: ['evidence-image'],
};

const imageEvidence: EvidenceRecord = {
  evidence_id: 'evidence-image',
  owner_type: 'material',
  owner_id: 'material-1',
  role: 'material',
  kind: 'bbox',
  canonicalization_version: 'evidence_v1',
  content_hash: 'sha256:test',
  page_index: 0,
  storage_ref: 'page-1',
  bbox: { x: 0, y: 0, width: 1, height: 1, unit: 'normalized' },
  image_url: '/broken-evidence.png',
};

describe('learning detail renderers', () => {
  it('renders material text literally and preserves its whitespace', () => {
    render(<MaterialText material={material} evidenceRegistry={[]} />);

    const text = screen.getByTestId('material-text');
    expect(text).toHaveTextContent('Keep (A) exactly as written.');
    expect(text.textContent).toContain('\\frac{1}{2}');
    expect(text).toHaveClass('whitespace-pre-wrap');
    expect(text).toHaveClass('[overflow-wrap:anywhere]');
    expect(text.querySelector('.katex')).toBeNull();
  });

  it('renders chemistry formulas in material text when math rendering is enabled', () => {
    render(
      <MaterialText
        material={{ ...material, text: '加入$NH_4HCO_3$后生成$FeCO_3$。' }}
        evidenceRegistry={[]}
        renderMath
      />,
    );

    const text = screen.getByTestId('material-text');
    expect(text).toHaveTextContent('加入');
    expect(text.querySelectorAll('.katex')).toHaveLength(2);
    expect(text.textContent).not.toContain('$');
  });

  it('renders chemistry formulas in the canonical student answer', () => {
    const question = questionWithAnswer(
      { mode: 'unknown', text: '', evidence_refs: [] },
      {
        subject: 'chemistry',
        question_type: 'equation',
        student_answer: '$Fe_2O_3+CO\\xrightarrow{800^\\circ C}2FeO+CO_2$',
        student_answer_payload: undefined,
        english_feedback: undefined,
      } as Partial<LearningQuestion>,
    );

    render(<SimpleQuestionDetail question={question} />);

    const answer = screen.getByTestId('student-answer');
    expect(answer.querySelector('.katex')).not.toBeNull();
    expect(answer.textContent).not.toContain('$');
  });

  it.each([
    [
      'single choice',
      { mode: 'choice_single', selections: [{ value: 'B' }], evidence_refs: [] } as AnswerPayload,
      ['B'],
    ],
    [
      'multiple choice',
      { mode: 'choice_multiple', selections: [{ value: 'A' }, { value: 'C' }], evidence_refs: [] } as AnswerPayload,
      ['A', 'C'],
    ],
    [
      'true false',
      { mode: 'true_false', selections: [{ value: 'True' }], evidence_refs: [] } as AnswerPayload,
      ['True'],
    ],
    [
      'matching',
      { mode: 'matching', mappings: [{ left_id: 'L1', right_id: 'R2' }], evidence_refs: [] } as AnswerPayload,
      ['L1', 'R2'],
    ],
    [
      'fill text',
      { mode: 'fill_text', slots: [{ slot_id: 'blank-1', value: 'went' }], evidence_refs: [] } as AnswerPayload,
      ['blank-1', 'went'],
    ],
    [
      'fill from bank',
      { mode: 'fill_from_bank', slots: [{ slot_id: 'blank-2', value: 'carefully' }], evidence_refs: [] } as AnswerPayload,
      ['blank-2', 'carefully'],
    ],
    [
      'sentence transform',
      { mode: 'sentence_transform', text: 'He did not leave.', evidence_refs: [] } as AnswerPayload,
      ['He did not leave.'],
    ],
    [
      'translation',
      { mode: 'translation', text: 'Learning takes practice.', evidence_refs: [] } as AnswerPayload,
      ['Learning takes practice.'],
    ],
    [
      'short answer',
      { mode: 'short_answer', text: 'Because the train was late.', evidence_refs: [] } as AnswerPayload,
      ['Because the train was late.'],
    ],
    [
      'writing',
      { mode: 'writing', text: 'Dear Sam,\nThank you for your letter.', evidence_refs: [] } as AnswerPayload,
      ['Dear Sam,', 'Thank you for your letter.'],
    ],
    [
      'unknown',
      { mode: 'unknown', text: 'Visible safe fallback', evidence_refs: [] } as AnswerPayload,
      ['Visible safe fallback'],
    ],
  ])('renders the %s answer payload without flattening its structure', (_name, payload, expected) => {
    render(<SimpleQuestionDetail question={questionWithAnswer(payload)} />);

    const answer = screen.getByTestId('student-answer');
    for (const text of expected) expect(within(answer).getByText(text)).toBeInTheDocument();
  });

  it('keeps long writing content inside the existing mobile detail width', () => {
    const longWord = 'extraordinarilylongunbrokenstudentanswer'.repeat(8);
    render(
      <div style={{ width: 320 }}>
        <SimpleQuestionDetail
          question={questionWithAnswer({ mode: 'writing', text: longWord, evidence_refs: [] })}
        />
      </div>,
    );

    expect(screen.getByTestId('simple-question-detail')).toHaveClass('min-w-0');
    expect(screen.getByTestId('student-answer')).toHaveClass('[overflow-wrap:anywhere]');
  });

  it('renders a completed writing evaluation as qualitative feedback instead of pending', () => {
    const writingFeedback = baseFeedback({
      question_type: 'writing',
      error_type: 'grammar',
      error_types: ['grammar', 'vocabulary'],
      feedback_mode: 'rubric',
      evaluation_status: 'complete',
      overall_assessment: '文章完成了主要任务，结构清楚，但语言准确性仍需提高。',
      explanation: '文章完成了主要任务，结构清楚，但语言准确性仍需提高。',
      strengths: ['覆盖了题目要求的主要信息', '段落顺序清楚'],
      representative_corrections: [
        { original: 'I am agree.', corrected: 'I agree.', explanation: 'agree 是动词，不与 am 连用。' },
        { original: 'It make me happy.', corrected: 'It makes me happy.', explanation: '第三人称单数用 makes。' },
        { original: 'I very like it.', corrected: 'I like it very much.', explanation: 'very 不能直接修饰 like。' },
      ],
      improved_answer: 'I agree with this idea. It makes me happy, and I like it very much.',
      rubric_feedback: [
        { dimension: 'task_completion', judgment: 'meets', feedback: '完成了主要写作任务。', score: null, max_score: null },
        { dimension: 'content', judgment: 'partly_meets', feedback: '信息基本完整，可增加细节。', score: null, max_score: null },
        { dimension: 'organization', judgment: 'meets', feedback: '内容顺序清楚。', score: null, max_score: null },
        { dimension: 'grammar', judgment: 'partly_meets', feedback: '存在主谓一致问题。', score: null, max_score: null },
        { dimension: 'vocabulary', judgment: 'partly_meets', feedback: '表达可理解，但搭配需要改进。', score: null, max_score: null },
      ],
    });

    render(
      <SimpleQuestionDetail
        question={questionWithAnswer(
          { mode: 'writing', text: 'I am agree. It make me happy. I very like it.', evidence_refs: [] },
          { question_type: 'writing', verdict: 'uncertain', english_feedback: writingFeedback },
        )}
      />,
    );

    expect(screen.getByText('已评价')).toBeInTheDocument();
    expect(screen.getByText('综合评价')).toBeInTheDocument();
    expect(screen.getByText('文章完成了主要任务，结构清楚，但语言准确性仍需提高。')).toBeInTheDocument();
    expect(screen.getByText('写作优点')).toBeInTheDocument();
    expect(screen.getByText('覆盖了题目要求的主要信息')).toBeInTheDocument();
    expect(screen.getByText('代表性修改')).toBeInTheDocument();
    expect(screen.getByText('I am agree.')).toBeInTheDocument();
    expect(screen.getByText('I agree.')).toBeInTheDocument();
    expect(screen.getByText('组织与连贯')).toBeInTheDocument();
    expect(screen.getByText('词汇与表达')).toBeInTheDocument();
    expect(screen.getByText('改进后的全文')).toBeInTheDocument();
    expect(screen.getByText('I agree with this idea. It makes me happy, and I like it very much.')).toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*\/\s*\d+/)).not.toBeInTheDocument();
  });

  it('surfaces a failed writing evaluation while preserving the base analysis', () => {
    render(
      <EnglishFeedbackPanel
        feedback={baseFeedback({
          question_type: 'writing',
          feedback_mode: 'feedback_only',
          evaluation_status: 'failed',
          explanation: '基础判题分析仍需保留。',
        })}
        ownerItemID="item-1"
        evidenceRegistry={[]}
      />,
    );

    expect(screen.getByText('作文评价暂未完成')).toBeInTheDocument();
    expect(screen.getByText('基础判题分析仍需保留。')).toBeInTheDocument();
  });

  it('falls back cleanly when an evidence image cannot load', () => {
    const neighboringEvidence: EvidenceRecord = {
      ...imageEvidence,
      evidence_id: 'neighbor-material-image',
      owner_id: 'material-2',
      image_url: '/neighbor-material.png',
    };
    render(
      <MaterialText
        material={{ ...material, evidence_refs: ['evidence-image', 'neighbor-material-image'] }}
        evidenceRegistry={[imageEvidence, neighboringEvidence]}
      />,
    );

    const image = screen.getByRole('img', { name: '材料证据' });
    expect(image).toHaveClass('object-contain');
    expect(image).toHaveClass('w-full');
    expect(image).toHaveClass('h-auto');

    fireEvent.error(image);

    expect(screen.queryByRole('img', { name: '材料证据' })).not.toBeInTheDocument();
    expect(screen.getByText('图片证据暂不可用')).toBeInTheDocument();
  });

  it('renders only feedback evidence owned by the current item', () => {
    const ownedEvidence: EvidenceRecord = {
      ...imageEvidence,
      evidence_id: 'feedback-image',
      owner_type: 'feedback',
      owner_id: 'item-1',
      role: 'grading_basis',
      image_url: '/feedback-image.png',
    };
    const neighboringEvidence: EvidenceRecord = {
      ...ownedEvidence,
      evidence_id: 'neighbor-feedback-image',
      owner_id: 'item-2',
      image_url: '/neighbor-feedback-image.png',
    };

    render(
      <EnglishFeedbackPanel
        feedback={baseFeedback({
          evidence_refs: ['feedback-image', 'neighbor-feedback-image'],
        })}
        ownerItemID="item-1"
        evidenceRegistry={[ownedEvidence, neighboringEvidence]}
      />,
    );

    const image = screen.getByRole('img', { name: '批改依据' });
    expect(image).toHaveAttribute('src', '/feedback-image.png');
  });

  it('renders evidence referenced only by slot and rubric feedback', () => {
    const slotEvidence: EvidenceRecord = {
      ...imageEvidence,
      evidence_id: 'slot-feedback-image',
      owner_type: 'feedback',
      owner_id: 'item-1',
      role: 'grading_basis',
      image_url: '/slot-feedback-image.png',
    };
    const rubricEvidence: EvidenceRecord = {
      ...slotEvidence,
      evidence_id: 'rubric-feedback-image',
      image_url: '/rubric-feedback-image.png',
    };
    const neighboringEvidence: EvidenceRecord = {
      ...slotEvidence,
      evidence_id: 'neighbor-slot-feedback-image',
      owner_id: 'item-2',
      image_url: '/neighbor-slot-feedback-image.png',
    };

    render(
      <EnglishFeedbackPanel
        feedback={baseFeedback({
          slot_feedback: [
            {
              slot_id: 'blank-1',
              verdict: 'incorrect',
              accepted_answers: [],
              error_types: ['grammar'],
              evidence_refs: ['slot-feedback-image', 'neighbor-slot-feedback-image'],
            },
          ],
          rubric_feedback: [
            {
              dimension: 'organization',
              judgment: 'partly_meets',
              feedback: 'Reorder the supporting details.',
              score: null,
              max_score: null,
              evidence_refs: ['rubric-feedback-image'],
            },
          ],
        })}
        ownerItemID="item-1"
        evidenceRegistry={[slotEvidence, rubricEvidence, neighboringEvidence]}
      />,
    );

    const sources = screen
      .getAllByRole('img', { name: '批改依据' })
      .map((image) => image.getAttribute('src'));
    expect(sources).toEqual(['/slot-feedback-image.png', '/rubric-feedback-image.png']);
  });

  it('renders only the image evidence owned and referenced by the current question', () => {
    const ownedEvidence: EvidenceRecord = {
      ...imageEvidence,
      evidence_id: 'question-image',
      owner_type: 'question',
      owner_id: 'item-1',
      role: 'question',
      image_url: '/whole-page.png',
      slice_image_url: '/question-image.png',
    };
    const neighboringEvidence: EvidenceRecord = {
      ...ownedEvidence,
      evidence_id: 'neighbor-image',
      owner_id: 'item-2',
      image_url: '/neighbor-image.png',
    };
    const question = questionWithAnswer(
      { mode: 'choice_single', selections: [{ value: 'B' }], evidence_refs: [] },
      { evidence_refs: ['question-image', 'neighbor-image'] },
    );

    render(
      <SimpleQuestionDetail
        question={question}
        evidenceRegistry={[ownedEvidence, neighboringEvidence]}
      />,
    );

    const image = screen.getByRole('img', { name: '题目图示' });
    expect(image).toHaveAttribute('src', '/question-image.png');
    expect(image).toHaveClass('object-contain');
    expect(screen.queryByRole('img', { name: '相邻题目图示' })).not.toBeInTheDocument();

    fireEvent.error(image);

    expect(screen.queryByRole('img', { name: '题目图示' })).not.toBeInTheDocument();
    expect(screen.getByText('图片证据暂不可用')).toBeInTheDocument();
  });

  it('shows the owned figure slice instead of a redundant question crop', () => {
    const questionEvidence: EvidenceRecord = {
      ...imageEvidence,
      evidence_id: 'question-crop',
      owner_type: 'question',
      owner_id: 'item-1',
      role: 'question',
      image_url: '/whole-page.png',
      slice_image_url: '/question-crop.png',
    };
    const figureEvidence: EvidenceRecord = {
      ...questionEvidence,
      evidence_id: 'figure-crop',
      slice_image_url: '/figure-crop.png',
    };
    const question = questionWithAnswer(
      { mode: 'unknown', text: '$Fe_2O_3$', evidence_refs: [] },
      {
        subject: 'chemistry',
        question_type: 'equation',
        evidence_refs: ['question-crop', 'figure-crop'],
        question_slice_image_url: '/question-crop.png',
        figure_slice_image_url: '/figure-crop.png',
        english_feedback: undefined,
      } as Partial<LearningQuestion>,
    );

    render(
      <SimpleQuestionDetail
        question={question}
        evidenceRegistry={[questionEvidence, figureEvidence]}
      />,
    );

    const images = screen.getAllByRole('img', { name: '题目图示' });
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', '/figure-crop.png');
  });

  it('does not paste the original page crop as the question when text already reconstructs a simple science item', () => {
    const pageCrop: EvidenceRecord = {
      ...imageEvidence,
      evidence_id: 'page-crop',
      owner_type: 'question',
      owner_id: 'item-1',
      role: 'question',
      image_url: '/uploads/page-01.jpeg',
    };
    const question = questionWithAnswer(
      { mode: 'choice_single', selections: [{ value: 'D' }], evidence_refs: [] },
      {
        subject: 'chemistry',
        question_type: 'choice',
        question_text: '将粗盐中含有的可溶性物质与难溶性杂质分离的操作是（ ）。\nA. 加热\nB. 溶解\nC. 过滤\nD. 先溶解再过滤',
        options: [
          { option_id: 'A', text: '加热', evidence_refs: [] },
          { option_id: 'B', text: '溶解', evidence_refs: [] },
          { option_id: 'C', text: '过滤', evidence_refs: [] },
          { option_id: 'D', text: '先溶解再过滤', evidence_refs: [] },
        ],
        evidence_refs: ['page-crop'],
        english_feedback: undefined,
      } as Partial<LearningQuestion>,
    );

    render(
      <SimpleQuestionDetail
        question={question}
        evidenceRegistry={[pageCrop]}
      />,
    );

    expect(screen.getByText(/将粗盐中含有的可溶性物质/)).toBeInTheDocument();
    expect(screen.getByText('先溶解再过滤')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '题目图示' })).not.toBeInTheDocument();
  });

  it('still shows a figure slice for a science item that depends on a printed diagram', () => {
    const question = questionWithAnswer(
      { mode: 'choice_single', selections: [{ value: 'B' }], evidence_refs: [] },
      {
        subject: 'physics',
        question_type: 'choice',
        question_text: '一同学借助于如图甲、乙所示中汽车行驶的结果来说明这两种方法，其中正确的是（ ）。',
        evidence_refs: [],
        figure_slice_image_url: '/slices/p03-q1-figure.png',
        english_feedback: undefined,
      } as Partial<LearningQuestion>,
    );

    render(<SimpleQuestionDetail question={question} evidenceRegistry={[]} />);

    const image = screen.getByRole('img', { name: '题目图示' });
    expect(image).toHaveAttribute('src', '/slices/p03-q1-figure.png');
  });

  it('renders an option image referenced only by the current option', () => {
    const optionEvidence: EvidenceRecord = {
      ...imageEvidence,
      evidence_id: 'option-image',
      owner_type: 'question',
      owner_id: 'item-1',
      role: 'options',
      image_url: '/option-image.png',
    };
    const neighboringEvidence: EvidenceRecord = {
      ...optionEvidence,
      evidence_id: 'neighbor-option-image',
      owner_id: 'item-2',
      image_url: '/neighbor-option-image.png',
    };
    const question = questionWithAnswer(
      { mode: 'choice_single', selections: [{ value: 'A' }], evidence_refs: [] },
      {
        evidence_refs: [],
        options: [
          { option_id: 'A', text: 'The first picture', evidence_refs: ['option-image'] },
          { option_id: 'B', text: 'The second picture', evidence_refs: ['neighbor-option-image'] },
        ],
      },
    );

    render(
      <SimpleQuestionDetail
        question={question}
        evidenceRegistry={[optionEvidence, neighboringEvidence]}
      />,
    );

    const image = screen.getByRole('img', { name: '题目图示' });
    expect(image).toHaveAttribute('src', '/option-image.png');
  });

  it('renders a degraded material group and the current item position without inventing material', () => {
    const group: MaterialGroup = {
      group_id: 'group-1',
      title: 'Reading',
      material_type: 'passage',
      display_order: 1,
      page_indices: [0],
      status: 'degraded',
      warnings: ['missing_material'],
      materials: [],
      item_ids: ['item-1', 'item-2'],
    };
    const question = questionWithAnswer(
      { mode: 'choice_single', selections: [{ value: 'B' }], evidence_refs: [] },
      {
        display_mode: 'material_group',
        material_group_id: 'group-1',
        group_position: 1,
        verdict: 'uncertain',
        degradation_reasons: ['missing_material'],
      } as Partial<LearningQuestion>,
    );

    render(
      <MaterialGroupDetail
        group={group}
        question={question}
        groupQuestions={[question]}
        evidenceRegistry={[]}
        contractStatus="degraded"
      />,
    );

    expect(screen.getByText('材料信息不完整')).toBeInTheDocument();
    expect(screen.getByText('第 1 / 2 小题')).toBeInTheDocument();
    expect(screen.queryByTestId('material-text')).not.toBeInTheDocument();
  });

  it('does not label a complete material group as incomplete for an unrelated contract warning', () => {
    const group: MaterialGroup = {
      group_id: 'group-1',
      title: 'Reading',
      material_type: 'passage',
      display_order: 1,
      page_indices: [0],
      status: 'complete',
      warnings: [],
      materials: [],
      item_ids: ['item-1'],
    };
    const question = questionWithAnswer(
      { mode: 'choice_single', selections: [{ value: 'B' }], evidence_refs: [] },
      {
        display_mode: 'material_group',
        material_group_id: 'group-1',
        group_position: 1,
      } as Partial<LearningQuestion>,
    );

    render(
      <MaterialGroupDetail
        group={group}
        question={question}
        groupQuestions={[question]}
        evidenceRegistry={[]}
        contractStatus="degraded"
      />,
    );

    expect(screen.queryByText('材料信息不完整')).not.toBeInTheDocument();
  });

  it('shows slot feedback and rubric judgments without fabricating a score', () => {
    render(
      <EnglishFeedbackPanel
        feedback={baseFeedback({
          feedback_mode: 'rubric',
          slot_feedback: [
            {
              slot_id: 'blank-1',
              verdict: 'incorrect',
              reference_answer: 'went',
              accepted_answers: ['went', 'had gone'],
              error_types: ['grammar'],
              explanation: 'Use the past tense here.',
              evidence_refs: [],
            },
          ],
          rubric_feedback: [
            {
              dimension: 'organization',
              judgment: 'partly_meets',
              feedback: 'The paragraph order can be clearer.',
              score: null,
              max_score: 10,
            },
          ],
        })}
        ownerItemID="item-1"
        evidenceRegistry={[]}
      />,
    );

    expect(screen.getByText('空格 blank-1')).toBeInTheDocument();
    expect(screen.getAllByText('went')).toHaveLength(2);
    expect(screen.getByText('had gone')).toBeInTheDocument();
    expect(screen.getByText('组织结构')).toBeInTheDocument();
    expect(screen.getByText('部分达到')).toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*\/\s*10/)).not.toBeInTheDocument();
  });

  it('uses the current Math detail surface and verdict colors for visual consistency', () => {
    render(
      <SimpleQuestionDetail
        question={{
          item_id: 'math-1',
          question_number: '9',
          verdict: 'incorrect',
          question_text: '已知函数 f(x)',
          student_answer: 'B',
          reason: '代入后结果不符',
          judgment_basis: [],
        }}
      />,
    );

    expect(screen.getByTestId('simple-question-detail')).toHaveClass('bg-neu-bg');
    expect(screen.getByTestId('simple-question-detail')).toHaveClass('shadow-neu-flat');
    expect(screen.getByText('错题')).toHaveClass('text-[#F87171]');
    expect(screen.getByText('原题内容')).toBeInTheDocument();
    expect(screen.getByText('判题分析')).toBeInTheDocument();
  });
});
