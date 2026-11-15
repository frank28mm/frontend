import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/contexts/LanguageContext';

const navigateMock = vi.fn();
const getMock = vi.fn();
const postMock = vi.fn();
const showToastMock = vi.fn();
const setActiveProfileMock = vi.fn();
let locationState: Record<string, unknown> | null = null;
let searchParams = new URLSearchParams('submissionId=sub1');
let subjectReadEnabled = true;
let mockProfileContext = {
  profiles: [] as Array<{ profile_id: string; display_name: string }>,
  activeProfileId: 'p1',
  activeProfile: { profile_id: 'p1', display_name: 'DEAN' },
  setActiveProfile: setActiveProfileMock,
};

const createStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: locationState }),
    useParams: () => ({ submissionId: 'sub1', id: encodeURIComponent('p1:q:1') }),
    useSearchParams: () => [searchParams],
  };
});

vi.mock('@/services/api', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
  },
}));

vi.mock('@/contexts/ProfileContext', () => ({
  useProfile: () => mockProfileContext,
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

vi.mock('@/components/ui/HomeButton', () => ({
  HomeFab: ({ avoidContentOverlap }: { avoidContentOverlap?: boolean }) => (
    <div data-testid="home-fab" data-overlap-safe={String(Boolean(avoidContentOverlap))} />
  ),
}));

vi.mock('@/components/ui/BackButton', () => ({
  BackButton: (props: { onClick?: () => void }) => (
    <button onClick={props.onClick}>back</button>
  ),
}));

vi.mock('@/components/ui/QuestionText', () => ({
  QuestionText: (props: { text?: string }) => <div>{props.text}</div>,
}));

vi.mock('@/hooks/useSubjectCapabilities', () => ({
  useSubjectCapabilities: () => ({
    loading: false,
    isReadEnabled: () => subjectReadEnabled,
    isSubmissionEnabled: () => false,
  }),
}));

describe('submission pages', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: vi.fn(),
      configurable: true,
    });
    Object.defineProperty(window, 'localStorage', {
      value: createStorageMock(),
      configurable: true,
    });
    navigateMock.mockReset();
    getMock.mockReset();
    postMock.mockReset();
    showToastMock.mockReset();
    setActiveProfileMock.mockReset();
    window.localStorage.clear();
    locationState = null;
    searchParams = new URLSearchParams('submissionId=sub1');
    subjectReadEnabled = true;
    mockProfileContext = {
      profiles: [],
      activeProfileId: 'p1',
      activeProfile: { profile_id: 'p1', display_name: 'DEAN' },
      setActiveProfile: setActiveProfileMock,
    };
  });

  it('uses a non-overlapping Home FAB on the narrow result summary', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true });
    getMock.mockResolvedValueOnce({
      data: {
        submission_id: 'sub1',
        summary: { total_items: 1, wrong_count: 0, uncertain_count: 0, blank_count: 0 },
        question_cards: [
          { item_id: 'p1:q:1', question_number: '1', page_index: 0, verdict: 'correct' },
        ],
      },
    });
    const { default: ResultSummary } = await import('@/pages/ResultSummary');

    render(<ResultSummary />);

    expect(await screen.findByTestId('home-fab')).toHaveAttribute('data-overlap-safe', 'true');
  });

  it('blocks a direct Chemistry result summary when runtime read capability is disabled', async () => {
    subjectReadEnabled = false;
    getMock.mockResolvedValueOnce({
      data: {
        submission_id: 'sub1',
        subject: 'chemistry',
        summary: { total_items: 1, wrong_count: 0, uncertain_count: 0, blank_count: 0 },
        question_cards: [],
      },
    });
    const { default: ResultSummary } = await import('@/pages/ResultSummary');

    render(<ResultSummary />);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }));
    expect(showToastMock).toHaveBeenCalledWith('化学入口已暂时关闭', 'info');
  });

  it('uses a non-overlapping Home FAB on the narrow question detail', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true });
    locationState = {
      submissionId: 'sub1',
      card: {
        item_id: 'p1:q:1',
        question_number: '1',
        page_index: 0,
        verdict: 'correct',
        question_content: '1 + 1 = 2',
      },
    };
    getMock.mockResolvedValueOnce({
      data: {
        submission_id: 'sub1',
        profile_id: 'p1',
        summary: { total_items: 1, wrong_count: 0, uncertain_count: 0, blank_count: 0 },
        question_cards: [locationState.card],
        questions: [{
          item_id: 'p1:q:1',
          question_number: '1',
          page_index: 0,
          verdict: 'correct',
          question_text: '1 + 1 = 2',
        }],
      },
    });
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');

    render(<QuestionDetail />);

    expect(await screen.findByTestId('home-fab')).toHaveAttribute('data-overlap-safe', 'true');
  });

  it('ResultSummary prefers backend summary over local card recount', async () => {
    const { default: ResultSummary } = await import('@/pages/ResultSummary');

    getMock.mockResolvedValueOnce({
      data: {
        submission_id: 'sub1',
        summary: {
          total_items: 3,
          wrong_count: 2,
          uncertain_count: 0,
          blank_count: 0,
          score_text: '0/100',
        },
        question_cards: [
          { item_id: 'p1:q:1', question_number: '1', page_index: 0, verdict: 'incorrect' },
          { item_id: 'p1:q:2', question_number: '2', page_index: 0, verdict: 'correct' },
          { item_id: 'p1:q:3', question_number: '3', page_index: 0, verdict: 'correct' },
        ],
      },
    });

    render(<ResultSummary />);

    expect(await screen.findByText('33%')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('归属：') && content.includes('DEAN'))).toBeInTheDocument();
    expect(screen.queryByText('0/100')).not.toBeInTheDocument();
  });

  it('ResultSummary refetches submission on focus without relying on dirty flag', async () => {
    const { default: ResultSummary } = await import('@/pages/ResultSummary');

    getMock
      .mockResolvedValueOnce({
        data: {
          submission_id: 'sub1',
          updated_at: '2026-03-22T10:00:00Z',
          summary: {
            total_items: 3,
            wrong_count: 2,
            uncertain_count: 0,
            blank_count: 0,
          },
          question_cards: [
            { item_id: 'p1:q:1', question_number: '1', page_index: 0, verdict: 'incorrect' },
            { item_id: 'p1:q:2', question_number: '2', page_index: 0, verdict: 'correct' },
            { item_id: 'p1:q:3', question_number: '3', page_index: 0, verdict: 'correct' },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          submission_id: 'sub1',
          updated_at: '2026-03-22T10:05:00Z',
          summary: {
            total_items: 3,
            wrong_count: 1,
            uncertain_count: 0,
            blank_count: 0,
          },
          question_cards: [
            { item_id: 'p1:q:1', question_number: '1', page_index: 0, verdict: 'correct' },
            { item_id: 'p1:q:2', question_number: '2', page_index: 0, verdict: 'incorrect' },
            { item_id: 'p1:q:3', question_number: '3', page_index: 0, verdict: 'correct' },
          ],
        },
      });

    render(<ResultSummary />);

    expect(await screen.findByText('33%')).toBeInTheDocument();

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => {
      expect(getMock).toHaveBeenLastCalledWith('/submissions/sub1', {
        headers: { 'X-Profile-Id': 'p1' },
      });
    });
    expect(await screen.findByText('67%')).toBeInTheDocument();
  });

  it('ResultSummary retries initial submission load across known profiles', async () => {
    const { default: ResultSummary } = await import('@/pages/ResultSummary');

    mockProfileContext = {
      profiles: [
        { profile_id: 'p1', display_name: 'DEAN' },
        { profile_id: 'p2', display_name: 'MIA' },
      ],
      activeProfileId: 'p1',
      activeProfile: { profile_id: 'p1', display_name: 'DEAN' },
      setActiveProfile: setActiveProfileMock,
    };

    getMock
      .mockRejectedValueOnce({ response: { status: 404, data: { detail: 'submission not found' } } })
      .mockResolvedValueOnce({
        data: {
          submission_id: 'sub1',
          profile_id: 'p2',
          summary: {
            total_items: 1,
            wrong_count: 0,
            uncertain_count: 0,
            blank_count: 0,
          },
          question_cards: [
            { item_id: 'p1:q:1', question_number: '1', page_index: 0, verdict: 'correct' },
          ],
        },
      });

    render(<ResultSummary />);

    expect(await screen.findByText('100%')).toBeInTheDocument();
    expect(getMock).toHaveBeenNthCalledWith(1, '/submissions/sub1', {
      headers: { 'X-Profile-Id': 'p1' },
    });
    expect(getMock).toHaveBeenNthCalledWith(2, '/submissions/sub1', {
      headers: { 'X-Profile-Id': 'p2' },
    });
  });

  it('ResultSummary opens question detail with the active filter navigation state', async () => {
    const { default: ResultSummary } = await import('@/pages/ResultSummary');
    const user = userEvent.setup();

    getMock.mockResolvedValueOnce({
      data: {
        submission_id: 'sub1',
        summary: {
          total_items: 3,
          wrong_count: 1,
          uncertain_count: 0,
          blank_count: 0,
        },
        question_cards: [
          { item_id: 'p1:q:1', question_number: '1', page_index: 0, verdict: 'incorrect', question_content: '错题1' },
          { item_id: 'p1:q:2', question_number: '2', page_index: 0, verdict: 'correct', question_content: '对题2' },
          { item_id: 'p1:q:3', question_number: '3', page_index: 0, verdict: 'correct', question_content: '对题3' },
        ],
      },
    });

    render(<ResultSummary />);

    expect(await screen.findByText('67%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '正确' }));
    await user.click(screen.getAllByText('题目详情')[0]);

    expect(navigateMock).toHaveBeenCalledWith('/question/p1%3Aq%3A2?submissionId=sub1', {
      state: {
        card: { item_id: 'p1:q:2', question_number: '2', page_index: 0, verdict: 'correct', question_content: '对题2' },
        submissionId: 'sub1',
        questionNav: {
          filter: 'correct',
          itemIds: ['p1:q:2', 'p1:q:3'],
        },
      },
    });
  });

  it('ResultSummary opens AI tutor with submissionId in query and state', async () => {
    const { default: ResultSummary } = await import('@/pages/ResultSummary');
    const user = userEvent.setup();

    getMock.mockResolvedValueOnce({
      data: {
        submission_id: 'sub1',
        summary: {
          total_items: 1,
          wrong_count: 1,
          uncertain_count: 0,
          blank_count: 0,
        },
        question_cards: [
          { item_id: 'p1:q:2', question_number: '2', page_index: 0, verdict: 'incorrect', question_content: '错题2' },
        ],
      },
    });

    render(<ResultSummary />);

    expect(await screen.findByText('0%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '问是知' }));

    expect(navigateMock).toHaveBeenCalledWith('/ai-tutor/p1%3Aq%3A2?submissionId=sub1', {
      state: {
        card: { item_id: 'p1:q:2', question_number: '2', page_index: 0, verdict: 'incorrect', question_content: '错题2' },
        submissionId: 'sub1',
      },
    });
  });

  it('QuestionDetail exclude refreshes submission and marks dirty', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');
    const user = userEvent.setup();

    locationState = {
      submissionId: 'sub1',
      card: {
        item_id: 'p1:q:1',
        question_number: '1',
        page_index: 0,
        verdict: 'incorrect',
        question_content: '关于下列说法，错误的是',
      },
    };
    getMock
      .mockResolvedValueOnce({
        data: {
          submission_id: 'sub1',
          profile_id: 'p1',
          summary: {
            total_items: 1,
            wrong_count: 1,
            uncertain_count: 0,
            blank_count: 0,
          },
          question_cards: [
            {
              item_id: 'p1:q:1',
              question_number: '1',
              page_index: 0,
              verdict: 'incorrect',
              question_content: '关于下列说法，错误的是',
            },
          ],
          questions: [
            {
              item_id: 'p1:q:1',
              question_number: '1',
              page_index: 0,
              verdict: 'incorrect',
              question_text: '关于下列说法，错误的是',
              student_answer: 'A',
              reason: 'A 选项表述错误，符合题意',
              judgment_basis: ['依据来源：OCR文本', 'A选项表述错误'],
            },
          ],
        },
      })
      .mockResolvedValueOnce({
      data: {
        submission_id: 'sub1',
        profile_id: 'p1',
        summary: {
          total_items: 1,
          wrong_count: 0,
          uncertain_count: 0,
          blank_count: 0,
        },
        question_cards: [
          {
            item_id: 'p1:q:1',
            question_number: '1',
            page_index: 0,
            verdict: 'correct',
            question_content: '关于下列说法，错误的是',
          },
        ],
        questions: [
          {
            item_id: 'p1:q:1',
            question_number: '1',
            page_index: 0,
            verdict: 'correct',
            question_text: '关于下列说法，错误的是',
            student_answer: 'A',
            reason: 'A 选项表述错误，符合题意',
            judgment_basis: ['依据来源：OCR文本', 'A选项表述错误'],
          },
        ],
      },
    });
    postMock.mockResolvedValue({ data: { ok: true } });

    render(<QuestionDetail />);

    await user.click(await screen.findByText('错题排除'));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        '/mistakes/exclusions',
        {
          submission_id: 'sub1',
          item_id: 'p1:q:1',
          reason: '已掌握',
        },
        { headers: { 'X-Profile-Id': 'p1' } }
      );
    });
    expect(window.localStorage.getItem('submission_dirty_sub1')).toBeTruthy();
    expect(getMock).toHaveBeenCalledWith('/submissions/sub1', {
      headers: { 'X-Profile-Id': 'p1' },
    });
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it('QuestionDetail exclude stays successful even if follow-up refetch fails', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');
    const user = userEvent.setup();

    locationState = {
      submissionId: 'sub1',
      card: {
        item_id: 'p1:q:1',
        question_number: '1',
        page_index: 0,
        verdict: 'incorrect',
        question_content: '关于下列说法，错误的是',
      },
    };
    getMock
      .mockResolvedValueOnce({
        data: {
          submission_id: 'sub1',
          profile_id: 'p1',
          summary: {
            total_items: 1,
            wrong_count: 1,
            uncertain_count: 0,
            blank_count: 0,
          },
          question_cards: [
            {
              item_id: 'p1:q:1',
              question_number: '1',
              page_index: 0,
              verdict: 'incorrect',
              question_content: '关于下列说法，错误的是',
            },
          ],
          questions: [
            {
              item_id: 'p1:q:1',
              question_number: '1',
              page_index: 0,
              verdict: 'incorrect',
              question_text: '关于下列说法，错误的是',
              student_answer: 'A',
              reason: 'A 选项表述错误，符合题意',
            },
          ],
        },
      })
      .mockRejectedValueOnce(new Error('refetch failed'));
    postMock.mockResolvedValue({ data: { ok: true } });

    render(<QuestionDetail />);

    await user.click(await screen.findByText('错题排除'));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        '/mistakes/exclusions',
        {
          submission_id: 'sub1',
          item_id: 'p1:q:1',
          reason: '已掌握',
        },
        { headers: { 'X-Profile-Id': 'p1' } }
      );
    });
    expect(showToastMock).toHaveBeenCalledWith('已归档到已掌握', 'success');
    expect(showToastMock).not.toHaveBeenCalledWith('操作失败，请稍后重试', 'error');
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it('QuestionDetail exclude ignores cards already excluded from mistakes when picking next card', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');
    const user = userEvent.setup();

    locationState = {
      submissionId: 'sub1',
      card: {
        item_id: 'p1:q:1',
        question_number: '1',
        page_index: 0,
        verdict: 'incorrect',
        question_content: '关于下列说法，错误的是',
      },
    };
    getMock
      .mockResolvedValueOnce({
        data: {
          submission_id: 'sub1',
          profile_id: 'p1',
          summary: {
            total_items: 2,
            wrong_count: 2,
            uncertain_count: 0,
            blank_count: 0,
          },
          question_cards: [
            {
              item_id: 'p1:q:1',
              question_number: '1',
              page_index: 0,
              verdict: 'incorrect',
              question_content: '题目1',
            },
            {
              item_id: 'p1:q:2',
              question_number: '2',
              page_index: 0,
              verdict: 'incorrect',
              question_content: '题目2',
            },
          ],
          questions: [
            {
              item_id: 'p1:q:1',
              question_number: '1',
              page_index: 0,
              verdict: 'incorrect',
              question_text: '题目1',
            },
            {
              item_id: 'p1:q:2',
              question_number: '2',
              page_index: 0,
              verdict: 'incorrect',
              question_text: '题目2',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          submission_id: 'sub1',
          profile_id: 'p1',
          summary: {
            total_items: 2,
            wrong_count: 1,
            uncertain_count: 0,
            blank_count: 0,
          },
          question_cards: [
            {
              item_id: 'p1:q:1',
              question_number: '1',
              page_index: 0,
              verdict: 'incorrect',
              excluded_from_mistakes: true,
              question_content: '题目1',
            },
            {
              item_id: 'p1:q:2',
              question_number: '2',
              page_index: 0,
              verdict: 'incorrect',
              question_content: '题目2',
            },
          ],
          questions: [
            {
              item_id: 'p1:q:1',
              question_number: '1',
              page_index: 0,
              verdict: 'incorrect',
              excluded_from_mistakes: true,
              question_text: '题目1',
            },
            {
              item_id: 'p1:q:2',
              question_number: '2',
              page_index: 0,
              verdict: 'incorrect',
              question_text: '题目2',
            },
          ],
        },
      });
    postMock.mockResolvedValue({ data: { ok: true } });

    render(<QuestionDetail />);

    await user.click(await screen.findByText('错题排除'));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/question/p1%3Aq%3A2?submissionId=sub1', {
        replace: true,
        state: {
          card: {
            item_id: 'p1:q:2',
            question_number: '2',
            page_index: 0,
            verdict: 'incorrect',
            question_content: '题目2',
          },
          submissionId: 'sub1',
          questionNav: {
            filter: 'wrong',
            itemIds: ['p1:q:1', 'p1:q:2'],
          },
        },
      });
    });
  });

  it('QuestionDetail renders rich payload sections from submission detail', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');

    locationState = {
      submissionId: 'sub1',
      card: {
        item_id: 'p1:q:1',
        question_number: '1',
        page_index: 0,
        verdict: 'incorrect',
        question_content: '加载中的题干',
      },
    };
    getMock.mockResolvedValueOnce({
      data: {
        submission_id: 'sub1',
        profile_id: 'p1',
        summary: {
          total_items: 1,
          wrong_count: 1,
          uncertain_count: 0,
          blank_count: 0,
        },
        question_cards: [
          {
            item_id: 'p1:q:1',
            question_number: '1',
            page_index: 0,
            verdict: 'incorrect',
            question_content: '已知函数',
          },
        ],
        questions: [
          {
            item_id: 'p1:q:1',
            question_number: '1',
            page_index: 0,
            verdict: 'incorrect',
            question_text: '已知函数 \\(f(x)=x^2-2x+1\\)，则 \\(f(2)\\) 的值是\nA. 0\nB. 1\nC. 2\nD. 3',
            figure_slice_image_url: '/figure.png',
            student_answer: 'B',
            reason: '将 x=2 代入可得 f(2)=1',
            judgment_basis: ['依据来源：题干函数表达式', '代入 x=2 计算得到 1'],
          },
        ],
      },
    });

    render(<QuestionDetail />);

    expect(await screen.findByText(/已知函数/)).toBeInTheDocument();
    const figureImage = screen.getByAltText('题目图示');
    expect(figureImage).toHaveAttribute('src', '/figure.png');
    expect(figureImage).toHaveClass('h-auto');
    expect(figureImage).not.toHaveClass('h-56');
    expect(screen.getByText('学生作答')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('判题分析')).toBeInTheDocument();
    expect(screen.getByText('将 x=2 代入可得 f(2)=1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '判题依据 · 2条' })).toBeInTheDocument();
    expect(screen.queryByText('依据来源：题干函数表达式')).not.toBeInTheDocument();
    expect(screen.queryByText('代入 x=2 计算得到 1')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '判题依据 · 2条' }));

    expect(screen.getByRole('button', { name: '收起依据' })).toBeInTheDocument();
    expect(screen.getByText('依据来源：题干函数表达式')).toBeInTheDocument();
    expect(screen.getByText('代入 x=2 计算得到 1')).toBeInTheDocument();
  });

  it('QuestionDetail opens AI tutor with submissionId in query and state', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');
    const user = userEvent.setup();

    locationState = {
      submissionId: 'sub1',
      card: {
        item_id: 'p1:q:1',
        question_number: '1',
        page_index: 0,
        verdict: 'incorrect',
        question_content: '关于下列说法，错误的是',
      },
    };
    getMock.mockResolvedValueOnce({
      data: {
        submission_id: 'sub1',
        profile_id: 'p1',
        summary: {
          total_items: 1,
          wrong_count: 1,
          uncertain_count: 0,
          blank_count: 0,
        },
        question_cards: [
          {
            item_id: 'p1:q:1',
            question_number: '1',
            page_index: 0,
            verdict: 'incorrect',
            question_content: '关于下列说法，错误的是',
          },
        ],
        questions: [
          {
            item_id: 'p1:q:1',
            question_number: '1',
            page_index: 0,
            verdict: 'incorrect',
            question_text: '关于下列说法，错误的是',
            student_answer: 'A',
            reason: 'A 选项表述错误',
          },
        ],
      },
    });

    render(<QuestionDetail />);

    expect(await screen.findByText('学生作答')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /问是知/ }));

    expect(navigateMock).toHaveBeenCalledWith('/ai-tutor/p1%3Aq%3A1?submissionId=sub1', {
      state: {
        card: {
          item_id: 'p1:q:1',
          question_number: '1',
          page_index: 0,
          verdict: 'incorrect',
          question_content: '关于下列说法，错误的是',
        },
        submissionId: 'sub1',
      },
    });
  });

  it('AITutor does not render static question slice for plain non-visual algebra question', async () => {
    const { default: AITutor } = await import('@/pages/AITutor');

    locationState = {
      submissionId: 'sub1',
      card: {
        item_id: 'p1:q:7',
        question_number: '7',
        page_index: 0,
        verdict: 'correct',
        question_content: '简便运算：198×202=',
        question_slice_image_url: '/question.png',
        figure_slice_image_url: '',
      },
    };

    getMock.mockResolvedValueOnce({
      data: {
        submission_id: 'sub1',
        profile_id: 'p1',
        subject: 'math',
        summary: {
          total_items: 1,
          wrong_count: 0,
          uncertain_count: 0,
          blank_count: 0,
        },
        question_cards: [
          {
            item_id: 'p1:q:7',
            question_number: '7',
            page_index: 0,
            verdict: 'correct',
            question_content: '简便运算：198×202=',
            question_slice_image_url: '/question.png',
            figure_slice_image_url: '',
          },
        ],
        questions: [
          {
            item_id: 'p1:q:7',
            question_number: '7',
            page_index: 0,
            verdict: 'correct',
            question_text: '简便运算：198×202=',
            question_slice_image_url: '/question.png',
            figure_slice_image_url: '',
            visual_risk: false,
          },
        ],
      },
    });

    render(<AITutor />);

    expect(await screen.findByText('题目：')).toBeInTheDocument();
    expect(screen.getByText('简便运算：198×202=')).toBeInTheDocument();
    expect(screen.queryByText('题目切片')).not.toBeInTheDocument();
    expect(screen.queryByAltText('题目切片')).not.toBeInTheDocument();
  });

  it('DataArchive renders the versioned hierarchy returned by Core', async () => {
    const { default: DataArchive } = await import('@/pages/DataArchive');
    const user = userEvent.setup();
    searchParams = new URLSearchParams();

    getMock.mockResolvedValueOnce({
      data: {
        subject: 'math',
        taxonomy_version: 'math_cn_secondary_v1',
        mistake_state: 'active',
        total_items: 9,
        unmapped_count: 0,
        nodes: [
          {
            id: 'domain-algebra',
            level: 1,
            name: '代数与函数',
            canonical_path: '代数与函数',
            taxonomy_version: 'math_cn_secondary_v1',
            count: 4,
            children: [
              {
                id: 'module-expression',
                parent_id: 'domain-algebra',
                level: 2,
                name: '代数式与恒等变形',
                canonical_path: '代数与函数/代数式与恒等变形',
                taxonomy_version: 'math_cn_secondary_v1',
                count: 2,
                children: [
                  {
                    id: 'math:formula',
                    parent_id: 'module-expression',
                    level: 3,
                    name: '乘法公式',
                    canonical_path: '代数与函数/代数式与恒等变形/乘法公式',
                    taxonomy_version: 'math_cn_secondary_v1',
                    count: 2,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    const { rerender } = render(
      <LanguageProvider>
        <DataArchive />
      </LanguageProvider>
    );

    expect(await screen.findByText('代数与函数')).toBeInTheDocument();
    expect(screen.getByText('错题面板 · 组合分类')).toBeInTheDocument();
    expect(screen.getByText('9 题')).toBeInTheDocument();
    expect(screen.getByText('04')).toBeInTheDocument();
    expect(screen.getByText('代数式与恒等变形')).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith('/knowledge/archive?subject=math&mistake_state=active');

    await user.click(screen.getByRole('button', { name: '英语' }));
    expect(navigateMock).toHaveBeenCalledWith('/data?subject=english');

    await user.click(screen.getByRole('button', { name: /代数与函数/ }));
    expect(navigateMock).toHaveBeenCalledWith('/data?domain=domain-algebra');

    searchParams = new URLSearchParams({
      subject: 'math',
      domain: 'domain-algebra',
      module: 'module-expression',
    });
    rerender(
      <LanguageProvider>
        <DataArchive />
      </LanguageProvider>
    );

    expect(await screen.findByText('错题面板 · 知识单元')).toBeInTheDocument();
    expect(screen.getByText('2 题')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /乘法公式/ }));
    expect(navigateMock).toHaveBeenCalledWith(
      '/data/category/math%3Aformula?subject=math&mode=review&taxonomy_version=math_cn_secondary_v1&tag_name=%E4%B9%98%E6%B3%95%E5%85%AC%E5%BC%8F',
      {
        state: {
          tagId: 'math:formula',
          tagName: '乘法公式',
          mode: 'review',
          subject: 'math',
          taxonomyVersion: 'math_cn_secondary_v1',
        },
      }
    );
  });

  it('QuestionDetail refetches submission on focus after server-side changes', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');

    locationState = {
      submissionId: 'sub1',
      card: {
        item_id: 'p1:q:1',
        question_number: '1',
        page_index: 0,
        verdict: 'incorrect',
        question_content: '旧题干',
      },
    };

    getMock
      .mockResolvedValueOnce({
        data: {
          submission_id: 'sub1',
          profile_id: 'p1',
          summary: {
            total_items: 1,
            wrong_count: 1,
            uncertain_count: 0,
            blank_count: 0,
          },
          question_cards: [
            {
              item_id: 'p1:q:1',
              question_number: '1',
              page_index: 0,
              verdict: 'incorrect',
              question_content: '旧题干',
            },
          ],
          questions: [
            {
              item_id: 'p1:q:1',
              question_number: '1',
              page_index: 0,
              verdict: 'incorrect',
              question_text: '旧题干',
              student_answer: 'A',
              reason: '旧分析',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          submission_id: 'sub1',
          profile_id: 'p1',
          summary: {
            total_items: 1,
            wrong_count: 0,
            uncertain_count: 0,
            blank_count: 0,
          },
          question_cards: [
            {
              item_id: 'p1:q:1',
              question_number: '1',
              page_index: 0,
              verdict: 'correct',
              question_content: '新题干',
            },
          ],
          questions: [
            {
              item_id: 'p1:q:1',
              question_number: '1',
              page_index: 0,
              verdict: 'correct',
              question_text: '新题干',
              student_answer: 'A',
              reason: '新分析',
            },
          ],
        },
      });

    render(<QuestionDetail />);

    expect(await screen.findByText('旧题干')).toBeInTheDocument();

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('新题干')).toBeInTheDocument();
    expect(screen.getByText('新分析')).toBeInTheDocument();
  });

  it('QuestionDetail retries initial load across known profiles', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');

    mockProfileContext = {
      profiles: [
        { profile_id: 'p1', display_name: 'DEAN' },
        { profile_id: 'p2', display_name: 'MIA' },
      ],
      activeProfileId: 'p1',
      activeProfile: { profile_id: 'p1', display_name: 'DEAN' },
      setActiveProfile: setActiveProfileMock,
    };

    locationState = {
      submissionId: 'sub1',
      card: {
        item_id: 'p1:q:1',
        question_number: '1',
        page_index: 0,
        verdict: 'incorrect',
        question_content: '旧题干',
      },
    };

    getMock
      .mockRejectedValueOnce({ response: { status: 404, data: { detail: 'submission not found' } } })
      .mockResolvedValueOnce({
        data: {
          submission_id: 'sub1',
          profile_id: 'p2',
          summary: {
            total_items: 1,
            wrong_count: 0,
            uncertain_count: 0,
            blank_count: 0,
          },
          question_cards: [
            {
              item_id: 'p1:q:1',
              question_number: '1',
              page_index: 0,
              verdict: 'correct',
              question_content: '新题干',
            },
          ],
          questions: [
            {
              item_id: 'p1:q:1',
              question_number: '1',
              page_index: 0,
              verdict: 'correct',
              question_text: '新题干',
              student_answer: 'A',
              reason: '新分析',
            },
          ],
        },
      });

    render(<QuestionDetail />);

    expect(await screen.findByText('新题干')).toBeInTheDocument();
    expect(getMock).toHaveBeenNthCalledWith(1, '/submissions/sub1', {
      headers: { 'X-Profile-Id': 'p1' },
    });
    expect(getMock).toHaveBeenNthCalledWith(2, '/submissions/sub1', {
      headers: { 'X-Profile-Id': 'p2' },
    });
  });

  it('QuestionDetail reuses filter navigation for correct questions', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');
    const user = userEvent.setup();

    locationState = {
      submissionId: 'sub1',
      card: {
        item_id: 'p1:q:1',
        question_number: '1',
        page_index: 0,
        verdict: 'correct',
        question_content: '对题1',
      },
      questionNav: {
        filter: 'correct',
        itemIds: ['p1:q:1', 'p1:q:3'],
      },
    };

    getMock.mockResolvedValueOnce({
      data: {
        submission_id: 'sub1',
        profile_id: 'p1',
        summary: {
          total_items: 3,
          wrong_count: 1,
          uncertain_count: 0,
          blank_count: 0,
        },
        question_cards: [
          { item_id: 'p1:q:1', question_number: '1', page_index: 0, verdict: 'correct', question_content: '对题1' },
          { item_id: 'p1:q:2', question_number: '2', page_index: 0, verdict: 'incorrect', question_content: '错题2' },
          { item_id: 'p1:q:3', question_number: '3', page_index: 0, verdict: 'correct', question_content: '对题3' },
        ],
        questions: [
          { item_id: 'p1:q:1', question_number: '1', page_index: 0, verdict: 'correct', question_text: '对题1', student_answer: 'A', reason: '正确' },
          { item_id: 'p1:q:3', question_number: '3', page_index: 0, verdict: 'correct', question_text: '对题3', student_answer: 'B', reason: '正确' },
        ],
      },
    });

    render(<QuestionDetail />);

    expect(await screen.findByText('对题 1 / 2')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /上一题|下一题/ });
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();

    await user.click(screen.getByRole('button', { name: '下一题' }));

    expect(navigateMock).toHaveBeenCalledWith('/question/p1%3Aq%3A3?submissionId=sub1', {
      replace: true,
      state: {
        card: { item_id: 'p1:q:3', question_number: '3', page_index: 0, verdict: 'correct', question_content: '对题3' },
        submissionId: 'sub1',
        questionNav: {
          filter: 'correct',
          itemIds: ['p1:q:1', 'p1:q:3'],
        },
      },
    });
  });
});
