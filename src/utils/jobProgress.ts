import type { JobResponse } from '@/services/types';

const LIVE_JOB_STATUSES = new Set(['queued', 'pending', 'processing', 'running']);

const recordValue = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const normalizedSubject = (value: unknown): string => String(value || '').trim().toLowerCase();

export const jobSubject = (job: JobResponse | null | undefined): string => {
  if (!job) return '';
  const result = recordValue(job.result);
  const resultQuestions = Array.isArray(result?.questions) ? result.questions : [];
  const subjects = [
    job.request?.subject,
    job.subject,
    result?.subject,
    ...resultQuestions.map((question) => recordValue(question)?.subject),
  ];
  return subjects.map(normalizedSubject).find((subject) => subject && subject !== 'auto') || '';
};

export const shouldUseLiveGradingProgress = (
  job: JobResponse | null | undefined,
  enabledSubjects: readonly string[],
): boolean => {
  if (!job || !LIVE_JOB_STATUSES.has(job.status)) return false;
  const enabled = new Set(enabledSubjects.map(normalizedSubject).filter(Boolean));
  return enabled.has(jobSubject(job));
};
