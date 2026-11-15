import { expect, test } from '@playwright/test';

import {
  MATH_FIGURE_URL,
  MATH_ITEM_ID,
  MATH_JOB_ID,
  MATH_SUBMISSION_ID,
  installMathApi,
  installMathLiveProgressApi,
} from './fixtures/math-learning-artifacts';

test('updates Math placeholder cards only when the polled job snapshot advances', async ({ page }) => {
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

  const api = await installMathLiveProgressApi(page);
  await page.goto(`/result?jobId=${MATH_JOB_ID}&submissionId=${MATH_SUBMISSION_ID}`);

  await expect(page.getByTestId('live-grading-progress')).toContainText('等待开始批改');
  await expect(page.getByTestId('live-grading-progress')).toContainText('批改任务已创建');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByTestId(`live-card-${MATH_ITEM_ID}`)).toHaveAttribute('data-flip-state', 'placeholder');
  await expect(page.getByTestId(`live-card-${MATH_ITEM_ID}`)).toContainText('识别中');
  await expect(page.getByTestId('live-page-1')).toContainText('题目加载中...');

  await expect(page.getByTestId('live-grading-progress')).toContainText('正在批改第 2 页', { timeout: 6_000 });
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByTestId(`live-card-${MATH_ITEM_ID}`)).toHaveAttribute('data-flip-state', 'complete');
  await expect(page.getByTestId(`live-card-${MATH_ITEM_ID}`)).toContainText('错误');
  await expect(page.getByTestId('live-page-1')).toContainText('处理中');
  await expect(page.getByTestId('live-page-1')).not.toContainText('已完成');
  expect(api.jobCalls()).toBeGreaterThanOrEqual(2);

  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(layout.document).toBeLessThanOrEqual(layout.viewport);
  expect(layout.body).toBeLessThanOrEqual(layout.viewport);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('keeps the existing Math detail and qindex rebuild flow working', async ({ page }) => {
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

  const api = await installMathApi(page);
  await page.goto(`/question/${encodeURIComponent(MATH_ITEM_ID)}?submissionId=${MATH_SUBMISSION_ID}`);

  await expect(page.getByRole('heading', { name: '题目 9' })).toBeVisible();
  await expect(page.getByText('原题内容')).toBeVisible();
  await expect(page.getByText('判题分析')).toBeVisible();
  await expect(page.locator('main')).toContainText('已知');
  await expect(page.locator('main')).toContainText('求');
  await page.getByRole('button', { name: '生成图示切片' }).click();
  await expect(page.locator(`img[src="${MATH_FIGURE_URL}"]`)).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText('已生成图示切片')).toBeVisible({ timeout: 12_000 });

  expect(api.rebuildRequested()).toBe(true);
  const rebuild = api.requests.find((request) => request.path.endsWith('/qindex/rebuild'));
  expect(rebuild?.body).toEqual({ question_numbers: ['9'] });
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(layout.document).toBeLessThanOrEqual(layout.viewport);
  expect(layout.body).toBeLessThanOrEqual(layout.viewport);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
