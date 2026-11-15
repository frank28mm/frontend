// Mock Data Definitions

export const MOCK_CAPABILITIES_RESPONSE = {
    capability_contract_version: 'capabilities_v1',
    subjects: {
        math: { read_enabled: true, submission_enabled: true },
        english: { read_enabled: true, submission_enabled: true },
        physics: { read_enabled: true, submission_enabled: true },
        chemistry: { read_enabled: true, submission_enabled: true },
    },
};

export const MOCK_UPLOAD_RESPONSE = {
    upload_id: 'mock_upload_123',
    page_image_urls: ['/tint-logo.png', '/tint-logo-hd-neu.png'],
    total_pages: 2,
};

export const MOCK_GRADE_RESPONSE = {
    job_id: 'mock_job_abc_123',
};

export const MOCK_ENGLISH_GRADE_RESPONSE = {
    job_id: 'mock_job_english_123',
};

const englishFeedback = {
    question_type: 'reading_choice',
    error_type: 'evidence',
    error_types: ['evidence'],
    accepted_answers: ['A'],
    feedback_mode: 'answer_comparison',
    keywords_used: [],
    semantic_score: null,
    similarity_mode: 'none',
    evidence: ['The passage says the library closes at five.'],
    evidence_refs: [],
    slot_feedback: [],
    rubric_feedback: [],
};

const englishQuestion = {
    item_id: 'p1:q:12(A)',
    question_number: '12(A)',
    page_index: 0,
    subject: 'english',
    display_mode: 'material_group',
    material_group_id: 'group-reading-12',
    group_position: 1,
    answer_mode: 'choice_single',
    question_type: 'reading_choice',
    question_text: 'When does the library close?',
    question_content: 'When does the library close?',
    options: [
        { option_id: 'A', text: 'At five.', evidence_refs: [] },
        { option_id: 'B', text: 'At six.', evidence_refs: [] },
    ],
    student_answer: 'B',
    student_answer_payload: {
        mode: 'choice_single',
        selections: [{ value: 'B', evidence_refs: [] }],
        evidence_refs: [],
    },
    reference_answer_payload: {
        mode: 'choice_single',
        selections: [{ value: 'A', evidence_refs: [] }],
        evidence_refs: [],
    },
    accepted_answer_payloads: [],
    answer_state: 'has_answer',
    verdict: 'incorrect',
    verdict_source: 'model',
    grading_confidence: 0.94,
    reason: 'The answer conflicts with the passage.',
    judgment_basis: ['The passage says the library closes at five.'],
    knowledge_tags: ['Language skills/Reading/Detail'],
    knowledge_tag_items: [{
        tag_id: 'engv1:language-skill:reading-detail',
        taxonomy_version: 'english_universal_v1',
        canonical_path: 'Language skills/Reading/Detail',
        role: 'primary',
    }],
    evidence_refs: [],
    contract_provenance: 'native_v1',
    degradation_reasons: [],
    english_feedback: englishFeedback,
};

const englishCard = {
    item_id: englishQuestion.item_id,
    question_number: englishQuestion.question_number,
    page_index: englishQuestion.page_index,
    answer_state: englishQuestion.answer_state,
    verdict: englishQuestion.verdict,
    question_content: englishQuestion.question_text,
    reason: englishQuestion.reason,
};

const englishMaterialGroup = {
    group_id: 'group-reading-12',
    title: 'Reading 12',
    material_type: 'passage',
    display_order: 1,
    page_indices: [0],
    status: 'complete',
    warnings: [],
    materials: [{
        material_id: 'material-reading-12',
        kind: 'passage',
        display_order: 1,
        text: 'The library opens at nine and closes at five.',
        evidence_refs: [],
    }],
    item_ids: [englishQuestion.item_id],
};

const ENGLISH_COMPLETE_RESULT = {
    submission_id: 'mock_submission_english_complete',
    subject: 'english',
    summary: { total_items: 1, wrong_count: 1, uncertain_count: 0, blank_count: 0 },
    artifact_contract_version: 'learning_artifacts_v1',
    artifact_contract_revision: 1,
    artifact_contract_provenance: 'native_v1',
    artifact_contract_status: 'complete',
    artifact_contract_warnings: [],
    material_groups: [englishMaterialGroup],
    evidence_registry: [],
    presentation_nodes: [{
        node_id: 'node-reading-12',
        kind: 'material_group',
        ref_id: englishMaterialGroup.group_id,
        display_order: 1,
    }],
    questions: [englishQuestion],
    question_cards: [englishCard],
};

const ENGLISH_DEGRADED_RESULT = {
    ...ENGLISH_COMPLETE_RESULT,
    submission_id: 'mock_submission_english_degraded',
    artifact_contract_revision: 2,
    artifact_contract_provenance: 'mixed',
    artifact_contract_status: 'degraded',
    artifact_contract_warnings: ['provider_output_degraded'],
    material_groups: [{
        ...englishMaterialGroup,
        status: 'degraded',
        warnings: ['provider_output_degraded'],
    }],
};

