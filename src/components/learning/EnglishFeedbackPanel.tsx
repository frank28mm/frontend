import { useMemo, useState } from 'react';

import type {
  EnglishErrorType,
  EnglishFeedback,
  EvidenceRecord,
  RubricDimension,
  RubricJudgment,
  Verdict,
} from '@/services/types';

export interface EnglishFeedbackPanelProps {
  feedback: EnglishFeedback;
  ownerItemID: string;
  evidenceRegistry: readonly EvidenceRecord[];
}

const ERROR_LABELS: Record<EnglishErrorType, string> = {
  missing_answer: '未作答',
  recognition_uncertain: '识别待确认',
  spelling: '拼写',
  word_form: '词形',
  vocabulary: '词汇',
  grammar: '语法',
  meaning: '语义',
  evidence: '依据',
  task_fulfillment: '任务完成度',
  coherence: '连贯性',
  expression: '表达',
  format: '格式',
  other: '其他',
  unknown: '待确认',
};

const RUBRIC_LABELS: Record<RubricDimension, string> = {
  task_completion: '任务完成',
  content: '内容',
  organization: '组织结构',
  grammar: '语法',
  vocabulary: '词汇',
  expression: '表达',
};

const writingRubricLabel = (dimension: RubricDimension): string => {
  if (dimension === 'organization') return '组织与连贯';
  if (dimension === 'vocabulary') return '词汇与表达';
  return RUBRIC_LABELS[dimension];
};

const RUBRIC_JUDGMENT_LABELS: Record<RubricJudgment, string> = {
  meets: '达到',
  partly_meets: '部分达到',
  does_not_meet: '未达到',
  uncertain: '待确认',
};

const VERDICT_LABELS: Record<Verdict, string> = {
  correct: '正确',
  incorrect: '错误',
  uncertain: '待确认',
};

const verdictClass = (verdict: Verdict): string => {
  if (verdict === 'correct') return 'text-[#10B981]';
  if (verdict === 'incorrect') return 'text-[#F87171]';
  return 'text-[#F59E0B]';
};

const evidenceImageURL = (evidence: EvidenceRecord): string => {
  if (evidence.kind !== 'page' && evidence.kind !== 'bbox' && evidence.kind !== 'answer_fragment') {
    return '';
  }
  return String(evidence.image_url || '').trim();
};

