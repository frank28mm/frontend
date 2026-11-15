import type { Page } from '@playwright/test';

export const MATH_SUBMISSION_ID = 'e2e-math-submission';
export const MATH_ITEM_ID = 'p1:q:9';
export const MATH_FIGURE_URL = '/tint-logo-hd-neu.png';
export const MATH_JOB_ID = 'e2e-math-live-job';

interface MathRequestRecord {
  method: string;
  path: string;
  body: unknown;
}

const requestBody = (request: { postDataJSON: () => unknown; postData: () => string | null }): unknown => {
  try {
    return request.postDataJSON();
  } catch {
    return request.postData();
  }
};

const mathCapabilities = {
  capability_contract_version: 'capabilities_v1',
  subjects: {
    math: { read_enabled: true, submission_enabled: true },
    english: { read_enabled: true, submission_enabled: true },
    physics: { read_enabled: true, submission_enabled: true },
    chemistry: { read_enabled: true, submission_enabled: true },
  },
};

const mathSubmissionDetail = (includeFigure: boolean) => ({
  submission_id: MATH_SUBMISSION_ID,
  profile_id: 'e2e-profile',
  subject: 'math',
  total_pages: 1,
  done_pages: 1,
  qindex_pending: false,
  summary: { total_items: 1, wrong_count: 1, uncertain_count: 0, blank_count: 0 },
  question_cards: [{
    item_id: MATH_ITEM_ID,
    question_number: '9',
    page_index: 0,
    verdict: 'incorrect',
    question_content: '已知 x + 2 = 5，求 x。',
    visual_risk: true,
    ...(includeFigure ? { figure_slice_image_url: MATH_FIGURE_URL } : {}),
  }],
  questions: [{
    item_id: MATH_ITEM_ID,
    question_number: '9',
    page_index: 0,
    verdict: 'incorrect',
    question_text: '已知 $x + 2 = 5$，求 $x$。',
    student_answer: '$x = 2$',
    reason: '移项后应为 $x = 3$。',
    judgment_basis: ['$x + 2 = 5$', '$x = 3$'],
    visual_risk: true,
    ...(includeFigure ? { figure_slice_image_url: MATH_FIGURE_URL } : {}),
  }],
});

export const installMathApi = async (page: Page) => {
  const requests: MathRequestRecord[] = [];
  let rebuildRequested = false;

  await page.route('https://fonts.googleapis.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  await page.route('https://fonts.gstatic.com/**', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '') || '/';
    const method = request.method();
    const body = requestBody(request);
    requests.push({ method, path, body });

    if (path === '/capabilities' && method === 'GET') {
      await route.fulfill({ json: mathCapabilities });
      return;
    }
    if (path === `/submissions/${MATH_SUBMISSION_ID}` && method === 'GET') {
      await route.fulfill({ json: mathSubmissionDetail(rebuildRequested) });
      return;
    }
    if (path === `/submissions/${MATH_SUBMISSION_ID}/qindex/rebuild` && method === 'POST') {
      rebuildRequested = true;
      await route.fulfill({ status: 202, json: { accepted: true } });
      return;
    }

    await route.fulfill({ status: 404, json: { detail: `Unhandled E2E route: ${method} ${path}` } });
  });

  return { requests, rebuildRequested: () => rebuildRequested };
};

export const installMathLiveProgressApi = async (page: Page) => {
  let jobCalls = 0;
  let firstJobCallAt = 0;

  await page.route('https://fonts.googleapis.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  await page.route('https://fonts.gstatic.com/**', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '') || '/';
    if (path === '/capabilities' && request.method() === 'GET') {
      await route.fulfill({ json: mathCapabilities });
      return;
    }
    if (path !== `/jobs/${MATH_JOB_ID}` || request.method() !== 'GET') {
      await route.fulfill({ status: 404, json: { detail: `Unhandled E2E route: ${request.method()} ${path}` } });
      return;
    }

    jobCalls += 1;
    if (!firstJobCallAt) firstJobCallAt = Date.now();
    const pageOneDone = Date.now() - firstJobCallAt >= 1_000;
    await route.fulfill({
      json: {
        job_id: MATH_JOB_ID,
        status: 'processing',
        request: { upload_id: MATH_SUBMISSION_ID, subject: 'math' },
        progress: pageOneDone
          ? {
              stage: 'page_processing',
              message: '正在批改第 2 页',
              done_pages: 1,
              total_pages: 2,
              page_index: 0,
            }
          : {
              stage: 'queued',
              message: '批改任务已创建，正在准备 2 页作业。',
              done_pages: 0,
              total_pages: 2,
            },
        total_pages: 2,
        done_pages: pageOneDone ? 1 : 0,
        page_summaries: [
          {
            page_index: 0,
            wrong_count: pageOneDone ? 1 : 0,
            uncertain_count: 0,
            blank_count: 0,
          },
          { page_index: 1, wrong_count: 0, uncertain_count: 0, blank_count: 0 },
        ],
        question_cards: pageOneDone
          ? [
              {
                item_id: MATH_ITEM_ID,
                question_number: '9',
                page_index: 0,
                card_state: 'verdict_ready',
                verdict: 'incorrect',
                question_content: '已知 x + 2 = 5，求 x。',
              },
              {
                item_id: 'p2:q:10',
                question_number: '10',
                page_index: 1,
                card_state: 'placeholder',
                question_content: '如图，求角 A。',
              },
            ]
          : [{
              item_id: MATH_ITEM_ID,
              question_number: '9',
              page_index: 0,
              card_state: 'placeholder',
              question_content: '已知 x + 2 = 5，求 x。',
            }],
      },
    });
  });

  return { jobCalls: () => jobCalls };
};
