import { createHash } from 'node:crypto';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EnglishFeedback,
  EvidenceRecord,
  LearningArtifactsContract,
  LearningQuestion,
  QuestionCard,
} from '@/services/types';

const navigateMock = vi.fn();
const getMock = vi.fn();
const postMock = vi.fn();
const showToastMock = vi.fn();
let routeItemID = 'item-a';
let locationState: Record<string, unknown> | null = null;
let subjectReadEnabled = true;
let disabledReadSubject: string | null = null;
let capabilitiesLoading = false;
let routeSearchParams = new URLSearchParams('submissionId=sub-english');

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: locationState }),
    useParams: () => ({ id: encodeURIComponent(routeItemID) }),
    useSearchParams: () => [routeSearchParams],
  };
});

vi.mock('@/services/api', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
  },
}));

vi.mock('@/config/features', () => ({
  FEATURE_ENGLISH_RENDER_ENABLED: true,
  FEATURE_ENGLISH_SUBMISSION_ENABLED: true,
  FEATURE_ENGLISH_ENABLED: true,
  FEATURE_PHYSICS_RENDER_ENABLED: true,
  FEATURE_PHYSICS_SUBMISSION_ENABLED: true,
  FEATURE_CHEMISTRY_RENDER_ENABLED: true,
  FEATURE_CHEMISTRY_SUBMISSION_ENABLED: true,
}));

