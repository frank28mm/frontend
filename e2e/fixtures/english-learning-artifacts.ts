import type { Page } from '@playwright/test';

import { getMockSubmissionDetail } from '../../src/services/mockData';
import type {
  EvidenceOwnerType,
  EvidenceRecord,
  EvidenceRole,
  LearningQuestion,
  QuestionCard,
  SubmissionDetail,
  TutorChatEventPayload,
} from '../../src/services/types';

export const TARGET_ITEM_ID = 'p1:q:12(A)';
export const DECOY_ITEM_ID = 'p1:q:12(B)';
export const SUBMISSION_ID = 'e2e-english-submission';
export const JOB_ID = 'e2e-english-job';
export const REPORT_ID = 'e2e-english-report';

export const IMAGE_URLS = {
  material: '/e2e/material-target.png',
  materialDecoy: '/e2e/material-decoy.png',
  question: '/e2e/question-target.png',
  questionDecoy: '/e2e/question-decoy.png',
  option: '/e2e/option-target.png',
  optionDecoy: '/e2e/option-decoy.png',
  feedback: '/e2e/feedback-target.png',
  feedbackDecoy: '/e2e/feedback-decoy.png',
  legacyDecoy: '/e2e/legacy-decoy.png',
  questionWrongOwner: '/e2e/question-wrong-owner.png',
  questionWrongRole: '/e2e/question-wrong-role.png',
  optionWrongOwner: '/e2e/option-wrong-owner.png',
  optionWrongRole: '/e2e/option-wrong-role.png',
  materialWrongOwner: '/e2e/material-wrong-owner.png',
  materialWrongRole: '/e2e/material-wrong-role.png',
  feedbackWrongOwner: '/e2e/feedback-wrong-owner.png',
  feedbackWrongRole: '/e2e/feedback-wrong-role.png',
  qindexBroken: '/e2e/qindex-broken.png',
} as const;

const HASH = `sha256:${'0'.repeat(64)}`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAftFz9QAAAAASUVORK5CYII=',
  'base64',
);

const bboxEvidence = ({
  evidenceID,
  ownerType,
  ownerID,
  role,
  imageURL,
}: {
  evidenceID: string;
  ownerType: EvidenceOwnerType;
  ownerID: string;
  role: EvidenceRole;
  imageURL: string;
}): EvidenceRecord => ({
  evidence_id: evidenceID,
  owner_type: ownerType,
  owner_id: ownerID,
  role,
  kind: 'bbox',
  canonicalization_version: 'evidence_v1',
  page_index: 0,
  storage_ref: `fixtures/${evidenceID}.png`,
  bbox: { x: 0.1, y: 0.1, width: 0.8, height: 0.2, unit: 'normalized' },
  image_url: imageURL,
  content_hash: HASH,
});

export interface EnglishDetailOptions {
  includeTargetQuestionImages?: boolean;
  includeTargetQuestionEvidence?: boolean;
  includeTargetOptionEvidence?: boolean;
  qindexPending?: boolean;
  targetFigureSliceURL?: string;
  decoyFigureSliceURL?: string;
  visualRisk?: boolean;
}

