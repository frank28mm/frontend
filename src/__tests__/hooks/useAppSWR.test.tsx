import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useKnowledgeArchive, useSubmissions } from '@/hooks/useAppSWR';
import type { SubmissionItem } from '@/services/types';

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}));

vi.mock('@/services/api', () => ({
  apiClient: {
    get: getMock,
  },
}));

const wrapper = ({ children }: PropsWithChildren) => (
  <SWRConfig
    value={{
      provider: () => new Map(),
      dedupingInterval: 0,
      errorRetryCount: 0,
      revalidateOnFocus: false,
    }}
  >
    {children}
  </SWRConfig>
);

const submission = (index: number): SubmissionItem => ({
  submission_id: `sub-${index}`,
  subject: 'math',
  created_at: `2026-09-12T${String(23 - index).padStart(2, '0')}:00:00Z`,
});

describe('useSubmissions pagination', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('keeps subject and UTC date bounds while following the next-before cursor', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => submission(index));
    getMock
      .mockResolvedValueOnce({
        data: { items: firstPage, next_before: '2026-09-12T03:00:00Z' },
      })
      .mockResolvedValueOnce({
        data: {
          items: [firstPage[19], submission(20)],
        },
      });

    const { result } = renderHook(() => useSubmissions({
      subject: 'math',
      from: '2026-09-11T16:00:00.000Z',
      before: '2026-09-12T16:00:00.000Z',
    }), { wrapper });

    await waitFor(() => expect(result.current.data?.items).toHaveLength(20));
    const firstURL = new URL(String(getMock.mock.calls[0][0]), 'http://localhost');
    expect(Object.fromEntries(firstURL.searchParams)).toEqual({
      limit: '20',
      subject: 'math',
      from: '2026-09-11T16:00:00.000Z',
      before: '2026-09-12T16:00:00.000Z',
    });
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    await waitFor(() => expect(result.current.data?.items).toHaveLength(21));
    const secondURL = new URL(String(getMock.mock.calls[1][0]), 'http://localhost');
    expect(Object.fromEntries(secondURL.searchParams)).toEqual({
      limit: '20',
      subject: 'math',
      from: '2026-09-11T16:00:00.000Z',
      before: '2026-09-12T03:00:00Z',
    });
    expect(result.current.hasMore).toBe(false);
  });
});

describe('useKnowledgeArchive capability gate', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('does not request a disabled subject archive', async () => {
    const { result } = renderHook(
      () => useKnowledgeArchive('physics', 'active', false),
      { wrapper },
    );

    await act(async () => Promise.resolve());

    expect(result.current.data).toBeUndefined();
    expect(getMock).not.toHaveBeenCalled();
  });
});
