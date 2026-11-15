import { parentReportFixture } from '../pages/parentReportFixture';

export const savedPlanFixture = (subject = 'math', version = 2) => ({
  plan_id: 'plan_1', version, profile_id: 'child-b', subject,
  from_date: '2026-10-01', through_date: '2026-10-03', goal: '期中考试复习',
  captured_at: '2026-10-04T00:00:00Z', created_at: '2026-10-04T00:00:00Z',
  content: {
    contract_version: 'revision_plan.v1', title: '复习方案', overview: '基于所选作业',
    priorities: [{ topic: '概念', observation: '所选题目存在错误', suggestion: '可以回顾相关概念', evidence_ids: ['e1'] }],
    suggestions: ['可以结合自己的进度安排'], limitations: ['仅代表所选作业'],
  },
  provenance: { model: 'fixture-model', prompt_version: 'revision_plan.advisory.v1' },
  facts: parentReportFixture(subject),
});
