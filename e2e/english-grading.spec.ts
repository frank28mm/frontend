import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import {
  DECOY_ITEM_ID,
  IMAGE_URLS,
  JOB_ID,
  REPORT_ID,
  SUBMISSION_ID,
  TARGET_ITEM_ID,
  englishSubmissionDetail,
  installEnglishApi,
} from './fixtures/english-learning-artifacts';

const uploadFixture = path.resolve(process.cwd(), 'public/tint-logo-hd-neu.png');
const WRITING_ITEM_ID = 'p1:q:Writing';

const writingSubmissionDetail = () => {
  const detail = englishSubmissionDetail({ includeTargetQuestionImages: false, visualRisk: false });
  const source = detail.questions?.[0];
  const sourceCard = detail.question_cards?.[0];
  if (!source || !sourceCard) throw new Error('English mock fixture is missing a source question');
  const sourceQuestion = { ...source };
  delete sourceQuestion.reference_answer_payload;
  delete sourceQuestion.material_group_id;
  delete sourceQuestion.group_position;
  const writing = {
    ...sourceQuestion,
    item_id: WRITING_ITEM_ID,
    question_number: 'Writing',
    question_type: 'writing' as const,
    answer_mode: 'writing' as const,
    display_mode: 'simple_question' as const,
    question_text: 'Write an email to your friend about the school trip.',
    question_content: 'Write an email to your friend about the school trip.',
    options: [],
    student_answer: 'I am agree. It make me happy. I very like it because the trip was exciting.',
    student_answer_payload: {
      mode: 'writing' as const,
      text: 'I am agree. It make me happy. I very like it because the trip was exciting.',
      evidence_refs: [],
    },
    accepted_answer_payloads: [],
    verdict: 'uncertain' as const,
    reason: '文章存在多处拼写、用词和语法问题。',
    judgment_basis: [],
    evidence_refs: [],
    visual_risk: false,
    english_feedback: {
      ...source.english_feedback,
      question_type: 'writing' as const,
      feedback_mode: 'rubric' as const,
      error_type: 'grammar' as const,
      error_types: ['grammar' as const, 'vocabulary' as const],
      accepted_answers: [],
      evidence: [],
      evidence_refs: [],
      evaluation_status: 'complete' as const,
      overall_assessment: '文章完成了主要任务，结构清楚，但语言准确性仍需提高。',
      explanation: '文章完成了主要任务，结构清楚，但语言准确性仍需提高。',
      strengths: ['覆盖了题目要求的主要信息', '表达了真实感受'],
      representative_corrections: [
        { original: 'I am agree.', corrected: 'I agree.', explanation: 'agree 是动词，不与 am 连用。' },
        { original: 'It make me happy.', corrected: 'It makes me happy.', explanation: '第三人称单数用 makes。' },
        { original: 'I very like it', corrected: 'I like it very much', explanation: '调整副词的位置。' },
      ],
      improved_answer: 'I agree with this idea. It makes me happy, and I like it very much because the trip was exciting.',
      rubric_feedback: [
        { dimension: 'task_completion' as const, judgment: 'meets' as const, feedback: '完成了主要写作任务。', score: null, max_score: null },
        { dimension: 'content' as const, judgment: 'partly_meets' as const, feedback: '信息基本完整，可增加细节。', score: null, max_score: null },
        { dimension: 'organization' as const, judgment: 'meets' as const, feedback: '内容顺序清楚。', score: null, max_score: null },
        { dimension: 'grammar' as const, judgment: 'partly_meets' as const, feedback: '存在主谓一致和句型问题。', score: null, max_score: null },
        { dimension: 'vocabulary' as const, judgment: 'partly_meets' as const, feedback: '表达可理解，但搭配需要改进。', score: null, max_score: null },
      ],
    },
  };
  return {
    ...detail,
    summary: { total_items: 0, wrong_count: 0, uncertain_count: 0, blank_count: 0 },
    material_groups: [],
    evidence_registry: [],
    presentation_nodes: [{ node_id: 'node-writing', kind: 'question' as const, ref_id: WRITING_ITEM_ID, display_order: 1 }],
    questions: [writing],
    question_cards: [{
      ...sourceCard,
      item_id: WRITING_ITEM_ID,
      question_number: 'Writing',
      question_content: writing.question_content,
      answer_state: 'has_answer' as const,
      verdict: 'uncertain' as const,
      visual_risk: false,
    }],
  };
};

