import { useMemo, useState } from 'react';

import { EnglishFeedbackPanel } from '@/components/learning/EnglishFeedbackPanel';
import { MathText } from '@/components/ui/MathText';
import { QuestionText } from '@/components/ui/QuestionText';
import type { AnswerPayload, EvidenceRecord, LearningQuestion } from '@/services/types';
import { resolveOwnedQuestionImageEvidence } from '@/utils/ownedEvidence';
import type { PresentationQuestion } from '@/utils/questionPresentation';

export interface SimpleQuestionDetailProps {
  question: PresentationQuestion;
  isCanonical?: boolean;
  evidenceRegistry?: readonly EvidenceRecord[];
  contractStatus?: 'complete' | 'degraded';
  imageRetryToken?: number;
  questionImageOverrides?: Readonly<Record<string, string>>;
  onQuestionImageError?: (evidenceID: string) => void;
  onQuestionImageLoad?: (evidenceID: string) => void;
}

const isLearningQuestion = (question: PresentationQuestion): question is LearningQuestion =>
  (question.display_mode === 'simple_question' || question.display_mode === 'material_group') &&
  typeof question.answer_mode === 'string';

const stringValue = (value: unknown): string => String(value ?? '').trim();

const stringList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
  const single = stringValue(value);
  return single ? [single] : [];
};

const verdictLabel = (verdict: unknown, relationType?: string): string => {
  if (String(relationType || '').toLowerCase() === 'non_scoring_context') return '不计分';
  if (verdict === 'incorrect') return '错题';
  if (verdict === 'uncertain') return '待定';
  if (verdict === 'correct') return '对题';
  return '处理中';
};

const verdictTextClass = (verdict: unknown, relationType?: string): string => {
  if (String(relationType || '').toLowerCase() === 'non_scoring_context') return 'text-[#9CA3AF]';
  if (verdict === 'incorrect') return 'text-[#F87171]';
  if (verdict === 'uncertain') return 'text-[#F59E0B]';
  if (verdict === 'correct') return 'text-[#10B981]';
  return 'text-[#9CA3AF]';
};

const AnswerValue = ({ value, renderMath, className }: { value: string; renderMath: boolean; className?: string }) =>
  renderMath ? <MathText as="span" className={className} text={value} /> : <span className={className}>{value}</span>;

