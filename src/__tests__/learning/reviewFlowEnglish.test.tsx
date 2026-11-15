import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ReviewFlow from '@/pages/ReviewFlow';
import { buildQuestionPresentation } from '@/utils/questionPresentation';

const {
  navigateMock,
  getMock,
  postMock,
  deleteMock,
  showToastMock,
  locationStateRef,
  locationSearchRef,
  routeParamsRef,
  capabilityStateRef,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  getMock: vi.fn(),
  postMock: vi.fn(),
  deleteMock: vi.fn(),
  showToastMock: vi.fn(),
  locationStateRef: { current: null as Record<string, unknown> | null },
  locationSearchRef: { current: '' },
  routeParamsRef: { current: {} as Record<string, string> },
  capabilityStateRef: {
    current: { loading: false, readEnabled: true },
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: locationStateRef.current, search: locationSearchRef.current }),
    useParams: () => routeParamsRef.current,
  };
});

vi.mock('@/services/api', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
    delete: deleteMock,
  },
}));

vi.mock('@/config/features', () => ({
  FEATURE_ENGLISH_RENDER_ENABLED: true,
  FEATURE_ENGLISH_SUBMISSION_ENABLED: false,
  FEATURE_ENGLISH_ENABLED: false,
  FEATURE_PHYSICS_RENDER_ENABLED: true,
  FEATURE_PHYSICS_SUBMISSION_ENABLED: true,
  FEATURE_CHEMISTRY_RENDER_ENABLED: true,
  FEATURE_CHEMISTRY_SUBMISSION_ENABLED: true,
}));

vi.mock('@/hooks/useSubjectCapabilities', () => ({
  useSubjectCapabilities: () => ({
    loading: capabilityStateRef.current.loading,
    isReadEnabled: () => capabilityStateRef.current.readEnabled,
    isSubmissionEnabled: () => true,
  }),
}));

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'zh' }),
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

vi.mock('@/components/ui/QuestionText', () => ({
  QuestionText: (props: { text?: string }) => <div>{props.text}</div>,
}));

const groupMistakes = [
  {
    submission_id: 'sub-english',
    subject: 'english',
    item_id: 'item:a#1',
    question_number: '7',
    display_mode: 'material_group',
    material_group_id: 'group-reading',
    evidence_refs: ['ev-owned-question'],
    reason: 'First item feedback',
    knowledge_tags: ['reading'],
  },
  {
    submission_id: 'sub-english',
    subject: 'english',
    item_id: 'item-b',
    question_number: '8',
    display_mode: 'material_group',
    material_group_id: 'group-reading',
    evidence_refs: [],
    reason: 'Second item feedback',
    knowledge_tags: ['reading'],
  },
];

const groupSubmission = {
  submission_id: 'sub-english',
  subject: 'english',
  question_cards: [
    {
      item_id: 'item:a#1',
      question_number: '7',
      page_index: 0,
      question_content: 'First grouped question',
      verdict: 'incorrect',
    },
    {
      item_id: 'item-b',
      question_number: '8',
      page_index: 0,
      question_content: 'Second grouped question',
      verdict: 'incorrect',
    },
  ],
  questions: [
    {
      item_id: 'item:a#1',
      question_number: '7',
      page_index: 0,
      subject: 'english',
      display_mode: 'material_group',
      material_group_id: 'group-reading',
      group_position: 1,
      question_text: 'First grouped question',
      evidence_refs: ['ev-owned-question'],
      options: [],
    },
    {
      item_id: 'item-b',
      question_number: '8',
      page_index: 0,
      subject: 'english',
      display_mode: 'material_group',
      material_group_id: 'group-reading',
      group_position: 2,
      question_text: 'Second grouped question',
      evidence_refs: [],
      options: [],
    },
  ],
  material_groups: [
    {
      group_id: 'group-reading',
      title: 'Reading with diagrams',
      material_type: 'mixed',
      display_order: 1,
      page_indices: [0],
      status: 'complete',
      warnings: [],
      item_ids: ['item:a#1', 'item-b'],
      materials: [],
    },
  ],
  evidence_registry: [],
};

