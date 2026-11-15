import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
const useJobPollingMock = vi.fn();
const showToastMock = vi.fn();
let subjectReadEnabled = true;
let searchParamsValue = 'jobId=job-live&submissionId=sub-live';

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

const emptyPresentation = {
  source: 'fallback' as const,
  contractStatus: 'degraded' as const,
  warnings: [],
  materialGroups: [],
  evidenceRegistry: [],
  nodes: [],
  questions: [],
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearchParams: () => [new URLSearchParams(searchParamsValue)],
  };
});

vi.mock('@/hooks/useJobPolling', () => ({
  useJobPolling: useJobPollingMock,
}));

vi.mock('@/hooks/useSubjectCapabilities', () => ({
  useSubjectCapabilities: () => ({
    loading: false,
    isReadEnabled: () => subjectReadEnabled,
    isSubmissionEnabled: () => false,
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock('@/utils/questionPresentation', () => ({
  buildQuestionPresentation: vi.fn(() => emptyPresentation),
}));

vi.mock('@/components/learning/ResultPresentation', () => ({
  ResultPresentation: () => <div data-testid="result-presentation" />,
}));

vi.mock('@/components/ui/BackButton', () => ({
  BackButton: () => <button type="button">back</button>,
}));

vi.mock('@/components/ui/HomeButton', () => ({
  HomeFab: () => <div data-testid="home-fab" />,
}));

describe('Result live grading progress', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorageMock(),
      configurable: true,
    });
    navigateMock.mockReset();
    useJobPollingMock.mockReset();
    showToastMock.mockReset();
    subjectReadEnabled = true;
    searchParamsValue = 'jobId=job-live&submissionId=sub-live';
    window.localStorage.clear();
  });

  it('renders real Math processing stages and per-page card states from the job payload', async () => {
    let jobData = {
      job_id: 'job-live',
      status: 'processing',
      request: { upload_id: 'sub-live', subject: 'math' },
      progress: {
        stage: 'page_structured_ocr',
        message: '正在识别第 1 页',
      },
      total_pages: 2,
      done_pages: 0,
      page_summaries: [
        { page_index: 0, wrong_count: 0, uncertain_count: 0, blank_count: 0, needs_review: false },
        { page_index: 1, wrong_count: 0, uncertain_count: 0, blank_count: 0, needs_review: false },
      ] as Array<Record<string, unknown>>,
      question_cards: [{
        item_id: 'p1:q:1',
        question_number: '1',
        page_index: 0,
        card_state: 'placeholder',
        question_content: '已知 x + 2 = 5，求 x。',
      }] as Array<Record<string, unknown>>,
    };
    useJobPollingMock.mockImplementation(() => ({
      status: 'processing',
      longRunning: false,
      data: jobData,
    }));
    const { default: Result } = await import('@/pages/Result');

    const { rerender } = render(<Result />);

    expect(screen.getByTestId('live-grading-progress')).toHaveTextContent('正在识别第 1 页');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('heading', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Page 2' })).toBeInTheDocument();
    expect(screen.getByTestId('live-card-p1:q:1')).toHaveTextContent('识别中');
    expect(screen.getByTestId('live-card-p1:q:1')).toHaveAttribute('data-flip-state', 'placeholder');
    expect(screen.getByTestId('live-page-1')).toHaveTextContent('题目加载中...');

    jobData = {
        job_id: 'job-live',
        status: 'processing',
        request: { upload_id: 'sub-live', subject: 'math' },
        progress: {
          stage: 'page_aggregate',
          message: '正在批改第 2 页',
        },
        total_pages: 2,
        done_pages: 1,
        page_summaries: [
          {
            page_index: 0,
            wrong_count: 1,
            uncertain_count: 0,
            blank_count: 0,
            needs_review: false,
          },
          {
            page_index: 1,
            wrong_count: 0,
            uncertain_count: 0,
            blank_count: 0,
            needs_review: false,
          },
        ],
        question_cards: [
          {
            item_id: 'p1:q:1',
            question_number: '1',
            page_index: 0,
            card_state: 'verdict_ready',
            verdict: 'incorrect',
            question_content: '已知 x + 2 = 5，求 x。',
          },
          {
            item_id: 'p2:q:2',
            question_number: '2',
            page_index: 1,
            card_state: 'placeholder',
            question_content: '如图，求角 A。',
          },
        ],
      };
    rerender(<Result />);

    expect(screen.getByTestId('live-grading-progress')).toHaveTextContent('正在批改第 2 页');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByTestId('live-page-0')).toHaveTextContent('1 错误');
    expect(screen.getByTestId('live-page-1')).toHaveTextContent('处理中');
    expect(screen.getByTestId('live-page-1')).not.toHaveTextContent('已完成');
    expect(screen.getByTestId('live-card-p1:q:1')).toHaveTextContent('错误');
    expect(screen.getByTestId('live-card-p1:q:1')).toHaveAttribute('data-flip-state', 'complete');
    expect(screen.getByTestId('live-card-p2:q:2')).toHaveTextContent('识别中');
    expect(screen.queryByTestId('result-presentation')).not.toBeInTheDocument();
  });

  it('keeps English processing on the existing ResultPresentation path', async () => {
    useJobPollingMock.mockReturnValue({
      status: 'processing',
      longRunning: false,
      data: {
        job_id: 'job-english',
        status: 'processing',
        request: { upload_id: 'sub-english', subject: 'english' },
        progress: {
          stage: 'page_aggregate',
          message: '正在批改英语作业',
        },
        total_pages: 2,
        done_pages: 1,
        page_summaries: [{ page_index: 0, wrong_count: 1 }],
        question_cards: [{
          item_id: 'english:1',
          question_number: '1',
          page_index: 0,
          card_state: 'verdict_ready',
          verdict: 'incorrect',
          question_content: 'Choose the correct answer.',
        }],
      },
    });
    const { default: Result } = await import('@/pages/Result');

    render(<Result />);

    expect(screen.getByTestId('result-presentation')).toBeInTheDocument();
    expect(screen.queryByTestId('live-grading-progress')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page 1' })).not.toBeInTheDocument();
  });

  it.each(['physics', 'chemistry'])('uses Math-style live progress for %s jobs', async (subject) => {
    useJobPollingMock.mockReturnValue({
      status: 'processing',
      longRunning: false,
      data: {
        job_id: `job-${subject}`,
        status: 'processing',
        request: { upload_id: `sub-${subject}`, subject },
        progress: { stage: 'page_processing', message: `正在批改${subject}` },
        total_pages: 1,
        done_pages: 0,
        page_summaries: [{ page_index: 0 }],
        question_cards: [],
      },
    });
    const { default: Result } = await import('@/pages/Result');

    render(<Result />);

    expect(screen.getByTestId('live-grading-progress')).toBeInTheDocument();
    expect(screen.queryByTestId('result-presentation')).not.toBeInTheDocument();
  });

  it('does not render a structural Science parent as a live grading card', async () => {
    useJobPollingMock.mockReturnValue({
      status: 'processing',
      longRunning: false,
      data: {
        job_id: 'job-physics-structural-parent',
        status: 'processing',
        request: { upload_id: 'sub-physics', subject: 'physics' },
        total_pages: 2,
        done_pages: 1,
        question_cards: [
          {
            item_id: 'p1:q:5', question_number: '5', page_index: 0,
            relation_type: 'cross_page_parent', card_state: 'review_pending',
            verdict: 'uncertain', needs_review: true,
          },
          {
            item_id: 'p2:q:5(A)', question_number: '5(A)', page_index: 1,
            relation_type: 'cross_page_continuation', card_state: 'verdict_ready',
            verdict: 'correct', needs_review: false,
          },
        ],
      },
    });
    const { default: Result } = await import('@/pages/Result');

    render(<Result />);

    expect(screen.queryByTestId('live-card-p1:q:5')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-card-p2:q:5(A)')).toBeInTheDocument();
  });

  it('does not keep a completed Science job open for a non-scoring parent review', async () => {
    useJobPollingMock.mockReturnValue({
      status: 'done',
      longRunning: false,
      data: {
        job_id: 'job-physics-done',
        status: 'done',
        request: { upload_id: 'sub-physics', subject: 'physics' },
        total_pages: 2,
        done_pages: 2,
        question_cards: [
          {
            item_id: 'p1:q:5', question_number: '5', page_index: 0,
            relation_type: 'cross_page_parent', card_state: 'review_pending',
            verdict: 'uncertain', needs_review: true,
          },
          {
            item_id: 'p2:q:5(A)', question_number: '5(A)', page_index: 1,
            relation_type: 'cross_page_continuation', card_state: 'verdict_ready',
            verdict: 'correct', needs_review: false,
          },
        ],
      },
    });
    const { default: Result } = await import('@/pages/Result');

    render(<Result />);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith(
      '/result-summary?jobId=job-live&submissionId=sub-live',
      { replace: true },
    ));
  });

  it('blocks a direct Physics result route when runtime read capability is disabled', async () => {
    subjectReadEnabled = false;
    useJobPollingMock.mockReturnValue({
      status: 'processing',
      longRunning: false,
      data: {
        job_id: 'job-physics',
        status: 'processing',
        request: { upload_id: 'sub-physics', subject: 'physics' },
        total_pages: 1,
        done_pages: 0,
        question_cards: [],
      },
    });
    const { default: Result } = await import('@/pages/Result');

    render(<Result />);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }));
    expect(showToastMock).toHaveBeenCalledWith('物理入口已暂时关闭', 'info');
    expect(screen.queryByTestId('live-grading-progress')).not.toBeInTheDocument();
  });

  it('does not infer which page completed from the aggregate done_pages count', async () => {
    useJobPollingMock.mockReturnValue({
      status: 'processing',
      longRunning: false,
      data: {
        job_id: 'job-live',
        status: 'processing',
        request: { upload_id: 'sub-live', subject: 'math' },
        progress: { stage: 'page_processing' },
        total_pages: 2,
        done_pages: 1,
        page_summaries: [
          { page_index: 0, wrong_count: 0, uncertain_count: 0, blank_count: 0 },
          { page_index: 1, wrong_count: 0, uncertain_count: 0, blank_count: 0 },
        ],
        question_cards: [
          { item_id: 'p1:q:1', question_number: '1', page_index: 0, card_state: 'placeholder' },
          {
            item_id: 'p2:q:2',
            question_number: '2',
            page_index: 1,
            card_state: 'verdict_ready',
            verdict: 'correct',
          },
        ],
      },
    });
    const { default: Result } = await import('@/pages/Result');

    render(<Result />);

    expect(screen.getByTestId('live-page-0')).toHaveTextContent('处理中');
    expect(screen.getByTestId('live-page-1')).toHaveTextContent('已完成');
  });

  it.each(['page_state', 'status'])('accepts an explicit summary %s=done signal', async (stateField) => {
    useJobPollingMock.mockReturnValue({
      status: 'processing',
      longRunning: false,
      data: {
        job_id: 'job-live',
        status: 'processing',
        request: { upload_id: 'sub-live', subject: 'math' },
        progress: { stage: 'artifact_materialize' },
        total_pages: 1,
        done_pages: 0,
        page_summaries: [{ page_index: 0, [stateField]: 'done' }],
        question_cards: [
          { item_id: 'p1:q:1', question_number: '1', page_index: 0, card_state: 'placeholder' },
        ],
      },
    });
    const { default: Result } = await import('@/pages/Result');

    render(<Result />);

    expect(screen.getByTestId('live-page-0')).toHaveTextContent('已完成');
  });

  it.each([
    ['page_processing', '正在批改页面'],
    ['writeback', '正在保存批改结果'],
    ['done', '批改完成'],
    ['failed', '批改失败'],
  ])('renders the %s backend stage with a Chinese label', async (stage, label) => {
    useJobPollingMock.mockReturnValue({
      status: 'processing',
      longRunning: false,
      data: {
        job_id: 'job-live',
        status: 'processing',
        request: { upload_id: 'sub-live', subject: 'math' },
        progress: { stage },
        total_pages: 2,
        done_pages: 0,
        page_summaries: [],
        question_cards: [],
      },
    });
    const { default: Result } = await import('@/pages/Result');

    render(<Result />);

    expect(screen.getByTestId('live-grading-progress')).toHaveTextContent(label);
  });
});
