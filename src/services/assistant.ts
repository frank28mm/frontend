import { CanceledError, getAdapter, type AxiosRequestConfig } from 'axios';
import { apiClient } from './api';
import { isConfirmationPathID, validateReportConfirmation, type ConfirmationIdentity, type ReportConfirmation } from './assistantConfirmationValidation';
import { validatePlanConfirmation, type PlanConfirmation } from './assistantPlanConfirmation';
import { validPlanId } from './plans';

export { validateReportConfirmation } from './assistantConfirmationValidation';
export type { ConfirmationIdentity, ReportConfirmation } from './assistantConfirmationValidation';

export const ASSISTANT_CONTRACT = 'rizhi.assistant.v1';
export interface AssistantPlanContext { plan_id: string; version: number }
export const validAssistantPlanContext = (value: unknown): value is AssistantPlanContext => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const context = value as AssistantPlanContext;
  return Object.keys(value).length === 2 && validPlanId(context.plan_id) && Number.isSafeInteger(context.version) && context.version > 0;
};
export const PLAN_DISCUSSION_EVENT = 'assistant:plan-discussion';
export const OPEN_ASSISTANT_HISTORY_EVENT = 'assistant:open-history';
export interface PlanDiscussionRequest { plan_context: AssistantPlanContext; accountId: string; token: string }
export function openPlanDiscussion(plan_context: AssistantPlanContext, accountId: string, token: string) {
  if (!validAssistantPlanContext(plan_context) || !accountId || !token) return false;
  return window.dispatchEvent(new CustomEvent<PlanDiscussionRequest>(PLAN_DISCUSSION_EVENT, { detail: { plan_context: { ...plan_context }, accountId, token }, cancelable: true }));
}
export interface LatestAssistantTurn {
  turn_id: string;
  status: 'processing' | 'completed' | 'failed' | 'canceled';
  error_code?: string;
  retry_of_turn_id?: string;
  created_at?: string;
}
export interface Conversation {
  conversation_id: string;
  title: string;
  archived: boolean;
  confirmed_profile_id?: string;
  created_at: string;
  updated_at: string;
  latest_turn?: LatestAssistantTurn;
  plan_context?: AssistantPlanContext;
}
export interface MistakeReference {
  submission_id: string;
  item_id: string;
  display_number: string;
  created_at: string;
  question_text?: string;
  reason?: string;
  knowledge_path?: string;
  href?: string;
  navigation_unavailable?: boolean;
  question_text_truncated?: boolean;
  reason_truncated?: boolean;
}
export interface ReferencePage {
  items: MistakeReference[];
  next_cursor?: string;
  submission_counts: Record<string, number>;
}
export interface ReportReference {
  report_id: string;
  title: string;
  subject: string;
  created_at: string;
  period_from?: string;
  period_to?: string;
  href?: string;
  title_truncated?: boolean;
  navigation_unavailable?: boolean;
}
export interface ReportReferencePage {
  items: ReportReference[];
  total: number;
  next_cursor?: string;
  filter_basis: 'generated_at';
}
export interface ReportScope {
  profile_id: string;
  subject?: string;
  from_date?: string;
  through_date?: string;
}
export type AssistantBlock =
  | { type: 'text'; text: string }
  | { type: 'clarification'; prompt_id: string; question: string; choices?: { profile_id: string; display_name: string }[] }
  | { type: 'references'; references: ReferencePage }
  | { type: 'action_confirmation'; action_confirmation: ReportConfirmation }
  | { type: 'plan_confirmation'; plan_confirmation: PlanConfirmation }
  | { type: 'report_references'; report_references: ReportReferencePage; report_scope: ReportScope };
export interface AssistantMessage {
  message_id: string;
  turn_id?: string;
  sequence: number;
  role: 'user' | 'assistant';
  blocks: AssistantBlock[];
  created_at: string;
}
export interface AssistantTurn extends LatestAssistantTurn {
  conversation_id: string;
  turn_id: string;
  error_code?: string;
  messages?: AssistantMessage[];
}
export interface SendTurn {
  conversation_id: string;
  client_request_id: string;
  text: string;
  retry_of_turn_id?: string;
  plan_context?: AssistantPlanContext;
}
interface Versioned { contract_version: string }

export function canonicalConfirmation(block: Extract<AssistantBlock, { type: 'action_confirmation' }>, conversationId: string, turnId?: string, role?: string): ReportConfirmation | undefined;
export function canonicalConfirmation(block: AssistantBlock, conversationId: string, turnId?: string, role?: string): ReportConfirmation | PlanConfirmation | undefined;
export function canonicalConfirmation(block: AssistantBlock, conversationId: string, turnId?: string, role?: string): ReportConfirmation | PlanConfirmation | undefined {
  if (role !== 'assistant' || !conversationId || !turnId) return;
  if (block.type === 'plan_confirmation') {
    const value = block.plan_confirmation;
    if (validatePlanConfirmation(value, { confirmation_id: value?.confirmation_id, conversation_id: conversationId, turn_id: turnId })) return value;
  }
  if (block.type === 'action_confirmation') {
    const value = block.action_confirmation;
    if (validateReportConfirmation(value, { confirmation_id: value?.confirmation_id, conversation_id: conversationId, turn_id: turnId })) return value;
  }
}

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const accountId = localStorage.getItem('user_id');
  const token = localStorage.getItem('access_token');
  const live = () => { try { return !config.signal?.aborted && localStorage.getItem('user_id') === accountId && localStorage.getItem('access_token') === token; } catch { return false; } };
  const adapter = getAdapter(config.adapter || apiClient.defaults.adapter);
  const { data } = await apiClient.request<T & Versioned>({ ...config, adapter: async input => {
    if (!live()) throw new CanceledError('Assistant account changed');
    try { const response = await adapter(input); if (!live()) throw new CanceledError('Assistant account changed'); return response; }
    catch (error) { if (!live()) throw new CanceledError('Assistant account changed'); throw error; }
  } });
  if (!data || data.contract_version !== ASSISTANT_CONTRACT) {
    throw new Error('UNSUPPORTED_ASSISTANT_CONTRACT');
  }
  return data;
}