const AnswerPayloadContent = ({ payload, renderMath }: { payload: AnswerPayload; renderMath: boolean }) => {
  if (payload.mode === 'choice_single' || payload.mode === 'choice_multiple' || payload.mode === 'true_false') {
    return (
      <div className="flex flex-wrap gap-2">
        {payload.selections.map((selection, index) => (
          <AnswerValue
            key={`${index}-${selection.value}`}
            value={selection.value}
            renderMath={renderMath}
            className="rounded-lg bg-white/45 px-3 py-1 text-sm font-bold text-[#334155]"
          />
        ))}
      </div>
    );
  }
  if (payload.mode === 'matching') {
    return (
      <div className="space-y-2">
        {payload.mappings.map((mapping, index) => (
          <div key={`${index}-${mapping.left_id}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <AnswerValue value={mapping.left_id} renderMath={renderMath} />
            <span aria-hidden="true" className="text-[#94A3B8]">:</span>
            <AnswerValue value={mapping.right_id} renderMath={renderMath} />
          </div>
        ))}
      </div>
    );
  }
  if (payload.mode === 'fill_text' || payload.mode === 'fill_from_bank') {
    return (
      <div className="space-y-2">
        {payload.slots.map((slot) => (
          <div key={slot.slot_id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3">
            <span className="text-xs font-bold text-[#64748B]">{slot.slot_id}</span>
            <AnswerValue value={slot.value} renderMath={renderMath} />
          </div>
        ))}
      </div>
    );
  }
  const text = payload.text || '';
  if (!text) return <span className="text-[#9CA3AF]">未识别到作答</span>;
  if (renderMath) {
    return <MathText as="div" className="whitespace-pre-wrap" text={text} />;
  }
  return (
    <div className="whitespace-pre-wrap">
      {text.split('\n').map((line, index) => (
        <span className="block min-h-[1.5rem]" key={`${index}-${line}`}>{line}</span>
      ))}
    </div>
  );
};

const canonicalQuestionDisplayText = (question: LearningQuestion): string => {
  const text = stringValue(question.question_text || question.question_content);
  if (!question.options.length) return text;
  const hasAllOptionText = question.options.every((option) => {
    const optionText = stringValue(option.text);
    return optionText ? text.includes(optionText) : text.includes(option.option_id);
  });
  if (hasAllOptionText) return text;
  const options = question.options.map((option) => {
    const optionText = stringValue(option.text);
    return `${option.option_id}. ${optionText}`.trim();
  });
  return [text, ...options].filter(Boolean).join('\n');
};

export const SimpleQuestionDetail = ({
  question,
  isCanonical,
  evidenceRegistry = [],
  imageRetryToken = 0,
  questionImageOverrides = {},
  onQuestionImageError,
  onQuestionImageLoad,
}: SimpleQuestionDetailProps) => {
  const [judgmentBasisExpanded, setJudgmentBasisExpanded] = useState(false);
  const [imageFailures, setImageFailures] = useState<{ token: number; evidenceIDs: Set<string> }>(() => ({
    token: imageRetryToken,
    evidenceIDs: new Set(),
  }));
  const failedQuestionImages = useMemo(
    () => imageFailures.token === imageRetryToken ? imageFailures.evidenceIDs : new Set<string>(),
    [imageFailures, imageRetryToken],
  );
  const canonicalQuestion = isCanonical === true
    ? question as LearningQuestion
    : isCanonical === false
      ? null
      : isLearningQuestion(question) ? question : null;
  const canonical = canonicalQuestion !== null;
  const isEnglishCanonical = canonicalQuestion?.subject === 'english';
  const writingEvaluationComplete = canonicalQuestion?.question_type === 'writing' &&
    canonicalQuestion.english_feedback?.evaluation_status === 'complete';
  const questionText = canonicalQuestion
    ? canonicalQuestionDisplayText(canonicalQuestion)
    : stringValue(question.question_text || question.question_content) || '暂无题干';
  const studentAnswer = stringValue(question.student_answer);
  const judgmentReason = stringValue(question.reason);
  const judgmentBasis = stringList(question.judgment_basis);
  const judgmentSource = judgmentBasis.find((item) => item.includes('依据来源')) || '';
  const judgmentSummary = judgmentReason || judgmentSource;
  const judgmentDetailItems = useMemo(() => {
    const seen = new Set<string>();
    return judgmentBasis.filter((item) => {
      if (!item || item === judgmentSummary || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  }, [judgmentBasis, judgmentSummary]);
  const toggleLabel = judgmentBasisExpanded ? '收起依据' : `判题依据 · ${judgmentDetailItems.length}条`;
  const questionImages = useMemo(() => {
    if (!canonicalQuestion) return [];
    const ownedImages = resolveOwnedQuestionImageEvidence(evidenceRegistry, canonicalQuestion);
    const figureSliceURL = stringValue(
      (canonicalQuestion as LearningQuestion & { figure_slice_image_url?: string }).figure_slice_image_url,
    );
    const usableText = stringValue(questionText) !== '' && stringValue(questionText) !== '暂无题干';
    const scienceSubject = ['math', 'physics', 'chemistry'].includes(stringValue(canonicalQuestion.subject));
    const figureImage = figureSliceURL && scienceSubject
      ? ownedImages.find(({ url }) => url === figureSliceURL) || {
          evidence: {
            evidence_id: `figure-slice:${canonicalQuestion.item_id}`,
            owner_type: 'question',
            owner_id: canonicalQuestion.item_id,
            role: 'question',
            kind: 'bbox',
            canonicalization_version: 'evidence_v1',
            content_hash: 'sha256:figure-slice',
            page_index: canonicalQuestion.page_index,
            storage_ref: figureSliceURL,
            bbox: { x: 0, y: 0, width: 1, height: 1, unit: 'normalized' },
            image_url: figureSliceURL,
            slice_image_url: figureSliceURL,
          },
          url: figureSliceURL,
        }
      : undefined;
    const visibleImages = figureImage
      ? [figureImage]
      : scienceSubject && usableText
        ? ownedImages.filter(({ evidence }) => {
            const regionKind = stringValue((evidence as { region_kind?: string }).region_kind);
            return regionKind === 'figure';
          })
        : ownedImages;
    return visibleImages
      .filter(({ evidence }) => !failedQuestionImages.has(evidence.evidence_id))
      .map(({ evidence, url }) => ({ entry: evidence, url }));
  }, [canonicalQuestion, evidenceRegistry, failedQuestionImages, questionText]);

  return (
    <div className="min-w-0 max-w-full space-y-6 [overflow-wrap:anywhere]">
      <section
        data-testid="simple-question-detail"
        className="relative min-w-0 max-w-full rounded-[32px] bg-neu-bg shadow-neu-flat p-6 border border-white/40"
      >
        {question.verdict === 'incorrect' && String((question as { relation_type?: string }).relation_type || '').toLowerCase() !== 'non_scoring_context' && (
          <div className="absolute bottom-8 left-0 top-8 w-1.5 rounded-r-full bg-[#F87171] shadow-[0_0_12px_rgba(248,113,113,0.4)] opacity-90" />
        )}
        <div className="flex min-w-0 flex-col gap-5 pl-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-sm font-bold uppercase text-[#64748B] opacity-80">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">quiz</span>
              <span>原题内容</span>
            </span>
            <span
              className={`shrink-0 rounded-full bg-neu-bg px-4 py-1.5 text-xs font-bold shadow-neu-pressed-sm ${writingEvaluationComplete ? 'text-[#10B981]' : verdictTextClass(question.verdict, (question as { relation_type?: string }).relation_type)}`}
            >
              {writingEvaluationComplete ? '已评价' : verdictLabel(question.verdict, (question as { relation_type?: string }).relation_type)}
            </span>
          </div>
          <div className="min-w-0 max-w-full rounded-2xl bg-neu-bg p-6 shadow-neu-pressed [overflow-wrap:anywhere]">
            <QuestionText
              as="div"
              className="min-w-0 max-w-full text-[16px] font-medium leading-relaxed text-[#1E293B] [overflow-wrap:anywhere]"
              variant="full"
              text={questionText}
              answerMode={canonicalQuestion?.answer_mode ?? (question as { answer_mode?: string }).answer_mode}
            />
            {questionImages.length > 0 && (
              <div className="mt-5 grid min-w-0 gap-3">
                {questionImages.map(({ entry, url }) => (
                  <div
                    key={`${entry.evidence_id}:${imageRetryToken}`}
                    className="flex min-h-40 w-full items-center justify-center overflow-hidden rounded-xl bg-neu-bg p-2 shadow-neu-pressed"
                  >
                    <img
                      alt="题目图示"
                      src={questionImageOverrides[entry.evidence_id] || url}
                      data-source-url={url}
                      className="h-auto max-h-80 w-full max-w-full object-contain"
                      onLoad={() => onQuestionImageLoad?.(entry.evidence_id)}
                      onError={() => {
                        setImageFailures((current) => {
                          const evidenceIDs = current.token === imageRetryToken
                            ? new Set(current.evidenceIDs)
                            : new Set<string>();
                          evidenceIDs.add(entry.evidence_id);
                          return { token: imageRetryToken, evidenceIDs };
                        });
                        onQuestionImageError?.(entry.evidence_id);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
            {failedQuestionImages.size > 0 && (
              <div className="mt-3 text-xs text-[#9CA3AF]">图片证据暂不可用</div>
            )}
          </div>
        </div>
      </section>

      {(canonicalQuestion
        ? Boolean(canonicalQuestion.student_answer_payload || canonicalQuestion.reference_answer_payload || studentAnswer || judgmentSummary || judgmentDetailItems.length)
        : Boolean(studentAnswer || judgmentSummary || judgmentDetailItems.length)) && (
        <section className="min-w-0 max-w-full rounded-[32px] bg-neu-bg shadow-neu-flat p-6 border border-white/40">
          {(canonicalQuestion ? canonicalQuestion.student_answer_payload !== undefined || studentAnswer : Boolean(studentAnswer)) && (
            <div
              data-testid="student-answer"
              className="min-w-0 max-w-full rounded-2xl bg-neu-bg p-4 text-[15px] leading-relaxed text-[#1E293B] shadow-neu-pressed [overflow-wrap:anywhere]"
            >
              <div className="mb-2 flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-[#64748B]">edit</span>
                <span className="text-sm font-bold text-[#64748B]">学生作答</span>
              </div>
              {canonicalQuestion?.student_answer_payload ? (
                <AnswerPayloadContent payload={canonicalQuestion.student_answer_payload} renderMath={!isEnglishCanonical} />
              ) : canonicalQuestion ? (
                isEnglishCanonical ? (
                  <div className="whitespace-pre-wrap">{studentAnswer}</div>
                ) : (
                  <MathText as="div" className="whitespace-pre-wrap" text={studentAnswer} />
                )
              ) : (
                <QuestionText as="div" className="text-[15px] leading-relaxed" variant="full" text={studentAnswer} />
              )}
            </div>
          )}

          {canonicalQuestion?.reference_answer_payload && (
            <div className="mt-4 min-w-0 max-w-full rounded-2xl bg-neu-bg p-4 text-[15px] leading-relaxed text-[#1E293B] shadow-neu-pressed [overflow-wrap:anywhere]">
              <div className="mb-2 text-sm font-bold text-[#64748B]">参考答案</div>
              <AnswerPayloadContent payload={canonicalQuestion.reference_answer_payload} renderMath={!isEnglishCanonical} />
            </div>
          )}

          {(judgmentSummary || judgmentDetailItems.length > 0) && (
            <div className={`${canonical || studentAnswer ? 'mt-4' : ''} min-w-0 max-w-full rounded-2xl bg-neu-bg p-4 shadow-neu-pressed`}>
              <div className="mb-2 flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-[#64748B]">gavel</span>
                <span className="text-sm font-bold text-[#64748B]">判题分析</span>
              </div>
              {judgmentSummary && (isEnglishCanonical ? (
                <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#1E293B] [overflow-wrap:anywhere]">
                  {judgmentSummary}
                </div>
              ) : (
                <MathText
                  as="div"
                  className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#1E293B] [overflow-wrap:anywhere]"
                  text={judgmentSummary}
                />
              ))}
              {judgmentDetailItems.length > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    aria-expanded={judgmentBasisExpanded}
                    aria-label={toggleLabel}
                    onClick={() => setJudgmentBasisExpanded((current) => !current)}
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-[#64748B]/80 transition-colors hover:text-[#475569]"
                  >
                    <span>{toggleLabel}</span>
                    <span
                      aria-hidden="true"
                      className={`material-symbols-outlined text-[14px] transition-transform ${judgmentBasisExpanded ? 'rotate-180' : ''}`}
                    >
                      expand_more
                    </span>
                  </button>
                  {judgmentBasisExpanded && (
                    <div className="mt-2 rounded-2xl border border-white/50 bg-white/40 px-3 py-3 text-[12px] text-[#64748B]">
                      <div className="space-y-2">
                        {judgmentDetailItems.map((item, index) => isEnglishCanonical ? (
                          <div key={`${index}-${item}`} className="whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{item}</div>
                        ) : (
                          <MathText
                            key={`${index}-${item}`}
                            as="div"
                            className="whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]"
                            text={item}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {canonicalQuestion?.english_feedback && (
        <EnglishFeedbackPanel
          feedback={canonicalQuestion.english_feedback}
          ownerItemID={canonicalQuestion.item_id}
          evidenceRegistry={evidenceRegistry}
        />
      )}
    </div>
  );
};
