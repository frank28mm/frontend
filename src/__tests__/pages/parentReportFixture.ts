export const parentReportFixture = (subject = 'math') => {
  const counts = { total: 3, correct: 1, incorrect: 1, blank: 1, uncertain: 1, accuracy_sample_size: 2, accuracy: 0.5 };
  const evidence = ['e1'];
  return {
    contract_version: 'parent_report.v1',
    meta: { subject, from_date: '2026-10-01', through_date: '2026-10-03', time_zone: 'Asia/Shanghai', generated_at: '2026-10-04T00:00:00Z', metric_version: 'v1', assignment_count: 1 },
    overall: { ...counts },
    data_quality: { selected_assignments: 1, analyzable_assignments: 1, missing_details: 0, invalid_details: 0, unscored_questions: 0, excluded_questions: 1, tagged_questions: 3, tag_coverage_rate: 1, visual_risk_questions: 1, review_questions: 1, observation_only: true, notes: ['样本有限'] },
    assignment_distribution: [{ ...counts, submission_id: 'sub/?%#', date: '2026-10-02', evidence_ids: evidence }],
    knowledge_structure: [{ ...counts, id: 'domain', name: '知识领域', level: 'domain', evidence_ids: evidence, children: [{ ...counts, id: 'unit', name: '单元知识', level: 'unit', evidence_ids: evidence, children: [{ ...counts, id: 'slice', name: '细分知识', level: 'slice', evidence_ids: evidence, children: [] }] }] }],
    error_mechanisms: [{ id: 'concept', label: '概念理解', count: 1, knowledge_paths: ['知识领域 / 单元知识'], evidence_ids: evidence }],
    subject_detail: { subject, sections: [{ id: 'observed', title: '已存储的学科观察', observed: 1, total: 3, note: '只使用已有批改事实', rows: [{ id: 'feedback', label: 'Writing: I think $x=2$; H_2O', count: 1, evidence_ids: evidence }] }] },
    evidence_refs: [{ id: 'e1', submission_id: 'sub/?%#', item_id: 'item/%?#', question_no: '2', reason: '概念观察依据' }],
    parent_summary: { strengths: [{ text: '已有稳定表现', evidence_ids: evidence }], concerns: [{ text: '概念值得关注', evidence_ids: evidence }], limits: ['不作跨期比较'] },
    primary_suggestion: { text: '可以一起看看这道原题。', evidence_ids: evidence },
  };
};
