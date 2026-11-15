export type JobStatus = 'queued' | 'pending' | 'processing' | 'running' | 'done' | 'failed';
export type CardState = 'placeholder' | 'verdict_ready' | 'review_pending' | 'review_ready' | 'review_failed';
export type Verdict = 'correct' | 'incorrect' | 'uncertain';
export type AnswerState = 'blank' | 'has_answer' | 'unknown';

export type LearningArtifactsContractVersion = 'learning_artifacts_v1';
export type QuestionType =
    | 'phonetics_spelling'
    | 'vocabulary_word_form'
    | 'grammar_usage'
    | 'sentence_transform'
    | 'cloze_banked'
    | 'cloze_open'
    | 'reading_choice'
    | 'reading_true_false'
    | 'reading_matching'
    | 'reading_summary'
    | 'translation'
    | 'short_answer'
    | 'writing'
    | 'unknown';
export type AnswerMode =
    | 'choice_single'
    | 'choice_multiple'
    | 'true_false'
    | 'matching'
    | 'fill_text'
    | 'fill_from_bank'
    | 'sentence_transform'
    | 'translation'
    | 'short_answer'
    | 'writing'
    | 'unknown';
export type DisplayMode = 'simple_question' | 'material_group';
export type SimilarityMode = 'normal' | 'strict' | 'rubric' | 'none';
export type FeedbackMode = 'answer_comparison' | 'rubric' | 'feedback_only';
export type EnglishErrorType =
    | 'missing_answer'
    | 'recognition_uncertain'
    | 'spelling'
    | 'word_form'
    | 'vocabulary'
    | 'grammar'
    | 'meaning'
    | 'evidence'
    | 'task_fulfillment'
    | 'coherence'
    | 'expression'
    | 'format'
    | 'other'
    | 'unknown';
export type MaterialKind =
    | 'passage'
    | 'dialogue'
    | 'instructions'
    | 'word_bank'
    | 'table'
    | 'diagram'
    | 'image'
    | 'mixed'
    | 'unknown';
export type MaterialStatus = 'complete' | 'degraded';
export type EvidenceOwnerType = 'material' | 'question' | 'answer' | 'feedback';
export type EvidenceRole =
    | 'material'
    | 'instructions'
    | 'question'
    | 'options'
    | 'student_answer'
    | 'reference_answer'
    | 'grading_basis';
export type EvidenceKind = 'page' | 'bbox' | 'text_span' | 'answer_fragment';
export type ArtifactContractProvenance = 'native_v1' | 'mixed' | 'legacy_fallback';
export type ArtifactContractStatus = 'complete' | 'degraded' | 'invalid';
export type VerdictSource = 'model' | 'review' | 'manual' | 'legacy';
export type PresentationKind = 'question' | 'material_group';
export type KnowledgeTagRole = 'primary' | 'secondary';
export type RubricDimension =
    | 'task_completion'
    | 'content'
    | 'organization'
    | 'grammar'
    | 'vocabulary'
    | 'expression';
export type RubricJudgment = 'meets' | 'partly_meets' | 'does_not_meet' | 'uncertain';
export type WritingEvaluationStatus = 'complete' | 'failed';
export type ArtifactWarningCode =
    | 'legacy_fallback_v1'
    | 'unknown_contract_version'
    | 'provider_output_degraded'
    | 'invalid_enum'
    | 'duplicate_item_id'
    | 'duplicate_group_id'
    | 'orphan_group_item_ref'
    | 'orphan_evidence_ref'
    | 'cross_owner_evidence_ref'
    | 'missing_material'
    | 'partial_cross_page_group'
    | 'invalid_evidence_locator'
    | 'answer_payload_mismatch'
    | 'question_feedback_type_mismatch'
    | 'knowledge_tag_missing'
    | 'presentation_node_missing'
    | 'presentation_order_invalid';