export const EnglishFeedbackPanel = ({
  feedback,
  ownerItemID,
  evidenceRegistry,
}: EnglishFeedbackPanelProps) => {
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const evidence = useMemo(() => {
    const refs = new Set([
      ...feedback.evidence_refs,
      ...feedback.slot_feedback.flatMap((slot) => slot.evidence_refs),
      ...feedback.rubric_feedback.flatMap((rubric) => rubric.evidence_refs || []),
    ]);
    return evidenceRegistry.filter(
      (entry) =>
        refs.has(entry.evidence_id) &&
        entry.owner_type === 'feedback' &&
        entry.owner_id === ownerItemID &&
        entry.role === 'grading_basis',
    );
  }, [evidenceRegistry, feedback, ownerItemID]);
  const evidenceText = useMemo(() => {
    const text = [...feedback.evidence];
    for (const entry of evidence) {
      if ('text' in entry && typeof entry.text === 'string' && entry.text.trim()) {
        text.push(entry.text);
      }
    }
    return [...new Set(text.map((item) => item.trim()).filter(Boolean))];
  }, [evidence, feedback.evidence]);
  const evidenceImages = evidence
    .map((entry) => ({ entry, url: evidenceImageURL(entry) }))
    .filter(({ entry, url }) => url && !failedImages.has(entry.evidence_id));
  const errorTypes = [...new Set([...(feedback.error_type ? [feedback.error_type] : []), ...feedback.error_types])];
  const writingEvaluation = feedback.question_type === 'writing';
  const writingEvaluationComplete = writingEvaluation && feedback.evaluation_status === 'complete';
  const strengths = feedback.strengths || [];
  const corrections = feedback.representative_corrections || [];
  const hasContent = Boolean(
    feedback.student_issue ||
      feedback.explanation ||
      feedback.improved_answer ||
      feedback.reference_answer ||
      feedback.accepted_answers.length ||
      errorTypes.length ||
      feedback.slot_feedback.length ||
      feedback.rubric_feedback.length ||
      feedback.evaluation_status ||
      feedback.overall_assessment ||
      strengths.length ||
      corrections.length ||
      evidenceText.length ||
      evidenceImages.length,
  );

  if (!hasContent) return null;

  return (
    <section className="min-w-0 max-w-full rounded-[32px] bg-neu-bg shadow-neu-flat border border-white/40 p-6 [overflow-wrap:anywhere]">
      <div className="mb-5 flex items-center gap-2 text-sm font-bold text-[#64748B]">
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">school</span>
        <span>英文反馈</span>
      </div>

      {writingEvaluation && feedback.evaluation_status === 'failed' && (
        <div className="mb-5 rounded-2xl bg-neu-bg px-4 py-3 text-sm font-bold text-[#F59E0B] shadow-neu-pressed">
          作文评价暂未完成
        </div>
      )}

      {errorTypes.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2" aria-label="问题类型">
          {errorTypes.map((type) => (
            <span
              key={type}
              className="rounded-full bg-neu-bg px-3 py-1 text-xs font-bold text-[#64748B] shadow-neu-pressed"
            >
              {ERROR_LABELS[type]}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-5 text-[14px] leading-6 text-[#1E293B]">
        {writingEvaluationComplete && feedback.overall_assessment && (
          <div>
            <div className="mb-1 text-xs font-bold text-[#64748B]">综合评价</div>
            <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{feedback.overall_assessment}</div>
          </div>
        )}
        {feedback.student_issue && (
          <div>
            <div className="mb-1 text-xs font-bold text-[#64748B]">问题定位</div>
            <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{feedback.student_issue}</div>
          </div>
        )}
        {feedback.explanation && (!writingEvaluationComplete || feedback.explanation !== feedback.overall_assessment) && (
          <div>
            <div className="mb-1 text-xs font-bold text-[#64748B]">解析</div>
            <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{feedback.explanation}</div>
          </div>
        )}
        {feedback.improved_answer && !writingEvaluationComplete && (
          <div>
            <div className="mb-1 text-xs font-bold text-[#64748B]">修改建议</div>
            <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{feedback.improved_answer}</div>
          </div>
        )}
        {(feedback.reference_answer || feedback.accepted_answers.length > 0) && (
          <div>
            <div className="mb-1 text-xs font-bold text-[#64748B]">参考答案</div>
            {feedback.reference_answer && <div className="whitespace-pre-wrap">{feedback.reference_answer}</div>}
            {feedback.accepted_answers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {feedback.accepted_answers.map((answer) => (
                  <span key={answer} className="rounded-lg bg-white/45 px-2.5 py-1 text-xs text-[#475569]">
                    {answer}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {feedback.slot_feedback.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-bold text-[#64748B]">分空反馈</div>
            {feedback.slot_feedback.map((slot) => (
              <div key={slot.slot_id} className="border-l-2 border-white/70 pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">空格 {slot.slot_id}</span>
                  <span className={`text-xs font-bold ${verdictClass(slot.verdict)}`}>
                    {VERDICT_LABELS[slot.verdict]}
                  </span>
                </div>
                {slot.reference_answer && <div className="mt-1">{slot.reference_answer}</div>}
                {slot.accepted_answers.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {slot.accepted_answers.map((answer) => (
                      <span key={answer} className="rounded-lg bg-white/45 px-2 py-0.5 text-xs">
                        {answer}
                      </span>
                    ))}
                  </div>
                )}
                {slot.explanation && (
                  <div className="mt-1 whitespace-pre-wrap text-[#64748B]">{slot.explanation}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {feedback.rubric_feedback.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-bold text-[#64748B]">写作维度</div>
            {feedback.rubric_feedback.map((rubric) => {
              const hasScore = rubric.score !== null && rubric.max_score !== null;
              return (
                <div key={rubric.dimension} className="border-l-2 border-white/70 pl-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">{writingEvaluation ? writingRubricLabel(rubric.dimension) : RUBRIC_LABELS[rubric.dimension]}</span>
                    <span className="text-xs font-bold text-[#64748B]">
                      {RUBRIC_JUDGMENT_LABELS[rubric.judgment]}
                      {hasScore ? ` · ${rubric.score} / ${rubric.max_score}` : ''}
                    </span>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-[#64748B]">{rubric.feedback}</div>
                </div>
              );
            })}
          </div>
        )}

        {writingEvaluationComplete && strengths.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-bold text-[#64748B]">写作优点</div>
            <div className="space-y-2">
              {strengths.map((strength) => (
                <div key={strength} className="flex min-w-0 gap-2 [overflow-wrap:anywhere]">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#10B981]" />
                  <span>{strength}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {writingEvaluationComplete && corrections.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-bold text-[#64748B]">代表性修改</div>
            {corrections.map((correction, index) => (
              <div key={`${index}-${correction.original}`} className="min-w-0 border-l-2 border-white/70 pl-3 [overflow-wrap:anywhere]">
                <div className="whitespace-pre-wrap text-[#F87171] line-through">{correction.original}</div>
                <div className="mt-1 whitespace-pre-wrap font-medium text-[#1E293B]">{correction.corrected}</div>
                <div className="mt-1 whitespace-pre-wrap text-[#64748B]">{correction.explanation}</div>
              </div>
            ))}
          </div>
        )}

        {writingEvaluationComplete && feedback.improved_answer && (
          <div>
            <div className="mb-1 text-xs font-bold text-[#64748B]">改进后的全文</div>
            <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{feedback.improved_answer}</div>
          </div>
        )}

        {evidenceText.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-bold text-[#64748B]">依据</div>
            <div className="space-y-2">
              {evidenceText.map((text) => (
                <div key={text} className="whitespace-pre-wrap text-[#64748B]">{text}</div>
              ))}
            </div>
          </div>
        )}

        {evidenceImages.length > 0 && (
          <div className="grid min-w-0 gap-3">
            {evidenceImages.map(({ entry, url }) => (
              <div
                key={entry.evidence_id}
                className="flex min-h-40 w-full items-center justify-center overflow-hidden rounded-2xl bg-neu-bg p-2 shadow-neu-pressed"
              >
                <img
                  alt="批改依据"
                  src={url}
                  className="h-auto max-h-80 w-full max-w-full object-contain"
                  onError={() => {
                    setFailedImages((current) => new Set(current).add(entry.evidence_id));
                  }}
                />
              </div>
            ))}
          </div>
        )}
        {failedImages.size > 0 && <div className="text-xs text-[#9CA3AF]">图片证据暂不可用</div>}
      </div>
    </section>
  );
};