const evidence = (
  fields: Record<string, unknown>,
): Record<string, unknown> => ({
  evidence_id: 'ev-owned-question',
  owner_type: 'question',
  owner_id: 'target-item',
  role: 'question',
  kind: 'bbox',
  canonicalization_version: 'evidence_v1',
  content_hash: 'sha256:test',
  page_index: 0,
  storage_ref: 'page-1',
  bbox: { x: 0, y: 0, width: 1, height: 1, unit: 'normalized' },
  image_url: '/owned-question.png',
  ...fields,
});

const mockReviewData = ({
  active,
  all = active,
  submission,
}: {
  active: Array<Record<string, unknown>>;
  all?: Array<Record<string, unknown>>;
  submission: Record<string, unknown>;
}) => {
  getMock.mockImplementation((url: string, config?: { params?: { include_excluded?: boolean } }) => {
    if (url === '/mistakes') {
      return Promise.resolve({
        data: { items: config?.params?.include_excluded ? all : active },
      });
    }
    if (url.startsWith('/submissions/')) return Promise.resolve({ data: submission });
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
};

describe('ReviewFlow English history and evidence ownership', () => {
  beforeEach(() => {
    locationStateRef.current = { mode: 'review', subject: 'english' };
    locationSearchRef.current = '';
    routeParamsRef.current = {};
    capabilityStateRef.current = { loading: false, readEnabled: true };
    navigateMock.mockReset();
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    showToastMock.mockReset();
    postMock.mockResolvedValue({ data: { ok: true } });
    deleteMock.mockResolvedValue({ data: { ok: true } });
  });

  it('keeps historical English readable when new English submission is disabled', async () => {
    mockReviewData({ active: groupMistakes, submission: groupSubmission });

    render(<ReviewFlow />);

    expect(await screen.findByText('英语')).toBeInTheDocument();
    expect(await screen.findByText('First grouped question')).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith('/mistakes', {
      params: {
        subject: 'english',
        knowledge_point_id: undefined,
        taxonomy_version: undefined,
        limit_submissions: 10000,
      },
    });
    expect(showToastMock).not.toHaveBeenCalledWith(
      '当前仅支持数学作业，英语入口已暂时关闭',
      'info',
    );
  });

  it('distinguishes a failed filtered request from an empty category', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getMock.mockRejectedValue(new Error('taxonomy request failed'));

    render(<ReviewFlow />);

    expect(await screen.findByText('数据加载失败')).toBeInTheDocument();
    expect(screen.queryByText('暂无数据')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('sends the exact taxonomy leaf identity to both mistake-list requests', async () => {
    locationStateRef.current = null;
    locationSearchRef.current = '?subject=english&mode=review&taxonomy_version=english_universal_v1&tag_name=%E7%BB%86%E8%8A%82%E7%90%86%E8%A7%A3';
    routeParamsRef.current = { tag: 'engv1%3Alanguage-skill%3Areading-detail' };
    mockReviewData({ active: [], submission: groupSubmission });

    render(<ReviewFlow />);

    await screen.findByText('暂无数据');
    const params = {
      subject: 'english',
      knowledge_point_id: 'engv1:language-skill:reading-detail',
      taxonomy_version: 'english_universal_v1',
      limit_submissions: 10000,
    };
    expect(getMock).toHaveBeenCalledWith('/mistakes', { params });
    expect(getMock).toHaveBeenCalledWith('/mistakes', {
      params: { ...params, include_excluded: true },
    });
  });

  it('preserves a Physics subject on a direct knowledge-category URL', async () => {
    locationStateRef.current = null;
    locationSearchRef.current = '?subject=physics&mode=review&taxonomy_version=physics_cn_secondary_v1';
    const physicsMistake = {
      submission_id: 'sub-physics',
      subject: 'physics',
      item_id: 'physics-item-1',
      question_number: '1',
      reason: '由牛顿第二定律可知加速度方向与合力相同。',
    };
    mockReviewData({
      active: [physicsMistake],
      submission: {
        submission_id: 'sub-physics',
        subject: 'physics',
        question_cards: [{
          item_id: 'physics-item-1',
          question_number: '1',
          page_index: 0,
          question_content: '比较物体的加速度。',
          verdict: 'incorrect',
        }],
      },
    });

    render(<ReviewFlow />);

    expect(await screen.findByText('物理')).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith('/mistakes', {
      params: expect.objectContaining({ subject: 'physics' }),
    });
  });

  it('does not query Math or Science when a direct Science review route is disabled', async () => {
    locationStateRef.current = null;
    locationSearchRef.current = '?subject=physics&mode=review&taxonomy_version=physics_cn_secondary_v1';
    capabilityStateRef.current = { loading: false, readEnabled: false };

    render(<ReviewFlow />);

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('物理入口已暂时关闭', 'info');
      expect(navigateMock).toHaveBeenCalledWith('/data?subject=math', { replace: true });
    });
    expect(getMock).not.toHaveBeenCalledWith('/mistakes', expect.anything());
  });

  it('renders exact raw question content and its slice before submission detail arrives', async () => {
    const item = {
      submission_id: 'sub-raw',
      subject: 'english',
      item_id: 'raw-item',
      question_number: 'IV.2',
      reason: 'Raw feedback',
      raw: {
        question_text: 'Raw question available from the mistake list.',
        review_slice_image_url: '/raw-question-slice.png',
      },
    };
    getMock.mockImplementation((url: string, config?: { params?: { include_excluded?: boolean } }) => {
      if (url === '/mistakes') {
        return Promise.resolve({
          data: { items: config?.params?.include_excluded ? [item] : [item] },
        });
      }
      if (url === '/submissions/sub-raw') return new Promise(() => undefined);
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    render(<ReviewFlow />);

    expect(await screen.findByText('Raw question available from the mistake list.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '英语题目 IV.2 图示' })).toHaveAttribute(
      'src',
      '/raw-question-slice.png',
    );
  });

  it('loads submission details progressively with at most four concurrent requests', async () => {
    const items = Array.from({ length: 6 }, (_, index) => ({
      submission_id: `sub-${index + 1}`,
      subject: 'english',
      item_id: `item-${index + 1}`,
      question_number: String(index + 1),
      raw: index === 1 ? undefined : { question_text: `Raw question ${index + 1}` },
    }));
    const started: string[] = [];
    const pending: Array<() => void> = [];
    let activeRequests = 0;
    let maxActiveRequests = 0;

    getMock.mockImplementation((url: string, config?: { params?: { include_excluded?: boolean } }) => {
      if (url === '/mistakes') {
        return Promise.resolve({
          data: { items: config?.params?.include_excluded ? items : items },
        });
      }
      if (url.startsWith('/submissions/')) {
        started.push(url);
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        return new Promise((resolve) => {
          pending.push(() => {
            activeRequests -= 1;
            const submissionID = url.split('/').pop() || '';
            const itemID = `item-${submissionID.replace('sub-', '')}`;
            resolve({
              data: {
                submission_id: submissionID,
                subject: 'english',
                questions: [{ item_id: itemID, question_text: `Detail question ${submissionID.replace('sub-', '')}` }],
              },
            });
          });
        });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    render(<ReviewFlow />);

    await waitFor(() => expect(started).toHaveLength(4));
    expect(maxActiveRequests).toBe(4);

    await userEvent.click(screen.getAllByRole('button', { name: '标记为已掌握' })[0]);
    await waitFor(() => expect(postMock).toHaveBeenCalled());
    expect(started).toHaveLength(4);

    await act(async () => pending[0]());
    await waitFor(() => expect(started).toHaveLength(5));
    expect(maxActiveRequests).toBe(4);

    await act(async () => pending[1]());
    await waitFor(() => expect(started).toHaveLength(6));
    expect(maxActiveRequests).toBe(4);
    expect(await screen.findByText('Detail question 2')).toBeInTheDocument();

    await act(async () => pending.slice(2).forEach((resolve) => resolve()));
    expect(new Set(started).size).toBe(6);
  });

  it('orders mistakes from one English submission by its canonical presentation_nodes', async () => {
    const sourceOrderedMistakes = [
      { submission_id: 'upl_cc7f6757bb2089cf', subject: 'english', item_id: 'q-i-1', question_number: 'I.1', reason: 'first' },
      { submission_id: 'upl_cc7f6757bb2089cf', subject: 'english', item_id: 'q-ii-1', question_number: 'II.1', reason: 'third' },
      { submission_id: 'upl_cc7f6757bb2089cf', subject: 'english', item_id: 'q-i-2', question_number: 'I.2', reason: 'second' },
    ];
    const canonicalOrder = [
      { itemID: 'q-i-1', questionNumber: 'I.1', text: 'Canonical first' },
      { itemID: 'q-i-2', questionNumber: 'I.2', text: 'Canonical second' },
      { itemID: 'q-ii-1', questionNumber: 'II.1', text: 'Canonical third' },
    ];
    const questions = canonicalOrder.map(({ itemID, questionNumber, text }) => ({
      item_id: itemID,
      question_number: questionNumber,
      page_index: 0,
      subject: 'english',
      display_mode: 'simple_question',
      answer_mode: 'unknown',
      question_type: 'unknown',
      question_text: text,
      options: null,
      student_answer: '',
      student_answer_payload: { mode: 'unknown', text: '', evidence_refs: [] },
      answer_state: 'has_answer',
      verdict: 'incorrect',
      judgment_basis: [],
      knowledge_tags: ['Language skills/Reading/Detail'],
      knowledge_tag_items: [{
        tag_id: 'engv1:language-skill:reading-detail',
        taxonomy_version: 'english_universal_v1',
        canonical_path: 'Language skills/Reading/Detail',
        role: 'primary',
      }],
      evidence_refs: null,
      contract_provenance: 'native_v1',
      degradation_reasons: [],
      english_feedback: {
        question_type: 'unknown',
        explanation: 'Check the answer.',
        feedback_mode: 'answer_comparison',
        similarity_mode: 'none',
        evidence_refs: [],
      },
    }));
    const canonicalSubmission = {
        submission_id: 'upl_cc7f6757bb2089cf',
        subject: 'english',
        artifact_contract_version: 'learning_artifacts_v1',
        artifact_contract_revision: 1,
        artifact_contract_provenance: 'native_v1',
        artifact_contract_status: 'complete',
        artifact_contract_warnings: [],
        material_groups: [],
        evidence_registry: [],
        presentation_nodes: canonicalOrder.map(({ itemID }, index) => ({
          node_id: `question:${itemID}`,
          kind: 'question',
          ref_id: itemID,
          display_order: index + 1,
        })),
        questions,
        question_cards: canonicalOrder.map(({ itemID, questionNumber, text }) => ({
          item_id: itemID,
          question_number: questionNumber,
          page_index: 0,
          verdict: 'incorrect',
          question_content: text,
        })),
    };
    expect(buildQuestionPresentation(canonicalSubmission).source).toBe('learning_artifacts_v1');
    mockReviewData({ active: sourceOrderedMistakes, submission: canonicalSubmission });

    render(<ReviewFlow />);

    await waitFor(() => {
      const cards = screen.getAllByTestId('mistake-review-item');
      expect(cards.map((card) => card.textContent)).toEqual([
        expect.stringContaining('Canonical first'),
        expect.stringContaining('Canonical second'),
        expect.stringContaining('Canonical third'),
      ]);
    });
  });

  it('shows one shared material-group identity on each independent mistake item', async () => {
    mockReviewData({ active: groupMistakes, submission: groupSubmission });

    render(<ReviewFlow />);

    expect(await screen.findAllByText('题组 · Reading with diagrams')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '标记为已掌握' })).toHaveLength(2);
  });

  it('excludes only the selected child item from a shared material group', async () => {
    const user = userEvent.setup();
    mockReviewData({ active: groupMistakes, submission: groupSubmission });

    render(<ReviewFlow />);

    const cards = await screen.findAllByTestId('mistake-review-item');
    await user.click(within(cards[0]).getByRole('button', { name: '标记为已掌握' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/mistakes/exclusions', {
        submission_id: 'sub-english',
        item_id: 'item:a#1',
        reason: '已掌握',
      });
    });
    expect(screen.queryByText('First grouped question')).not.toBeInTheDocument();
    expect(screen.getByText('Second grouped question')).toBeInTheDocument();
  });

  it('restores only the selected child item using encoded canonical identities', async () => {
    const user = userEvent.setup();
    locationStateRef.current = { mode: 'mastered', subject: 'english' };
    mockReviewData({
      active: [groupMistakes[1]],
      all: groupMistakes,
      submission: groupSubmission,
    });

    render(<ReviewFlow />);

    await user.click(await screen.findByRole('button', { name: '恢复到错题' }));

    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalledWith(
        '/mistakes/exclusions/sub-english/item%3Aa%231',
      );
    });
    expect(screen.queryByText('First grouped question')).not.toBeInTheDocument();
  });

  it('uses only explicitly referenced and exactly owned English image evidence', async () => {
    const targetMistake = {
      submission_id: 'sub-english',
      subject: 'english',
      item_id: 'target-item',
      question_number: '7',
      evidence_refs: [
        'ev-owned-question',
        'ev-neighbor',
        'ev-wrong-role',
      ],
      reason: 'Target feedback',
      raw: {
        question_text: 'Target visual question',
        review_slice_image_url: '/raw-exact-question.png',
      },
    };
    mockReviewData({
      active: [targetMistake],
      submission: {
        submission_id: 'sub-english',
        subject: 'english',
        page_image_urls: ['/entire-page.png'],
        question_cards: [
          {
            item_id: 'neighbor-item',
            question_number: '7',
            page_index: 0,
            question_content: 'Neighbor question selected by number',
            review_slice_image_url: '/neighbor-card-slice.png',
          },
        ],
        questions: [
          {
            item_id: 'target-item',
            question_number: '7',
            page_index: 0,
            subject: 'english',
            display_mode: 'simple_question',
            question_text: 'Target visual question',
            evidence_refs: ['ev-owned-question', 'ev-neighbor', 'ev-wrong-role'],
            options: [],
          },
          {
            item_id: 'neighbor-item',
            question_number: '7',
            page_index: 0,
            subject: 'english',
            display_mode: 'simple_question',
            question_text: 'Neighbor visual question',
            evidence_refs: ['ev-neighbor'],
            options: [],
          },
        ],
        evidence_registry: [
          evidence({}),
          evidence({
            evidence_id: 'ev-neighbor',
            owner_id: 'neighbor-item',
            image_url: '/neighbor-evidence.png',
          }),
          evidence({
            evidence_id: 'ev-wrong-role',
            role: 'grading_basis',
            image_url: '/wrong-role.png',
          }),
          evidence({
            evidence_id: 'ev-unreferenced',
            image_url: '/unreferenced.png',
          }),
        ],
      },
    });

    render(<ReviewFlow />);

    expect(await screen.findByText('Target visual question')).toBeInTheDocument();
    const image = screen.getByRole('img', { name: '英语题目 7 图示' });
    await waitFor(() => expect(image).toHaveAttribute('src', '/owned-question.png'));
    expect(image).toHaveClass('object-contain');
    expect(image.parentElement).toHaveClass('w-24', 'h-24');
    expect(screen.queryByText('Neighbor question selected by number')).not.toBeInTheDocument();
    expect(document.querySelector('img[src="/neighbor-card-slice.png"]')).toBeNull();
    expect(document.querySelector('img[src="/neighbor-evidence.png"]')).toBeNull();
    expect(document.querySelector('img[src="/wrong-role.png"]')).toBeNull();
    expect(document.querySelector('img[src="/unreferenced.png"]')).toBeNull();
    expect(document.querySelector('img[src="/raw-exact-question.png"]')).toBeNull();
    expect(document.querySelector('img[src="/entire-page.png"]')).toBeNull();

    const frame = image.parentElement;
    fireEvent.error(image);

    expect(frame).toBeInTheDocument();
    expect(within(frame as HTMLElement).getByRole('status')).toHaveTextContent('题目图片暂不可用');
    expect(screen.queryByRole('img', { name: '英语题目 7 图示' })).not.toBeInTheDocument();
  });

  it('uses exact Physics item identity and owned evidence when question numbers repeat', async () => {
    locationStateRef.current = { mode: 'review', subject: 'physics' };
    const targetMistake = {
      submission_id: 'sub-physics',
      subject: 'physics',
      item_id: 'physics-target',
      question_number: '12(1)',
      evidence_refs: ['ev-physics-target'],
      reason: 'Target physics feedback',
    };
    mockReviewData({
      active: [targetMistake],
      submission: {
        submission_id: 'sub-physics',
        subject: 'physics',
        page_image_urls: ['/physics-entire-page.png'],
        question_cards: [{
          item_id: 'physics-neighbor',
          question_number: '12(1)',
          page_index: 0,
          question_content: 'Neighbor physics question selected by number',
          review_slice_image_url: '/physics-neighbor-slice.png',
        }],
        questions: [
          {
            item_id: 'physics-target',
            question_number: '12(1)',
            page_index: 0,
            subject: 'physics',
            display_mode: 'simple_question',
            question_text: 'Target circuit question with $I=U/R$.',
            evidence_refs: ['ev-physics-target'],
            options: [],
          },
          {
            item_id: 'physics-neighbor',
            question_number: '12(1)',
            page_index: 0,
            subject: 'physics',
            display_mode: 'simple_question',
            question_text: 'Neighbor circuit question.',
            evidence_refs: ['ev-physics-neighbor'],
            options: [],
          },
        ],
        evidence_registry: [
          evidence({
            evidence_id: 'ev-physics-target',
            owner_id: 'physics-target',
            image_url: '/physics-target-evidence.png',
          }),
          evidence({
            evidence_id: 'ev-physics-neighbor',
            owner_id: 'physics-neighbor',
            image_url: '/physics-neighbor-evidence.png',
          }),
        ],
      },
    });

    render(<ReviewFlow />);

    expect(await screen.findByText('Target circuit question with $I=U/R$.')).toBeInTheDocument();
    expect(screen.queryByText('Neighbor physics question selected by number')).not.toBeInTheDocument();
    const image = screen.getByRole('img', { name: '物理题目 12(1) 图示' });
    expect(image).toHaveAttribute('src', '/physics-target-evidence.png');
    expect(image).toHaveClass('object-contain');
    expect(document.querySelector('img[src="/physics-neighbor-slice.png"]')).toBeNull();
    expect(document.querySelector('img[src="/physics-entire-page.png"]')).toBeNull();
  });

  it('accepts an exact option image owner without borrowing a sibling material', async () => {
    const targetMistake = {
      submission_id: 'sub-english',
      subject: 'english',
      item_id: 'option-item',
      question_number: '9',
      display_mode: 'material_group',
      material_group_id: 'group-visual',
      evidence_refs: ['ev-question-ref-wrong-role', 'ev-option', 'ev-material'],
    };
    mockReviewData({
      active: [targetMistake],
      submission: {
        submission_id: 'sub-english',
        subject: 'english',
        questions: [
          {
            item_id: 'option-item',
            question_number: '9',
            page_index: 0,
            subject: 'english',
            display_mode: 'material_group',
            material_group_id: 'group-visual',
            group_position: 1,
            question_text: 'Choose the matching picture.',
            evidence_refs: ['ev-question-ref-wrong-role'],
            options: [{ option_id: 'A', text: 'Picture A', evidence_refs: ['ev-option'] }],
          },
        ],
        material_groups: [
          {
            group_id: 'group-visual',
            title: 'Picture passage',
            material_type: 'image',
            display_order: 1,
            page_indices: [0],
            status: 'complete',
            warnings: [],
            item_ids: ['option-item'],
            materials: [
              {
                material_id: 'material-visual',
                kind: 'image',
                display_order: 1,
                evidence_refs: ['ev-material'],
              },
            ],
          },
        ],
        evidence_registry: [
          evidence({
            evidence_id: 'ev-question-ref-wrong-role',
            owner_id: 'option-item',
            role: 'options',
            image_url: '/question-ref-wrong-role.png',
          }),
          evidence({
            evidence_id: 'ev-option',
            owner_id: 'option-item',
            role: 'options',
            image_url: '/owned-option.png',
          }),
          evidence({
            evidence_id: 'ev-material',
            owner_type: 'material',
            owner_id: 'material-visual',
            role: 'material',
            image_url: '/owned-material.png',
          }),
          evidence({
            evidence_id: 'ev-sibling-material',
            owner_type: 'material',
            owner_id: 'material-sibling',
            role: 'material',
            image_url: '/sibling-material.png',
          }),
        ],
      },
    });

    render(<ReviewFlow />);

    const image = await screen.findByRole('img', { name: '英语题目 9 图示' });
    expect(image).toHaveAttribute('src', '/owned-option.png');
    expect(document.querySelector('img[src="/question-ref-wrong-role.png"]')).toBeNull();
    expect(document.querySelector('img[src="/sibling-material.png"]')).toBeNull();
  });

  it('uses an explicitly referenced material image when the current group has no question image', async () => {
    const targetMistake = {
      submission_id: 'sub-english',
      subject: 'english',
      item_id: 'material-item',
      question_number: '10',
      display_mode: 'material_group',
      material_group_id: 'group-material',
      evidence_refs: ['ev-material-only'],
    };
    mockReviewData({
      active: [targetMistake],
      submission: {
        submission_id: 'sub-english',
        subject: 'english',
        questions: [
          {
            item_id: 'material-item',
            question_number: '10',
            page_index: 0,
            subject: 'english',
            display_mode: 'material_group',
            material_group_id: 'group-material',
            group_position: 1,
            question_text: 'Read the picture passage.',
            evidence_refs: ['ev-material-only'],
            options: [],
          },
        ],
        material_groups: [
          {
            group_id: 'group-material',
            title: 'Visual passage',
            material_type: 'image',
            display_order: 1,
            page_indices: [0],
            status: 'complete',
            warnings: [],
            item_ids: ['material-item'],
            materials: [
              {
                material_id: 'material-owner',
                kind: 'image',
                display_order: 1,
                evidence_refs: ['ev-material-only'],
              },
            ],
          },
        ],
        evidence_registry: [
          evidence({
            evidence_id: 'ev-material-only',
            owner_type: 'material',
            owner_id: 'material-owner',
            role: 'material',
            image_url: '/owned-material-only.png',
          }),
          evidence({
            evidence_id: 'ev-neighbor-material',
            owner_type: 'material',
            owner_id: 'neighbor-material-owner',
            role: 'material',
            image_url: '/neighbor-material-only.png',
          }),
        ],
      },
    });

    render(<ReviewFlow />);

    const image = await screen.findByRole('img', { name: '英语题目 10 图示' });
    expect(image).toHaveAttribute('src', '/owned-material-only.png');
    expect(document.querySelector('img[src="/neighbor-material-only.png"]')).toBeNull();
  });

  it('preserves the current Math slice and whole-page fallback behavior', async () => {
    locationStateRef.current = { mode: 'review', subject: 'math' };
    const mathItems = [
      {
        submission_id: 'sub-math',
        subject: 'math',
        item_id: 'math-1',
        question_number: '1',
        reason: 'Math one',
      },
      {
        submission_id: 'sub-math',
        subject: 'math',
        item_id: 'math-2',
        question_number: '2',
        reason: 'Math two',
      },
      {
        submission_id: 'sub-math',
        subject: 'math',
        item_id: 'math-3',
        question_number: '3',
        reason: 'Math three fallback',
        raw: {
          question_text: 'Math raw question',
          question_slice_image_url: '/math-raw-slice.png',
        },
      },
    ];
    mockReviewData({
      active: mathItems,
      submission: {
        submission_id: 'sub-math',
        subject: 'math',
        page_image_urls: ['/math-page.png'],
        question_cards: [
          {
            item_id: 'math-1',
            question_number: '1',
            page_index: 0,
            question_content: 'Math sliced question',
            review_slice_image_url: '/math-slice.png',
          },
          {
            item_id: 'math-2',
            question_number: '2',
            page_index: 0,
            question_content: 'Math page fallback question',
          },
        ],
      },
    });

    render(<ReviewFlow />);

    expect(await screen.findByText('Math sliced question')).toBeInTheDocument();
    expect(screen.getByText('数学')).toBeInTheDocument();
    expect(document.querySelector('img[src="/math-slice.png"]')).toBeInTheDocument();
    expect(document.querySelector('img[src="/math-page.png"]')).toBeInTheDocument();
    expect(screen.getByText('Math raw question')).toBeInTheDocument();
    expect(document.querySelector('img[src="/math-raw-slice.png"]')).toBeInTheDocument();
  });
});
