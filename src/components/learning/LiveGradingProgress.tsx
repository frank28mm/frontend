import { PRODUCT_IDENTITY } from "@/content/productIdentity";
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

import { QuestionText } from '@/components/ui/QuestionText';
import { cn } from '@/lib/utils';
import type { JobProgressSnapshot, JobResponse, PageSummary, QuestionCard } from '@/services/types';
import { compareQuestionNumbers } from '@/utils/questionOrder';
import { isNonScoringCrossPageParent } from '@/utils/questionRelations';
import type { ResultPresentationFilter } from '@/components/learning/ResultPresentation';

interface LiveGradingProgressProps {
  job: JobResponse;
  filter: ResultPresentationFilter;
  onOpenQuestion: (card: QuestionCard, visibleItemIds: string[]) => void;
  onAskAI: (card: QuestionCard) => void;
}

const STAGE_LABELS: Record<string, string> = {
  accepted: '任务已接收',
  queued: '等待开始批改',
  grade_start: '准备识别题目',
  vision_start: '识别题目中',
  page_prepare: '准备本页',
  page_structured_ocr: '识别本页题目',
  page_qindex: '定位本页题目',
  page_slice_select: '整理本页题目',
  page_aggregate: '批改本页中',
  page_finalize: '整理本页结果',
  page_processing: '正在批改页面',
  artifact_materialize: '生成题目卡',
  cross_page_resolve: '核对跨页题目',
  writeback: '正在保存批改结果',
  done: '批改完成',
  failed: '批改失败',
};

const progressSnapshot = (job: JobResponse): JobProgressSnapshot | null =>
  job.progress && typeof job.progress === 'object' && !Array.isArray(job.progress)
    ? job.progress
    : null;

const progressStage = (job: JobResponse): string => {
  const progress = progressSnapshot(job);
  return String(progress?.stage || progress?.current_stage || '').trim().toLowerCase();
};

const progressMessage = (job: JobResponse): string => {
  if (typeof job.progress === 'string') return job.progress.trim();
  if (typeof job.progress === 'number' && Number.isFinite(job.progress)) {
    return `当前进度 ${Math.max(0, Math.min(100, Math.round(job.progress)))}%`;
  }
  return String(progressSnapshot(job)?.message || '').trim();
};

const verdictMatches = (card: QuestionCard, filter: ResultPresentationFilter): boolean => {
  if (filter === 'all') return true;
  const verdict = String(card.verdict || '').toLowerCase();
  if (filter === 'wrong') return verdict === 'incorrect';
  return verdict === filter;
};

const verdictLabel = (card: QuestionCard): string => {
  if (card.verdict === 'correct') return '正确';
  if (card.verdict === 'incorrect') return '错误';
  if (card.verdict === 'uncertain') return '待定';
  return '识别中';
};

const summaryLabel = (summary: PageSummary): string => [
  `${summary.wrong_count || 0} 错误`,
  `${summary.uncertain_count || 0} 待定`,
  `${summary.blank_count || 0} 未作答`,
].join(' · ');

const cardIsReady = (card: QuestionCard): boolean => {
  const cardState = String(card.card_state || '').trim().toLowerCase();
  return cardState ? cardState !== 'placeholder' : Boolean(card.verdict);
};

const summaryIsDone = (summary: PageSummary | undefined): boolean => {
  if (!summary) return false;
  return [summary.page_state, summary.status]
    .some((state) => String(state || '').trim().toLowerCase() === 'done');
};

