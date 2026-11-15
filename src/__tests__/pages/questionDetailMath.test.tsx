import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
const getMock = vi.fn();
const showToastMock = vi.fn();
let locationState: Record<string, unknown> | null = null;

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
    useParams: () => ({ id: encodeURIComponent('p1:q:9') }),
    useSearchParams: () => [new URLSearchParams('submissionId=sub1')],
  };
});

vi.mock('@/services/api', () => ({
  apiClient: {
    get: getMock,
    post: vi.fn(),
  },
}));

vi.mock('@/hooks/useSubjectCapabilities', () => ({
  useSubjectCapabilities: () => ({
    loading: false,
    isReadEnabled: () => true,
    isSubmissionEnabled: () => true,
  }),
}));

vi.mock('@/contexts/ProfileContext', () => ({
  useProfile: () => ({
    profiles: [{ profile_id: 'p1', display_name: 'DEAN' }],
    activeProfileId: 'p1',
    activeProfile: { profile_id: 'p1', display_name: 'DEAN' },
    setActiveProfile: vi.fn(),
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
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

describe('QuestionDetail math rendering', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorageMock(),
      configurable: true,
    });
    navigateMock.mockReset();
    getMock.mockReset();
    showToastMock.mockReset();
    window.localStorage.clear();
    locationState = {
      submissionId: 'sub1',
      card: {
        item_id: 'p1:q:9',
        question_number: '9',
        page_index: 0,
        verdict: 'correct',
        question_content: '题目',
      },
    };
  });

  it('keeps judgment basis collapsed by default and expands it through MathText', async () => {
    const { default: QuestionDetail } = await import('@/pages/QuestionDetail');

    getMock.mockResolvedValueOnce({
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
            item_id: 'p1:q:9',
            question_number: '9',
            page_index: 0,
            verdict: 'correct',
            question_content: '题目',
          },
        ],
        questions: [
          {
            item_id: 'p1:q:9',
            question_number: '9',
            page_index: 0,
            verdict: 'correct',
            question_text: '题目',
            student_answer: 'x\\geqslant-\\frac{1}{3}',
            reason: '应为$x+2$',
            judgment_basis: [
              '\\boldsymbol{x\\geqslant-\\frac{1}{3}}',
              '\\boldsymbol{x<-\\frac{3}{2}}',
            ],
          },
        ],
      },
    });

    const user = userEvent.setup();
    const { container } = render(<QuestionDetail />);

    expect(await screen.findByText('判题分析')).toBeInTheDocument();
    expect(container.textContent).toContain('应为');
    expect(container.textContent).not.toContain('应为$x+2$');
    expect(screen.getByRole('button', { name: '判题依据 · 2条' })).toBeInTheDocument();
    expect(screen.queryByText('x≥-1/3')).not.toBeInTheDocument();
    expect(screen.queryByText('x<-3/2')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('\\boldsymbol{x\\geqslant-\\frac{1}{3}}');
    expect(container.textContent).not.toContain('\\boldsymbol{x<-\\frac{3}{2}}');

    await user.click(screen.getByRole('button', { name: '判题依据 · 2条' }));

    expect(screen.getByRole('button', { name: '收起依据' })).toBeInTheDocument();
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(3);
    expect(container.textContent).not.toContain('\\boldsymbol{x\\geqslant-\\frac{1}{3}}');
    expect(container.textContent).not.toContain('\\boldsymbol{x<-\\frac{3}{2}}');
  });
});
