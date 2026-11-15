import { describe, expect, it } from 'vitest';
import { performanceLevelFromSummary } from '@/utils/performanceRating';

describe('performanceLevelFromSummary', () => {
  it.each([
    [{ performance_rate: 90, performance_level: 'A', score_basis: 'item_accuracy' }, 'A'],
    [{ performance_rate: 80, performance_level: 'B', score_basis: 'item_accuracy' }, 'B'],
    [{ performance_rate: 60, performance_level: 'C', score_basis: 'item_accuracy' }, 'C'],
    [{ performance_rate: 59.9, performance_level: 'D', score_basis: 'item_accuracy' }, 'D'],
  ])('prefers the backend level from %o', (summary, expected) => {
    expect(performanceLevelFromSummary(summary)).toBe(expected);
  });

  it.each([
    ['9/10', 'A'],
    ['8/10', 'B'],
    ['6/10', 'C'],
    ['5/10', 'D'],
  ])('uses the agreed thresholds for legacy score %s', (scoreText, expected) => {
    expect(performanceLevelFromSummary({ score_text: scoreText })).toBe(expected);
  });

  it('rejects obsolete or malformed backend levels', () => {
    expect(performanceLevelFromSummary({ performance_level: 'A+', score_text: '9/10' })).toBe('A');
    expect(performanceLevelFromSummary({ performance_level: 'excellent' })).toBeNull();
    expect(performanceLevelFromSummary({ score_text: 'not-a-score' })).toBeNull();
  });
});