export interface AnswerSelection {
    value: string;
    evidence_refs?: string[];
}

export interface AnswerMapping {
    left_id: string;
    right_id: string;
    evidence_refs?: string[];
}

export interface AnswerSlot {
    slot_id: string;
    value: string;
    evidence_refs?: string[];
}

interface AnswerPayloadBase {
    evidence_refs?: string[];
}

export type ChoiceSingleAnswerPayload = AnswerPayloadBase & {
    mode: 'choice_single';
    selections: AnswerSelection[];
    mappings?: never;
    slots?: never;
    text?: never;
};

export type ChoiceMultipleAnswerPayload = AnswerPayloadBase & {
    mode: 'choice_multiple';
    selections: AnswerSelection[];
    mappings?: never;
    slots?: never;
    text?: never;
};

export type TrueFalseAnswerPayload = AnswerPayloadBase & {
    mode: 'true_false';
    selections: AnswerSelection[];
    mappings?: never;
    slots?: never;
    text?: never;
};

export type MatchingAnswerPayload = AnswerPayloadBase & {
    mode: 'matching';
    selections?: never;
    mappings: AnswerMapping[];
    slots?: never;
    text?: never;
};

export type FillTextAnswerPayload = AnswerPayloadBase & {
    mode: 'fill_text';
    selections?: never;
    mappings?: never;
    slots: AnswerSlot[];
    text?: never;
};

export type FillFromBankAnswerPayload = AnswerPayloadBase & {
    mode: 'fill_from_bank';
    selections?: never;
    mappings?: never;
    slots: AnswerSlot[];
    text?: never;
};

export type TextAnswerPayload<Mode extends 'sentence_transform' | 'translation' | 'short_answer' | 'writing'> =
    AnswerPayloadBase & {
        mode: Mode;
        selections?: never;
        mappings?: never;
        slots?: never;
        text: string;
    };

export type UnknownAnswerPayload = AnswerPayloadBase & {
    mode: 'unknown';
    selections?: never;
    mappings?: never;
    slots?: never;
    text?: string;
};

export type AnswerPayload =
    | ChoiceSingleAnswerPayload
    | ChoiceMultipleAnswerPayload
    | TrueFalseAnswerPayload
    | MatchingAnswerPayload
    | FillTextAnswerPayload
    | FillFromBankAnswerPayload
    | TextAnswerPayload<'sentence_transform'>
    | TextAnswerPayload<'translation'>
    | TextAnswerPayload<'short_answer'>
    | TextAnswerPayload<'writing'>
    | UnknownAnswerPayload;

export interface EnglishKnowledgeTagItem {
    tag_id: string;
    taxonomy_version: string;
    canonical_path: string;
    role: KnowledgeTagRole;
}

export interface EnglishSlotFeedback {
    slot_id: string;
    verdict: Verdict;
    reference_answer?: string;
    accepted_answers: string[];
    error_types: EnglishErrorType[];
    explanation?: string;
    evidence_refs: string[];
}

export interface EnglishRubricFeedback {
    dimension: RubricDimension;
    judgment: RubricJudgment;
    feedback: string;
    score: number | null;
    max_score: number | null;
    evidence_refs?: string[];
}

export interface EnglishWritingCorrection {
    original: string;
    corrected: string;
    explanation: string;
}

export interface EnglishFeedback {
    question_type: QuestionType;
    error_type?: EnglishErrorType;
    error_types: EnglishErrorType[];
    reference_answer?: string;
    accepted_answers: string[];
    improved_answer?: string;
    student_issue?: string;
    explanation?: string;
    feedback_mode: FeedbackMode;
    keywords_used: string[];
    semantic_score: number | null;
    similarity_mode: SimilarityMode;
    evidence: string[];
    evidence_refs: string[];
    slot_feedback: EnglishSlotFeedback[];
    rubric_feedback: EnglishRubricFeedback[];
    evaluation_status?: WritingEvaluationStatus;
    overall_assessment?: string;
    strengths?: string[];
    representative_corrections?: EnglishWritingCorrection[];
}