const conversationPath = (id: string) => `/assistant/conversations/${encodeURIComponent(id)}`;
const turnPath = (id: string) => `/assistant/turns/${encodeURIComponent(id)}`;

export interface AssistantConfirmationContext {
  accountId: string;
  token: string;
  isCurrent?: () => boolean;
  expected?: Omit<ConfirmationIdentity, 'confirmation_id'>;
}

async function confirmationRequest(id: string, context: AssistantConfirmationContext, execute: boolean, signal?: AbortSignal): Promise<ReportConfirmation> {
  if (!isConfirmationPathID(id)) throw new Error('INVALID_CONFIRMATION_ID');
  const { accountId, token, isCurrent, expected } = context;
  const live = () => {
    try {
      return Boolean(accountId && token && !signal?.aborted && (!isCurrent || isCurrent()) &&
        localStorage.getItem('user_id') === accountId && localStorage.getItem('access_token') === token);
    } catch { return false; }
  };
  if (!live()) throw new CanceledError('Confirmation identity changed');
  const adapter = getAdapter(apiClient.defaults.adapter);
  const response = await request<{ confirmation: unknown }>({
    method: execute ? 'post' : 'get',
    url: `/assistant/confirmations/${encodeURIComponent(id)}${execute ? '/execute' : ''}`,
    ...(execute ? { data: { contract_version: ASSISTANT_CONTRACT } } : {}),
    signal,
    headers: { Authorization: `Bearer ${token}` },
    adapter: async config => {
      if (!live()) throw new CanceledError('Confirmation identity changed');
      config.headers.set('Authorization', `Bearer ${token}`);
      config.headers.delete('X-Profile-Id');
      config.headers.delete('X-User-Id');
      try {
        const result = await adapter(config);
        if (!live()) throw new CanceledError('Confirmation identity changed');
        return result;
      } catch (error) {
        // Fence stale errors before shared auth/quota response interceptors run.
        if (!live()) throw new CanceledError('Confirmation identity changed');
        const failure = error as { response?: { status?: number; data?: { detail?: string } } };
        if (failure.response?.status === 402) {
          // Confirmation quota refusal belongs to this action, not the shared page redirect.
          throw Object.assign(new Error('报告券不足'), { status: 402, code: 'quota_insufficient' });
        }
        throw error;
      }
    },
  });
  if (!live()) throw new CanceledError('Confirmation identity changed');
  if (!validateReportConfirmation(response.confirmation, { ...expected, confirmation_id: id }) ||
    (execute && response.confirmation.status !== 'executed')) throw new Error('INVALID_REPORT_CONFIRMATION');
  return response.confirmation;
}

export const assistantService = {
  getConfirmation: (id: string, context: AssistantConfirmationContext, signal?: AbortSignal) => confirmationRequest(id, context, false, signal),
  executeConfirmation: (id: string, context: AssistantConfirmationContext, signal?: AbortSignal) => confirmationRequest(id, context, true, signal),
  list: async (status: 'active' | 'archived' = 'active', cursor?: string, signal?: AbortSignal) => {
    const result = await request<{ items: Conversation[]; next_cursor?: string }>({ url: '/assistant/conversations', params: { status, ...(cursor ? { cursor } : {}) }, signal });
    for (const conversation of result.items) if (conversation.plan_context !== undefined && !validAssistantPlanContext(conversation.plan_context)) throw new Error('INVALID_PLAN_CONTEXT');
    return result;
  },
  detail: async (id: string, beforeSequence?: number, signal?: AbortSignal) => {
    const result = await request<{ conversation: Conversation; messages: AssistantMessage[]; next_before_sequence: number }>({ url: conversationPath(id), params: beforeSequence ? { before_sequence: beforeSequence } : undefined, signal });
    if (result.conversation?.plan_context !== undefined && !validAssistantPlanContext(result.conversation.plan_context)) throw new Error('INVALID_PLAN_CONTEXT');
    return result;
  },
  send: async (input: SendTurn, signal?: AbortSignal) => {
    if (input.plan_context !== undefined && !validAssistantPlanContext(input.plan_context)) throw new Error('INVALID_PLAN_CONTEXT');
    return request<AssistantTurn>({ method: 'post', url: '/assistant/turns', data: { ...input, ...(input.plan_context ? { plan_context: { ...input.plan_context } } : {}), contract_version: ASSISTANT_CONTRACT }, signal });
  },
  turn: (id: string, signal?: AbortSignal) => request<AssistantTurn>({ url: turnPath(id), signal }),
  references: (id: string, cursor?: string, limit = 12, signal?: AbortSignal) =>
    request<ReferencePage>({ url: `${turnPath(id)}/references`, params: { ...(cursor ? { cursor } : {}), limit }, signal }),
  reports: (id: string, cursor?: string, limit = 12, signal?: AbortSignal) =>
    request<ReportReferencePage>({ url: `${turnPath(id)}/reports`, params: { ...(cursor ? { cursor } : {}), limit }, signal }),
  update: (id: string, update: { title?: string; archived?: boolean }, signal?: AbortSignal) =>
    request<{ conversation: Conversation }>({ method: 'patch', url: conversationPath(id), data: update, signal }),
  remove: (id: string, signal?: AbortSignal) => request<{ ok: boolean }>({ method: 'delete', url: conversationPath(id), signal }),
};