const ENGLISH_LEGACY_RESULT = {
    submission_id: 'mock_submission_english_legacy',
    subject: 'english',
    summary: { total_items: 1, wrong_count: 0, uncertain_count: 1, blank_count: 0 },
    artifact_contract_provenance: 'legacy_fallback',
    artifact_contract_status: 'degraded',
    artifact_contract_warnings: ['legacy_fallback_v1'],
    questions: [{
        item_id: 'p1:q:legacy-1',
        question_number: '1',
        page_index: 0,
        subject: 'english',
        question_text: 'Legacy English question.',
        answer_state: 'unknown',
        verdict: 'uncertain',
        verdict_source: 'legacy',
        contract_provenance: 'legacy_fallback',
    }],
    question_cards: [{
        item_id: 'p1:q:legacy-1',
        question_number: '1',
        page_index: 0,
        verdict: 'uncertain',
        question_content: 'Legacy English question.',
    }],
};

// English progressive job states used only when the mock grade request selects English.
export const MOCK_ENGLISH_JOB_STATES = {
    pending: {
        status: 'pending',
        elapsed_ms: 100,
        total_pages: 2,
        done_pages: 0,
        result: null,
    },
    page1_done: {
        status: 'processing',
        elapsed_ms: 2500,
        total_pages: 2,
        done_pages: 1,
        result: ENGLISH_DEGRADED_RESULT,
    },
    all_done: {
        status: 'done',
        elapsed_ms: 5000,
        total_pages: 2,
        done_pages: 2,
        result: ENGLISH_COMPLETE_RESULT,
    },
    legacy_done: {
        status: 'done',
        elapsed_ms: 4500,
        total_pages: 1,
        done_pages: 1,
        result: ENGLISH_LEGACY_RESULT,
    },
};

export const MOCK_ENGLISH_HISTORY = {
    items: [
        {
            submission_id: 'mock_submission_english_complete',
            profile_id: 'mock_profile_1',
            created_at: '2026-09-01T14:30:00Z',
            subject: 'english',
            total_pages: 2,
            done_pages: 2,
            summary: {
                total_items: 1,
                wrong_count: 1,
                uncertain_count: 0,
                blank_count: 0,
                score_text: '0/1',
            },
        },
        {
            submission_id: 'mock_submission_english_degraded',
            profile_id: 'mock_profile_1',
            created_at: '2026-08-30T09:15:00Z',
            subject: 'english',
            total_pages: 2,
            done_pages: 2,
            summary: {
                total_items: 1,
                wrong_count: 1,
                uncertain_count: 0,
                blank_count: 0,
            },
        },
        {
            submission_id: 'mock_submission_english_legacy',
            profile_id: 'mock_profile_1',
            created_at: '2026-08-28T08:00:00Z',
            subject: 'english',
            total_pages: 1,
            done_pages: 1,
            summary: {
                total_items: 1,
                wrong_count: 0,
                uncertain_count: 1,
                blank_count: 0,
            },
        },
    ],
};