export const englishSubmissionDetail = ({
  includeTargetQuestionImages = true,
  qindexPending = false,
  targetFigureSliceURL = '',
  decoyFigureSliceURL = '',
  includeTargetQuestionEvidence,
  includeTargetOptionEvidence,
  visualRisk = true,
}: EnglishDetailOptions = {}): SubmissionDetail => {
  const base = structuredClone(
    getMockSubmissionDetail('english', 'mock_submission_english_complete'),
  ) as unknown as SubmissionDetail;
  const baseQuestion = structuredClone(base.questions?.[0] || {}) as unknown as LearningQuestion;
  const baseGroup = structuredClone(base.material_groups?.[0]);
  if (!baseGroup) throw new Error('English mock fixture is missing its material group');
  const materialID = baseGroup.materials[0]?.material_id || 'material-reading-12';
  const includeQuestionEvidence = includeTargetQuestionEvidence ?? includeTargetQuestionImages;
  const includeOptionEvidence = includeTargetOptionEvidence ?? includeTargetQuestionImages;

  const targetOptions = baseQuestion.options.map((option, index) => ({
    ...option,
    evidence_refs: index === 0
      ? [
          ...(includeOptionEvidence ? ['evidence-option-target'] : []),
          'evidence-option-wrong-owner',
          'evidence-option-wrong-role',
        ]
      : [],
  }));
  const target = {
    ...baseQuestion,
    item_id: TARGET_ITEM_ID,
    question_number: '12(A)',
    group_position: 2,
    question_text: 'Which picture matches the library closing time?',
    question_content: 'Which picture matches the library closing time?',
    options: targetOptions,
    evidence_refs: [
      ...(includeQuestionEvidence ? ['evidence-question-target'] : []),
      'evidence-question-wrong-owner',
      'evidence-question-wrong-role',
    ],
    visual_risk: visualRisk,
    ...(targetFigureSliceURL ? { figure_slice_image_url: targetFigureSliceURL } : {}),
    english_feedback: {
      ...baseQuestion.english_feedback,
      evidence_refs: [
        'evidence-feedback-target',
        'evidence-feedback-wrong-owner',
        'evidence-feedback-wrong-role',
      ],
      evidence: ['The passage says the library closes at five.'],
    },
  } as LearningQuestion & Record<string, unknown>;

  const decoy = {
    ...structuredClone(target),
    item_id: DECOY_ITEM_ID,
    question_number: '12(A)',
    group_position: 1,
    question_text: 'Neighboring item decoy.',
    question_content: 'Neighboring item decoy.',
    evidence_refs: ['evidence-question-decoy'],
    ...(decoyFigureSliceURL ? { figure_slice_image_url: decoyFigureSliceURL } : {}),
    options: targetOptions.map((option, index) => ({
      ...option,
      evidence_refs: index === 0 ? ['evidence-option-decoy'] : [],
    })),
    english_feedback: {
      ...baseQuestion.english_feedback,
      evidence_refs: ['evidence-feedback-decoy'],
      evidence: ['Neighboring feedback decoy.'],
    },
  } as LearningQuestion & Record<string, unknown>;

  const evidenceRegistry: EvidenceRecord[] = [
    bboxEvidence({
      evidenceID: 'evidence-material-target',
      ownerType: 'material',
      ownerID: materialID,
      role: 'material',
      imageURL: IMAGE_URLS.material,
    }),
    bboxEvidence({
      evidenceID: 'evidence-material-decoy',
      ownerType: 'material',
      ownerID: materialID,
      role: 'material',
      imageURL: IMAGE_URLS.materialDecoy,
    }),
    bboxEvidence({
      evidenceID: 'evidence-question-target',
      ownerType: 'question',
      ownerID: TARGET_ITEM_ID,
      role: 'question',
      imageURL: IMAGE_URLS.question,
    }),
    bboxEvidence({
      evidenceID: 'evidence-question-decoy',
      ownerType: 'question',
      ownerID: DECOY_ITEM_ID,
      role: 'question',
      imageURL: IMAGE_URLS.questionDecoy,
    }),
    bboxEvidence({
      evidenceID: 'evidence-option-target',
      ownerType: 'question',
      ownerID: TARGET_ITEM_ID,
      role: 'options',
      imageURL: IMAGE_URLS.option,
    }),
    bboxEvidence({
      evidenceID: 'evidence-option-decoy',
      ownerType: 'question',
      ownerID: DECOY_ITEM_ID,
      role: 'options',
      imageURL: IMAGE_URLS.optionDecoy,
    }),
    bboxEvidence({
      evidenceID: 'evidence-feedback-target',
      ownerType: 'feedback',
      ownerID: TARGET_ITEM_ID,
      role: 'grading_basis',
      imageURL: IMAGE_URLS.feedback,
    }),
    bboxEvidence({
      evidenceID: 'evidence-feedback-decoy',
      ownerType: 'feedback',
      ownerID: DECOY_ITEM_ID,
      role: 'grading_basis',
      imageURL: IMAGE_URLS.feedbackDecoy,
    }),
    bboxEvidence({
      evidenceID: 'evidence-question-wrong-owner',
      ownerType: 'question',
      ownerID: DECOY_ITEM_ID,
      role: 'question',
      imageURL: IMAGE_URLS.questionWrongOwner,
    }),
    bboxEvidence({
      evidenceID: 'evidence-question-wrong-role',
      ownerType: 'question',
      ownerID: TARGET_ITEM_ID,
      role: 'options',
      imageURL: IMAGE_URLS.questionWrongRole,
    }),
    bboxEvidence({
      evidenceID: 'evidence-option-wrong-owner',
      ownerType: 'question',
      ownerID: DECOY_ITEM_ID,
      role: 'options',
      imageURL: IMAGE_URLS.optionWrongOwner,
    }),
    bboxEvidence({
      evidenceID: 'evidence-option-wrong-role',
      ownerType: 'question',
      ownerID: TARGET_ITEM_ID,
      role: 'question',
      imageURL: IMAGE_URLS.optionWrongRole,
    }),
    bboxEvidence({
      evidenceID: 'evidence-material-wrong-owner',
      ownerType: 'question',
      ownerID: TARGET_ITEM_ID,
      role: 'material',
      imageURL: IMAGE_URLS.materialWrongOwner,
    }),
    bboxEvidence({
      evidenceID: 'evidence-material-wrong-role',
      ownerType: 'material',
      ownerID: materialID,
      role: 'question',
      imageURL: IMAGE_URLS.materialWrongRole,
    }),
    bboxEvidence({
      evidenceID: 'evidence-feedback-wrong-owner',
      ownerType: 'feedback',
      ownerID: DECOY_ITEM_ID,
      role: 'grading_basis',
      imageURL: IMAGE_URLS.feedbackWrongOwner,
    }),
    bboxEvidence({
      evidenceID: 'evidence-feedback-wrong-role',
      ownerType: 'feedback',
      ownerID: TARGET_ITEM_ID,
      role: 'question',
      imageURL: IMAGE_URLS.feedbackWrongRole,
    }),
  ];

  const cards: QuestionCard[] = [decoy, target].map((question) => ({
    item_id: question.item_id,
    question_number: question.question_number,
    page_index: question.page_index,
    answer_state: question.answer_state,
    verdict: question.verdict,
    question_content: question.question_text,
    visual_risk: visualRisk,
    card_state: qindexPending ? 'review_pending' : 'review_ready',
    ...(question.figure_slice_image_url
      ? { figure_slice_image_url: String(question.figure_slice_image_url) }
      : {}),
  }));

  return {
    ...base,
    submission_id: SUBMISSION_ID,
    subject: 'english',
    total_pages: 1,
    done_pages: 1,
    qindex_pending: qindexPending,
    summary: { total_items: 2, wrong_count: 2, uncertain_count: 0, blank_count: 0 },
    material_groups: [{
      ...baseGroup,
      materials: baseGroup.materials.map((material, index) => ({
        ...material,
        evidence_refs: index === 0
          ? [
              'evidence-material-target',
              'evidence-material-wrong-owner',
              'evidence-material-wrong-role',
            ]
          : [],
      })),
      item_ids: [DECOY_ITEM_ID, TARGET_ITEM_ID],
    }],
    evidence_registry: evidenceRegistry,
    presentation_nodes: [{
      node_id: 'node-reading-12',
      kind: 'material_group',
      ref_id: baseGroup.group_id,
      display_order: 1,
    }],
    questions: [decoy, target],
    question_cards: cards,
  };
};

