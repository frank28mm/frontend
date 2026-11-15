import { CanceledError, getAdapter, type AxiosRequestConfig } from 'axios';
import { apiClient } from './api';
import { isCapabilitySubject } from '@/config/subjects';
import type { CapabilitySubject } from './types';
import type { ParentReport } from '@/components/report/parentReportTypes';
import { validateParentReport } from '@/components/report/parentReportValidation';
import { validReportProfileId } from './reportNavigationScope';

export const PLAN_CONTRACT = 'revision_plan.v1';
export interface PlanSummary {
  plan_id: string; version: number; profile_id: string; subject: CapabilitySubject;
  title: string; from_date: string; through_date: string; created_at: string;
}
export interface PlanContent {
  contract_version: typeof PLAN_CONTRACT; title: string; overview: string;
  priorities: { topic: string; observation: string; suggestion: string; evidence_ids: string[] }[];
  suggestions: string[]; limitations: string[];
}
export interface PlanDetail extends Omit<PlanSummary, 'title'> {
  goal: string; captured_at: string; content: PlanContent; facts: ParentReport;
  provenance: { model: string; prompt_version: string }; source_conversation_id?: string;
}
export interface PlanAccountContext { accountId: string; token: string; isCurrent?: () => boolean }

type Obj = Record<string, unknown>;
const object = (value: unknown): value is Obj => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
export const validPlanId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const version = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 1000000;
const day = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const timestamp = (value: unknown): value is string => typeof value === 'string' && day(value.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const exactKeys = (value: Obj, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));

function planIdentity(value: Obj, profile?: string) {
  return validPlanId(value.plan_id) && version(value.version) && validReportProfileId(value.profile_id) &&
    (!profile || value.profile_id === profile) && isCapabilitySubject(value.subject) &&
    ['math', 'english', 'physics', 'chemistry'].includes(String(value.subject)) &&
    day(value.from_date) && day(value.through_date) && value.from_date <= value.through_date && timestamp(value.created_at);
}
export function validatePlanSummary(value: unknown, profile?: string): value is PlanSummary {
  return object(value) && planIdentity(value, profile) && text(value.title);
}
export function validatePlanDetail(value: unknown, id: string, requestedVersion = 0, profile?: string): value is PlanDetail {
  if (!object(value) || !planIdentity(value, profile) || value.plan_id !== id || requestedVersion > 0 && value.version !== requestedVersion ||
    !text(value.goal) || !timestamp(value.captured_at) || !object(value.provenance) || !text(value.provenance.model) || !text(value.provenance.prompt_version) ||
    value.source_conversation_id !== undefined && !validPlanId(value.source_conversation_id) ||
    !validateParentReport(value.facts, value.subject) || value.facts.meta.from_date !== value.from_date || value.facts.meta.through_date !== value.through_date || value.facts.meta.generated_at !== value.captured_at) return false;
  const content = value.content;
  if (!object(content) || !exactKeys(content, ['contract_version', 'title', 'overview', 'priorities', 'suggestions', 'limitations']) || content.contract_version !== PLAN_CONTRACT || !text(content.title) || !text(content.overview)) return false;
  try { if (new TextEncoder().encode(JSON.stringify(content)).length > 256 * 1024) return false; } catch { return false; }
  const evidence = new Set(value.facts.evidence_refs.map(ref => ref.id));
  return Array.isArray(content.priorities) && content.priorities.every(item => object(item) && exactKeys(item, ['topic', 'observation', 'suggestion', 'evidence_ids']) &&
    text(item.topic) && text(item.observation) && text(item.suggestion) && Array.isArray(item.evidence_ids) && item.evidence_ids.length > 0 &&
    item.evidence_ids.every(ref => typeof ref === 'string' && evidence.has(ref)) && new Set(item.evidence_ids).size === item.evidence_ids.length) &&
    Array.isArray(content.suggestions) && content.suggestions.every(text) && Array.isArray(content.limitations) && content.limitations.every(text);
}

async function request(config: AxiosRequestConfig, context: PlanAccountContext, signal?: AbortSignal): Promise<Obj> {
  const live = () => {
    try { return Boolean(context.accountId && context.token && !signal?.aborted && (!context.isCurrent || context.isCurrent()) && localStorage.getItem('user_id') === context.accountId && localStorage.getItem('access_token') === context.token); }
    catch { return false; }
  };
  if (!live()) throw new CanceledError('Plan account changed');
  const adapter = getAdapter(apiClient.defaults.adapter);
  const response = await apiClient.request({ ...config, signal, headers: { Authorization: `Bearer ${context.token}` }, adapter: async inner => {
    if (!live()) throw new CanceledError('Plan account changed');
    inner.headers.set('Authorization', `Bearer ${context.token}`);
    inner.headers.delete('X-User-Id'); inner.headers.delete('X-Profile-Id');
    try {
      const result = await adapter(inner);
      if (!live()) throw new CanceledError('Plan account changed');
      return result;
    } catch (error) {
      // Fence old-account errors before shared response interceptors clear auth.
      if (!live()) throw new CanceledError('Plan account changed');
      throw error;
    }
  } });
  if (!live()) throw new CanceledError('Plan account changed');
  if (!object(response.data) || response.data.contract_version !== PLAN_CONTRACT) throw new Error('UNSUPPORTED_PLAN_CONTRACT');
  return response.data;
}

export const plansService = {
  async list(context: PlanAccountContext, profileId?: string, offset = 0, signal?: AbortSignal): Promise<PlanSummary[]> {
    if (profileId !== undefined && !validReportProfileId(profileId) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new Error('INVALID_PLAN_SCOPE');
    const data = await request({ url: '/plans', params: { limit: 20, offset, ...(profileId ? { profile_id: profileId } : {}) } }, context, signal);
    if (!Array.isArray(data.items) || data.items.length > 20 || !data.items.every(item => validatePlanSummary(item, profileId)) || new Set(data.items.map(item => item.plan_id)).size !== data.items.length) throw new Error('INVALID_PLAN_LIST');
    return data.items;
  },
  async detail(id: string, requestedVersion: number, context: PlanAccountContext, profileId?: string, signal?: AbortSignal): Promise<PlanDetail> {
    if (!validPlanId(id) || !Number.isSafeInteger(requestedVersion) || requestedVersion < 0 || requestedVersion > 1000000 || profileId !== undefined && !validReportProfileId(profileId)) throw new Error('INVALID_PLAN_SCOPE');
    const data = await request({ url: `/plans/${encodeURIComponent(id)}`, params: { ...(requestedVersion ? { version: requestedVersion } : {}), ...(profileId ? { profile_id: profileId } : {}) } }, context, signal);
    if (!validatePlanDetail(data.plan, id, requestedVersion, profileId)) throw new Error('INVALID_SAVED_PLAN');
    return data.plan;
  },
};
