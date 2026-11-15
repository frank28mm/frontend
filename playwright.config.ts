import { defineConfig } from '@playwright/test';

const port = 4176;
const featureOffPort = 4177;

const serverCommand = (serverPort: number, renderEnabled: boolean) => [
  'VITE_API_BASE_URL=/api/v1',
  'VITE_USE_MOCK=false',
  'VITE_DEV_USER_ID=e2e-user',
  `VITE_FEATURE_ENGLISH_RENDER_ENABLED=${renderEnabled}`,
  `VITE_FEATURE_ENGLISH_SUBMISSION_ENABLED=${renderEnabled}`,
  'npm run dev -- --host 127.0.0.1',
  `--port ${serverPort}`,
].join(' ');

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/playwright',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'line',
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    permissions: ['camera'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  projects: [
    {
      name: 'mobile-320',
      testMatch: /(english-grading|math-regression)\.spec\.ts/,
      use: { viewport: { width: 320, height: 568 } },
    },
    {
      name: 'mobile-390',
      testMatch: /(english-grading|math-regression)\.spec\.ts/,
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop',
      testMatch: /(english-grading|math-regression)\.spec\.ts/,
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'feature-off-mobile-320',
      testMatch: /english-feature-off\.spec\.ts/,
      use: {
        baseURL: `http://127.0.0.1:${featureOffPort}`,
        viewport: { width: 320, height: 568 },
      },
    },
    {
      name: 'feature-off-mobile-390',
      testMatch: /english-feature-off\.spec\.ts/,
      use: {
        baseURL: `http://127.0.0.1:${featureOffPort}`,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'feature-off-desktop',
      testMatch: /english-feature-off\.spec\.ts/,
      use: {
        baseURL: `http://127.0.0.1:${featureOffPort}`,
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: [
    {
      command: serverCommand(port, true),
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: serverCommand(featureOffPort, false),
      url: `http://127.0.0.1:${featureOffPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