export interface ApiRequestRecord {
  method: string;
  path: string;
  body: unknown;
}

export interface EnglishApiOptions {
  capabilityEnabled?: boolean;
  gradeForbidden?: boolean;
  uploadFailuresBeforeSuccess?: number;
  brokenImageURL?: string;
  brokenImagePredicate?: (pathname: string, rebuildRequested: boolean) => boolean;
  requireCacheReloadForURL?: string;
  detailProvider?: (call: number, rebuildRequested: boolean) => SubmissionDetail;
  chatPayload?: TutorChatEventPayload;
}

export interface EnglishApiController {
  requests: ApiRequestRecord[];
  detailCalls: () => number;
  rebuildRequested: () => boolean;
  uploadAttempts: () => number;
  imageRequestsFor: (pathname: string) => number;
}

const requestBody = (request: { postDataJSON: () => unknown; postData: () => string | null }): unknown => {
  try {
    return request.postDataJSON();
  } catch {
    return request.postData();
  }
};

export const installEnglishApi = async (
  page: Page,
  options: EnglishApiOptions = {},
): Promise<EnglishApiController> => {
  const requests: ApiRequestRecord[] = [];
  let detailCalls = 0;
  let rebuildRequested = false;
  let uploadAttempts = 0;
  const imageRequestCounts = new Map<string, number>();
  const cacheReloadedImageURLs = new Set<string>();
  const excludedItemIDs = new Set<string>();
  const detailProvider = options.detailProvider || (() => englishSubmissionDetail());
  const currentDetail = (call: number): SubmissionDetail => {
    const detail = structuredClone(detailProvider(call, rebuildRequested));
    detail.question_cards = detail.question_cards?.map((card) =>
      excludedItemIDs.has(card.item_id) ? { ...card, excluded_from_mistakes: true } : card,
    );
    return detail;
  };

  // Report and tutor routes are authenticated in the product. Keep the fixture
  // aligned with that contract so browser tests exercise the page instead of
  // stopping at the login gate.
  await page.addInitScript(() => {
    localStorage.setItem('user_id', 'e2e-user');
    localStorage.setItem('access_token', 'e2e-token');
  });

  await page.route('https://fonts.googleapis.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  await page.route('https://fonts.gstatic.com/**', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/e2e/*.png', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    imageRequestCounts.set(pathname, (imageRequestCounts.get(pathname) || 0) + 1);
    if (
      pathname === options.requireCacheReloadForURL &&
      rebuildRequested &&
      route.request().resourceType() === 'fetch'
    ) {
      cacheReloadedImageURLs.add(pathname);
    }
    const missingRequiredReload =
      pathname === options.requireCacheReloadForURL &&
      rebuildRequested &&
      !cacheReloadedImageURLs.has(pathname);
    const isBroken = missingRequiredReload || (options.brokenImagePredicate
      ? options.brokenImagePredicate(pathname, rebuildRequested)
      : pathname === options.brokenImageURL);
    if (isBroken) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'Cache-Control': 'public, max-age=3600' },
        body: Buffer.from('invalid-image'),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'Cache-Control': 'public, max-age=3600' },
      body: PNG,
    });
  });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '') || '/';
    const method = request.method();
    const body = requestBody(request);
    requests.push({ method, path, body });

    if (path === '/capabilities' && method === 'GET') {
      await route.fulfill({
        json: {
          capability_contract_version: 'capabilities_v1',
          subjects: {
            math: { read_enabled: true, submission_enabled: true },
            english: { read_enabled: true, submission_enabled: options.capabilityEnabled !== false },
          },
        },
      });
      return;
    }
    if (path === '/me/profiles' && method === 'GET') {
      await route.fulfill({
        json: {
          profiles: [{ profile_id: 'e2e-profile', display_name: 'E2E Child', is_default: true }],
        },
      });
      return;
    }
    if (path === '/uploads' && method === 'POST') {
      uploadAttempts += 1;
      if (uploadAttempts <= (options.uploadFailuresBeforeSuccess || 0)) {
        await route.fulfill({ status: 503, json: { detail: 'temporary upload failure' } });
        return;
      }
      await route.fulfill({
        json: { upload_id: SUBMISSION_ID, page_image_urls: [IMAGE_URLS.material], total_pages: 1 },
      });
      return;
    }
    if (path === '/grade' && method === 'POST') {
      if (options.gradeForbidden) {
        await route.fulfill({
          status: 403,
          json: { detail: 'ENGLISH_GRADING_NOT_ALLOWLISTED' },
        });
        return;
      }
      await route.fulfill({ json: { job_id: JOB_ID } });
      return;
    }
    if (path === `/jobs/${JOB_ID}` && method === 'GET') {
      const detail = currentDetail(detailCalls);
      await route.fulfill({
        json: {
          job_id: JOB_ID,
          status: 'done',
          request: { upload_id: SUBMISSION_ID, subject: 'english' },
          total_pages: 1,
          done_pages: 1,
          question_cards: detail.question_cards,
          result: detail,
        },
      });
      return;
    }
    if (path === `/submissions/${SUBMISSION_ID}` && method === 'GET') {
      detailCalls += 1;
      await route.fulfill({ json: currentDetail(detailCalls) });
      return;
    }
    if (path === `/submissions/${SUBMISSION_ID}/qindex/rebuild` && method === 'POST') {
      rebuildRequested = true;
      await route.fulfill({ status: 202, json: { accepted: true } });
      return;
    }
    if (path === '/mistakes/exclusions' && method === 'POST') {
      const itemID =
        body && typeof body === 'object' && 'item_id' in body
          ? String((body as { item_id?: unknown }).item_id || '').trim()
          : '';
      if (itemID) excludedItemIDs.add(itemID);
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (path === '/chat' && method === 'POST') {
      const payload: TutorChatEventPayload = options.chatPayload || {
        session_id: 'e2e-chat-session',
        messages: [
          { role: 'user', content: 'Why is B wrong?' },
          { role: 'assistant', content: 'Use the evidence in the passage.' },
        ],
        focus_image_urls: [IMAGE_URLS.question],
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
      };
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `event: chat\ndata: ${JSON.stringify(payload)}\n\nevent: done\ndata: {}\n\n`,
      });
      return;
    }
    if (path === `/reports/${REPORT_ID}` && method === 'GET') {
      await route.fulfill({
        json: {
          report_id: REPORT_ID,
          title: '英语近30天学情报告',
          params: { subject: 'english', window_days: 30 },
          exclusions_snapshot: { key_takeaway: 'Focus on evidence and grammar.' },
          stats: {
            overall: { accuracy: 0.5, sample_size: 2, correct: 1, incorrect: 1, uncertain: 0 },
            knowledge_mastery: {
              rows: [{ tag: '语言技能/阅读/细节理解', wrong_count: 1 }],
            },
            english: {
              contract_coverage: { native_v1: 2 },
              by_question_type: { reading_choice: 2 },
              by_answer_mode: { choice_single: 2 },
              by_error_type: { evidence: 1 },
              by_knowledge_tag: {
                'english_universal_v1|engv1:language-skill:reading-detail': {
                  taxonomy_version: 'english_universal_v1',
                  canonical_path: '语言技能/阅读/细节理解',
                  item_count: 2,
                  incorrect: 1,
                },
              },
              item_count: 2,
              material_group_count: 1,
              blank_count: 0,
              accuracy: {
                rate: 0.5,
                sample_size: 2,
                correct: 1,
                incorrect: 1,
                excluded_uncertain: 0,
              },
            },
          },
        },
      });
      return;
    }

    await route.fulfill({ status: 404, json: { detail: `Unhandled E2E route: ${method} ${path}` } });
  });

  return {
    requests,
    detailCalls: () => detailCalls,
    rebuildRequested: () => rebuildRequested,
    uploadAttempts: () => uploadAttempts,
    imageRequestsFor: (pathname: string) => imageRequestCounts.get(pathname) || 0,
  };
};
