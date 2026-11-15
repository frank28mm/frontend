import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { capabilityState, navigateMock, subjectReadEnabledMock, useReportsMock } = vi.hoisted(() => ({
  capabilityState: { loading: false },
  navigateMock: vi.fn(),
  subjectReadEnabledMock: vi.fn((subject: string) => subject.length > 0),
  useReportsMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/hooks/useAppSWR', () => ({
  useReports: () => useReportsMock(),
}));

vi.mock('@/hooks/useSubjectCapabilities', () => ({
  useSubjectCapabilities: () => ({
    loading: capabilityState.loading,
    isReadEnabled: subjectReadEnabledMock,
    isSubmissionEnabled: () => true,
  }),
}));

vi.mock('@/components/ui/HomeButton', () => ({
  HomeFab: () => <div data-testid="home-fab" />,
}));

vi.mock('@/components/ui/BackButton', () => ({
  BackButton: ({ onClick }: { onClick: () => void }) => <button onClick={onClick}>back</button>,
}));

describe('ReportHistory subject identity', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    subjectReadEnabledMock.mockReset();
    subjectReadEnabledMock.mockReturnValue(true);
    useReportsMock.mockReset();
    capabilityState.loading = false;
  });

  it('distinguishes Math, English, Physics, and Chemistry records without changing the list API', async () => {
    useReportsMock.mockReturnValue({
      data: {
        items: [
          { report_id: 'report-math', title: 'Math report', subject: 'math', created_at: '2026-09-04T08:00:00Z' },
          { report_id: 'report-english', title: 'English report', params: { subject: 'english' }, created_at: '2026-09-04T09:00:00Z' },
          { report_id: 'report-physics', title: 'Physics report', subject: 'physics', created_at: '2026-09-04T10:00:00Z' },
          { report_id: 'report-chemistry', title: 'Chemistry report', subject: 'chemistry', created_at: '2026-09-04T11:00:00Z' },
        ],
      },
      isLoading: false,
    });
    const { default: ReportHistory } = await import('@/pages/ReportHistory');

    render(<ReportHistory />);

    for (const [title, subject, label] of [
      ['Math report', 'math', '数学'],
      ['English report', 'english', '英语'],
      ['Physics report', 'physics', '物理'],
      ['Chemistry report', 'chemistry', '化学'],
    ] as const) {
      const row = screen.getByText(title).closest('[data-report-subject]');
      expect(row).toBeInstanceOf(HTMLElement);
      if (!(row instanceof HTMLElement)) throw new Error(`Missing report row for ${title}`);
      expect(row).toHaveAttribute('data-report-subject', subject);
      expect(within(row).getByText(label)).toBeInTheDocument();
    }
    expect(useReportsMock).toHaveBeenCalledWith();
  });

  it('filters report rows whose runtime read capability is disabled', async () => {
    subjectReadEnabledMock.mockImplementation((subject: string) => subject !== 'physics');
    useReportsMock.mockReturnValue({
      data: {
        items: [
          { report_id: 'report-math', title: 'Math report', subject: 'math' },
          { report_id: 'report-physics', title: 'Physics report', subject: 'physics' },
        ],
      },
      isLoading: false,
    });
    const { default: ReportHistory } = await import('@/pages/ReportHistory');

    render(<ReportHistory />);

    expect(screen.getByText('Math report')).toBeInTheDocument();
    expect(screen.queryByText('Physics report')).not.toBeInTheDocument();
  });

  it('filters Science report rows while runtime capabilities are pending', async () => {
    capabilityState.loading = true;
    useReportsMock.mockReturnValue({
      data: {
        items: [
          { report_id: 'report-math', title: 'Math report', subject: 'math' },
          { report_id: 'report-physics', title: 'Physics report', subject: 'physics' },
        ],
      },
      isLoading: false,
    });
    const { default: ReportHistory } = await import('@/pages/ReportHistory');

    render(<ReportHistory />);

    expect(screen.getByText('Math report')).toBeInTheDocument();
    expect(screen.queryByText('Physics report')).not.toBeInTheDocument();
  });

  it('carries a visible report subject into the detail route', async () => {
    useReportsMock.mockReturnValue({
      data: {
        items: [{ report_id: 'report-physics', title: 'Physics report', subject: 'physics' }],
      },
      isLoading: false,
    });
    const { default: ReportHistory } = await import('@/pages/ReportHistory');
    const user = userEvent.setup();

    render(<ReportHistory />);
    await user.click(screen.getByText('Physics report'));

    expect(navigateMock).toHaveBeenCalledWith('/report/report-physics', {
      state: { subject: 'physics' },
    });
  });
});