// Preserve the existing Math mock as the default local development flow.
export const MOCK_JOB_STATES = {
    pending: {
        status: 'pending',
        elapsed_ms: 100,
        total_pages: 2,
        done_pages: 0,
        progress: {
            stage: 'queued',
            message: '批改任务已创建，正在准备 2 页作业。',
            done_pages: 0,
            total_pages: 2,
        },
        page_summaries: [
            { page_index: 0, wrong_count: 0, uncertain_count: 0, blank_count: 0, needs_review: false },
            { page_index: 1, wrong_count: 0, uncertain_count: 0, blank_count: 0, needs_review: false },
        ],
        question_cards: [
            {
                item_id: 'q1',
                question_number: '1',
                page_index: 0,
                card_state: 'placeholder',
                question_content: '题目内容加载中...',
            },
            {
                item_id: 'q4',
                question_number: '4',
                page_index: 1,
                card_state: 'placeholder',
                question_content: '题目内容加载中...',
            },
        ],
        result: null,
    },
    page1_done: {
        status: 'processing',
        elapsed_ms: 2500,
        total_pages: 2,
        done_pages: 1,
        progress: {
            stage: 'page_processing',
            message: '已完成 1/2 页，正在继续批改。',
            done_pages: 1,
            total_pages: 2,
            page_index: 0,
        },
        page_summaries: [
            { page_index: 0, wrong_count: 1, uncertain_count: 1, blank_count: 0, needs_review: false },
            { page_index: 1, wrong_count: 0, uncertain_count: 0, blank_count: 0, needs_review: false },
        ],
        question_cards: [
            {
                item_id: 'q1',
                question_number: '1',
                page_index: 0,
                card_state: 'verdict_ready',
                verdict: 'correct',
                question_content: '计算第 1 题。',
            },
            {
                item_id: 'q2',
                question_number: '2',
                page_index: 0,
                card_state: 'verdict_ready',
                verdict: 'incorrect',
                question_content: '计算第 2 题。',
            },
            {
                item_id: 'q3',
                question_number: '3',
                page_index: 0,
                card_state: 'verdict_ready',
                verdict: 'uncertain',
                question_content: '计算第 3 题。',
            },
            {
                item_id: 'q4',
                question_number: '4',
                page_index: 1,
                card_state: 'placeholder',
                question_content: '题目内容加载中...',
            },
        ],
        result: {
            score: 45,
            questions: [
                { item_id: 'q1', page_index: 0, verdict: 'correct', is_correct: true, question_number: '1' },
                { item_id: 'q2', page_index: 0, verdict: 'wrong', is_correct: false, question_number: '2' },
                { item_id: 'q3', page_index: 0, verdict: 'pending', is_correct: false, question_number: '3' },
            ],
        },
    },
    all_done: {
        status: 'done',
        elapsed_ms: 5000,
        total_pages: 2,
        done_pages: 2,
        progress: {
            stage: 'done',
            message: '批改完成。',
            done_pages: 2,
            total_pages: 2,
        },
        page_summaries: [
            { page_index: 0, wrong_count: 1, uncertain_count: 0, blank_count: 0, needs_review: false },
            { page_index: 1, wrong_count: 0, uncertain_count: 0, blank_count: 0, needs_review: false },
        ],
        question_cards: [
            { item_id: 'q1', question_number: '1', page_index: 0, card_state: 'verdict_ready', verdict: 'correct', question_content: '计算第 1 题。' },
            { item_id: 'q2', question_number: '2', page_index: 0, card_state: 'verdict_ready', verdict: 'incorrect', question_content: '计算第 2 题。' },
            { item_id: 'q3', question_number: '3', page_index: 0, card_state: 'verdict_ready', verdict: 'correct', question_content: '计算第 3 题。' },
            { item_id: 'q4', question_number: '4', page_index: 1, card_state: 'verdict_ready', verdict: 'correct', question_content: '计算第 4 题。' },
            { item_id: 'q5', question_number: '5', page_index: 1, card_state: 'verdict_ready', verdict: 'correct', question_content: '计算第 5 题。' },
        ],
        result: {
            score: 85,
            questions: [
                { item_id: 'q1', page_index: 0, verdict: 'correct', is_correct: true, question_number: '1' },
                { item_id: 'q2', page_index: 0, verdict: 'wrong', is_correct: false, question_number: '2' },
                { item_id: 'q3', page_index: 0, verdict: 'correct', is_correct: true, question_number: '3' },
                { item_id: 'q4', page_index: 1, verdict: 'correct', is_correct: true, question_number: '4' },
                { item_id: 'q5', page_index: 1, verdict: 'correct', is_correct: true, question_number: '5' },
            ],
        },
    },
};

export const getMockJobState = (
    subject: 'math' | 'english',
    elapsedMs: number,
) => {
    const states = subject === 'english' ? MOCK_ENGLISH_JOB_STATES : MOCK_JOB_STATES;
    if (elapsedMs > 2000 && elapsedMs < 6000) return states.page1_done;
    if (elapsedMs >= 6000) return states.all_done;
    return states.pending;
};

export const MOCK_HISTORY = {
    items: [
        {
            submission_id: 'sub_001',
            profile_id: 'mock_profile_1',
            created_at: '2023-11-05T14:30:00Z',
            subject: 'math',
            total_pages: 2,
            done_pages: 2,
            summary: {
                total_items: 5,
                wrong_count: 1,
                uncertain_count: 0,
                blank_count: 0,
                score_text: '4/5',
            },
        },
        {
            submission_id: 'sub_002',
            profile_id: 'mock_profile_1',
            created_at: '2023-11-03T09:15:00Z',
            subject: 'math',
            total_pages: 1,
            done_pages: 1,
            summary: {
                total_items: 5,
                wrong_count: 0,
                uncertain_count: 0,
                blank_count: 0,
                score_text: '5/5',
            },
        },
    ],
};

export const getMockSubmissionDetail = (
    subject: 'math' | 'english',
    submissionID: string,
) => {
    const submission_id = String(submissionID || '').trim() || MOCK_UPLOAD_RESPONSE.upload_id;
    const isEnglishHistory = MOCK_ENGLISH_HISTORY.items.some((item) => item.submission_id === submission_id);
    const isMathHistory = MOCK_HISTORY.items.some((item) => item.submission_id === submission_id);
    const resolvedSubject = isEnglishHistory ? 'english' : isMathHistory ? 'math' : subject;
    if (resolvedSubject === 'english') {
        const result = submission_id === ENGLISH_DEGRADED_RESULT.submission_id
            ? ENGLISH_DEGRADED_RESULT
            : submission_id === ENGLISH_LEGACY_RESULT.submission_id
                ? ENGLISH_LEGACY_RESULT
                : ENGLISH_COMPLETE_RESULT;
        return {
            ...result,
            submission_id,
            profile_id: 'mock_profile_1',
            page_image_urls: [...MOCK_UPLOAD_RESPONSE.page_image_urls],
        };
    }
    return {
        submission_id,
        profile_id: 'mock_profile_1',
        subject: 'math',
        page_image_urls: [...MOCK_UPLOAD_RESPONSE.page_image_urls],
        summary: {
            total_items: 5,
            wrong_count: 1,
            uncertain_count: 0,
            blank_count: 0,
            score_text: '4/5',
        },
        ...MOCK_JOB_STATES.all_done.result,
    };
};