const watchRuntimeErrors = (page: Page, allowedConsoleErrors: readonly string[] = []) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.failure()?.errorText || 'failed'} ${request.url()}`);
  });
  return () => {
    const unexpectedConsoleErrors = consoleErrors.filter(
      (message) => !allowedConsoleErrors.some((allowed) => message.includes(allowed)),
    );
    expect(unexpectedConsoleErrors, 'browser console errors').toEqual([]);
    expect(pageErrors, 'uncaught page errors').toEqual([]);
    expect(failedRequests, 'failed browser requests').toEqual([]);
  };
};

const expectNoHorizontalOverflow = async (page: Page) => {
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(layout.document).toBeLessThanOrEqual(layout.viewport);
  expect(layout.body).toBeLessThanOrEqual(layout.viewport);
};

const expectNoVisibleButtonOverlap = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  const overlaps = await page.locator('button:visible').evaluateAll((buttons) => {
    const rows = buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        label: button.getAttribute('aria-label') || button.textContent?.trim() || 'button',
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    });
    const collisions: string[] = [];
    for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
        const left = rows[leftIndex];
        const right = rows[rightIndex];
        if (!left || !right) continue;
        const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left);
        const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
        if (overlapWidth > 1 && overlapHeight > 1) {
          collisions.push(`${left.label} <> ${right.label}`);
        }
      }
    }
    return collisions;
  });
  expect(overlaps, 'visible controls must not overlap').toEqual([]);
};

const openTargetDetail = async (page: Page) => {
  await page.goto(`/question/${encodeURIComponent(TARGET_ITEM_ID)}?submissionId=${SUBMISSION_ID}`);
  await expect(page.getByRole('heading', { name: '题目 12(A)' })).toBeVisible();
  await expect(page.getByText('Which picture matches the library closing time?', { exact: true })).toBeVisible();
};

test.describe('TC-LT-07 English grading browser contract', () => {
  test('renders a complete qualitative writing evaluation without pending or numeric scoring', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    await installEnglishApi(page, { detailProvider: writingSubmissionDetail });

    await page.goto(`/question/${encodeURIComponent(WRITING_ITEM_ID)}?submissionId=${SUBMISSION_ID}`);

    await expect(page.getByRole('heading', { name: '题目 Writing' })).toBeVisible();
    await expect(page.getByText('已评价', { exact: true })).toBeVisible();
    await expect(page.getByText('综合评价')).toBeVisible();
    await expect(page.getByText('写作维度')).toBeVisible();
    await expect(page.getByText('写作优点')).toBeVisible();
    await expect(page.getByText('代表性修改')).toBeVisible();
    await expect(page.getByText('组织与连贯')).toBeVisible();
    await expect(page.getByText('词汇与表达')).toBeVisible();
    await expect(page.getByText('改进后的全文')).toBeVisible();
    await expect(page.getByText(/待定/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /是错题/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /是对题/ })).toHaveCount(0);
    await expect(page.getByText(/(?:达到|部分达到|未达到|待确认)\s*·\s*\d/)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectNoVisibleButtonOverlap(page);
    await test.info().attach('writing-evaluation', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    assertNoRuntimeErrors();
  });

  test('binds material, question, option, and feedback images to the exact owner', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    await installEnglishApi(page);
    await openTargetDetail(page);

    for (const imageURL of [
      IMAGE_URLS.material,
      IMAGE_URLS.question,
      IMAGE_URLS.option,
      IMAGE_URLS.feedback,
    ]) {
      const image = page.locator(`img[src="${imageURL}"]`);
      await expect(image).toBeVisible();
      await expect(image).toHaveCSS('object-fit', 'contain');
    }
    for (const decoyURL of [
      IMAGE_URLS.materialDecoy,
      IMAGE_URLS.questionDecoy,
      IMAGE_URLS.optionDecoy,
      IMAGE_URLS.feedbackDecoy,
      IMAGE_URLS.legacyDecoy,
      IMAGE_URLS.questionWrongOwner,
      IMAGE_URLS.questionWrongRole,
      IMAGE_URLS.optionWrongOwner,
      IMAGE_URLS.optionWrongRole,
      IMAGE_URLS.materialWrongOwner,
      IMAGE_URLS.materialWrongRole,
      IMAGE_URLS.feedbackWrongOwner,
      IMAGE_URLS.feedbackWrongRole,
    ]) {
      await expect(page.locator(`img[src="${decoyURL}"]`)).toHaveCount(0);
    }
    await expect(page.getByTestId('material-text')).toHaveText(
      'The library opens at nine and closes at five.',
    );
    await expect(page.getByText('Neighboring item decoy.')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectNoVisibleButtonOverlap(page);
    assertNoRuntimeErrors();
  });

  test('renders option-only evidence without borrowing a question image', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    await installEnglishApi(page, {
      detailProvider: () => englishSubmissionDetail({
        includeTargetQuestionEvidence: false,
        includeTargetOptionEvidence: true,
      }),
    });
    await openTargetDetail(page);

    await expect(page.locator(`img[src="${IMAGE_URLS.option}"]`)).toBeVisible();
    await expect(page.locator(`img[src="${IMAGE_URLS.question}"]`)).toHaveCount(0);
    await expect(page.locator(`img[src="${IMAGE_URLS.questionWrongRole}"]`)).toHaveCount(0);
    await expect(page.locator(`img[src="${IMAGE_URLS.optionWrongRole}"]`)).toHaveCount(0);
    await expect(page.getByRole('button', { name: '生成图示切片' })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('does not fall back to a same-number sibling when the stable item ID is missing', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    const api = await installEnglishApi(page);
    const missingItemID = 'p9:q:12(A)';

    await page.goto(`/question/${encodeURIComponent(missingItemID)}?submissionId=${SUBMISSION_ID}`);
    await expect.poll(() => api.detailCalls()).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: `题目 ${missingItemID}` })).toBeVisible();
    await expect(page.getByText('暂无题干')).toBeVisible();
    await expect(page.getByText('Neighboring item decoy.')).toHaveCount(0);
    for (const imageURL of Object.values(IMAGE_URLS)) {
      await expect(page.locator(`img[src="${imageURL}"]`)).toHaveCount(0);
    }
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  for (const brokenCase of [
    {
      label: 'question',
      brokenURL: IMAGE_URLS.question,
      decoyURL: IMAGE_URLS.questionDecoy,
      retainedURLs: [IMAGE_URLS.option, IMAGE_URLS.material, IMAGE_URLS.feedback],
    },
    {
      label: 'option',
      brokenURL: IMAGE_URLS.option,
      decoyURL: IMAGE_URLS.optionDecoy,
      retainedURLs: [IMAGE_URLS.question, IMAGE_URLS.material, IMAGE_URLS.feedback],
    },
    {
      label: 'material',
      brokenURL: IMAGE_URLS.material,
      decoyURL: IMAGE_URLS.materialDecoy,
      retainedURLs: [IMAGE_URLS.question, IMAGE_URLS.option, IMAGE_URLS.feedback],
    },
    {
      label: 'feedback',
      brokenURL: IMAGE_URLS.feedback,
      decoyURL: IMAGE_URLS.feedbackDecoy,
      retainedURLs: [IMAGE_URLS.question, IMAGE_URLS.option, IMAGE_URLS.material],
    },
  ]) {
    test(`degrades a broken ${brokenCase.label} image without borrowing its neighbor`, async ({ page }) => {
      const assertNoRuntimeErrors = watchRuntimeErrors(page);
      await installEnglishApi(page, { brokenImageURL: brokenCase.brokenURL });
      await openTargetDetail(page);

      await expect(page.locator(`img[src="${brokenCase.brokenURL}"]`)).toHaveCount(0);
      await expect(page.getByText('图片证据暂不可用')).toBeVisible();
      for (const retainedURL of brokenCase.retainedURLs) {
        await expect(page.locator(`img[src="${retainedURL}"]`)).toBeVisible();
      }
      await expect(page.locator(`img[src="${brokenCase.decoyURL}"]`)).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      assertNoRuntimeErrors();
    });
  }

  test('shows the Math qindex pending and missing-slice controls for English visual items', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    let detail = englishSubmissionDetail({
      includeTargetQuestionImages: false,
      qindexPending: true,
    });
    await installEnglishApi(page, { detailProvider: () => detail });
    await openTargetDetail(page);

    await expect(page.getByText('该题被识别为带图题，图示切片生成中…')).toBeVisible();
    await expect(page.getByRole('button', { name: '生成图示切片' })).toHaveCount(0);

    detail = englishSubmissionDetail({
      includeTargetQuestionImages: false,
      qindexPending: false,
    });
    await page.reload();
    await expect(page.getByRole('button', { name: '生成图示切片' })).toBeVisible();
    await expect(page.getByRole('button', { name: '刷新' })).toBeVisible();

    detail = englishSubmissionDetail({ includeTargetQuestionImages: true });
    await page.getByRole('button', { name: '刷新' }).click();
    await expect(page.locator(`img[src="${IMAGE_URLS.question}"]`)).toBeVisible();
    await expect(page.getByRole('button', { name: '生成图示切片' })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('degrades a broken qindex slice and keeps rebuild controls available', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    await installEnglishApi(page, {
      brokenImageURL: IMAGE_URLS.qindexBroken,
      detailProvider: () => englishSubmissionDetail({
        includeTargetQuestionImages: false,
        targetFigureSliceURL: IMAGE_URLS.qindexBroken,
      }),
    });
    await openTargetDetail(page);

    await expect(page.locator(`img[src="${IMAGE_URLS.qindexBroken}"]`)).toHaveCount(0);
    await expect(page.getByText('图示切片暂不可用，请刷新或重新生成。')).toBeVisible();
    await expect(page.getByRole('button', { name: '生成图示切片' })).toBeVisible();
    await expect(page.getByRole('button', { name: '刷新' })).toBeVisible();
    await expect(page.locator(`img[src="${IMAGE_URLS.legacyDecoy}"]`)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('recovers a repaired qindex slice when rebuild keeps the same URL', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    const api = await installEnglishApi(page, {
      brokenImagePredicate: (pathname, rebuildRequested) =>
        pathname === IMAGE_URLS.qindexBroken && !rebuildRequested,
      detailProvider: () => englishSubmissionDetail({
        includeTargetQuestionImages: false,
        targetFigureSliceURL: IMAGE_URLS.qindexBroken,
      }),
    });
    await openTargetDetail(page);

    await expect(page.getByText('图示切片暂不可用，请刷新或重新生成。')).toBeVisible();
    await page.getByRole('button', { name: '生成图示切片' }).click();
    await expect(page.locator(`img[data-source-url="${IMAGE_URLS.qindexBroken}"]`)).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText('已生成图示切片')).toBeVisible({ timeout: 12_000 });
    expect(api.rebuildRequested()).toBe(true);
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('reloads a cached qindex image when rebuild keeps the same URL', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    const api = await installEnglishApi(page, {
      brokenImagePredicate: (pathname, rebuildRequested) =>
        pathname === IMAGE_URLS.qindexBroken && !rebuildRequested,
      requireCacheReloadForURL: IMAGE_URLS.qindexBroken,
      detailProvider: () => englishSubmissionDetail({
        includeTargetQuestionImages: false,
        targetFigureSliceURL: IMAGE_URLS.qindexBroken,
      }),
    });
    await openTargetDetail(page);

    await expect(page.getByText('图示切片暂不可用，请刷新或重新生成。')).toBeVisible();
    await page.getByRole('button', { name: '生成图示切片' }).click();

    await expect(page.locator(`img[data-source-url="${IMAGE_URLS.qindexBroken}"]`)).toBeVisible({ timeout: 12_000 });
    expect(api.imageRequestsFor(IMAGE_URLS.qindexBroken)).toBeGreaterThanOrEqual(2);
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('keeps qindex polling paced while a rebuilt slice stays pending', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    const api = await installEnglishApi(page, {
      detailProvider: (_call, rebuildRequested) => englishSubmissionDetail({
        includeTargetQuestionImages: false,
        qindexPending: rebuildRequested,
      }),
    });
    await openTargetDetail(page);
    const callsBeforeRebuild = api.detailCalls();

    await page.getByRole('button', { name: '生成图示切片' }).click();
    await page.waitForTimeout(900);

    expect(api.detailCalls() - callsBeforeRebuild).toBeLessThanOrEqual(1);
    await expect(page.getByText('该题被识别为带图题，图示切片生成中…')).toBeVisible();
    await expect(page.getByRole('button', { name: '生成中…' })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('offers qindex recovery when every canonical question image is broken', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    await installEnglishApi(page, {
      brokenImageURL: IMAGE_URLS.question,
      detailProvider: () => englishSubmissionDetail({
        includeTargetQuestionEvidence: true,
        includeTargetOptionEvidence: false,
      }),
    });
    await openTargetDetail(page);

    await expect(page.getByText('图片证据暂不可用')).toBeVisible();
    await expect(page.getByRole('button', { name: '生成图示切片' })).toBeVisible();
    await expect(page.getByRole('button', { name: '刷新' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('offers qindex recovery from exact evidence even when visual risk is omitted', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    await installEnglishApi(page, {
      brokenImageURL: IMAGE_URLS.question,
      detailProvider: () => englishSubmissionDetail({
        includeTargetQuestionEvidence: true,
        includeTargetOptionEvidence: false,
        visualRisk: false,
      }),
    });
    await openTargetDetail(page);

    await expect(page.getByText('图片证据暂不可用')).toBeVisible();
    await expect(page.getByRole('button', { name: '生成图示切片' })).toBeVisible();
    await expect(page.getByRole('button', { name: '刷新' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('recovers a repaired canonical image when rebuild keeps its evidence URL', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    const api = await installEnglishApi(page, {
      brokenImagePredicate: (pathname, rebuildRequested) =>
        pathname === IMAGE_URLS.question && !rebuildRequested,
      detailProvider: () => englishSubmissionDetail({
        includeTargetQuestionEvidence: true,
        includeTargetOptionEvidence: false,
      }),
    });
    await openTargetDetail(page);

    await expect(page.getByText('图片证据暂不可用')).toBeVisible();
    await page.getByRole('button', { name: '生成图示切片' }).click();
    await expect(page.locator(`img[data-source-url="${IMAGE_URLS.question}"]`)).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText('已生成图示切片')).toBeVisible({ timeout: 12_000 });
    expect(api.rebuildRequested()).toBe(true);
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('polls qindex by exact item and stops when owned canonical evidence appears', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    const api = await installEnglishApi(page, {
      detailProvider: (call, rebuildRequested) => {
        if (!rebuildRequested || call <= 2) {
          return englishSubmissionDetail({
            includeTargetQuestionImages: false,
            qindexPending: rebuildRequested,
            decoyFigureSliceURL: IMAGE_URLS.legacyDecoy,
          });
        }
        return englishSubmissionDetail({ includeTargetQuestionImages: true, qindexPending: false });
      },
    });
    await openTargetDetail(page);

    await page.getByRole('button', { name: '生成图示切片' }).click();
    await expect(page.getByText('已开始生成图示切片（可先返回，稍后再看）。')).toBeVisible();
    await expect(page.locator(`img[data-source-url="${IMAGE_URLS.question}"]`)).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText('已生成图示切片')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByRole('button', { name: '生成中…' })).toHaveCount(0);
    await expect(page.locator(`img[src="${IMAGE_URLS.legacyDecoy}"]`)).toHaveCount(0);
    expect(api.rebuildRequested()).toBe(true);
    expect(api.detailCalls()).toBeGreaterThanOrEqual(3);
    const rebuild = api.requests.find((request) => request.path.endsWith('/qindex/rebuild'));
    expect(rebuild?.body).toEqual({ question_numbers: ['12(A)'] });
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('does not show a missing-slice control after owned canonical image success', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    await installEnglishApi(page, {
      detailProvider: () => englishSubmissionDetail({ includeTargetQuestionImages: true }),
    });
    await openTargetDetail(page);

    await expect(page.locator(`img[src="${IMAGE_URLS.question}"]`)).toBeVisible();
    await expect(page.getByText('该题被识别为带图题，但未获取到图示切片。')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '生成图示切片' })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('uses the auto subject entry when English capability is off', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    const api = await installEnglishApi(page, { capabilityEnabled: false });
    await page.goto('/scan');
    await page.locator('input[type="file"]').setInputFiles(uploadFixture);
    await page.waitForURL('**/upload');

    await expect(page.getByRole('button', { name: '数学' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '英语' })).toHaveCount(0);
    expect(api.requests.filter((request) => request.path === '/capabilities')).toHaveLength(0);
    await page.getByRole('button', { name: '开始批改' }).click();
    await expect(page).toHaveURL(/\/result-summary\?/, { timeout: 12_000 });
    const gradeRequest = api.requests.find((request) => request.path === '/grade');
    expect(gradeRequest?.body).toEqual({ upload_id: SUBMISSION_ID, subject: 'auto' });
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('retains the upload after auto-detected English returns a stable 403', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page, ['status of 403 (Forbidden)']);
    const api = await installEnglishApi(page, { capabilityEnabled: true, gradeForbidden: true });
    await page.goto('/scan');
    await page.locator('input[type="file"]').setInputFiles(uploadFixture);
    await page.waitForURL('**/upload');
    await page.getByRole('button', { name: '开始批改' }).click();

    await expect(page.getByText('英语批改当前未对该账号开放，图片已保留，请稍后重试')).toBeVisible();
    await expect(page).toHaveURL(/\/upload$/);
    await expect(page.getByRole('img', { name: '作业预览' })).toBeVisible();
    const gradeRequest = api.requests.find((request) => request.path === '/grade');
    expect(gradeRequest?.body).toEqual({ upload_id: SUBMISSION_ID, subject: 'auto' });
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('retries a transient upload failure without losing the image or auto subject', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page, ['status of 503']);
    const api = await installEnglishApi(page, {
      capabilityEnabled: true,
      uploadFailuresBeforeSuccess: 1,
    });
    await page.goto('/scan');
    await page.locator('input[type="file"]').setInputFiles(uploadFixture);
    await page.waitForURL('**/upload');

    await page.getByRole('button', { name: '开始批改' }).click();
    await expect(page.getByText('上传失败：temporary upload failure')).toBeVisible();
    await expect(page.getByRole('img', { name: '作业预览' })).toBeVisible();
    await expect(page.getByRole('button', { name: '数学' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '英语' })).toHaveCount(0);

    await page.getByRole('button', { name: '开始批改' }).click();
    await expect(page).toHaveURL(/\/result-summary\?/, { timeout: 12_000 });
    await expect(page.getByRole('heading', { name: 'Reading 12' })).toBeVisible();
    expect(api.uploadAttempts()).toBe(2);
    const gradeRequests = api.requests.filter((request) => request.path === '/grade');
    expect(gradeRequests).toHaveLength(1);
    expect(gradeRequests[0]?.body).toEqual({ upload_id: SUBMISSION_ID, subject: 'auto' });
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('keeps material-group result order while navigating duplicate visible question numbers', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    await installEnglishApi(page);
    await page.goto(`/result-summary?jobId=${JOB_ID}&submissionId=${SUBMISSION_ID}`);

    await expect(page.getByRole('heading', { name: 'Reading 12' })).toBeVisible();
    await expect(page.getByText('2 小题')).toBeVisible();
    await page.getByRole('button', { name: '查看题组' }).click();
    await expect.poll(() => decodeURIComponent(new URL(page.url()).pathname))
      .toBe(`/question/${DECOY_ITEM_ID}`);
    await expect(page.getByText('Neighboring item decoy.', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '下一题' }).click();
    await expect.poll(() => decodeURIComponent(new URL(page.url()).pathname))
      .toBe(`/question/${TARGET_ITEM_ID}`);
    await expect(page.getByText('Which picture matches the library closing time?', { exact: true })).toBeVisible();
    await expect(page.locator(`img[src="${IMAGE_URLS.question}"]`)).toBeVisible();
    await expect(page.locator(`img[src="${IMAGE_URLS.questionDecoy}"]`)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('excludes the exact English mistake identity', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    const api = await installEnglishApi(page);
    await openTargetDetail(page);

    await page.getByRole('button', { name: '错题排除' }).click();
    await expect.poll(() => api.requests.filter((request) => request.path === '/mistakes/exclusions').length)
      .toBe(1);
    const exclusion = api.requests.find((request) => request.path === '/mistakes/exclusions');
    expect(exclusion?.body).toEqual({
      submission_id: SUBMISSION_ID,
      item_id: TARGET_ITEM_ID,
      reason: '已掌握',
    });
    expect(JSON.stringify(exclusion?.body)).not.toContain(DECOY_ITEM_ID);
    await expect.poll(() => decodeURIComponent(new URL(page.url()).pathname))
      .toBe(`/question/${DECOY_ITEM_ID}`);
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('renders English report dimensions without math-only guidance', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    await installEnglishApi(page);
    await page.goto(`/report/${REPORT_ID}`);

    const stats = page.getByTestId('english-report-stats');
    await expect(stats).toBeVisible();
    await expect(stats.getByText('英语结构与题型')).toBeVisible();
    await expect(stats.getByText('阅读选择')).toBeVisible();
    await expect(stats.getByText('单选')).toBeVisible();
    await expect(stats.getByText('证据定位')).toBeVisible();
    await expect(stats.getByText('原生结构')).toBeVisible();
    await expect(stats.getByText('语言技能/阅读/细节理解')).toBeVisible();
    await expect(stats.getByText('题目 2', { exact: true })).toBeVisible();
    await expect(stats.getByText('材料题组 1', { exact: true })).toBeVisible();
    await expect(stats.getByText('待定 0 题未计入正确率', { exact: true })).toBeVisible();
    await expect(page.getByText(/关键公式|等式|计算稳健/)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectNoVisibleButtonOverlap(page);
    assertNoRuntimeErrors();
  });

  test('Shizhi Tutor keeps a page-local conversation and starts fresh after reload', async ({ page }, testInfo) => {
    const api = await installEnglishApi(page);
    await page.addInitScript(() => {
      localStorage.setItem('chat_session_old', 'old-session');
      localStorage.setItem('chat_history_old', 'old-body');
    });
    await page.goto(`/ai-tutor/${encodeURIComponent(TARGET_ITEM_ID)}?submissionId=${SUBMISSION_ID}`);
    await expect(page.getByPlaceholder('问问是知...')).toBeVisible();
    await expect(page.getByText('是知', { exact: true })).toBeVisible();
    expect(api.requests.filter((request) => request.path === '/chat')).toHaveLength(0);
    await page.screenshot({ path: testInfo.outputPath('shizhi-entry.png') });
    await page.getByPlaceholder('问问是知...').fill('Why is B wrong?');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByText('Use the evidence in the passage.')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoVisibleButtonOverlap(page);
    await page.screenshot({ path: testInfo.outputPath('shizhi-reply.png') });
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /^chat_(history|session)_/.test(key))))
      .toEqual(expect.arrayContaining(['chat_session_old', 'chat_history_old']));
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /^chat_(history|session)_/.test(key)).length)).toBe(2);
    await page.reload();
    await expect(page.getByPlaceholder('问问是知...')).toBeVisible();
    await expect(page.getByText('Use the evidence in the passage.')).toHaveCount(0);
    expect(api.requests.filter((request) => request.path === '/chat')).toHaveLength(1);
  });

  test('sends exact English identity to Tutor and renders the owned focus image', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    const api = await installEnglishApi(page);
    await page.goto(`/ai-tutor/${encodeURIComponent(TARGET_ITEM_ID)}?submissionId=${SUBMISSION_ID}`);
    await expect(page.getByTestId('english-question-text')).toContainText(
      'Which picture matches the library closing time?',
    );
    await page.getByPlaceholder('问问是知...').fill('Why is B wrong?');
    await page.getByText('send').locator('..').click();

    await expect(page.getByText('Use the evidence in the passage.')).toBeVisible();
    await expect(page.locator(`img[src="${IMAGE_URLS.question}"]`)).toBeVisible();
    const chat = api.requests.find((request) => request.path === '/chat');
    expect(chat?.body).toMatchObject({
      subject: 'english',
      submission_id: SUBMISSION_ID,
      context_item_ids: [TARGET_ITEM_ID],
    });
    expect(JSON.stringify(chat?.body)).not.toContain(DECOY_ITEM_ID);
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('rejects mismatched Tutor context and decoy focus for a legacy English item', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    const legacyDetail = englishSubmissionDetail({ includeTargetQuestionImages: false });
    const legacyRecord = legacyDetail as unknown as Record<string, unknown>;
    delete legacyRecord.artifact_contract_version;
    delete legacyRecord.artifact_contract_revision;
    delete legacyRecord.presentation_nodes;
    const api = await installEnglishApi(page, {
      detailProvider: () => legacyDetail,
      chatPayload: {
        session_id: 'e2e-chat-mismatch',
        messages: [
          { role: 'user', content: 'Why is B wrong?' },
          { role: 'assistant', content: 'Mismatched context must not provide the picture.' },
        ],
        focus_image_urls: [IMAGE_URLS.questionDecoy],
        focus_image_source: 'learning_evidence',
        focus_review_context: {
          learning_context: {
            contract_version: 'learning_artifacts_v1',
            item_id: DECOY_ITEM_ID,
            material_group_id: 'group-reading-12',
            evidence_ids: ['evidence-question-decoy'],
            context_status: 'complete',
          },
        },
      },
    });

    await page.goto(`/ai-tutor/${encodeURIComponent(TARGET_ITEM_ID)}?submissionId=${SUBMISSION_ID}`);
    await page.getByPlaceholder('问问是知...').fill('Why is B wrong?');
    await page.getByText('send').locator('..').click();
    await expect(page.getByText('Mismatched context must not provide the picture.')).toBeVisible();
    await expect(page.getByText('学习上下文已同步')).toHaveCount(0);
    await expect(page.locator(`img[src="${IMAGE_URLS.questionDecoy}"]`)).toHaveCount(0);
    expect(api.requests.some((request) => request.path === '/chat')).toBe(true);
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('rejects a Tutor decoy URL even when the context item ID matches', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    const legacyDetail = englishSubmissionDetail({
      includeTargetQuestionEvidence: true,
      includeTargetOptionEvidence: false,
    });
    const legacyRecord = legacyDetail as unknown as Record<string, unknown>;
    delete legacyRecord.artifact_contract_version;
    delete legacyRecord.artifact_contract_revision;
    delete legacyRecord.presentation_nodes;
    await installEnglishApi(page, {
      detailProvider: () => legacyDetail,
      chatPayload: {
        session_id: 'e2e-chat-decoy-url',
        messages: [
          { role: 'user', content: 'Show the exact picture.' },
          { role: 'assistant', content: 'The response URL must match its evidence identity.' },
        ],
        focus_image_urls: [IMAGE_URLS.questionDecoy],
        focus_image_source: 'learning_evidence',
        focus_review_context: {
          learning_context: {
            contract_version: 'learning_artifacts_v1',
            item_id: TARGET_ITEM_ID,
            material_group_id: 'group-reading-12',
            evidence_ids: ['evidence-question-target'],
            context_status: 'complete',
          },
        },
      },
    });

    await page.goto(`/ai-tutor/${encodeURIComponent(TARGET_ITEM_ID)}?submissionId=${SUBMISSION_ID}`);
    await page.getByPlaceholder('问问是知...').fill('Show the exact picture.');
    await page.getByText('send').locator('..').click();
    await expect(page.getByText('The response URL must match its evidence identity.')).toBeVisible();
    await expect(page.locator(`img[src="${IMAGE_URLS.questionDecoy}"]`)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });

  test('accepts exact Tutor evidence for a legacy English item', async ({ page }) => {
    const assertNoRuntimeErrors = watchRuntimeErrors(page);
    const legacyDetail = englishSubmissionDetail({
      includeTargetQuestionEvidence: true,
      includeTargetOptionEvidence: false,
    });
    const legacyRecord = legacyDetail as unknown as Record<string, unknown>;
    delete legacyRecord.artifact_contract_version;
    delete legacyRecord.artifact_contract_revision;
    delete legacyRecord.presentation_nodes;
    await installEnglishApi(page, { detailProvider: () => legacyDetail });

    await page.goto(`/ai-tutor/${encodeURIComponent(TARGET_ITEM_ID)}?submissionId=${SUBMISSION_ID}`);
    await page.getByPlaceholder('问问是知...').fill('Why is B wrong?');
    await page.getByText('send').locator('..').click();
    await expect(page.getByText('Use the evidence in the passage.')).toBeVisible();
    await expect(page.locator(`img[src="${IMAGE_URLS.question}"]`)).toBeVisible();
    await expect(page.getByText('学习上下文已同步')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    assertNoRuntimeErrors();
  });
});