export interface LearningQuestionOption {
    option_id: string;
    text?: string;
    evidence_refs: string[];
}

export type LearningSubject = 'english' | 'physics' | 'chemistry';

interface LearningQuestionBase {
    item_id: string;
    question_number: string;
    page_index: number;
    subject: LearningSubject;
    relation_type?: string;
    question_type: string;
    question_text: string;
    question_content?: string;
    options: LearningQuestionOption[];
    student_answer?: string;
    answer_state: AnswerState;
    verdict: Verdict;
    verdict_source: VerdictSource;
    grading_confidence?: number | null;
    reason?: string;
    judgment_basis: string[];
    knowledge_tags: string[];
    knowledge_tag_items: Array<EnglishKnowledgeTagItem | KnowledgeTagItem>;
    evidence_refs: string[];
    contract_provenance: ArtifactContractProvenance;
    degradation_reasons: string[];
    english_feedback?: EnglishFeedback;
}

type LearningQuestionAnswerFields = {
    [Mode in AnswerMode]: {
        answer_mode: Mode;
        student_answer_payload?: Extract<AnswerPayload, { mode: Mode }>;
        reference_answer_payload?: Extract<AnswerPayload, { mode: Mode }>;
        accepted_answer_payloads: Array<Extract<AnswerPayload, { mode: Mode }>>;
    }
}[AnswerMode];

export type SimpleLearningQuestion = LearningQuestionBase & LearningQuestionAnswerFields & {
    display_mode: 'simple_question';
    material_group_id?: never;
    group_position?: never;
};

export type MaterialLearningQuestion = LearningQuestionBase & LearningQuestionAnswerFields & {
    display_mode: 'material_group';
    material_group_id: string;
    group_position: number;
};

export type LearningQuestion = SimpleLearningQuestion | MaterialLearningQuestion;

export interface Material {
    material_id: string;
    kind: MaterialKind;
    display_order: number;
    text?: string;
    evidence_refs: string[];
    questions?: never;
}

export interface MaterialGroup {
    group_id: string;
    title?: string;
    material_type: MaterialKind;
    display_order: number;
    page_indices: number[];
    status: MaterialStatus;
    warnings: ArtifactWarningCode[];
    materials: Material[];
    item_ids: string[];
    questions?: never;
}

interface EvidenceBase {
    evidence_id: string;
    owner_type: EvidenceOwnerType;
    owner_id: string;
    role: EvidenceRole;
    canonicalization_version: 'evidence_v1';
    content_hash: string;
    slice_image_url?: string;
}

export interface EvidenceBBox {
    x: number;
    y: number;
    width: number;
    height: number;
    unit: 'normalized';
}

export type PageEvidenceRecord = EvidenceBase & {
    kind: 'page';
    page_index: number;
    storage_ref: string;
    text?: string;
    image_url?: string;
    bbox?: never;
    source_text_id?: never;
    span_start?: never;
    span_end?: never;
    bbox_evidence_ref?: never;
};

export type BBoxEvidenceRecord = EvidenceBase & {
    kind: 'bbox';
    page_index: number;
    storage_ref: string;
    bbox: EvidenceBBox;
    text?: string;
    image_url?: string;
    source_text_id?: never;
    span_start?: never;
    span_end?: never;
    bbox_evidence_ref?: never;
};

export type TextSpanEvidenceRecord = EvidenceBase & {
    kind: 'text_span';
    source_text_id: string;
    span_start: number;
    span_end: number;
    text: string;
    page_index?: number;
    bbox_evidence_ref?: string;
    storage_ref?: never;
    bbox?: never;
    image_url?: never;
};

