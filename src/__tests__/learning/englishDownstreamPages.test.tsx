import { createHash } from 'node:crypto';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EnglishFeedback,
  LearningArtifactsContract,
  LearningQuestion,
  QuestionCard,
  SubmissionItem,
} from '@/services/types';

const navigateMock = vi.fn();
const getMock = vi.fn();
const postMock = vi.fn();
const showToastMock = vi.fn();
const useMistakesMock = vi.fn();
const useSubmissionsMock = vi.fn();
const useKnowledgeArchiveMock = vi.fn();
const isSubjectReadEnabledMock = vi.fn();
vi.mock('@/contexts/ProfileContext', () => ({ useProfile: () => ({ activeProfileId: 'profile-1', loading: false }) }));
let capabilitiesLoading = false;
let routeItemID = 'item-target';
let routeParams: Record<string, string> = { id: 'item-target' };
let locationState: Record<string, unknown> | null = null;
let locationSearch = '?submissionId=sub-english';
let searchParams = new URLSearchParams();

const createStorageMock = () => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
};

const deferred = <Value,>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

vi.mock('@/config/features', () => ({
  FEATURE_ENGLISH_RENDER_ENABLED: true,
  FEATURE_ENGLISH_SUBMISSION_ENABLED: false,
  FEATURE_ENGLISH_ENABLED: false,
  FEATURE_PHYSICS_RENDER_ENABLED: true,
  FEATURE_PHYSICS_SUBMISSION_ENABLED: true,
  FEATURE_CHEMISTRY_RENDER_ENABLED: true,
  FEATURE_CHEMISTRY_SUBMISSION_ENABLED: true,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({
      state: locationState,
      search: locationSearch,
      pathname: '/history',
    }),
    useParams: () => ({ ...routeParams, id: routeItemID }),
    useSearchParams: () => [searchParams],
  };
});

vi.mock('@/services/api', () => ({
  apiClient: {
    defaults: { baseURL: '/api/v1' },
    get: getMock,
    post: postMock,
  },
}));

vi.mock('@/hooks/useAppSWR', () => ({
  useMistakes: (includeExcluded: boolean) => useMistakesMock(includeExcluded),
  useSubmissions: (options?: unknown) => useSubmissionsMock(options),
  useKnowledgeArchive: (subject: string, mistakeState: string, enabled?: boolean) =>
    useKnowledgeArchiveMock(subject, mistakeState, enabled),
}));

vi.mock('@/hooks/useSubjectCapabilities', () => ({
  useSubjectCapabilities: () => ({
    loading: capabilitiesLoading,
    isReadEnabled: isSubjectReadEnabledMock,
    isSubmissionEnabled: vi.fn(() => false),
  }),
}));

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'zh' }),
}));

