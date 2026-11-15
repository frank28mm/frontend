import { CanceledError, getAdapter, type AxiosRequestConfig } from 'axios';
import { apiClient } from './api';
import type { CapabilitySubject, ReportEligibility } from './types';

export const PARENT_REPORT_VERSION = 'parent_report.v1' as const;

export interface ReportSubmissionContext {
  accountId: string;
  profileId: string;
  token: string;
}
export interface ReportSubmissionInput {
  subject: CapabilitySubject;
  window_days: number;
  client_request_id: string;
  from_date: string;
  through_date: string;
  content_version?: typeof PARENT_REPORT_VERSION;
}
export type ReportWindowDates = Pick<ReportSubmissionInput, 'from_date' | 'through_date'>;

export function reportWindowDates(windowDays: number, now = new Date()): ReportWindowDates {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', calendar: 'iso8601', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const end = Date.UTC(part('year'), part('month') - 1, part('day'));
  return { from_date: new Date(end - (windowDays - 1) * 86400000).toISOString().slice(0, 10), through_date: new Date(end).toISOString().slice(0, 10) };
}

const frozenConfig = (context: ReportSubmissionContext, signal: AbortSignal, isCurrent: () => boolean): AxiosRequestConfig => ({
  signal,
  headers: { Authorization: `Bearer ${context.token}`, 'X-Profile-Id': context.profileId },
  // Interceptors run asynchronously and may read a different account than the click did.
  adapter: async config => {
    const valid = () => !signal.aborted && isCurrent() && localStorage.getItem('access_token') === context.token && localStorage.getItem('user_id') === context.accountId;
    if (!valid()) throw new CanceledError('Report identity changed');
    config.headers.set('Authorization', `Bearer ${context.token}`);
    config.headers.set('X-Profile-Id', context.profileId);
    try {
      const response = await getAdapter(apiClient.defaults.adapter)(config);
      if (!valid()) throw new CanceledError('Report identity changed');
      return response;
    } catch (error) {
      // Fence stale errors before shared response interceptors can redirect or mutate auth.
      if (!valid()) throw new CanceledError('Report identity changed');
      throw error;
    }
  },
});

export const reportSubmissionService = {
  async eligibility(scope: Omit<ReportSubmissionInput, 'client_request_id'>, context: ReportSubmissionContext, signal: AbortSignal, isCurrent: () => boolean): Promise<ReportEligibility> {
    const { data } = await apiClient.get<ReportEligibility>('/reports/eligibility', {
      ...frozenConfig(context, signal, isCurrent),
      params: { mode: 'periodic', ...scope, min_distinct_days: 3, min_submissions: 3 },
    });
    return data;
  },
  async submit(input: ReportSubmissionInput, context: ReportSubmissionContext, signal: AbortSignal, isCurrent: () => boolean): Promise<string> {
    const { data } = await apiClient.post<{ job_id: string }>('/reports', input, frozenConfig(context, signal, isCurrent));
    if (typeof data?.job_id !== 'string' || !data.job_id.trim()) throw new Error('Unconfirmed report acceptance');
    return data.job_id;
  },
};