export type AnswerFragmentBBoxEvidenceRecord = EvidenceBase & {
    kind: 'answer_fragment';
    owner_type: 'answer';
    role: 'student_answer' | 'reference_answer';
    text: string;
    page_index: number;
    bbox: EvidenceBBox;
    storage_ref?: string;
    image_url?: string;
    source_text_id?: never;
    span_start?: never;
    span_end?: never;
    bbox_evidence_ref?: never;
};

export type AnswerFragmentTextEvidenceRecord = EvidenceBase & {
    kind: 'answer_fragment';
    owner_type: 'answer';
    role: 'student_answer' | 'reference_answer';
    text: string;
    source_text_id: string;
    span_start: number;
    span_end: number;
    page_index?: never;
    storage_ref?: never;
    bbox?: never;
    image_url?: never;
    bbox_evidence_ref?: never;
};

export type EvidenceRecord =
    | PageEvidenceRecord
    | BBoxEvidenceRecord
    | TextSpanEvidenceRecord
    | AnswerFragmentBBoxEvidenceRecord
    | AnswerFragmentTextEvidenceRecord;

export interface PresentationNode {
    node_id: string;
    kind: PresentationKind;
    ref_id: string;
    display_order: number;
}

export interface LearningArtifactsContract {
    subject?: LearningSubject;
    artifact_contract_version: LearningArtifactsContractVersion;
    artifact_contract_revision: number;
    artifact_contract_provenance: ArtifactContractProvenance;
    artifact_contract_status: ArtifactContractStatus;
    artifact_contract_warnings: ArtifactWarningCode[];
    material_groups: MaterialGroup[];
    evidence_registry: EvidenceRecord[];
    presentation_nodes: PresentationNode[];
    questions: LearningQuestion[];
    question_cards: QuestionCard[];
}

export type CapabilitySubject = 'math' | 'english' | 'physics' | 'chemistry';

export interface SubjectCapability {
    read_enabled: boolean;
    submission_enabled: boolean;
}

export interface CapabilitySubjects {
    math: SubjectCapability;
    english: SubjectCapability;
    physics: SubjectCapability;
    chemistry: SubjectCapability;
}

export interface CapabilitiesResponse {
    capability_contract_version: 'capabilities_v1';
    subjects: CapabilitySubjects;
}

export type CapabilityResponse = CapabilitiesResponse;

export interface QuestionCard {
    subject?: CapabilitySubject;
    relation_type?: string;
    item_id: string;
    question_number: string;
    page_index: number;
    answer_state?: AnswerState;
    excluded_from_mistakes?: boolean;
    question_content?: string;
    question_slice_image_url?: string;
    figure_slice_image_url?: string;
    image_refs?: Record<string, unknown>;
    visual_risk?: boolean;
    visual_risk_reasons?: string[];
    card_state?: CardState;
    verdict?: Verdict;
    reason?: string;
    needs_review?: boolean;
    review_summary?: string;
    review_reasons?: string[];
    review_slice_image_url?: string;
    review_bbox?: number[];
}

export interface PageSummary {
    page_index: number;
    page_state?: string;
    status?: string;
    wrong_count?: number;
    uncertain_count?: number;
    blank_count?: number;
    needs_review?: boolean;
}

export interface JobRequest {
    upload_id?: string;
    submission_id?: string;
    subject?: string;
    session_id?: string;
    [key: string]: unknown;
}

export interface JobProgressSnapshot {
    stage?: string;
    current_stage?: string;
    message?: string;
    done_pages?: number;
    total_pages?: number;
    page_index?: number;
    updated_at?: string;
    percent?: number;
    progress_percent?: number;
    [key: string]: unknown;
}

export type JobProgress = JobProgressSnapshot | string | number;

export interface JobResponse {
    job_id: string;
    status: JobStatus;
    subject?: string;
    request?: JobRequest;
    progress?: JobProgress;
    result?: unknown;
    error?: string | null;
    created_at?: string;
    updated_at?: string;
    elapsed_ms?: number;
    total_pages?: number;
    done_pages?: number;
    page_summaries?: PageSummary[];
    question_cards?: QuestionCard[];
    submission_id?: string;
    session_id?: string;
}