vi.mock('@/hooks/useKnowledgeTagTranslations', () => ({
  useKnowledgeTagTranslations: () => undefined,
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock('@/components/ui/HomeButton', () => ({
  HomeFab: () => <div data-testid="home-fab" />,
  HomeButton: () => <button type="button" aria-label="Home">home</button>,
}));

vi.mock('@/components/ui/BackButton', () => ({
  BackButton: (props: { onClick?: () => void }) => (
    <button type="button" onClick={props.onClick}>back</button>
  ),
}));

vi.mock('@/components/ui/Header', () => ({
  Header: ({ title }: { title: string }) => <header>{title}</header>,
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

const materialQuestion = ({
  itemID,
  text,
  position,
  evidenceRef,
}: {
  itemID: string;
  text: string;
  position: number;
  evidenceRef: string;
}): LearningQuestion => ({
  item_id: itemID,
  question_number: '12',
  page_index: 0,
  subject: 'english',
  display_mode: 'material_group',
  material_group_id: 'group-reading',
  group_position: position,
  answer_mode: 'choice_single',
  question_type: 'reading_choice',
  question_text: text,
  question_content: text,
  options: [
    { option_id: 'A', text: 'first answer', evidence_refs: [] },
    { option_id: 'B', text: 'second answer', evidence_refs: [] },
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
  verdict: 'incorrect',
  verdict_source: 'model',
  reason: 'Use the evidence in the passage.',
  judgment_basis: [],
  knowledge_tags: ['Language skills/Reading/Detail'],
  knowledge_tag_items: [{
    tag_id: 'engv1:language-skill:reading-detail',
    taxonomy_version: 'english_universal_v1',
    canonical_path: 'Language skills/Reading/Detail',
    role: 'primary',
  }],
  evidence_refs: [evidenceRef],
  contract_provenance: 'native_v1',
  degradation_reasons: [],
  english_feedback: feedback(),
});

const englishSubmission = (): LearningArtifactsContract & {
  submission_id: string;
  profile_id: string;
  subject: string;
  summary: { total_items: number; wrong_count: number; uncertain_count: number; blank_count: number };
} => {
  const passage = 'Line one of the passage.\n\nLine three stays separate.';
  const targetText = "Keep A.D. exactly.\n(1) Don't split A-D.\nA-D is one token.";
  const decoyText = 'Duplicate number, wrong item.';
  const target = materialQuestion({
    itemID: 'item-target',
    text: targetText,
    position: 2,
    evidenceRef: 'evidence-target',
  });
  const decoy = materialQuestion({
    itemID: 'item-decoy',
    text: decoyText,
    position: 1,
    evidenceRef: 'evidence-decoy',
  });
  const cards: QuestionCard[] = [decoy, target].map((question) => ({
    item_id: question.item_id,
    question_number: question.question_number,
    page_index: question.page_index,
    verdict: question.verdict,
    question_content: question.question_text,
    visual_risk: true,
    figure_slice_image_url: question.item_id === 'item-target' ? '/legacy-target.png' : '/decoy.png',
  }));

  return {
    submission_id: 'sub-english',
    profile_id: 'profile-1',
    subject: 'english',
    summary: { total_items: 2, wrong_count: 2, uncertain_count: 0, blank_count: 0 },
    artifact_contract_version: 'learning_artifacts_v1',
    artifact_contract_revision: 3,
    artifact_contract_provenance: 'native_v1',
    artifact_contract_status: 'complete',
    artifact_contract_warnings: [],
    material_groups: [{
      group_id: 'group-reading',
      title: 'Reading 12',
      material_type: 'passage',
      display_order: 1,
      page_indices: [0],
      status: 'complete',
      warnings: [],
      materials: [{
        material_id: 'material-reading',
        kind: 'passage',
        display_order: 1,
        text: passage,
        evidence_refs: [],
      }],
      item_ids: ['item-decoy', 'item-target'],
    }],
    evidence_registry: [
      {
        evidence_id: 'evidence-decoy',
        owner_type: 'question',
        owner_id: 'item-decoy',
        role: 'question',
        kind: 'bbox',
        canonicalization_version: 'evidence_v1',
        page_index: 0,
        storage_ref: 'pages/english.png',
        bbox: { x: 0.05, y: 0.1, width: 0.4, height: 0.2, unit: 'normalized' },
        image_url: '/owned-decoy.png',
        content_hash: sha256('decoy'),
      },
      {
        evidence_id: 'evidence-target',
        owner_type: 'question',
        owner_id: 'item-target',
        role: 'question',
        kind: 'bbox',
        canonicalization_version: 'evidence_v1',
        page_index: 0,
        storage_ref: 'pages/english.png',
        bbox: { x: 0.05, y: 0.4, width: 0.4, height: 0.2, unit: 'normalized' },
        image_url: '/owned-target.png',
        content_hash: sha256('target'),
      },
    ],
    presentation_nodes: [
      { node_id: 'node-reading', kind: 'material_group', ref_id: 'group-reading', display_order: 1 },
    ],
    questions: [decoy, target],
    question_cards: cards,
  };
};

const streamResponse = (chatPayload?: Record<string, unknown>): Response => {
  const chunks = [
    chatPayload ? `event: chat\ndata: ${JSON.stringify(chatPayload)}\n\n` : '',
    'event: done\ndata: {}\n\n',
  ].filter(Boolean);
  let index = 0;
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => index < chunks.length
          ? { value: encoder.encode(chunks[index++]), done: false }
          : { value: undefined, done: true },
      }),
    },
    text: async () => '',
  } as unknown as Response;
};

describe('TC-LT-07 downstream English pages', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: vi.fn(),
      configurable: true,
    });
    Object.defineProperty(window, 'localStorage', {
      value: createStorageMock(),
      configurable: true,
    });
    localStorage.setItem('access_token', 'analysis-token');
    localStorage.setItem('user_id', 'analysis-owner');
    localStorage.setItem('active_profile_id', 'profile-1');
    navigateMock.mockReset();
    getMock.mockReset();
    postMock.mockReset();
    showToastMock.mockReset();
    useMistakesMock.mockReset();
    useSubmissionsMock.mockReset();
    useKnowledgeArchiveMock.mockReset();
    isSubjectReadEnabledMock.mockReset();
    isSubjectReadEnabledMock.mockReturnValue(true);
    capabilitiesLoading = false;
    routeItemID = 'item-target';
    routeParams = { id: 'item-target' };
    locationState = null;
    locationSearch = '?submissionId=sub-english';
    searchParams = new URLSearchParams();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('keeps historical English categories readable when new English submission is off', async () => {
    searchParams = new URLSearchParams({ subject: 'english' });
    useKnowledgeArchiveMock.mockImplementation((subject: string) => ({
      data: subject === 'english' ? {
        subject: 'english',
        taxonomy_version: 'english_universal_v1',
        mistake_state: 'active',
        total_items: 1,
        unmapped_count: 0,
        nodes: [{
          id: 'english.language-skills',
          level: 1,
          name: '阅读理解',
          canonical_path: '语言技能/阅读',
          taxonomy_version: 'english_universal_v1',
          count: 1,
          children: [],
        }],
      } : {
        subject: 'math',
        taxonomy_version: 'math_cn_secondary_v1',
        mistake_state: 'active',
        total_items: 0,
        unmapped_count: 0,
        nodes: [],
      },
      isLoading: false,
      error: null,
    }));
    const { default: DataArchive } = await import('@/pages/DataArchive');

    render(<DataArchive />);

    expect(await screen.findByText('阅读理解')).toBeInTheDocument();
    expect(useKnowledgeArchiveMock).toHaveBeenLastCalledWith('english', 'active', true);
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('switches DataArchive across all four subjects in the fixed product order', async () => {
    searchParams = new URLSearchParams({ subject: 'physics' });
    useKnowledgeArchiveMock.mockReturnValue({
      data: {
        subject: 'physics',
        taxonomy_version: 'physics_cn_secondary_v1',
        mistake_state: 'active',
        total_items: 0,
        unmapped_count: 0,
        nodes: [],
      },
      isLoading: false,
      error: null,
    });
    const { default: DataArchive } = await import('@/pages/DataArchive');
    const user = userEvent.setup();

    render(<DataArchive />);

    const subjectButtons = screen.getAllByRole('button')
      .filter((button) => ['数学', '英语', '物理', '化学'].includes(button.textContent || ''));
    expect(subjectButtons.map((button) => button.textContent)).toEqual(['数学', '英语', '物理', '化学']);
    expect(useKnowledgeArchiveMock).toHaveBeenLastCalledWith('physics', 'active', true);

    await user.click(screen.getByRole('button', { name: '化学' }));
    expect(navigateMock).toHaveBeenCalledWith('/data?subject=chemistry');
  });

  it('does not open a Science data route when runtime read capability is disabled', async () => {
    searchParams = new URLSearchParams({ subject: 'physics' });
    isSubjectReadEnabledMock.mockImplementation((subject: string) => subject !== 'physics');
    useKnowledgeArchiveMock.mockReturnValue({
      data: {
        subject: 'math',
        taxonomy_version: 'math_cn_secondary_v1',
        mistake_state: 'active',
        total_items: 0,
        unmapped_count: 0,
        nodes: [],
      },
      isLoading: false,
      error: null,
    });
    const { default: DataArchive } = await import('@/pages/DataArchive');

    render(<DataArchive />);

    expect(useKnowledgeArchiveMock).toHaveBeenLastCalledWith('physics', 'active', false);
    expect(screen.getByRole('button', { name: '物理' })).toHaveAttribute('aria-disabled', 'true');
    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('物理入口已暂时关闭', 'info');
      expect(navigateMock).toHaveBeenCalledWith('/data?subject=math', { replace: true });
    });
  });

  it('lets History filter existing English submissions when submission is off', async () => {
    const items: SubmissionItem[] = [{
      submission_id: 'sub-english',
      subject: 'english',
      created_at: '2026-09-01T10:00:00Z',
      summary: { total_items: 2, wrong_count: 1, uncertain_count: 0 },
    }];
    useSubmissionsMock.mockReturnValue({
      data: { items },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    });
    const { default: History } = await import('@/pages/History');
    const user = userEvent.setup();

    render(<History />);
    await user.click(screen.getByText('tune').closest('button')!);
    await user.click(screen.getByRole('button', { name: '英语' }));
    await user.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => expect(useSubmissionsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ subject: 'english' }),
    ));
    expect(screen.getByText('英语')).toBeInTheDocument();
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('labels Physics and Chemistry history without falling back to Math', async () => {
    const items: SubmissionItem[] = [
      {
        submission_id: 'sub-physics',
        subject: 'physics',
        created_at: '2026-09-01T10:00:00Z',
        summary: { total_items: 2, wrong_count: 1, uncertain_count: 0 },
      },
      {
        submission_id: 'sub-chemistry',
        subject: 'chemistry',
        created_at: '2026-09-01T09:00:00Z',
        summary: { total_items: 2, wrong_count: 0, uncertain_count: 0 },
      },
    ];
    useSubmissionsMock.mockReturnValue({
      data: { items },
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      mutate: vi.fn(),
    });
    const { default: History } = await import('@/pages/History');
    const user = userEvent.setup();

    render(<History />);

    expect(screen.getByRole('heading', { name: '物理' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '化学' })).toBeInTheDocument();

    await user.click(screen.getByText('tune').closest('button')!);
    await user.click(screen.getByRole('button', { name: '物理' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(useSubmissionsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ subject: 'physics' }),
    ));
  });

  it('keeps a runtime-disabled Science subject out of History filters', async () => {
    isSubjectReadEnabledMock.mockImplementation((subject: string) => subject !== 'physics');
    useSubmissionsMock.mockReturnValue({
      data: {
        items: [
          {
            submission_id: 'sub-math-visible',
            subject: 'math',
            created_at: '2026-09-01T10:00:00Z',
            summary: { total_items: 1, wrong_count: 0, uncertain_count: 0 },
          },
          {
            submission_id: 'sub-physics-hidden',
            subject: 'physics',
            created_at: '2026-09-01T09:00:00Z',
            summary: { total_items: 1, wrong_count: 1, uncertain_count: 0 },
          },
        ],
      },
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      mutate: vi.fn(),
    });
    const { default: History } = await import('@/pages/History');
    const user = userEvent.setup();

    render(<History />);

    expect(screen.getByRole('heading', { name: '数学' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '物理' })).not.toBeInTheDocument();
    await user.click(screen.getByText('tune').closest('button')!);
    await user.click(screen.getByRole('button', { name: '物理' }));

    expect(showToastMock).toHaveBeenCalledWith('物理入口已暂时关闭', 'info');
    expect(useSubmissionsMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'physics' }),
    );
  });

  it('keeps Science records hidden while runtime capabilities are pending', async () => {
    capabilitiesLoading = true;
    isSubjectReadEnabledMock.mockReturnValue(true);
    useSubmissionsMock.mockReturnValue({
      data: {
        items: [
          {
            submission_id: 'sub-math-visible',
            subject: 'math',
            created_at: '2026-09-01T10:00:00Z',
            summary: { total_items: 1, wrong_count: 0, uncertain_count: 0 },
          },
          {
            submission_id: 'sub-physics-pending',
            subject: 'physics',
            created_at: '2026-09-01T09:00:00Z',
            summary: { total_items: 1, wrong_count: 1, uncertain_count: 0 },
          },
        ],
      },
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      mutate: vi.fn(),
    });
    const { default: History } = await import('@/pages/History');

    render(<History />);

    expect(screen.getByRole('heading', { name: '数学' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '物理' })).not.toBeInTheDocument();
  });

  it('does not request a known Science report while runtime capability is pending', async () => {
    routeParams = { id: 'report-physics' };
    routeItemID = 'report-physics';
    locationState = { subject: 'physics' };
    capabilitiesLoading = true;
    isSubjectReadEnabledMock.mockReturnValue(false);
    const { default: ReportDetail } = await import('@/pages/ReportDetail');

    render(<ReportDetail />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(getMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('blocks a known Science report before requests when runtime capability is disabled', async () => {
    routeParams = { id: 'report-physics' };
    routeItemID = 'report-physics';
    locationState = { subject: 'physics' };
    isSubjectReadEnabledMock.mockReturnValue(false);
    const { default: ReportDetail } = await import('@/pages/ReportDetail');

    render(<ReportDetail />);
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/analysis', { replace: true });
    });

    expect(getMock).not.toHaveBeenCalled();
  });

  it('uses the loaded report subject when stale navigation state says Math', async () => {
    routeParams = { id: 'report-physics' };
    routeItemID = 'report-physics';
    locationState = { subject: 'math' };
    isSubjectReadEnabledMock.mockImplementation((subject: string) => subject !== 'physics');
    getMock.mockResolvedValue({
      data: {
        report_id: 'report-physics',
        params: { subject: 'physics' },
      },
    });
    const { default: ReportDetail } = await import('@/pages/ReportDetail');

    render(<ReportDetail />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/analysis', { replace: true });
    });
    expect(getMock).toHaveBeenCalledWith('/reports/report-physics', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('keeps the Analysis English report path readable when new English submission is off', async () => {
    getMock.mockResolvedValue({ data: { eligible: true } });
    const { default: Analysis } = await import('@/pages/Analysis');
    const user = userEvent.setup();

    render(<Analysis />);

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith('/reports/eligibility', expect.objectContaining({
        params: expect.objectContaining({ subject: 'math' }),
      }));
    });
    await user.click(screen.getByRole('button', { name: '学科：数学' }));

    expect(await screen.findByRole('button', { name: '学科：英语' })).toBeInTheDocument();
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith('/reports/eligibility', expect.objectContaining({
        params: expect.objectContaining({ subject: 'english' }),
      }));
    });
    expect(showToastMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '报告记录' }));
    expect(navigateMock).toHaveBeenCalledWith('/report-history');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('cycles Analysis reports through Math, English, Physics, and Chemistry', async () => {
    getMock.mockResolvedValue({ data: { eligible: true } });
    const { default: Analysis } = await import('@/pages/Analysis');
    const user = userEvent.setup();

    render(<Analysis />);

    expect(within(screen.getByRole('button', { name: '天数：3天' })).getByText('7天')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: '学科：数学' })).getByText('英语')).toBeInTheDocument();

    for (const [from, to, apiSubject] of [
      ['数学', '英语', 'english'],
      ['英语', '物理', 'physics'],
      ['物理', '化学', 'chemistry'],
    ] as const) {
      await user.click(await screen.findByRole('button', { name: `学科：${from}` }));
      expect(await screen.findByRole('button', { name: `学科：${to}` })).toBeInTheDocument();
      await waitFor(() => {
        expect(getMock).toHaveBeenCalledWith('/reports/eligibility', expect.objectContaining({
          params: expect.objectContaining({ subject: apiSubject }),
        }));
      });
    }
  });

  it('does not switch Analysis to a runtime-disabled Science subject', async () => {
    isSubjectReadEnabledMock.mockImplementation((subject: string) => subject !== 'physics');
    getMock.mockResolvedValue({ data: { eligible: true } });
    const { default: Analysis } = await import('@/pages/Analysis');
    const user = userEvent.setup();

    render(<Analysis />);
    await user.click(screen.getByRole('button', { name: '学科：数学' }));
    await user.click(await screen.findByRole('button', { name: '学科：英语' }));

    expect(screen.getByRole('button', { name: '学科：英语' })).toBeInTheDocument();
    expect(showToastMock).toHaveBeenCalledWith('物理入口已暂时关闭', 'info');
    expect(getMock).not.toHaveBeenCalledWith('/reports/eligibility', expect.objectContaining({
      params: expect.objectContaining({ subject: 'physics' }),
    }));
  });

  it('does not reuse report eligibility while a newly selected subject is loading', async () => {
    const pendingEnglish = deferred<{ data: { eligible: boolean } }>();
    getMock
      .mockResolvedValueOnce({ data: { eligible: true } })
      .mockImplementationOnce(() => pendingEnglish.promise);
    const { default: Analysis } = await import('@/pages/Analysis');
    const user = userEvent.setup();

    render(<Analysis />);

    const generateButton = screen.getByRole('button', { name: '生成报告' });
    await waitFor(() => expect(generateButton).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '学科：数学' }));

    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/reports/eligibility', expect.objectContaining({
      params: expect.objectContaining({ subject: 'english' }),
    })));
    expect(generateButton).toBeDisabled();
    await user.click(generateButton);
    expect(postMock).not.toHaveBeenCalled();

    pendingEnglish.resolve({ data: { eligible: true } });
    await waitFor(() => expect(generateButton).toBeEnabled());
  });

  it('resolves Tutor content and owned evidence by exact item identity', async () => {
    locationState = {
      submissionId: 'sub-english',
      subject: 'english',
      card: {
        item_id: 'item-decoy',
        question_number: '12',
        page_index: 0,
        verdict: 'incorrect',
        question_content: 'Duplicate number, wrong item.',
        figure_slice_image_url: '/decoy.png',
      },
    };
    getMock.mockResolvedValue({ data: englishSubmission() });
    const { default: AITutor } = await import('@/pages/AITutor');

    render(<AITutor />);

    const question = await screen.findByTestId('english-question-text');
    expect(question.textContent).toBe("Keep A.D. exactly.\n(1) Don't split A-D.\nA-D is one token.");
    expect(screen.queryByText('Duplicate number, wrong item.')).not.toBeInTheDocument();
    expect(screen.getByTestId('material-text').textContent).toBe(
      'Line one of the passage.\n\nLine three stays separate.',
    );
    expect(screen.getByAltText('题目图示')).toHaveAttribute('src', '/owned-target.png');
    expect(screen.queryByAltText('题目图示')).not.toHaveAttribute('src', '/owned-decoy.png');
  });

  it('waits for submission subject confirmation before sending an English Tutor message', async () => {
    locationState = {
      submissionId: 'sub-english',
      card: {
        item_id: 'item-target',
        question_number: '12',
        page_index: 0,
        subject: 'english',
        verdict: 'incorrect',
        question_content: 'Choose the answer.',
      },
    };
    const pendingDetail = deferred<{ data: ReturnType<typeof englishSubmission> }>();
    getMock.mockReturnValue(pendingDetail.promise);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(streamResponse());
    const { default: AITutor } = await import('@/pages/AITutor');
    const user = userEvent.setup();

    render(<AITutor />);
    expect(screen.queryByPlaceholderText('问问是知...')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    pendingDetail.resolve({ data: englishSubmission() });
    const input = await screen.findByPlaceholderText('问问是知...');
    await user.type(input, 'Why is B wrong?');
    await user.click(screen.getByText('send').closest('button')!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      subject: 'english',
      submission_id: 'sub-english',
      context_item_ids: ['item-target'],
    });
  });

  it('degrades a broken Tutor evidence image without disturbing the English text', async () => {
    locationState = { submissionId: 'sub-english', subject: 'english' };
    getMock.mockResolvedValue({ data: englishSubmission() });
    const { default: AITutor } = await import('@/pages/AITutor');

    render(<AITutor />);

    const image = await screen.findByAltText('题目图示');
    fireEvent.error(image);

    expect(screen.queryByAltText('题目图示')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('题目图片暂不可用');
    expect(screen.getByTestId('english-question-text')).toHaveTextContent("Keep A.D. exactly.");
  });

  it('does not display a full-page Tutor fallback when canonical English evidence is missing', async () => {
    locationState = { submissionId: 'sub-english', subject: 'english' };
    const submission = englishSubmission();
    submission.evidence_registry = [];
    getMock.mockResolvedValue({ data: submission });
    vi.mocked(fetch).mockResolvedValue(streamResponse({
      messages: [
        { role: 'user', content: 'Show the image.' },
        { role: 'assistant', content: 'The exact crop is unavailable.' },
      ],
      focus_image_urls: ['/full-page-fallback.png'],
      focus_image_source: 'page',
      focus_review_context: {
        learning_context: {
          contract_version: 'learning_artifacts_v1',
          item_id: 'item-target',
          material_group_id: 'group-reading',
          context_status: 'complete',
          evidence_ids: [],
        },
      },
    }));
    const { default: AITutor } = await import('@/pages/AITutor');
    const user = userEvent.setup();

    render(<AITutor />);
    await screen.findByTestId('english-question-text');
    await user.type(screen.getByPlaceholderText('问问是知...'), 'Show the image.');
    await user.click(screen.getByText('send').closest('button')!);

    expect(await screen.findByText('The exact crop is unavailable.')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.querySelector('img[src="/full-page-fallback.png"]')).not.toBeInTheDocument();
  });

  it('sends Tutor identity-only context without synthetic system question text', async () => {
    locationState = { submissionId: 'sub-english', subject: 'english' };
    getMock.mockResolvedValue({ data: englishSubmission() });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(streamResponse());
    const { default: AITutor } = await import('@/pages/AITutor');
    const user = userEvent.setup();

    render(<AITutor />);
    await screen.findByTestId('english-question-text');
    await user.type(screen.getByPlaceholderText('问问是知...'), 'Why is B wrong?');
    await user.click(screen.getByText('send').closest('button')!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as {
      history: Array<{ role: string; content: string }>;
      submission_id: string;
      context_item_ids: string[];
      question: string;
    };
    expect(payload.submission_id).toBe('sub-english');
    expect(payload.context_item_ids).toEqual(['item-target']);
    expect(payload.question).toBe('Why is B wrong?');
    expect(payload.history).toEqual([{ role: 'user', content: 'Why is B wrong?' }]);
    expect(payload.history.some((message) => message.role === 'system')).toBe(false);
    expect(JSON.stringify(payload)).not.toContain('【题目上下文】');
  });

  it('consumes identity-only canonical learning context from Tutor SSE', async () => {
    locationState = { submissionId: 'sub-english', subject: 'english' };
    getMock.mockResolvedValue({ data: englishSubmission() });
    vi.mocked(fetch).mockResolvedValue(streamResponse({
      messages: [
        { role: 'user', content: 'Show me the evidence.' },
        { role: 'assistant', content: 'Use line three.' },
      ],
      focus_review_context: {
        learning_context: {
          contract_version: 'learning_artifacts_v1',
          item_id: 'item-target',
          material_group_id: 'group-reading',
          context_status: 'complete',
          evidence_ids: ['evidence-target', 'evidence-material'],
        },
      },
    }));
    const { default: AITutor } = await import('@/pages/AITutor');
    const user = userEvent.setup();

    render(<AITutor />);
    await screen.findByTestId('english-question-text');
    await user.type(screen.getByPlaceholderText('问问是知...'), 'Show me the evidence.');
    await user.click(screen.getByText('send').closest('button')!);

    const status = await screen.findByText('学习上下文已同步');
    expect(status).toHaveAttribute('data-item-id', 'item-target');
    expect(status).toHaveAttribute('data-material-group-id', 'group-reading');
    expect(screen.getByText('Use line three.')).toBeInTheDocument();
  });

  it('validates exact Tutor reply evidence after subject confirmation without restoring history', async () => {
    locationState = { submissionId: 'sub-english', subject: 'english' };
    window.localStorage.setItem('chat_session_sub-english_item-target', 'history-session');
    const detail = englishSubmission();
    const target = detail.questions.find((question) => question.item_id === 'item-target');
    if (!target) throw new Error('missing target Tutor fixture');
    delete (target as Partial<LearningQuestion>).display_mode;
    detail.question_cards = detail.question_cards.map((card) => ({
      ...card,
      visual_risk: false,
      figure_slice_image_url: undefined,
      question_slice_image_url: undefined,
    }));
    let resolveDetail: ((value: { data: typeof detail }) => void) | undefined;
    getMock.mockReturnValue(new Promise((resolve) => {
      resolveDetail = resolve;
    }));
    vi.mocked(fetch).mockResolvedValue(streamResponse({
      session_id: 'history-session',
      messages: [
        { role: 'user', content: 'Show the saved evidence.' },
        { role: 'assistant', content: 'Here is the exact saved crop.' },
      ],
      focus_image_urls: ['/owned-target.png'],
      focus_image_source: 'learning_evidence',
      focus_review_context: {
        learning_context: {
          contract_version: 'learning_artifacts_v1',
          item_id: 'item-target',
          material_group_id: 'group-reading',
          context_status: 'complete',
          evidence_ids: ['evidence-target'],
        },
      },
    }));
    const { default: AITutor } = await import('@/pages/AITutor');

    render(<AITutor />);

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText('Here is the exact saved crop.')).not.toBeInTheDocument();
    expect(screen.queryByAltText('题图参考')).not.toBeInTheDocument();
    resolveDetail?.({ data: detail });

    const input = await screen.findByRole('textbox');
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Show the saved evidence.' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('Here is the exact saved crop.')).toBeInTheDocument();
    expect(await screen.findByAltText('题图参考')).toHaveAttribute('src', '/owned-target.png');
  });

  it('renders every backend English report dimension and removes math-only advice', async () => {
    routeParams = { id: 'report-english' };
    routeItemID = 'report-english';
    getMock.mockResolvedValue({
      data: {
        report_id: 'report-english',
        title: '英语近30天学情报告',
        params: { subject: 'english', window_days: 30 },
        exclusions_snapshot: { key_takeaway: 'Focus on evidence and grammar.' },
        stats: {
          overall: { accuracy: 2 / 3, sample_size: 4, correct: 2, incorrect: 1, uncertain: 1 },
          knowledge_mastery: {
            rows: [{ tag: '语言技能/阅读/细节理解', wrong_count: 1 }],
          },
          meta: {
            cause_definitions: {
              grammar: { display_name_cn: '语法' },
              evidence: { display_name_cn: '证据定位' },
            },
          },
          cause_distribution: { severity_counts: { grammar: 1, evidence: 1 } },
          english: {
            contract_coverage: { native_v1: 2, mixed: 1, legacy_fallback: 1 },
            by_question_type: { reading_choice: 2, writing: 1, short_answer: 1 },
            by_answer_mode: { choice_single: 2, writing: 1, short_answer: 1 },
            by_error_type: { grammar: 1, evidence: 1, missing_answer: 1 },
            by_knowledge_tag: {
              'english_universal_v1|engv1:language-skill:reading-detail': {
                taxonomy_version: 'english_universal_v1',
                canonical_path: '语言技能/阅读/细节理解',
                item_count: 2,
                incorrect: 1,
              },
            },
            item_count: 4,
            material_group_count: 1,
            blank_count: 1,
            accuracy: {
              rate: 2 / 3,
              sample_size: 3,
              correct: 2,
              incorrect: 1,
              excluded_uncertain: 1,
            },
          },
        },
      },
    });
    const { default: ReportDetail } = await import('@/pages/ReportDetail');

    render(<ReportDetail />);

    const englishStats = await screen.findByTestId('english-report-stats');
    expect(within(englishStats).getByText('英语结构与题型')).toBeInTheDocument();
    expect(within(englishStats).getByText('原生结构')).toBeInTheDocument();
    expect(within(englishStats).getByText('混合结构')).toBeInTheDocument();
    expect(within(englishStats).getByText('兼容回退')).toBeInTheDocument();
    expect(within(englishStats).getByText('阅读选择')).toBeInTheDocument();
    expect(within(englishStats).getByText('单选')).toBeInTheDocument();
    expect(within(englishStats).getByText('语法')).toBeInTheDocument();
    expect(within(englishStats).getByText('语言技能/阅读/细节理解')).toBeInTheDocument();
    expect(within(englishStats).getByText('题目 4')).toBeInTheDocument();
    expect(within(englishStats).getByText('材料题组 1')).toBeInTheDocument();
    expect(within(englishStats).getByText('空答 1')).toBeInTheDocument();
    expect(within(englishStats).getByText('待定 1 题未计入正确率')).toBeInTheDocument();
    expect(screen.queryByText(/关键公式|等式|计算稳健/)).not.toBeInTheDocument();
  });

  it('provides API-realistic complete, degraded, and legacy English mock shapes', async () => {
    const mockDataModule = await import('@/services/mockData');
    const {
      MOCK_ENGLISH_HISTORY,
      MOCK_ENGLISH_JOB_STATES,
      MOCK_CAPABILITIES_RESPONSE,
      MOCK_HISTORY,
      MOCK_JOB_STATES,
      MOCK_UPLOAD_RESPONSE,
      getMockSubmissionDetail,
    } = mockDataModule;
    const { buildQuestionPresentation } = await import('@/utils/questionPresentation');
    const states = MOCK_ENGLISH_JOB_STATES as unknown as Record<
      string,
      { result?: Record<string, unknown> | null }
    >;

    expect(states.all_done.result).toMatchObject({
      subject: 'english',
      artifact_contract_version: 'learning_artifacts_v1',
      artifact_contract_status: 'complete',
    });
    expect(states.page1_done.result).toMatchObject({
      subject: 'english',
      artifact_contract_version: 'learning_artifacts_v1',
      artifact_contract_status: 'degraded',
    });
    expect(states.legacy_done.result).toMatchObject({
      subject: 'english',
      artifact_contract_provenance: 'legacy_fallback',
    });
    expect(MOCK_ENGLISH_HISTORY).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ submission_id: expect.any(String), subject: 'english' }),
      ]),
    });
    expect(MOCK_JOB_STATES.all_done.result).toMatchObject({
      questions: expect.arrayContaining([
        expect.objectContaining({ item_id: 'q1' }),
      ]),
    });
    expect(MOCK_HISTORY).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ submission_id: expect.any(String), subject: 'math' }),
      ]),
    });
    expect(MOCK_CAPABILITIES_RESPONSE).toEqual({
      capability_contract_version: 'capabilities_v1',
      subjects: {
        math: { read_enabled: true, submission_enabled: true },
        english: { read_enabled: true, submission_enabled: true },
        physics: { read_enabled: true, submission_enabled: true },
        chemistry: { read_enabled: true, submission_enabled: true },
      },
    });
    expect(MOCK_UPLOAD_RESPONSE.page_image_urls).toEqual([
      '/tint-logo.png',
      '/tint-logo-hd-neu.png',
    ]);
    const englishDetail = getMockSubmissionDetail('english', 'mock_upload_123');
    expect(englishDetail).toMatchObject({
      submission_id: 'mock_upload_123',
      subject: 'english',
      artifact_contract_version: 'learning_artifacts_v1',
      questions: expect.arrayContaining([
        expect.objectContaining({ item_id: 'p1:q:12(A)' }),
      ]),
    });
    expect(getMockSubmissionDetail('math', 'mock_upload_123')).toMatchObject({
      submission_id: 'mock_upload_123',
      subject: 'math',
      questions: expect.arrayContaining([
        expect.objectContaining({ item_id: 'q1' }),
      ]),
    });
    expect(getMockSubmissionDetail('math', 'mock_submission_english_degraded')).toMatchObject({
      subject: 'english',
      artifact_contract_status: 'degraded',
      submission_id: 'mock_submission_english_degraded',
    });
    expect(getMockSubmissionDetail('math', 'mock_submission_english_legacy')).toMatchObject({
      subject: 'english',
      artifact_contract_provenance: 'legacy_fallback',
      submission_id: 'mock_submission_english_legacy',
    });
    const getMockJobState = (mockDataModule as unknown as {
      getMockJobState?: (subject: 'math' | 'english', elapsedMs: number) => Record<string, unknown>;
    }).getMockJobState;
    expect(getMockJobState).toBeTypeOf('function');
    expect(getMockJobState?.('english', 2500)).toMatchObject({
      status: 'processing',
      result: expect.objectContaining({ subject: 'english', artifact_contract_status: 'degraded' }),
    });
    expect(getMockJobState?.('english', 6500)).toMatchObject({
      status: 'done',
      result: expect.objectContaining({ subject: 'english', artifact_contract_status: 'complete' }),
    });
    const detailPresentation = buildQuestionPresentation(englishDetail);
    expect(detailPresentation.source).toBe('learning_artifacts_v1');
    expect(detailPresentation.materialGroups).toEqual([
      expect.objectContaining({
        group_id: 'group-reading-12',
        item_ids: ['p1:q:12(A)'],
      }),
    ]);

    expect(buildQuestionPresentation(states.all_done.result).source).toBe('learning_artifacts_v1');
    expect(buildQuestionPresentation(states.all_done.result).contractStatus).toBe('complete');
    expect(buildQuestionPresentation(states.page1_done.result).source).toBe('learning_artifacts_v1');
    expect(buildQuestionPresentation(states.page1_done.result).contractStatus).toBe('degraded');
    expect(buildQuestionPresentation(states.legacy_done.result).source).toBe('fallback');
  });
});
