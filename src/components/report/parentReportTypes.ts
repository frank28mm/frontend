import type { CapabilitySubject } from '@/services/types';

export interface ParentCounts {
  total: number; correct: number; incorrect: number; blank: number; uncertain: number;
  accuracy_sample_size: number; accuracy: number | null;
}
export interface ParentEvidence { id: string; submission_id: string; item_id: string; question_no: string; reason: string }
export interface ParentKnowledge extends ParentCounts {
  id: string; name: string; level: 'domain' | 'unit' | 'slice'; evidence_ids: string[]; children: ParentKnowledge[];
}
export interface ParentDimension {
  id: string; title: string; observed: number; total: number; note: string;
  rows: { id: string; label: string; count: number; evidence_ids: string[] }[];
}
export interface ParentConclusion { text: string; evidence_ids: string[] }
export interface ParentReport {
  contract_version: 'parent_report.v1';
  meta: { subject: CapabilitySubject; from_date: string; through_date: string; time_zone: 'Asia/Shanghai'; generated_at: string; metric_version: string; assignment_count: number };
  overall: ParentCounts;
  data_quality: {
    selected_assignments: number; analyzable_assignments: number; missing_details: number; invalid_details: number;
    unscored_questions: number; excluded_questions: number; tagged_questions: number; tag_coverage_rate: number;
    visual_risk_questions: number; review_questions: number; observation_only: boolean; notes: string[];
  };
  assignment_distribution: (ParentCounts & { submission_id: string; date: string; evidence_ids: string[] })[];
  knowledge_structure: ParentKnowledge[];
  error_mechanisms: { id: string; label: string; count: number; knowledge_paths: string[]; evidence_ids: string[] }[];
  subject_detail: { subject: CapabilitySubject; sections: ParentDimension[] };
  evidence_refs: ParentEvidence[];
  parent_summary: { strengths: ParentConclusion[]; concerns: ParentConclusion[]; limits: string[] };
  primary_suggestion: ParentConclusion;
}