export interface SubmissionSummary {
    total_items?: number;
    wrong_count?: number;
    uncertain_count?: number;
    blank_count?: number;
    score_text?: string;
    performance_rate?: number;
    performance_level?: 'A' | 'B' | 'C' | 'D';
    score_basis?: string;
}

export interface SubmissionItem {
    submission_id: string;
    profile_id?: string | null;
    created_at?: string;
    updated_at?: string | null;
    subject?: string;
    total_pages?: number;
    done_pages?: number;
    session_id?: string;
    summary?: SubmissionSummary;
}

export interface SubmissionListResponse {
    items: SubmissionItem[];
    next_before?: string;
}

export interface SubmissionDetail extends SubmissionItem {
    page_image_urls?: string[];
    vision_raw_text?: string;
    page_summaries?: PageSummary[];
    question_cards?: QuestionCard[];
    questions?: Array<Record<string, unknown>>;
    artifact_contract_version?: string;
    artifact_contract_revision?: number;
    artifact_contract_provenance?: ArtifactContractProvenance;
    artifact_contract_status?: ArtifactContractStatus;
    artifact_contract_warnings?: ArtifactWarningCode[];
    material_groups?: MaterialGroup[];
    evidence_registry?: EvidenceRecord[];
    presentation_nodes?: PresentationNode[];
    // True when qindex slices are being generated (visual questions detected and queued)
    qindex_pending?: boolean;
}

export interface QuotaResponse {
    cp_left: number;
    report_coupons_left: number;
    trial_expires_at?: string | null;
    plan_tier?: string | null;
    data_retention_tier?: string | null;
}

export interface ProfileItem {
    profile_id: string;
    display_name: string;
    avatar_url?: string | null;
    is_default?: boolean;
    created_at?: string | null;
}

export interface ProfilesResponse {
    default_profile_id: string;
    profiles: ProfileItem[];
}

export interface MistakeItem {
    submission_id: string;
    session_id?: string;
    subject?: string;
    created_at?: string;
    item_id: string;
    question_number?: string;
    display_mode?: DisplayMode;
    answer_mode?: AnswerMode;
    question_type?: QuestionType;
    material_group_id?: string;
    contract_provenance?: ArtifactContractProvenance;
    evidence_refs?: string[];
    reason?: string;
    severity?: string;
    knowledge_tags?: string[];
    knowledge_tag_items?: KnowledgeTagItem[];
    knowledge_category_id?: string;
    knowledge_category_name?: string;
    primary_knowledge_tag?: string;
    raw?: Record<string, unknown>;
}

export interface KnowledgeTagItem {
    id?: string;
    tag_id?: string;
    taxonomy_version?: string;
    key?: string;
    name?: string;
    canonical_path?: string;
    primary_domain?: string;
    category_id?: string;
    category_name?: string;
    leaf_name?: string;
    label?: string;
    name_zh?: string;
    name_en?: string;
    display_name?: string;
    display_name_zh?: string;
    display_name_en?: string;
}

export interface MistakeListResponse {
    items: MistakeItem[];
    next_before_created_at?: string | null;
}

export interface KnowledgeArchiveNode {
    id: string;
    parent_id?: string;
    level: 1 | 2 | 3;
    name: string;
    canonical_path: string;
    taxonomy_version: string;
    count: number;
    children: KnowledgeArchiveNode[];
}

export interface KnowledgeArchiveResponse {
    subject: 'math' | 'english' | 'physics' | 'chemistry';
    taxonomy_version: string;
    mistake_state: 'active' | 'mastered';
    total_items: number;
    unmapped_count: number;
    nodes: KnowledgeArchiveNode[];
}

