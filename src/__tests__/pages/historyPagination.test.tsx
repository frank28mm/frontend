import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SubmissionItem } from '@/services/types';

const {
  loadMoreMock,
  mutateMock,
  navigateMock,
  subjectReadEnabledMock,
  useSubmissionsMock,
} = vi.hoisted(() => ({
  loadMoreMock: vi.fn(),
  mutateMock: vi.fn(),
  navigateMock: vi.fn(),
  subjectReadEnabledMock: vi.fn(() => true),
  useSubmissionsMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ pathname: '/history', state: null }),
  };
});

vi.mock('@/hooks/useAppSWR', () => ({
  useSubmissions: (options?: unknown) => useSubmissionsMock(options),
}));

vi.mock('@/hooks/useSubjectCapabilities', () => ({
  useSubjectCapabilities: () => ({
    loading: false,
    isReadEnabled: subjectReadEnabledMock,
    isSubmissionEnabled: () => true,
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/components/ui/HomeButton', () => ({
  HomeFab: () => <div data-testid="home-fab" />,
}));

vi.mock('@/config/features', () => ({
  FEATURE_ENGLISH_RENDER_ENABLED: true,
  FEATURE_PHYSICS_RENDER_ENABLED: true,
  FEATURE_CHEMISTRY_RENDER_ENABLED: true,
}));

const item: SubmissionItem = {
  submission_id: 'sub-outside',
  subject: 'math',
  created_at: '2000-01-01T10:00:00Z',
  summary: { total_items: 2, wrong_count: 1, uncertain_count: 0 },
};

const createStorageMock = (): Storage => {
  const values = new Map<string, string>();
  const storage = {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, String(value));
      Object.defineProperty(storage, key, {
        value: String(value),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    },
    removeItem: (key: string) => {
      values.delete(key);
      delete (storage as Record<string, unknown>)[key];
    },
    clear: () => {
      for (const key of values.keys()) {
        delete (storage as Record<string, unknown>)[key];
      }
      values.clear();
    },
  };
  return storage as Storage;
};

describe('History pagination and exact date query', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: createStorageMock(),
      configurable: true,
    });
    loadMoreMock.mockReset();
    mutateMock.mockReset();
    navigateMock.mockReset();
    useSubmissionsMock.mockReset();
    useSubmissionsMock.mockReturnValue({
      data: { items: [item] },
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: loadMoreMock,
      mutate: mutateMock,
    });
  });

  it('turns a selected local calendar day into an API UTC half-open range', async () => {
    const user = userEvent.setup();
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const before = new Date(now.getFullYear(), now.getMonth(), 2);
    const { default: History } = await import('@/pages/History');

    render(<History />);
    await user.click(screen.getByText('tune').closest('button')!);
    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => expect(useSubmissionsMock).toHaveBeenLastCalledWith({
      subject: undefined,
      from: from.toISOString(),
      before: before.toISOString(),
    }));
    expect(screen.getByText('#utside')).toBeInTheDocument();
  });

  it('loads an older page only when the user asks for it', async () => {
    useSubmissionsMock.mockReturnValue({
      data: { items: [item] },
      isLoading: false,
      isLoadingMore: false,
      hasMore: true,
      error: null,
      loadMore: loadMoreMock,
      mutate: mutateMock,
    });
    const user = userEvent.setup();
    const { default: History } = await import('@/pages/History');

    render(<History />);
    await user.click(screen.getByRole('button', { name: '加载更早' }));

    expect(loadMoreMock).toHaveBeenCalledTimes(1);
  });

  it('keeps dirty-submission refresh behavior', async () => {
    localStorage.setItem('submission_dirty_sub-outside', '1');
    const { default: History } = await import('@/pages/History');

    render(<History />);

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('submission_dirty_sub-outside')).toBeNull();
  });
});
