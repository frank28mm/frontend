import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';

import type { QuestionPresentation } from '@/utils/questionPresentation';

const navigateMock = vi.fn();
const getMock = vi.fn();
const postMock = vi.fn();
const showToastMock = vi.fn();
const isSubjectSubmissionEnabledMock = vi.fn();
const revalidateSubjectSubmissionMock = vi.fn();
const buildQuestionPresentationMock = vi.fn();
const setActiveProfileMock = vi.fn();
const useJobPollingMock = vi.fn();
let locationState: Record<string, unknown> | null = null;
let searchParamsValue = 'submissionId=submission-english';

const createStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: locationState }),
    useParams: () => ({}),
    useSearchParams: () => [new URLSearchParams(searchParamsValue)],
  };
});

vi.mock('@/services/api', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
  },
}));

vi.mock('@/utils/questionPresentation', () => ({
  buildQuestionPresentation: buildQuestionPresentationMock,
}));

vi.mock('@/hooks/useJobPolling', () => ({
  useJobPolling: useJobPollingMock,
}));

vi.mock('@/hooks/useSubjectCapabilities', () => ({
  useSubjectCapabilities: () => ({
    loading: false,
    isReadEnabled: () => true,
    isSubmissionEnabled: () => true,
  }),
}));

vi.mock('@/services/capabilities', () => ({
  isSubjectSubmissionEnabled: isSubjectSubmissionEnabledMock,
  revalidateSubjectSubmission: revalidateSubjectSubmissionMock,
}));

