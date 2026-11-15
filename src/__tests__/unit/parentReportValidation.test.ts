import { describe, expect, it } from 'vitest';
import { routeParentReport, validateParentReport } from '@/components/report/parentReportValidation';
import { parentReportFixture } from '../pages/parentReportFixture';

describe('parent report full contract validation', () => {
  it.each(['math', 'english', 'physics', 'chemistry'])('accepts complete %s payload', subject => {
    expect(validateParentReport(parentReportFixture(subject), subject)).toBe(true);
  });
  it.each([
    ['overall.total', -1], ['overall.correct', Infinity], ['overall.blank', 0.5], ['overall.accuracy', NaN], ['overall.accuracy', 1.1], ['overall.accuracy', null], ['overall.accuracy', 0.75], ['overall.accuracy_sample_size', 3],
    ['data_quality.tag_coverage_rate', -0.1], ['data_quality.tag_coverage_rate', Infinity], ['data_quality.notes', null], ['data_quality.observation_only', 'false'], ['data_quality.review_questions', -1],
    ['meta.from_date', '2026-02-30'], ['meta.through_date', '2026-09-30'], ['meta.generated_at', '2026-02-30T00:00:00Z'], ['meta.time_zone', 'UTC'], ['meta.subject', 'biology'], ['meta.assignment_count', '1'],
    ['knowledge_structure.0.name', null], ['knowledge_structure.0.children.0.level', 'slice'], ['subject_detail.sections.0.rows.0.count', -1], ['subject_detail.sections.0.observed', 4],
    ['assignment_distribution.0.evidence_ids', ['missing']], ['assignment_distribution.0.submission_id', 'unrelated'], ['assignment_distribution.0.date', '2026-11-01'],
    ['parent_summary.strengths.0.evidence_ids', ['unknown']], ['parent_summary.limits', 'none'], ['primary_suggestion.text', ''], ['primary_suggestion.evidence_ids', ['missing']],
    ['evidence_refs.0.item_id', ''], ['evidence_refs.0.submission_id', ''], ['error_mechanisms.0.count', null], ['error_mechanisms.0.knowledge_paths', [3]],
    ['evidence_refs.0.item_id', '\uD800'], ['evidence_refs.0.submission_id', 'bad\u0000id'],
    ['contract_version', 'parent_report.v2'], ['primary_suggestion', undefined],
    ['meta.generated_at', '2026-10-04T24:00:00Z'], ['meta.assignment_count', 2], ['data_quality.analyzable_assignments', 2], ['data_quality.tagged_questions', 4], ['data_quality.visual_risk_questions', 4], ['data_quality.review_questions', 4], ['data_quality.tag_coverage_rate', 0.5], ['data_quality.observation_only', false],
    ['subject_detail.sections.0.rows.0.count', 4], ['error_mechanisms.0.count', 2], ['error_mechanisms.0.label', ''],
  ])('rejects invalid %s = %s', (path, value) => {
    const payload = parentReportFixture();
    const keys = path.split('.');
    let target = payload as unknown as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
    target[keys.at(-1)!] = value;
    expect(validateParentReport(payload, 'math')).toBe(false);
  });
  it('accepts a null accuracy only with zero scored sample', () => {
    const payload = parentReportFixture();
    const zero = { total: 1, correct: 0, incorrect: 0, blank: 0, uncertain: 1, accuracy_sample_size: 0, accuracy: null };
    Object.assign(payload.overall, zero);
    Object.assign(payload.assignment_distribution[0], zero);
    payload.knowledge_structure = [];
    payload.error_mechanisms = [];
    Object.assign(payload.data_quality, { tagged_questions: 1, tag_coverage_rate: 1 });
    expect(validateParentReport(payload)).toBe(true);
  });
  it('rejects duplicate evidence identities and cyclic taxonomy', () => {
    const payload = parentReportFixture();
    payload.evidence_refs.push({ ...payload.evidence_refs[0], id: 'duplicate' });
    expect(validateParentReport(payload)).toBe(false);
    const cyclic = parentReportFixture();
    (cyclic.knowledge_structure[0].children as unknown[]).push(cyclic.knowledge_structure[0]);
    expect(validateParentReport(cyclic)).toBe(false);
  });
  it.each(['total', 'correct', 'incorrect', 'blank', 'uncertain'])('rejects a distribution whose %s does not match overall', field => {
    const payload = parentReportFixture();
    const row = payload.assignment_distribution[0];
    if (field === 'blank') row.blank = 0;
    else if (field === 'correct') Object.assign(row, { correct: 0, uncertain: 2, accuracy_sample_size: 1, accuracy: 0 });
    else if (field === 'incorrect') Object.assign(row, { incorrect: 0, blank: 0, uncertain: 2, accuracy_sample_size: 1, accuracy: 1 });
    else Object.assign(row, { total: 4, uncertain: 2 });
    expect(validateParentReport(payload)).toBe(false);
  });
  it.each(['overall', 'ancestor'])('rejects taxonomy count beyond %s', boundary => {
    const payload = parentReportFixture();
    if (boundary === 'overall') Object.assign(payload.knowledge_structure[0], { total: 4, uncertain: 2 });
    else Object.assign(payload.knowledge_structure[0], { total: 2, uncertain: 0 });
    expect(validateParentReport(payload)).toBe(false);
  });
  it('allows missing assignments outside distribution and overlapping dimension rows', () => {
    const payload = parentReportFixture();
    payload.meta.assignment_count = 2;
    payload.data_quality.selected_assignments = 2;
    payload.data_quality.missing_details = 1;
    const section = payload.subject_detail.sections[0];
    section.rows = [{ ...section.rows[0], count: 3 }, { ...section.rows[0], id: 'overlapping', count: 3 }];
    expect(validateParentReport(payload)).toBe(true);
  });
  it('never falls back for marked but missing/unknown/malformed parent data', () => {
    for (const parent_report of [null, {}, undefined, { contract_version: 'parent_report.v2' }]) expect(routeParentReport({ parent_report }, {}).kind).toBe('unsupported');
    expect(routeParentReport({}, { content_version: 'parent_report.v1' }).kind).toBe('unsupported');
    expect(routeParentReport({}, { content_version: 'future' }).kind).toBe('unsupported');
    expect(routeParentReport({}, {}).kind).toBe('legacy');
    expect(routeParentReport({ parent_report: parentReportFixture() }, { subject: 'english' }).kind).toBe('unsupported');
  });
});
