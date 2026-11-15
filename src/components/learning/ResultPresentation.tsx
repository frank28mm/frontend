import { PRODUCT_IDENTITY } from "@/content/productIdentity";
import React, { useMemo } from 'react';

import { QuestionText } from '@/components/ui/QuestionText';
import { cn } from '@/lib/utils';
import type { MaterialKind } from '@/services/types';
import { compareQuestionNumbers } from '@/utils/questionOrder';
import type {
  PresentationQuestion,
  QuestionPresentation,
  QuestionPresentationNode,
} from '@/utils/questionPresentation';

export type ResultPresentationFilter = 'all' | 'wrong' | 'uncertain' | 'correct';

interface ResultPresentationProps {
  presentation: QuestionPresentation;
  filter: ResultPresentationFilter;
  onOpenQuestion: (question: PresentationQuestion, visibleItemIds: string[]) => void;
  onAskAI: (question: PresentationQuestion) => void;
  loading?: boolean;
  layout?: 'list' | 'carousel';
}

const questionRelation = (question: PresentationQuestion): string =>
  String((question as { relation_type?: string }).relation_type || '').toLowerCase();

const isUnscoredScienceRelation = (question: PresentationQuestion): boolean => {
  const relation = questionRelation(question);
  return relation === 'non_scoring_context' || relation === 'cross_page_parent';
};

const verdictMatches = (
  question: PresentationQuestion,
  filter: ResultPresentationFilter,
): boolean => {
  if (filter === 'all') return true;
  const verdict = String(question.verdict || '').toLowerCase();
  if (filter === 'wrong') {
    if (isUnscoredScienceRelation(question)) return false;
    return verdict === 'incorrect';
  }
  return verdict === filter;
};

const questionText = (question: PresentationQuestion): string => {
  const value = question as PresentationQuestion & { question_text?: string; question_content?: string };
  return String(value.question_content || value.question_text || '').trim();
};

const questionPageIndex = (question: PresentationQuestion): number => {
  const pageIndex = Number(question.page_index);
  return Number.isFinite(pageIndex) ? pageIndex : 0;
};

const orderedFallbackNodes = (nodes: QuestionPresentationNode[]): QuestionPresentationNode[] =>
  [...nodes].sort((left, right) => {
    const leftQuestion = left.questions[0];
    const rightQuestion = right.questions[0];
    const byPage = questionPageIndex(leftQuestion) - questionPageIndex(rightQuestion);
    if (byPage !== 0) return byPage;
    const byNumber = compareQuestionNumbers(leftQuestion?.question_number, rightQuestion?.question_number);
    if (byNumber !== 0) return byNumber;
    return String(leftQuestion?.item_id || '').localeCompare(String(rightQuestion?.item_id || ''));
  });

const entryQuestion = (node: QuestionPresentationNode): PresentationQuestion | undefined =>
  node.questions.find((question) => question.verdict === 'incorrect') ||
  node.questions.find((question) => question.verdict === 'uncertain') ||
  node.questions[0];

type ReviewLifecycleQuestion = PresentationQuestion & {
  card_state?: string;
  review_summary?: string;
};

const reviewLifecycleLabel = (question: PresentationQuestion): string => {
  const cardState = String((question as ReviewLifecycleQuestion).card_state || '');
  if (cardState === 'review_pending') return '复核中...';
  if (cardState === 'review_failed') return '复核未完成';
  return '';
};

const reviewSummary = (question: PresentationQuestion): string =>
  String((question as ReviewLifecycleQuestion).review_summary || '').trim();

const pageRangeLabel = (node: QuestionPresentationNode): string => {
  const fromGroup = node.group?.page_indices || [];
  const pageIndexes = [...new Set(
    (fromGroup.length > 0 ? fromGroup : node.questions.map(questionPageIndex))
      .filter((value) => Number.isFinite(value)),
  )].sort((left, right) => left - right);
  if (pageIndexes.length === 0) return '';
  const first = pageIndexes[0] + 1;
  const last = pageIndexes[pageIndexes.length - 1] + 1;
  return first === last ? `第 ${first} 页` : `第 ${first}-${last} 页`;
};

const materialKindLabel = (kind?: MaterialKind): string => {
  const labels: Partial<Record<MaterialKind, string>> = {
    passage: '阅读材料',
    dialogue: '对话材料',
    instructions: '任务说明',
    word_bank: '词库材料',
    table: '表格材料',
    diagram: '图示材料',
    image: '图片材料',
    mixed: '综合材料',
  };
  return labels[kind || 'unknown'] || '材料题组';
};

const verdictLabel = (question: PresentationQuestion): string => {
  if (questionRelation(question) === 'non_scoring_context') return '不计分';
  const verdict = String(question.verdict || '');
  if (verdict === 'correct') return '正确';
  if (verdict === 'incorrect') return '错误';
  if (verdict === 'uncertain') return '待定';
  return '处理中';
};

const verdictToneClass = (question: PresentationQuestion): string => {
  if (questionRelation(question) === 'non_scoring_context') return 'text-gray-400';
  if (question.verdict === 'correct') return 'text-green-500';
  if (question.verdict === 'incorrect') return 'text-red-500';
  if (question.verdict === 'uncertain') return 'text-yellow-500';
  return 'text-gray-400';
};