vi.mock('@/contexts/ProfileContext', () => ({
  useProfile: () => ({
    profiles: [],
    activeProfileId: 'profile-1',
    activeProfile: { profile_id: 'profile-1', display_name: 'DEAN' },
    setActiveProfile: setActiveProfileMock,
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock('@/components/ui/BackButton', () => ({
  BackButton: () => <button type="button">返回</button>,
}));

vi.mock('@/components/ui/HomeButton', () => ({
  HomeFab: ({ avoidContentOverlap }: { avoidContentOverlap?: boolean }) => (
    <div data-testid="home-fab" data-overlap-safe={String(Boolean(avoidContentOverlap))} />
  ),
}));

const uploadFile = () => new File(['page'], 'english-page.jpg', { type: 'image/jpeg' });

const renderUpload = async () => {
  locationState = { files: [uploadFile()] };
  const { default: Upload } = await import('@/pages/Upload');
  let rendered: ReturnType<typeof render> | undefined;
  await act(async () => {
    rendered = render(<Upload />);
  });
  return rendered!;
};

const materialPresentation = (): QuestionPresentation => {
  const uncertain = {
    item_id: 'item-uncertain',
    question_number: '1',
    page_index: 0,
    subject: 'english',
    verdict: 'uncertain',
    question_content: 'Which picture matches the passage?',
  };
  const incorrect = {
    item_id: 'item-incorrect',
    question_number: '2',
    page_index: 1,
    subject: 'english',
    verdict: 'incorrect',
    question_content: 'Choose the correct diagram.',
  };
  const correct = {
    item_id: 'item-correct',
    question_number: '3',
    page_index: 1,
    subject: 'english',
    verdict: 'correct',
    question_content: 'Complete the caption.',
  };
  const questions = [uncertain, incorrect, correct] as QuestionPresentation['questions'];
  return {
    source: 'learning_artifacts_v1',
    contractStatus: 'complete',
    warnings: [],
    materialGroups: [
      {
        group_id: 'group-visual-reading',
        title: 'Visual reading',
        material_type: 'diagram',
        display_order: 1,
        page_indices: [0, 1],
        status: 'complete',
        warnings: [],
        materials: [],
        item_ids: ['item-uncertain', 'item-incorrect', 'item-correct'],
      },
    ],
    evidenceRegistry: [],
    nodes: [
      {
        kind: 'material_group',
        refId: 'group-visual-reading',
        displayOrder: 1,
        group: {
          group_id: 'group-visual-reading',
          title: 'Visual reading',
          material_type: 'diagram',
          display_order: 1,
          page_indices: [0, 1],
          status: 'complete',
          warnings: [],
          materials: [],
          item_ids: ['item-uncertain', 'item-incorrect', 'item-correct'],
        },
        questions,
        verdictCounts: { total: 3, correct: 1, incorrect: 1, uncertain: 1 },
      },
    ],
    questions,
  };
};

describe('English grading pages', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorageMock(),
      configurable: true,
    });
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:english-page'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
    });
    navigateMock.mockReset();
    getMock.mockReset();
    postMock.mockReset();
    showToastMock.mockReset();
    isSubjectSubmissionEnabledMock.mockReset();
    revalidateSubjectSubmissionMock.mockReset();
    buildQuestionPresentationMock.mockReset();
    setActiveProfileMock.mockReset();
    useJobPollingMock.mockReset();
    isSubjectSubmissionEnabledMock.mockResolvedValue(true);
    revalidateSubjectSubmissionMock.mockResolvedValue(true);
    locationState = null;
    searchParamsValue = 'submissionId=submission-english';
  });

  it('submits uploaded pages for backend subject auto-detection without subject controls', async () => {
    postMock
      .mockResolvedValueOnce({ data: { upload_id: 'upload-1', page_image_urls: [], total_pages: 1 } })
      .mockResolvedValueOnce({ data: { job_id: 'job-1' } });
    window.localStorage.setItem('default_subject', 'english');

    await renderUpload();

    expect(screen.queryByRole('button', { name: '数学' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '英语' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('default_subject')).toBe('english');
    expect(isSubjectSubmissionEnabledMock).not.toHaveBeenCalled();
    expect(revalidateSubjectSubmissionMock).not.toHaveBeenCalled();
    await act(async () => {
      screen.getByRole('button', { name: '开始批改' }).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(postMock).toHaveBeenNthCalledWith(
      2,
      '/grade',
      { upload_id: 'upload-1', subject: 'auto' },
      { headers: { 'X-Force-Async': '1' } },
    );
    expect(navigateMock).toHaveBeenCalledWith('/result?jobId=job-1&submissionId=upload-1', {
      replace: true,
    });
  });

  it('keeps the active upload preview URL alive under StrictMode effect replay', async () => {
    let nextURL = 0;
    const createObjectURL = vi.fn(() => `blob:english-page-${++nextURL}`);
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    locationState = { files: [uploadFile()] };
    const { default: Upload } = await import('@/pages/Upload');

    await act(async () => {
      render(
        <StrictMode>
          <Upload />
        </StrictMode>,
      );
      await Promise.resolve();
    });

    const previewURL = screen.getByRole('img', { name: '作业预览' }).getAttribute('src');
    expect(previewURL).toMatch(/^blob:english-page-/);
    expect(revokeObjectURL).not.toHaveBeenCalledWith(previewURL);
  });

  it.each([
    ['ENGLISH_GRADING_DISABLED', '英语'],
    ['ENGLISH_GRADING_NOT_ALLOWLISTED', '英语'],
    ['PHYSICS_GRADING_DISABLED', '物理'],
    ['PHYSICS_GRADING_NOT_ALLOWLISTED', '物理'],
    ['CHEMISTRY_GRADING_DISABLED', '化学'],
    ['CHEMISTRY_GRADING_NOT_ALLOWLISTED', '化学'],
  ])('keeps the upload retryable when auto-detected subject returns %s', async (code, label) => {
    postMock
      .mockResolvedValueOnce({
        data: { upload_id: 'upload-1', page_image_urls: [], total_pages: 1 },
      })
      .mockRejectedValueOnce({ response: { status: 403, data: { detail: code } } });

    await renderUpload();
    await act(async () => {
      screen.getByRole('button', { name: '开始批改' }).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        `${label}批改当前未对该账号开放，图片已保留，请稍后重试`,
        'warning',
      );
    });
    expect(postMock).toHaveBeenNthCalledWith(
      2,
      '/grade',
      { upload_id: 'upload-1', subject: 'auto' },
      { headers: { 'X-Force-Async': '1' } },
    );
    expect(screen.getByRole('img', { name: '作业预览' })).toHaveAttribute('src', 'blob:english-page');
    expect(window.localStorage.getItem('active_job_id')).toBeNull();
    expect(navigateMock).not.toHaveBeenCalledWith(expect.stringContaining('/result'), expect.anything());
  });

  it('renders one material-group summary and opens its first incorrect item', async () => {
    const { ResultPresentation } = await import('@/components/learning/ResultPresentation');
    const user = userEvent.setup();
    const onOpenQuestion = vi.fn();

    render(
      <ResultPresentation
        presentation={materialPresentation()}
        filter="all"
        onOpenQuestion={onOpenQuestion}
        onAskAI={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId('result-presentation-node')).toHaveLength(1);
    expect(screen.getByText('Visual reading')).toBeInTheDocument();
    expect(screen.getByText('第 1-2 页')).toBeInTheDocument();
    expect(screen.getByText('3 小题')).toBeInTheDocument();
    expect(screen.getByText('1 错')).toBeInTheDocument();
    expect(screen.getAllByText('1 待定')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: '查看题组' }));
    expect(onOpenQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: 'item-incorrect' }),
      ['item-uncertain', 'item-incorrect', 'item-correct'],
    );
  });

  it('keeps the math review lifecycle visible while a card is pending review', async () => {
    const { ResultPresentation } = await import('@/components/learning/ResultPresentation');
    const pendingQuestion = {
      item_id: 'math-review-pending',
      question_number: '8',
      page_index: 0,
      subject: 'math',
      verdict: 'incorrect',
      card_state: 'review_pending',
      question_content: '如图，求角 A 的度数。',
      review_summary: '图像复核正在生成切片。',
    } as QuestionPresentation['questions'][number];
    const presentation: QuestionPresentation = {
      source: 'fallback',
      contractStatus: 'degraded',
      warnings: [],
      materialGroups: [],
      evidenceRegistry: [],
      nodes: [{
        kind: 'question',
        refId: pendingQuestion.item_id,
        displayOrder: 1,
        question: pendingQuestion,
        questions: [pendingQuestion],
        verdictCounts: { total: 1, correct: 0, incorrect: 1, uncertain: 0 },
      }],
      questions: [pendingQuestion],
    };

    render(
      <ResultPresentation
        presentation={presentation}
        filter="all"
        onOpenQuestion={vi.fn()}
        onAskAI={vi.fn()}
      />,
    );

    expect(screen.getByText('复核中...')).toBeInTheDocument();
    expect(screen.getByText('复核摘要：图像复核正在生成切片。')).toBeInTheDocument();
  });

  it('opens the matching item when a material group is filtered', async () => {
    const { ResultPresentation } = await import('@/components/learning/ResultPresentation');
    const user = userEvent.setup();
    const onOpenQuestion = vi.fn();
    const onAskAI = vi.fn();

    render(
      <ResultPresentation
        presentation={materialPresentation()}
        filter="correct"
        onOpenQuestion={onOpenQuestion}
        onAskAI={onAskAI}
      />,
    );

    await user.click(screen.getByRole('button', { name: '查看题组' }));
    expect(onOpenQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: 'item-correct' }),
      ['item-correct'],
    );

    await user.click(screen.getByRole('button', { name: '问是知' }));
    expect(onAskAI).toHaveBeenCalledWith(expect.objectContaining({ item_id: 'item-correct' }));
  });

  it('uses presentation nodes in the English summary and excludes uncertain from accuracy', async () => {
    const user = userEvent.setup();
    buildQuestionPresentationMock.mockReturnValue(materialPresentation());
    getMock.mockResolvedValue({
      data: {
        submission_id: 'submission-english',
        subject: 'english',
        summary: {
          total_items: 3,
          wrong_count: 1,
          uncertain_count: 1,
          blank_count: 0,
        },
        question_cards: [],
      },
    });
    const { default: ResultSummary } = await import('@/pages/ResultSummary');

    render(<ResultSummary />);

    expect(await screen.findByText('50%')).toBeInTheDocument();
    expect(screen.getAllByTestId('result-presentation-node')).toHaveLength(1);
    expect(screen.getByText('Visual reading')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看题组' }));
    expect(navigateMock).toHaveBeenCalledWith(
      '/question/item-incorrect?submissionId=submission-english',
      expect.objectContaining({
        state: expect.objectContaining({
          submissionId: 'submission-english',
          questionNav: { filter: 'wrong', itemIds: ['item-incorrect'] },
        }),
      }),
    );

    navigateMock.mockClear();
    await user.click(screen.getByRole('button', { name: '问是知' }));
    expect(navigateMock).toHaveBeenCalledWith(
      '/ai-tutor/item-incorrect?submissionId=submission-english',
      expect.objectContaining({
        state: expect.objectContaining({
          submissionId: 'submission-english',
          subject: 'english',
        }),
      }),
    );
  });

  it('uses the canonical job result while grading instead of flattening material items', async () => {
    buildQuestionPresentationMock.mockReturnValue(materialPresentation());
    searchParamsValue = 'jobId=job-english&submissionId=submission-english';
    const canonicalResult = { artifact_contract_version: 'learning_artifacts_v1' };
    useJobPollingMock.mockReturnValue({
      status: 'processing',
      longRunning: false,
      data: {
        job_id: 'job-english',
        status: 'processing',
        total_pages: 2,
        done_pages: 1,
        result: canonicalResult,
        question_cards: [],
      },
    });
    const { default: Result } = await import('@/pages/Result');

    render(<Result />);

    expect(buildQuestionPresentationMock).toHaveBeenCalledWith(canonicalResult);
    expect(screen.getAllByTestId('result-presentation-node')).toHaveLength(1);
    expect(screen.getByText('Visual reading')).toBeInTheDocument();
    expect(screen.getByTestId('home-fab')).toHaveAttribute('data-overlap-safe', 'true');
  });
});
