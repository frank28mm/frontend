import { useMemo } from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import { apiClient } from '@/services/api';
import type {
  CapabilitySubject,
  SubmissionListResponse,
  ReportListResponse,
  MistakeItem,
  KnowledgeArchiveResponse,
  QuotaResponse,
} from '@/services/types';

const fetcher = async (url: string) => {
  const res = await apiClient.get(url);
  return res.data;
};

const SUBMISSION_PAGE_SIZE = 20;

export interface SubmissionListQuery {
  subject?: string;
  from?: string;
  before?: string;
}

const submissionPageKey = (
  query: SubmissionListQuery,
  pageIndex: number,
  previousPage?: SubmissionListResponse,
) => {
  if (pageIndex > 0) {
    if (!previousPage?.next_before || previousPage.items.length < SUBMISSION_PAGE_SIZE) {
      return null;
    }
  }

  const params = new URLSearchParams();
  params.set('limit', String(SUBMISSION_PAGE_SIZE));
  if (query.subject && query.subject !== 'all') params.set('subject', query.subject);
  if (query.from) params.set('from', query.from);
  const before = pageIndex > 0 ? previousPage?.next_before : query.before;
  if (before) params.set('before', before);
  return `/submissions?${params.toString()}`;
};

export function useSubmissions(query: SubmissionListQuery = {}) {
  const swr = useSWRInfinite<SubmissionListResponse>(
    (pageIndex, previousPage) => submissionPageKey(query, pageIndex, previousPage),
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateFirstPage: false,
      dedupingInterval: 10000,
    },
  );

  const items = useMemo(() => {
    const seen = new Set<string>();
    return (swr.data || []).flatMap((page) => page.items || []).filter((item) => {
      if (seen.has(item.submission_id)) return false;
      seen.add(item.submission_id);
      return true;
    });
  }, [swr.data]);

  const lastPage = swr.data?.[swr.data.length - 1];
  const hasMore = Boolean(
    lastPage?.next_before && lastPage.items.length >= SUBMISSION_PAGE_SIZE,
  );
  const isLoadingMore = !swr.error && Boolean(
    swr.data && swr.size > swr.data.length,
  );
  const data = useMemo<SubmissionListResponse | undefined>(() => (
    swr.data
      ? { items, next_before: lastPage?.next_before }
      : undefined
  ), [items, lastPage?.next_before, swr.data]);

  const loadMore = () => {
    if (!hasMore || isLoadingMore) return Promise.resolve(swr.data);
    if (swr.error) return swr.mutate();
    return swr.setSize((current) => current + 1);
  };

  return {
    ...swr,
    data,
    hasMore,
    isLoadingMore,
    loadMore,
  };
}

export function useReports() {
  return useSWR<ReportListResponse>(
    '/reports',
    fetcher,
    {
      revalidateOnFocus: true,
      dedupingInterval: 15000,
    }
  );
}

export function useMistakes(includeExcluded: boolean = false) {
  const key = includeExcluded ? '/mistakes?include_excluded=true' : '/mistakes';
  
  return useSWR<{ items: MistakeItem[] }>(
    key,
    fetcher,
    {
      revalidateOnFocus: true,
      dedupingInterval: 15000,
    }
  );
}

export function useKnowledgeArchive(
  subject: CapabilitySubject,
  mistakeState: 'active' | 'mastered',
  enabled: boolean = true,
) {
  const key = enabled
    ? `/knowledge/archive?subject=${encodeURIComponent(subject)}&mistake_state=${encodeURIComponent(mistakeState)}`
    : null;
  return useSWR<KnowledgeArchiveResponse>(key, fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 15000,
  });
}

export function useQuota() {
  const { data, isLoading, mutate } = useSWR<QuotaResponse>(
    '/me/quota',
    fetcher,
    {
      revalidateOnFocus: true,
      dedupingInterval: 30000,
    }
  );

  return {
    quota: data ?? null,
    loading: isLoading,
    refresh: mutate,
  };
}

export function useFeedbackUnread() {
  const { data, isLoading, mutate } = useSWR<{ has_unread: boolean }>(
    '/feedback/check_unread',
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
      dedupingInterval: 10000,
    }
  );

  return {
    hasUnread: data?.has_unread ?? false,
    loading: isLoading,
    refresh: mutate,
  };
}
