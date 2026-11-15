import type { SubmissionSummary } from '@/services/types';

export type PerformanceLevel = 'A' | 'B' | 'C' | 'D';

type PerformanceSummary = Pick<SubmissionSummary, 'score_text' | 'performance_rate' | 'score_basis'> & {
  performance_level?: string | null;
};

export const performanceLevelFromSummary = (summary?: PerformanceSummary | null): PerformanceLevel | null => {
  const backendLevel = summary?.performance_level?.trim().toUpperCase();
  if (backendLevel === 'A' || backendLevel === 'B' || backendLevel === 'C' || backendLevel === 'D') {
    return backendLevel;
  }

  const scoreText = summary?.score_text;
  if (!scoreText) return null;
  const match = scoreText.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  const correct = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) return null;

  const rate = (correct / total) * 100;
  if (rate >= 90) return 'A';
  if (rate >= 80) return 'B';
  if (rate >= 60) return 'C';
  return 'D';
};
