import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ResultPresentation } from '@/components/learning/ResultPresentation';
import { QuestionText } from '@/components/ui/QuestionText';
import type { QuestionPresentation } from '@/utils/questionPresentation';

describe('QuestionText answerMode', () => {
  it('does not turn photo position labels into choice cards for fill_text', () => {
    render(
      <QuestionText
        variant="full"
        answerMode="fill_text"
        text="图2是苹果下落过程中依次经过位置 A、B、C、D、E、F 的照片。苹果从 A 点到下落至 F 点，总共需要的时间是____s；"
      />,
    );

    expect(screen.queryByText('（选项为图形，见题图或图示切片）')).not.toBeInTheDocument();
    expect(screen.getByText(/总共需要的时间是/)).toBeInTheDocument();
  });

  it('still renders A/B/C choice cards when answerMode is choice_single', () => {
    render(
      <QuestionText
        variant="full"
        answerMode="choice_single"
        text="比较分析苹果经过的路程和所需的时间，可以知道，苹果下落过程中，其运动速度____（选填）。A．变大 B．不变 C．变小"
      />,
    );

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });
});

describe('ResultPresentation science unscored context', () => {
  const backgroundQuestion = {
    item_id: 'p1:q:3',
    question_number: '3',
    page_index: 0,
    subject: 'physics',
    verdict: 'incorrect',
    relation_type: 'non_scoring_context',
    answer_mode: 'unknown',
    question_content: '复兴号动车组高铁改变着人们的出行和生活方式，大大提升了人民的幸福感。',
  } as QuestionPresentation['questions'][number];

  const presentation: QuestionPresentation = {
    source: 'fallback',
    contractStatus: 'degraded',
    warnings: [],
    materialGroups: [],
    evidenceRegistry: [],
    nodes: [{
      kind: 'question',
      refId: backgroundQuestion.item_id,
      displayOrder: 1,
      question: backgroundQuestion,
      questions: [backgroundQuestion],
      verdictCounts: { total: 1, correct: 0, incorrect: 1, uncertain: 0 },
    }],
    questions: [backgroundQuestion],
  };

  it('shows 不计分 instead of 错误 and hides the card from the wrong filter', () => {
    const { rerender } = render(
      <ResultPresentation
        presentation={presentation}
        filter="all"
        onOpenQuestion={() => undefined}
        onAskAI={() => undefined}
      />,
    );

    expect(screen.getByText('不计分')).toBeInTheDocument();
    expect(screen.queryByText('错误')).not.toBeInTheDocument();

    rerender(
      <ResultPresentation
        presentation={presentation}
        filter="wrong"
        onOpenQuestion={() => undefined}
        onAskAI={() => undefined}
      />,
    );
    expect(screen.getByText('暂无题目')).toBeInTheDocument();
  });
});