export interface ReportEligibility {
    eligible: boolean;
    submission_count: number;
    required_count: number;
    distinct_days: number;
    required_days: number;
    subject?: string;
    reason?: string;
    progress_percent?: number;
    sample_submission_ids?: string[];
}

export interface ReportJob {
    job_id?: string;
    status?: string;
    report_id?: string;
    error?: string;
    created_at?: string;
    updated_at?: string;
}

export interface ReportListItem {
    report_id: string;
    created_at?: string;
    subject?: string;
    title?: string;
    params?: Record<string, unknown>;
}

export interface ReportListResponse {
    items: ReportListItem[];
}

export interface EnglishReportKnowledgeAggregate {
    tag_id?: string;
    taxonomy_version?: string;
    canonical_path?: string;
    canonical_paths?: string[];
    role?: KnowledgeTagRole;
    roles?: KnowledgeTagRole[];
    item_count?: number;
    correct?: number;
    incorrect?: number;
    uncertain?: number;
}

export interface EnglishReportAccuracy {
    rate?: number;
    sample_size?: number;
    correct?: number;
    incorrect?: number;
    excluded_uncertain?: number;
}

export interface EnglishReportStats {
    contract_coverage?: Partial<Record<ArtifactContractProvenance, number>>;
    by_question_type?: Partial<Record<QuestionType, number>>;
    by_answer_mode?: Partial<Record<AnswerMode, number>>;
    by_error_type?: Partial<Record<EnglishErrorType, number>>;
    by_knowledge_tag?: Record<string, EnglishReportKnowledgeAggregate>;
    item_count?: number;
    material_group_count?: number;
    blank_count?: number;
    accuracy?: EnglishReportAccuracy;
}

export interface ReportStats {
    [key: string]: unknown;
    english?: EnglishReportStats;
}

export interface TutorLearningContextIdentity {
    contract_version: LearningArtifactsContractVersion;
    item_id: string;
    material_group_id?: string;
    context_status: 'complete' | 'truncated';
    evidence_ids: string[];
}

export interface TutorFocusReviewContext {
    learning_context?: TutorLearningContextIdentity;
    [key: string]: unknown;
}

export interface TutorChatEventPayload {
    messages?: Array<{ role?: string; content?: string }>;
    session_id?: string | null;
    focus_image_urls?: string[];
    focus_image_source?: string | null;
    focus_review_context?: TutorFocusReviewContext;
}

export interface ReportContent {
    report_id: string;
    content?: string;
    title?: string;
    stats?: ReportStats;
    params?: Record<string, unknown>;
    created_at?: string;
}

// ============================================================================
// Admin Types
// ============================================================================

export interface AdminUser {
    user_id: string;
    phone: string;
    created_at?: string;
    last_login_at?: string;
}

export interface WalletInfo {
    user_id: string;
    bt_trial: number;
    bt_subscription: number;
    bt_report_reserve: number;
    report_coupons: number;
    trial_expires_at?: string;
    plan_tier?: string;
    data_retention_tier?: string;
    updated_at?: string;
}

export interface AdminUserDetail {
    user: AdminUser;
    wallet?: WalletInfo;
}

export interface AuditLogItem {
    actor: string;
    action: string;
    target_type: string;
    target_id: string | null;
    payload: Record<string, unknown>;
    request_id: string;
    ip: string;
    user_agent: string;
    created_at: string;
}

export interface AdminSubmissionItem {
    submission_id: string;
    user_id: string;
    profile_id?: string;
    created_at: string;
    subject?: string;
    session_id: string;
    warnings?: unknown[];
}

export interface AdminReportItem {
    id: string;
    user_id: string;
    profile_id?: string;
    report_job_id: string;
    title: string;
    period_from: string;
    period_to: string;
    created_at: string;
}

export interface UsageLedgerItem {
    id: string;
    user_id: string;
    event_type: string;
    amount_delta: number;
    balance_after: number;
    created_at: string;
}
