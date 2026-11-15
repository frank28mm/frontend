import path from 'node:path';

import { expect, test } from '@playwright/test';

import { installEnglishApi } from './fixtures/english-learning-artifacts';

const uploadFixture = path.resolve(process.cwd(), 'public/tint-logo-hd-neu.png');

test('keeps the auto subject upload entry independent of the frontend render ceiling', async ({ page }) => {
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

  await installEnglishApi(page, { capabilityEnabled: true });
  await page.goto('/scan');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);
  await page.waitForURL('**/upload');

  await expect(page.getByRole('button', { name: '数学' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '英语' })).toHaveCount(0);
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