vi.mock('@/contexts/ProfileContext', () => ({
  useProfile: () => ({
    profiles: [{ profile_id: 'profile-1', display_name: 'DEAN' }],
    activeProfileId: 'profile-1',
    activeProfile: { profile_id: 'profile-1', display_name: 'DEAN' },
    setActiveProfile: vi.fn(),
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock('@/components/ui/HomeButton', () => ({
  HomeFab: () => <div data-testid="home-fab" />,
}));

vi.mock('@/components/ui/BackButton', () => ({
  BackButton: (props: { onClick?: () => void }) => <button onClick={props.onClick}>back</button>,
}));

vi.mock('@/hooks/useSubjectCapabilities', () => ({
  useSubjectCapabilities: () => ({
    loading: capabilitiesLoading,
    isReadEnabled: (subject: string) => subjectReadEnabled && subject !== disabledReadSubject,
    isSubmissionEnabled: () => true,
  }),
}));

const sha256 = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;

const feedback = (): EnglishFeedback => ({
  question_type: 'reading_choice',
  error_type: 'evidence',
  error_types: ['evidence'],
  accepted_answers: ['A'],
  feedback_mode: 'answer_comparison',
  keywords_used: [],
  semantic_score: null,
  similarity_mode: 'none',
  evidence: [],
  evidence_refs: [],
  slot_feedback: [],
  rubric_feedback: [],
});

const materialQuestion = (
  itemID: string,
  questionNumber: string,
  position: number,
  verdict: 'incorrect' | 'uncertain' = 'incorrect',
): LearningQuestion => ({
  item_id: itemID,
  question_number: questionNumber,
  page_index: 0,
  subject: 'english',
  display_mode: 'material_group',
  material_group_id: 'group-reading',
  group_position: position,
  answer_mode: 'choice_single',
  question_type: 'reading_choice',
  question_text: `Question ${itemID}`,
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
  accepted_answer_payloads: [],
  answer_state: 'has_answer',
  verdict,
  verdict_source: 'model',
  reason: 'Check the passage evidence.',
  judgment_basis: [],
  knowledge_tags: ['Language skills/Reading/Detail'],
  knowledge_tag_items: [
    {
      tag_id: 'engv1:language-skill:reading-detail',
      taxonomy_version: 'english_universal_v1',
      canonical_path: 'Language skills/Reading/Detail',
      role: 'primary',
    },
  ],
  evidence_refs: [],
  contract_provenance: 'native_v1',
  degradation_reasons: [],
  english_feedback: feedback(),
});

const simpleQuestion = (): LearningQuestion => ({
  item_id: 'item-simple',
  question_number: '3',
  page_index: 0,
  subject: 'english',
  display_mode: 'simple_question',
  answer_mode: 'translation',
  question_type: 'translation',
  question_text: 'Translate the sentence.',
  options: [],
  student_answer_payload: { mode: 'translation', text: 'Hello.', evidence_refs: [] },
  accepted_answer_payloads: [],
  answer_state: 'has_answer',
  verdict: 'correct',
  verdict_source: 'model',
  judgment_basis: [],
  knowledge_tags: ['Language skills/Translation'],
  knowledge_tag_items: [
    {
      tag_id: 'engv1:language-skill:translation',
      taxonomy_version: 'english_universal_v1',
      canonical_path: 'Language skills/Translation',
      role: 'primary',
    },
  ],
  evidence_refs: [],
  contract_provenance: 'native_v1',
  degradation_reasons: [],
  english_feedback: { ...feedback(), question_type: 'translation' },
});

const submission = (
  currentVerdict: 'incorrect' | 'uncertain' = 'incorrect',
): LearningArtifactsContract & {
  submission_id: string;
  profile_id: string;
  subject: string;
  summary: { total_items: number; wrong_count: number; uncertain_count: number; blank_count: number };
} => {
  const passage = 'Maya records the weather every Friday.';
  const questions = [
    materialQuestion('item-b', '10', 1),
    materialQuestion('item-a', '2', 2, currentVerdict),
    simpleQuestion(),
  ];
  const cards: QuestionCard[] = questions.map((question) => ({
    item_id: question.item_id,
    question_number: question.question_number,
    page_index: question.page_index,
    verdict: question.verdict,
    question_content: question.question_text,
  }));
  return {
    submission_id: 'sub-english',
    profile_id: 'profile-1',
    subject: 'english',
    summary: {
      total_items: 3,
      wrong_count: currentVerdict === 'incorrect' ? 2 : 1,
      uncertain_count: currentVerdict === 'uncertain' ? 1 : 0,
      blank_count: 0,
    },
    artifact_contract_version: 'learning_artifacts_v1',
    artifact_contract_revision: 1,
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
            text: passage,
            evidence_refs: ['evidence-material'],
          },
        ],
        item_ids: ['item-b', 'item-a'],
      },
    ],
    evidence_registry: [
      {
        evidence_id: 'evidence-material',
        owner_type: 'material',
        owner_id: 'material-reading',
        role: 'material',
        kind: 'text_span',
        canonicalization_version: 'evidence_v1',
        source_text_id: 'material:material-reading:text',
        span_start: 0,
        span_end: Array.from(passage).length,
        text: passage,
        content_hash: sha256(passage),
      },
    ],
    presentation_nodes: [
      { node_id: 'node-group', kind: 'material_group', ref_id: 'group-reading', display_order: 1 },
      { node_id: 'node-simple', kind: 'question', ref_id: 'item-simple', display_order: 2 },
    ],
    questions,
    question_cards: cards,
  };
};

const scienceSubmission = (subject: 'physics' | 'chemistry') => {
  const physics = subject === 'physics';
  const itemID = physics ? 'item-a' : 'item-simple';
  const questionText = physics ? '根据电路图判断两个灯泡的亮度。' : '选择正确的氧气收集装置。';
  const canonicalPath = physics ? '电磁学/恒定电流与电路/串并联' : '化学实验/气体制备与检验/气体收集';
  const pathParts = canonicalPath.split('/');
  const question = {
    item_id: itemID,
    question_number: physics ? '12(1)' : '8',
    page_index: 0,
    subject,
    display_mode: physics ? 'material_group' : 'simple_question',
    ...(physics ? { material_group_id: 'group-circuit', group_position: 1 } : {}),
    answer_mode: 'unknown',
    question_type: physics ? 'experiment' : 'apparatus_selection',
    question_text: questionText,
    question_content: questionText,
    options: [],
    student_answer: physics ? 'L1 更亮' : '向上排空气法',
    answer_state: 'has_answer',
    verdict: physics ? 'incorrect' : 'correct',
    verdict_source: 'model',
    reason: physics ? '应根据实际串并联关系比较。' : '作答与氧气密度特性一致。',
    judgment_basis: ['依据来源：题干与装置图'],
    knowledge_tags: [canonicalPath],
    knowledge_tag_items: [{
      id: `${subject}:tag`,
      tag_id: `${subject}:tag`,
      taxonomy_version: `${subject}_cn_secondary_v1`,
      name: pathParts[2],
      canonical_path: canonicalPath,
      primary_domain: pathParts[0],
      category_id: `${subject}:category`,
      category_name: pathParts[1],
      leaf_name: pathParts[2],
    }],
    evidence_refs: [],
    contract_provenance: 'native_v1',
    degradation_reasons: [],
    accepted_answer_payloads: [],
  };
  return {
    submission_id: `sub-${subject}`,
    profile_id: 'profile-1',
    subject,
    summary: { total_items: 1, wrong_count: physics ? 1 : 0, uncertain_count: 0, blank_count: 0 },
    artifact_contract_version: 'learning_artifacts_v1',
    artifact_contract_revision: 1,
    artifact_contract_provenance: 'native_v1',
    artifact_contract_status: 'complete',
    artifact_contract_warnings: [],
    material_groups: physics ? [{
      group_id: 'group-circuit',
      title: '串并联电路实验',
      material_type: 'diagram',
      display_order: 1,
      page_indices: [0],
      status: 'complete',
      warnings: [],
      materials: [{
        material_id: 'material-circuit',
        kind: 'diagram',
        display_order: 1,
        text: '闭合开关后观察两个灯泡。',
        evidence_refs: [],
      }],
      item_ids: [itemID],
    }] : [],
    evidence_registry: [],
    presentation_nodes: [{
      node_id: `node-${subject}`,
      kind: physics ? 'material_group' : 'question',
      ref_id: physics ? 'group-circuit' : itemID,
      display_order: 1,
    }],
    questions: [question],
    question_cards: [{
      item_id: itemID,
      question_number: question.question_number,
      page_index: 0,
      verdict: question.verdict,
      question_content: questionText,
    }],
  };
};

const realCoreSubmissionShape = (): unknown => {
  const payload = submission();
  const questions = payload.questions.map((question) => {
    const persisted = {
      ...question,
      options: null,
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
  });
  return {
    ...payload,
    submission_id: 'upl_cc7f6757bb2089cf',
    questions,
    question_cards: questions.map((question) => ({
      ...question,
      card_state: 'verdict_ready',
      needs_review: false,
      question_content: question.question_text,
    })),
  };
};

describe('QuestionDetail English learning artifacts', () => {
  beforeEach(() => {
    routeItemID = 'item-a';
    navigateMock.mockReset();
    getMock.mockReset();
    postMock.mockReset();
    showToastMock.mockReset();
    subjectReadEnabled = true;
    disabledReadSubject = null;
    capabilitiesLoading = false;
    routeSearchParams = new URLSearchParams('submissionId=sub-english');
    locationState = {
      submissionId: 'sub-english',
      card: {
        item_id: 'item-a',
        question_number: '2',
        page_index: 0,
        verdict: 'incorrect',
        question_content: 'Loading question',
      },
    };
  });

  it('renders a Physics material group through the shared canonical detail components', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');
    getMock.mockResolvedValue({ data: scienceSubmission('physics') });

    render(<QuestionDetail />);

    expect(await screen.findByText('闭合开关后观察两个灯泡。')).toBeInTheDocument();
    expect(screen.getByText('串并联电路实验')).toBeInTheDocument();
    expect(screen.getByTestId('simple-question-detail')).toBeInTheDocument();
    expect(screen.queryByText('英文反馈')).not.toBeInTheDocument();
  });

  it('renders a Chemistry simple question through the shared canonical detail component', async () => {
    routeItemID = 'item-simple';
    locationState = {
      submissionId: 'sub-chemistry',
      card: {
        item_id: 'item-simple',
        question_number: '3',
        page_index: 0,
        verdict: 'correct',
        question_content: 'Loading chemistry question',
      },
    };
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');
    getMock.mockResolvedValue({ data: scienceSubmission('chemistry') });

    render(<QuestionDetail />);

    expect(await screen.findByText('选择正确的氧气收集装置。')).toBeInTheDocument();
    expect(screen.getByText('向上排空气法')).toBeInTheDocument();
    expect(screen.getByTestId('simple-question-detail')).toBeInTheDocument();
  });

  it('blocks a direct Physics question route when runtime read capability is disabled', async () => {
    subjectReadEnabled = false;
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');
    getMock.mockResolvedValue({ data: scienceSubmission('physics') });

    render(<QuestionDetail />);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }));
    expect(showToastMock).toHaveBeenCalledWith('物理入口已暂时关闭', 'info');
    expect(screen.queryByText('根据电路图判断两个灯泡的亮度。')).not.toBeInTheDocument();
  });

  it('does not request or display a known Science question while capability is pending', async () => {
    capabilitiesLoading = true;
    subjectReadEnabled = false;
    locationState = {
      submissionId: 'sub-physics',
      subject: 'physics',
      card: {
        item_id: 'item-a',
        question_number: '1',
        page_index: 0,
        verdict: 'incorrect',
        question_content: 'Pending physics state content',
      },
    };
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');

    render(<QuestionDetail />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(getMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Pending physics state content')).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('uses the state card subject to hide Science content while capability is pending', async () => {
    capabilitiesLoading = true;
    subjectReadEnabled = true;
    routeSearchParams = new URLSearchParams('submissionId=sub-physics');
    locationState = {
      submissionId: 'sub-physics',
      card: {
        item_id: 'item-a',
        question_number: '1',
        page_index: 0,
        subject: 'physics',
        verdict: 'incorrect',
        question_content: 'Pending physics card content',
      },
    };
    getMock.mockReturnValue(new Promise(() => undefined));
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');

    render(<QuestionDetail />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(getMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Pending physics card content')).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('blocks a known Science question before requesting its submission', async () => {
    subjectReadEnabled = false;
    locationState = {
      submissionId: 'sub-physics',
      subject: 'physics',
    };
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');

    render(<QuestionDetail />);
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    });

    expect(getMock).not.toHaveBeenCalled();
  });

  it('uses the loaded subject when stale navigation state says Math', async () => {
    disabledReadSubject = 'physics';
    locationState = {
      submissionId: 'sub-physics',
      subject: 'math',
    };
    getMock.mockResolvedValue({ data: scienceSubmission('physics') });
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');

    render(<QuestionDetail />);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }));
    expect(getMock).toHaveBeenCalled();
    expect(screen.queryByText('根据电路图判断两个灯泡的亮度。')).not.toBeInTheDocument();
  });

  it('dispatches a material item through the English renderer and navigates by presentation order', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');
    const user = userEvent.setup();
    getMock.mockResolvedValue({ data: submission() });

    render(<QuestionDetail />);

    expect(await screen.findByText('Maya records the weather every Friday.')).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
    expect(screen.getByText('第 2 / 2 小题')).toBeInTheDocument();
    expect(screen.getByText('Question item-a')).toBeInTheDocument();
    expect(screen.getByText('英文反馈')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '上一题' }));

    expect(navigateMock).toHaveBeenCalledWith('/question/item-b?submissionId=sub-english', {
      replace: true,
      state: {
        card: expect.objectContaining({ item_id: 'item-b', question_number: '10' }),
        submissionId: 'sub-english',
        subject: 'english',
        questionNav: {
          filter: 'wrong',
          itemIds: ['item-b', 'item-a'],
        },
      },
    });
  });

  it('renders the persisted upl_cc7f6757bb2089cf field shape without reading length from missing arrays', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');
    getMock.mockResolvedValue({ data: realCoreSubmissionShape() });

    render(<QuestionDetail />);

    expect(await screen.findByText('Question item-a')).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
    expect(screen.getByText('英文反馈')).toBeInTheDocument();
  });

  it('keeps a real-shaped English question renderable when an invalid envelope forces fallback', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');
    const payload = realCoreSubmissionShape() as Record<string, unknown>;
    payload.artifact_contract_status = 'invalid';
    getMock.mockResolvedValue({ data: payload });

    render(<QuestionDetail />);

    expect(await screen.findByText('Question item-a')).toBeInTheDocument();
    expect(screen.queryByText('英文反馈')).not.toBeInTheDocument();
  });

  it('keeps the canonical question verdict synchronized after manual review', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');
    const user = userEvent.setup();
    const payload = submission('uncertain');
    locationState = {
      submissionId: 'sub-english',
      card: payload.question_cards.find((card) => card.item_id === 'item-a'),
    };
    getMock.mockResolvedValue({ data: payload });
    postMock.mockResolvedValueOnce({
      data: {
        verdict: 'correct',
        summary: { total_items: 3, wrong_count: 1, uncertain_count: 0, blank_count: 0 },
      },
    });

    render(<QuestionDetail />);

    expect(await screen.findByText('Reading')).toBeInTheDocument();
    expect(screen.getByText('待定')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /是对题/ }));

    await waitFor(() => expect(screen.getByText('对题')).toBeInTheDocument());
    expect(postMock).toHaveBeenCalledWith(
      '/submissions/sub-english/questions/item-a',
      { verdict: 'correct' },
      { headers: { 'X-Profile-Id': 'profile-1' } },
    );
  });

  it('keeps a degraded material group visible after a manual verdict override', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');
    const user = userEvent.setup();
    const payload = submission('uncertain');
    payload.artifact_contract_status = 'degraded';
    payload.artifact_contract_warnings = ['missing_material'];
    payload.material_groups[0] = {
      ...payload.material_groups[0]!,
      status: 'degraded',
      warnings: ['missing_material'],
      materials: [],
    };
    payload.evidence_registry = [];
    payload.questions = payload.questions.map((question) =>
      question.display_mode === 'material_group'
        ? {
            ...question,
            verdict: 'uncertain',
            degradation_reasons: ['missing_material'],
          }
        : question,
    );
    payload.question_cards = payload.question_cards.map((card) =>
      card.item_id === 'item-a' || card.item_id === 'item-b'
        ? { ...card, verdict: 'uncertain' }
        : card,
    );
    locationState = {
      submissionId: 'sub-english',
      card: payload.question_cards.find((card) => card.item_id === 'item-a'),
    };
    getMock.mockResolvedValue({ data: payload });
    postMock.mockResolvedValueOnce({ data: { verdict: 'correct' } });

    render(<QuestionDetail />);

    expect(await screen.findByText('材料信息不完整')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /是对题/ }));

    await waitFor(() => expect(screen.getByText('对题')).toBeInTheDocument());
    expect(screen.getByText('Reading')).toBeInTheDocument();
    expect(screen.getByText('英文反馈')).toBeInTheDocument();
  });

  it('keeps the existing qindex rebuild interaction for an English image question', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');
    const user = userEvent.setup();
    const payload = submission('uncertain');
    const currentCard = payload.question_cards.find((card) => card.item_id === 'item-a');
    if (!currentCard) throw new Error('missing current English question card');
    currentCard.visual_risk = true;
    locationState = {
      submissionId: 'sub-english',
      card: currentCard,
    };
    getMock.mockResolvedValue({ data: payload });
    postMock.mockResolvedValueOnce({ data: { status: 'queued' } });

    render(<QuestionDetail />);

    expect(await screen.findByText('Reading')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '生成图示切片' }));

    expect(postMock).toHaveBeenCalledWith(
      '/submissions/sub-english/qindex/rebuild',
      { question_numbers: ['2'] },
      { headers: { 'X-Profile-Id': 'profile-1' } },
    );
    expect(showToastMock).toHaveBeenCalledWith(
      '已开始生成图示切片（可先返回，稍后再看）。',
      'success',
    );
  });

  it('treats only exact owned canonical evidence as the current English image slice', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');
    const payload = submission('uncertain');
    const target = payload.questions.find((question) => question.item_id === 'item-a');
    const neighbor = payload.questions.find((question) => question.item_id === 'item-b');
    const currentCard = payload.question_cards.find((card) => card.item_id === 'item-a');
    const neighborCard = payload.question_cards.find((card) => card.item_id === 'item-b');
    if (!target || !neighbor || !currentCard || !neighborCard) {
      throw new Error('missing English image fixture');
    }

    target.evidence_refs = ['evidence-question-target'];
    neighbor.question_number = target.question_number;
    neighborCard.question_number = target.question_number;
    neighbor.evidence_refs = ['evidence-question-neighbor'];
    currentCard.visual_risk = true;
    const imageEvidence = (
      evidenceID: string,
      ownerID: string,
      imageURL: string,
    ): EvidenceRecord => ({
      evidence_id: evidenceID,
      owner_type: 'question',
      owner_id: ownerID,
      role: 'question',
      kind: 'bbox',
      canonicalization_version: 'evidence_v1',
      page_index: 0,
      storage_ref: `tests/${evidenceID}.png`,
      bbox: { x: 0.1, y: 0.1, width: 0.8, height: 0.2, unit: 'normalized' },
      image_url: imageURL,
      content_hash: sha256(evidenceID),
    });
    payload.evidence_registry.push(
      imageEvidence('evidence-question-neighbor', 'item-b', '/neighbor.png'),
      imageEvidence('evidence-question-target', 'item-a', '/target.png'),
    );
    locationState = { submissionId: 'sub-english', card: currentCard };
    getMock.mockResolvedValue({ data: payload });

    render(<QuestionDetail />);

    const image = await screen.findByRole('img', { name: '题目图示' });
    expect(image).toHaveAttribute('src', '/target.png');
    expect(screen.queryByRole('img', { name: '题目图示' })).not.toHaveAttribute('src', '/neighbor.png');
    expect(screen.queryByText('该题被识别为带图题，但未获取到图示切片。')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '生成图示切片' })).not.toBeInTheDocument();
  });
});
