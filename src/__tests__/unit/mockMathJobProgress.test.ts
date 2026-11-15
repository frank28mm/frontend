import { describe, expect, it } from 'vitest';

import { MOCK_JOB_STATES } from '@/services/mockData';

describe('Math mock job progress contract', () => {
  it('exposes data-driven progress artifacts at the top level of every job snapshot', () => {
    expect(MOCK_JOB_STATES.pending).toMatchObject({
      progress: { stage: 'queued', done_pages: 0, total_pages: 2 },
      page_summaries: expect.any(Array),
      question_cards: expect.any(Array),
    });
    expect(MOCK_JOB_STATES.page1_done).toMatchObject({
      progress: { stage: 'page_processing', done_pages: 1, total_pages: 2, page_index: 0 },
      done_pages: 1,
      page_summaries: expect.arrayContaining([
        expect.objectContaining({ page_index: 0 }),
        expect.objectContaining({ page_index: 1 }),
      ]),
      question_cards: expect.arrayContaining([
        expect.objectContaining({ page_index: 0, card_state: 'verdict_ready' }),
        expect.objectContaining({ page_index: 1, card_state: 'placeholder' }),
      ]),
    });
    expect(MOCK_JOB_STATES.all_done).toMatchObject({
      progress: { stage: 'done', done_pages: 2, total_pages: 2 },
      page_summaries: expect.any(Array),
      question_cards: expect.any(Array),
    });
  });
});
