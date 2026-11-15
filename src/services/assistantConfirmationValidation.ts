import type { CapabilitySubject, ReportEligibility } from './types';

export interface ReportConfirmation {
  confirmation_id: string;
  conversation_id: string;
  turn_id: string;
  status: 'pending' | 'expired' | 'invalidated' | 'executed';
  expires_at: string;
  preview: {
    scope: { profile_id: string; subject: CapabilitySubject; from_date: string; through_date: string };
    child_name: string;
    time_zone: 'Asia/Shanghai';
    goal: string;
    content_version: 'parent_report.v1';
    cost: { report_coupons: 1; bt: 0 };
    eligibility: ReportEligibility;
    quota_available: boolean;
    scope_revision: string;
  };
  job_id?: string;
  report_id?: string;
}

export interface ConfirmationIdentity {
  confirmation_id: string;
  conversation_id?: string;
  turn_id?: string;
  previous?: ReportConfirmation;
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export const isConfirmationIdentifier = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value || value.trim() !== value || value === '.' || value === '..' ||
    Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false;
  try { return new TextEncoder().encode(value).length <= 128 && Boolean(encodeURIComponent(value)); } catch { return false; }
};
export const isConfirmationPathID = (value: unknown): value is string => isConfirmationIdentifier(value) && !/[/\\ ]/.test(value);
const date = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const timestamp = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  return Boolean(match && date(match[1]) && Number(match[2]) < 24 && Number(match[3]) < 60 && Number(match[4]) < 60 && Number.isFinite(Date.parse(value)));
};

const eligibility = (value: unknown, subject: unknown): boolean => {
  if (!record(value) || typeof value.eligible !== 'boolean' ||
    !count(value.submission_count) || !count(value.required_count) || !count(value.distinct_days) || !count(value.required_days) ||
    value.distinct_days > value.submission_count) return false;
  if (value.subject !== undefined && value.subject !== subject) return false;
  if (value.reason !== undefined && typeof value.reason !== 'string') return false;
  if (value.progress_percent !== undefined && (!count(value.progress_percent) || value.progress_percent > 100)) return false;
  if (value.sample_submission_ids !== undefined && (!Array.isArray(value.sample_submission_ids) ||
    !value.sample_submission_ids.every(isConfirmationIdentifier) || value.sample_submission_ids.length > value.submission_count ||
    new Set(value.sample_submission_ids).size !== value.sample_submission_ids.length)) return false;
  // Eligibility policy stays server-owned; only a claimed positive result must meet its own thresholds.
  return !value.eligible || (value.submission_count >= value.required_count && value.distinct_days >= value.required_days);
};

const same = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => same(value, right[index]));
  if (!record(left) || !record(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && same(left[key], right[key]));
};

export function validateReportConfirmation(value: unknown, expected: ConfirmationIdentity): value is ReportConfirmation {
  if (!record(value) || !isConfirmationPathID(expected.confirmation_id) ||
    !isConfirmationPathID(value.confirmation_id) || value.confirmation_id !== expected.confirmation_id ||
    !isConfirmationIdentifier(value.conversation_id) || !isConfirmationIdentifier(value.turn_id) ||
    (expected.conversation_id !== undefined && value.conversation_id !== expected.conversation_id) ||
    (expected.turn_id !== undefined && value.turn_id !== expected.turn_id) || !timestamp(value.expires_at)) return false;
  const preview = value.preview;
  if (!record(preview) || !record(preview.scope) || !record(preview.cost)) return false;
  const scope = preview.scope;
  if (!isConfirmationIdentifier(scope.profile_id) || typeof scope.subject !== 'string' || !['math', 'english', 'physics', 'chemistry'].includes(scope.subject) ||
    !date(scope.from_date) || !date(scope.through_date) || scope.from_date > scope.through_date ||
    typeof preview.child_name !== 'string' || typeof preview.goal !== 'string' || new TextEncoder().encode(preview.goal).length > 2000 ||
    preview.time_zone !== 'Asia/Shanghai' || preview.content_version !== 'parent_report.v1' ||
    preview.cost.report_coupons !== 1 || preview.cost.bt !== 0 || preview.scope_revision !== value.turn_id ||
    typeof preview.quota_available !== 'boolean' || !eligibility(preview.eligibility, scope.subject)) return false;
  if (value.job_id !== undefined && !isConfirmationIdentifier(value.job_id)) return false;
  if (value.report_id !== undefined && !isConfirmationIdentifier(value.report_id)) return false;
  if (value.status === 'executed') {
    if (!isConfirmationIdentifier(value.job_id)) return false;
  } else if (typeof value.status !== 'string' || !['pending', 'expired', 'invalidated'].includes(value.status) || value.job_id !== undefined || value.report_id !== undefined) return false;
  const previous = expected.previous;
  if (previous) {
    if (!validateReportConfirmation(previous, { confirmation_id: expected.confirmation_id }) ||
      previous.conversation_id !== value.conversation_id || previous.turn_id !== value.turn_id || previous.expires_at !== value.expires_at ||
      !same(previous.preview, preview) || (previous.status === 'executed' && value.status !== 'executed') ||
      ((previous.status === 'expired' || previous.status === 'invalidated') && (value.status === 'pending' || value.status === 'executed')) ||
      (previous.job_id !== undefined && previous.job_id !== value.job_id) || (previous.report_id !== undefined && previous.report_id !== value.report_id)) return false;
  }
  return true;
}