export const ResultPresentation: React.FC<ResultPresentationProps> = ({
  presentation,
  filter,
  onOpenQuestion,
  onAskAI,
  loading = false,
  layout = 'list',
}) => {
  const nodes = useMemo(() => {
    const ordered = presentation.source === 'learning_artifacts_v1'
      ? [...presentation.nodes].sort((left, right) => left.displayOrder - right.displayOrder)
      : orderedFallbackNodes(presentation.nodes);
    return ordered.filter((node) => node.questions.some((question) => verdictMatches(question, filter)));
  }, [filter, presentation]);

  const visibleItemIds = useMemo(
    () => nodes.flatMap((node) => node.questions)
      .filter((question) => verdictMatches(question, filter))
      .map((question) => String(question.item_id || '').trim())
      .filter(Boolean),
    [filter, nodes],
  );

  if (!loading && nodes.length === 0) {
    return <div className="text-sm text-[#9CA3AF]">暂无题目</div>;
  }

  return (
    <div
      className={cn(
        'w-full gap-4',
        layout === 'carousel'
          ? 'flex h-full snap-x snap-mandatory items-start overflow-x-auto pb-2 no-scrollbar'
          : 'grid',
      )}
      data-testid="result-presentation"
    >
      {nodes.map((node) => {
        const matchingQuestions = node.questions.filter((question) => verdictMatches(question, filter));
        const target = entryQuestion({ ...node, questions: matchingQuestions });
        if (!target) return null;
        const isGroup = node.kind === 'material_group' && Boolean(node.group);
        const title = isGroup
          ? String(node.group?.title || '').trim() || '材料题组'
          : `Q${target.question_number || '--'}`;
        const pageLabel = pageRangeLabel(node);

        return (
          <article
            key={`${node.kind}:${node.refId}`}
            data-testid="result-presentation-node"
            className={cn(
              'min-w-0 rounded-[2rem] border border-white/40 bg-neu-bg p-5 shadow-neu-flat',
              layout === 'carousel' && 'h-full w-[85%] max-w-[520px] shrink-0 snap-center',
            )}
          >
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0">
                {isGroup && (
                  <div className="mb-1 text-[10px] font-bold text-gray-400">
                    {materialKindLabel(node.group?.material_type)}
                  </div>
                )}
                <h3 className="break-words text-lg font-bold text-gray-800">{title}</h3>
                {pageLabel && <div className="mt-1 text-[11px] text-gray-400">{pageLabel}</div>}
              </div>
              {!isGroup && (
                <span className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold shadow-neu-pressed',
                  verdictToneClass(target),
                )}>
                  {verdictLabel(target)}
                </span>
              )}
            </div>

            {isGroup ? (
              <>
                <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold text-gray-500">
                  <span className="rounded-full bg-neu-bg px-3 py-1.5 shadow-neu-pressed">
                    {node.verdictCounts.total} 小题
                  </span>
                  <span className="rounded-full bg-neu-bg px-3 py-1.5 text-red-500 shadow-neu-pressed">
                    {node.verdictCounts.incorrect} 错
                  </span>
                  <span className="rounded-full bg-neu-bg px-3 py-1.5 text-yellow-500 shadow-neu-pressed">
                    {node.verdictCounts.uncertain} 待定
                  </span>
                </div>
                <div className="mt-4 flex min-w-0 gap-2 overflow-x-auto pb-1">
                  {node.questions.map((question) => (
                    <span
                      key={question.item_id}
                      className={cn(
                        'shrink-0 rounded-full bg-neu-bg px-3 py-1.5 text-[11px] font-bold shadow-neu-pressed',
                        verdictToneClass(question),
                      )}
                    >
                      {question.question_number || '--'} {reviewLifecycleLabel(question) || verdictLabel(question)}
                    </span>
                  ))}
                </div>
                {node.questions.some((question) => reviewLifecycleLabel(question) || reviewSummary(question)) && (
                  <div className="mt-3 space-y-1 text-[11px] text-gray-500">
                    {node.questions.map((question) => {
                      const lifecycle = reviewLifecycleLabel(question);
                      const summary = reviewSummary(question);
                      if (!lifecycle && !summary) return null;
                      return (
                        <div key={`review:${question.item_id}`}>
                          {question.question_number || '--'}：{lifecycle || `复核摘要：${summary}`}
                          {lifecycle && summary ? ` ${summary}` : ''}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="mt-4 min-w-0 rounded-2xl bg-neu-bg p-4 text-sm text-gray-600 shadow-neu-pressed">
                {String((target as { subject?: string }).subject || '').toLowerCase() === 'english' ? (
                  <div className="whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">
                    {questionText(target) || ((target as ReviewLifecycleQuestion).card_state === 'placeholder' ? '题目内容加载中...' : '暂无题干')}
                  </div>
                ) : (
                  <QuestionText
                    as="div"
                    className="whitespace-pre-wrap text-sm leading-relaxed text-gray-600 [overflow-wrap:anywhere]"
                    text={questionText(target) || ((target as ReviewLifecycleQuestion).card_state === 'placeholder' ? '题目内容加载中...' : '暂无题干')}
                    answerMode={(target as { answer_mode?: string }).answer_mode}
                  />
                )}
              </div>
            )}

            {!isGroup && reviewLifecycleLabel(target) && (
              <div className="mt-3 text-[11px] text-gray-400">{reviewLifecycleLabel(target)}</div>
            )}
            {!isGroup && reviewSummary(target) && (
              <div className="mt-3 text-[11px] text-gray-500">复核摘要：{reviewSummary(target)}</div>
            )}

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => onOpenQuestion(target, visibleItemIds)}
                className="flex-1 rounded-2xl bg-neu-bg py-3 text-xs font-bold text-gray-600 shadow-neu-flat"
              >
                {isGroup ? '查看题组' : '题目详情'}
              </button>
              <button
                type="button"
                onClick={() => onAskAI(target)}
                className="flex-1 rounded-2xl bg-neu-bg py-3 text-xs font-bold text-gray-600 shadow-neu-flat"
              >
                {PRODUCT_IDENTITY.tutor.action}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default ResultPresentation;
