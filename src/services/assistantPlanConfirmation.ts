import { CanceledError, getAdapter, type AxiosRequestConfig } from 'axios';
import { apiClient } from './api';
import { isConfirmationIdentifier, isConfirmationPathID, type ReportConfirmation, type ConfirmationIdentity } from './assistantConfirmationValidation';
import type { AssistantConfirmationContext, AssistantPlanContext } from './assistant';
import { validPlanId } from './plans';
export type PlanConfirmation = Omit<ReportConfirmation, 'preview' | 'report_id'> & { preview: Omit<ReportConfirmation['preview'], 'cost' | 'eligibility' | 'quota_available' | 'scope_revision' | 'content_version'> & { content_version: 'revision_plan.v1'; generation_available: boolean; target_plan_id?: string; base_version?: number }; plan_id?: string };
export type PlanIdentity = Omit<ConfirmationIdentity, 'previous'> & { previous?: PlanConfirmation };
export const isPlanConfirmation = (value: ReportConfirmation | PlanConfirmation): value is PlanConfirmation => value.preview.content_version === 'revision_plan.v1';
export function matchesConfirmationPlanContext(value: ReportConfirmation | PlanConfirmation, context?: AssistantPlanContext): boolean {
  if (!value?.preview) return false;
  if (!isPlanConfirmation(value)) return !context;
  if (!validatePlanConfirmation(value, { confirmation_id: value.confirmation_id })) return false;
  return context ? value.preview.target_plan_id === context.plan_id && value.preview.base_version === context.version
    : value.preview.target_plan_id === undefined;
}
const date = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const timestamp = (v: unknown) => {
  if (typeof v !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(v);
  return Boolean(match && date(match[1]) && Number(match[2]) < 24 && Number(match[3]) < 60 && Number(match[4]) < 60 && Number.isFinite(Date.parse(v)));
};
export function validatePlanConfirmation(value: unknown, expected: PlanIdentity): value is PlanConfirmation {
  if (!value || typeof value !== 'object') return false;
  const c = value as PlanConfirmation;
  const p = c.preview;
  const scope = p?.scope;
  if (p && (p.target_plan_id !== undefined || p.base_version !== undefined) &&
    (!validPlanId(p.target_plan_id) || !Number.isSafeInteger(p.base_version) || !(p.base_version! > 0))) return false;
  if (c.status === 'executed' && p?.target_plan_id !== undefined && c.plan_id !== p.target_plan_id) return false;
  if (!isConfirmationPathID(expected.confirmation_id) || !isConfirmationPathID(c.confirmation_id) || c.confirmation_id !== expected.confirmation_id ||
    !isConfirmationIdentifier(c.conversation_id) || !isConfirmationIdentifier(c.turn_id) ||
    expected.conversation_id !== undefined && c.conversation_id !== expected.conversation_id || expected.turn_id !== undefined && c.turn_id !== expected.turn_id || !timestamp(c.expires_at) ||
    !p || !scope || !isConfirmationIdentifier(scope.profile_id) || !['math', 'english', 'physics', 'chemistry'].includes(scope.subject) ||
    !date(scope.from_date) || !date(scope.through_date) || scope.from_date > scope.through_date || p.time_zone !== 'Asia/Shanghai' ||
    p.content_version !== 'revision_plan.v1' || typeof p.generation_available !== 'boolean' ||
    typeof p.goal !== 'string' || !p.goal.trim() || new TextEncoder().encode(p.goal).length > 2000 || typeof p.child_name !== 'string' || !p.child_name.trim() || new TextEncoder().encode(p.child_name).length > 1000 ||
    c.job_id !== undefined && !isConfirmationIdentifier(c.job_id) ||
    (c.plan_id !== undefined && !isConfirmationIdentifier(c.plan_id)) || (c.status === 'executed' ? !isConfirmationIdentifier(c.plan_id) : c.plan_id !== undefined)) return false;
  if (c.status === 'executed' ? !isConfirmationIdentifier(c.job_id) : !['pending', 'expired', 'invalidated'].includes(c.status) || c.job_id !== undefined) return false;
  const previous = expected.previous;
  if (previous) {
    if (!validatePlanConfirmation(previous, { confirmation_id: expected.confirmation_id }) || previous.conversation_id !== c.conversation_id || previous.turn_id !== c.turn_id || previous.expires_at !== c.expires_at ||
      previous.preview.child_name !== p.child_name || previous.preview.goal !== p.goal || previous.preview.target_plan_id !== p.target_plan_id || previous.preview.base_version !== p.base_version ||
      Object.keys(scope).length !== Object.keys(previous.preview.scope).length || Object.entries(previous.preview.scope).some(([key, v]) => scope[key as keyof typeof scope] !== v) ||
      previous.status === 'executed' && c.status !== 'executed' || ['expired', 'invalidated'].includes(previous.status) && ['pending', 'executed'].includes(c.status) ||
      previous.job_id !== undefined && previous.job_id !== c.job_id || previous.plan_id !== undefined && previous.plan_id !== c.plan_id) return false;
  }
  return true;
}

export interface PlanJob { job_id: string; plan_id: string; status: 'queued' | 'processing' | 'done' | 'failed'; version?: number; error_code?: string }
async function fencedRequest(config: AxiosRequestConfig, context: Omit<AssistantConfirmationContext, 'expected'>, signal?: AbortSignal) {
  const live = () => { try { return Boolean(context.accountId && context.token && !signal?.aborted && (!context.isCurrent || context.isCurrent()) && localStorage.getItem('user_id') === context.accountId && localStorage.getItem('access_token') === context.token); } catch { return false; } };
  const assertLive = () => { if (!live()) throw new CanceledError('Confirmation identity changed'); };
  assertLive();
  const adapter = getAdapter(apiClient.defaults.adapter);
  const response = await apiClient.request({ ...config, signal, headers: { Authorization: `Bearer ${context.token}` }, adapter: async input => {
    assertLive(); input.headers.set('Authorization', `Bearer ${context.token}`); input.headers.delete('X-Profile-Id'); input.headers.delete('X-User-Id');
    // Shared GET cache-busting is not part of either contract.
    input.params = config.params;
    try { const result = await adapter(input); assertLive(); return result; }
    catch (error) { assertLive(); throw error; }
  } });
  assertLive();
  return response.data;
}
type PlanContext = Omit<AssistantConfirmationContext, 'expected'> & { expected?: Omit<PlanIdentity, 'confirmation_id'> };
async function confirmationRequest(id: string, context: PlanContext, execute: boolean, signal?: AbortSignal): Promise<PlanConfirmation> {
  if (!isConfirmationPathID(id)) throw new Error('INVALID_CONFIRMATION_ID');
  const result = await fencedRequest({ method: execute ? 'post' : 'get', url: `/assistant/plan-confirmations/${encodeURIComponent(id)}${execute ? '/execute' : ''}`, ...(execute ? { data: { contract_version: 'rizhi.assistant.v1' } } : {}) }, context, signal);
  if (result?.contract_version !== 'rizhi.assistant.v1' || !validatePlanConfirmation(result.confirmation, { ...context.expected, confirmation_id: id }) || (execute && result.confirmation.status !== 'executed')) throw new Error('INVALID_PLAN_CONFIRMATION');
  return result.confirmation;
}
export const planConfirmationService = {
  getConfirmation: (id: string, context: PlanContext, signal?: AbortSignal) => confirmationRequest(id, context, false, signal),
  executeConfirmation: (id: string, context: PlanContext, signal?: AbortSignal) => confirmationRequest(id, context, true, signal),
  job: async (value: PlanConfirmation, context: AssistantConfirmationContext, signal?: AbortSignal): Promise<PlanJob> => {
    if (!validatePlanConfirmation(value, { confirmation_id: value.confirmation_id }) || value.status !== 'executed') throw new Error('INVALID_PLAN_JOB_SOURCE');
    const result = await fencedRequest({ url: `/plan-jobs/${encodeURIComponent(value.job_id!)}`, params: { profile_id: value.preview.scope.profile_id } }, context, signal);
    const job = result?.job;
    if (result?.contract_version !== 'revision_plan.v1' || !job || job.job_id !== value.job_id || job.plan_id !== value.plan_id ||
      !['queued', 'processing', 'done', 'failed'].includes(job.status) ||
      (job.version !== undefined && (!Number.isSafeInteger(job.version) || job.version < 0)) ||
      (job.status === 'done' ? !(job.version > 0) : job.version !== undefined && job.version !== 0) ||
      (job.error_code !== undefined && typeof job.error_code !== 'string') ||
      (job.profile_id !== undefined && job.profile_id !== value.preview.scope.profile_id)) throw new Error('INVALID_PLAN_JOB');
    return job;
  },
};