export const LiveGradingProgress: React.FC<LiveGradingProgressProps> = ({
  job,
  filter,
  onOpenQuestion,
  onAskAI,
}) => {
  const questionCards = useMemo(
    () => (job.question_cards || []).filter((card) => !isNonScoringCrossPageParent(card)),
    [job.question_cards],
  );
  const pageSummaries = useMemo(() => job.page_summaries || [], [job.page_summaries]);
  const totalPages = useMemo(() => Math.max(
    1,
    Number(job.total_pages) || 0,
    ...questionCards.map((card) => (Number.isFinite(card.page_index) ? card.page_index + 1 : 1)),
    ...pageSummaries.map((summary) => (Number.isFinite(summary.page_index) ? summary.page_index + 1 : 1)),
  ), [job.total_pages, pageSummaries, questionCards]);
  const donePages = Math.max(0, Math.min(totalPages, Number(job.done_pages) || 0));
  const filteredCards = useMemo(
    () => questionCards.filter((card) => verdictMatches(card, filter)),
    [filter, questionCards],
  );
  const visibleItemIds = useMemo(
    () => filteredCards.map((card) => String(card.item_id || '').trim()).filter(Boolean),
    [filteredCards],
  );
  const cardsByPage = useMemo(() => {
    const pages = new Map<number, QuestionCard[]>();
    filteredCards.forEach((card) => {
      const pageIndex = Number.isFinite(card.page_index) ? card.page_index : 0;
      pages.set(pageIndex, [...(pages.get(pageIndex) || []), card]);
    });
    pages.forEach((cards, pageIndex) => {
      pages.set(pageIndex, cards.slice().sort((left, right) => {
        const byNumber = compareQuestionNumbers(left.question_number, right.question_number);
        return byNumber || String(left.item_id).localeCompare(String(right.item_id));
      }));
    });
    return pages;
  }, [filteredCards]);
  const summariesByPage = useMemo(
    () => new Map(pageSummaries.map((summary) => [summary.page_index, summary])),
    [pageSummaries],
  );
  const stage = progressStage(job);
  const message = progressMessage(job);
  const stageLabel = STAGE_LABELS[stage] || (stage ? stage.replaceAll('_', ' ') : '批改处理中');

  return (
    <div className="space-y-8">
      <div
        data-testid="live-grading-progress"
        className="rounded-2xl border border-white/40 bg-neu-bg p-4 shadow-neu-flat"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-700">{stageLabel}</div>
            {message && message !== stageLabel && (
              <div className="mt-1 break-words text-[11px] text-gray-500">{message}</div>
            )}
          </div>
          <span className="shrink-0 text-[11px] font-bold text-gray-500">{donePages}/{totalPages}</span>
        </div>
        <div
          role="progressbar"
          aria-label="批改页面进度"
          aria-valuemin={0}
          aria-valuemax={totalPages}
          aria-valuenow={donePages}
          className="mt-3 h-2 overflow-hidden rounded-full bg-neu-bg shadow-neu-pressed"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${(donePages / totalPages) * 100}%` }}
          />
        </div>
      </div>

      {Array.from({ length: totalPages }, (_, pageIndex) => {
        const cards = cardsByPage.get(pageIndex) || [];
        const summary = summariesByPage.get(pageIndex);
        const hasReadyCard = questionCards.some((card) => (
          (Number.isFinite(card.page_index) ? card.page_index : 0) === pageIndex && cardIsReady(card)
        ));
        const pageComplete = summaryIsDone(summary) || hasReadyCard;
        return (
          <section key={pageIndex} data-testid={`live-page-${pageIndex}`} className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-bold text-gray-700">Page {pageIndex + 1}</h3>
              <span className="text-[10px] text-gray-400">
                {pageComplete ? '已完成' : '处理中'}{cards.length > 0 ? ` · ${cards.length} 题` : ''}
              </span>
            </div>
            {summary && pageComplete && (
              <div className="text-[11px] text-gray-500">{summaryLabel(summary)}</div>
            )}
            <div className="grid gap-4">
              {cards.length === 0 && (
                <div className="rounded-2xl bg-neu-bg p-4 text-xs text-gray-400 shadow-neu-pressed">
                  {pageComplete ? '本页已完成，题目卡整理中...' : '题目加载中...'}
                </div>
              )}
              {cards.map((card) => {
                const ready = cardIsReady(card);
                const isPlaceholder = !ready;
                return (
                  <motion.article
                    key={card.item_id}
                    data-testid={`live-card-${card.item_id}`}
                    data-flip-state={ready ? 'complete' : 'placeholder'}
                    initial={false}
                    animate={{ rotateX: ready ? 360 : 0 }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                    className="rounded-3xl border border-white/40 bg-neu-bg p-5 shadow-neu-flat"
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs text-gray-400">题号</div>
                        <div className="text-lg font-bold text-gray-800">Q{card.question_number}</div>
                      </div>
                      <span className={cn(
                        'rounded-full px-3 py-1.5 text-xs font-bold shadow-neu-pressed',
                        card.verdict === 'correct' && 'text-green-500',
                        card.verdict === 'incorrect' && 'text-red-500',
                        card.verdict === 'uncertain' && 'text-yellow-500',
                        !card.verdict && 'text-gray-400',
                      )}>
                        {verdictLabel(card)}
                      </span>
                    </div>

                    <div className="mt-4 rounded-2xl bg-neu-bg p-4 text-sm text-gray-600 shadow-neu-pressed">
                      <QuestionText
                        as="div"
                        className="clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-600"
                        text={card.question_content || (isPlaceholder ? '题目内容加载中...' : '暂无题干')}
                      />
                    </div>

                    {card.card_state === 'review_pending' && (
                      <div className="mt-3 text-[11px] text-gray-400">复核中...</div>
                    )}
                    {card.review_summary && (
                      <div className="mt-3 text-[11px] text-gray-500">复核摘要：{card.review_summary}</div>
                    )}

                    <div className="mt-4 flex gap-3">
                      <button
                        type="button"
                        onClick={() => onOpenQuestion(card, visibleItemIds)}
                        className="flex-1 rounded-2xl bg-neu-bg py-2 text-xs font-bold text-gray-600 shadow-neu-flat"
                      >
                        题目详情
                      </button>
                      <button
                        type="button"
                        onClick={() => onAskAI(card)}
                        className="flex-1 rounded-2xl bg-neu-bg py-2 text-xs font-bold text-gray-600 shadow-neu-flat"
                      >
                        {PRODUCT_IDENTITY.tutor.action}
                      </button>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default LiveGradingProgress;
