import { isCapabilitySubject } from '@/config/subjects';
import type { ParentCounts, ParentReport } from './parentReportTypes';

type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string';
const id = (v: unknown): v is string => {
  if (!text(v) || !v.trim() || Array.from(v).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false;
  try { encodeURIComponent(v); return true; }
  catch { return false; }
};
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const rate = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const list = (v: unknown, validate: (value: unknown) => boolean): boolean => Array.isArray(v) && v.every(validate);
const strings = (v: unknown) => list(v, text);
const day = (v: unknown): v is string => text(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const unique = (values: unknown[], key: string): boolean => new Set(values.map(v => object(v) ? v[key] : undefined)).size === values.length;
const counts = (v: unknown): v is ParentCounts => {
  if (!object(v) || !['total', 'correct', 'incorrect', 'blank', 'uncertain', 'accuracy_sample_size'].every(k => count(v[k]))) return false;
  const { total, correct, incorrect, blank, uncertain, accuracy_sample_size: sample, accuracy } = v as Record<string, number>;
  return correct + incorrect + uncertain === total && blank <= incorrect && sample === correct + incorrect && (sample === 0 ? accuracy === null : rate(accuracy) && Math.abs(accuracy - correct / sample) < 1e-9);
};

// Validate all visible fields and resolve every reference before rendering or building links.
export function validateParentReport(value: unknown, expectedSubject?: unknown): value is ParentReport {
  if (!object(value) || value.contract_version !== 'parent_report.v1') return false;
  const { meta, overall, data_quality: quality, subject_detail: detail, parent_summary: summary } = value;
  if (!object(meta) || !isCapabilitySubject(meta.subject) || expectedSubject !== undefined && meta.subject !== expectedSubject || !day(meta.from_date) || !day(meta.through_date) || meta.from_date > meta.through_date || meta.time_zone !== 'Asia/Shanghai' || !text(meta.generated_at) || !day(meta.generated_at.slice(0, 10)) || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(meta.generated_at) || !Number.isFinite(Date.parse(meta.generated_at)) || !id(meta.metric_version) || !count(meta.assignment_count) || !counts(overall)) return false;
  if (!object(quality) || !['selected_assignments', 'analyzable_assignments', 'missing_details', 'invalid_details', 'unscored_questions', 'excluded_questions', 'tagged_questions', 'visual_risk_questions', 'review_questions'].every(k => count(quality[k])) || !rate(quality.tag_coverage_rate) || typeof quality.observation_only !== 'boolean' || !strings(quality.notes)) return false;
  const q = quality as ParentReport['data_quality'];
  if (meta.assignment_count !== q.selected_assignments || q.analyzable_assignments > q.selected_assignments || q.tagged_questions > overall.total || q.visual_risk_questions > overall.total || q.review_questions > overall.total || q.observation_only !== (q.analyzable_assignments < 3) || Math.abs(q.tag_coverage_rate - (overall.total ? q.tagged_questions / overall.total : 0)) > 1e-9) return false;
  if (!list(value.evidence_refs, v => object(v) && id(v.id) && id(v.submission_id) && id(v.item_id) && text(v.question_no) && text(v.reason))) return false;
  const evidence = value.evidence_refs as Obj[];
  if (!unique(evidence, 'id') || new Set(evidence.map(v => JSON.stringify([v.submission_id, v.item_id]))).size !== evidence.length) return false;
  const refs = new Map(evidence.map(v => [v.id, v]));
  const evidenceIDs = (v: unknown, submission?: unknown) => list(v, x => id(x) && refs.has(x) && (submission === undefined || refs.get(x)?.submission_id === submission)) && new Set(v as unknown[]).size === (v as unknown[]).length;
  const conclusion = (v: unknown) => object(v) && id(v.text) && evidenceIDs(v.evidence_ids);
  if (!list(value.assignment_distribution, v => object(v) && counts(v) && id(v.submission_id) && day(v.date) && v.date >= meta.from_date! && v.date <= meta.through_date! && evidenceIDs(v.evidence_ids, v.submission_id)) || !unique(value.assignment_distribution as unknown[], 'submission_id')) return false;
  const distribution = value.assignment_distribution as ParentReport['assignment_distribution'];
  if (!(['total', 'correct', 'incorrect', 'blank', 'uncertain'] as const).every(field => distribution.reduce((sum, row) => sum + row[field], 0) === overall[field])) return false;
  const assignments = new Set((value.assignment_distribution as Obj[]).map(v => v.submission_id));
  if (evidence.some(v => !assignments.has(v.submission_id))) return false;
  const nodes = new Set<string>();
  const knowledge = (v: unknown, level = 0, ancestorTotal = overall.total): boolean => {
    if (level > 2 || !object(v) || !counts(v) || v.total > ancestorTotal || v.total > overall.total || !id(v.id) || nodes.has(v.id) || !id(v.name) || v.level !== ['domain', 'unit', 'slice'][level] || !evidenceIDs(v.evidence_ids)) return false;
    nodes.add(v.id);
    return list(v.children, child => knowledge(child, level + 1, v.total));
  };
  if (!list(value.knowledge_structure, v => knowledge(v))) return false;
  if (!list(value.error_mechanisms, v => object(v) && id(v.id) && id(v.label) && count(v.count) && v.count <= overall.incorrect && strings(v.knowledge_paths) && evidenceIDs(v.evidence_ids)) || !unique(value.error_mechanisms as unknown[], 'id')) return false;
  if (!object(detail) || detail.subject !== meta.subject || !list(detail.sections, v => object(v) && id(v.id) && id(v.title) && count(v.observed) && count(v.total) && v.observed <= v.total && text(v.note) && list(v.rows, row => object(row) && id(row.id) && id(row.label) && count(row.count) && row.count <= (v.total as number) && evidenceIDs(row.evidence_ids)) && unique(v.rows as unknown[], 'id')) || !unique(detail.sections as unknown[], 'id')) return false;
  return object(summary) && list(summary.strengths, conclusion) && list(summary.concerns, conclusion) && strings(summary.limits) && conclusion(value.primary_suggestion);
}

export type ParentReportRouting = { kind: 'legacy' } | { kind: 'unsupported' } | { kind: 'parent'; report: ParentReport };
export function routeParentReport(stats: unknown, params: unknown, subject?: unknown): ParentReportRouting {
  const payload = object(stats) ? stats.parent_report : undefined;
  const marked = object(stats) && Object.prototype.hasOwnProperty.call(stats, 'parent_report');
  const version = object(params) ? params.content_version : undefined;
  if (!marked && (version === undefined || version === '')) return { kind: 'legacy' };
  const expected = subject ?? (object(params) ? params.subject : undefined);
  if (version !== undefined && version !== '' && version !== 'parent_report.v1' || !validateParentReport(payload, expected)) return { kind: 'unsupported' };
  return { kind: 'parent', report: payload };
}
