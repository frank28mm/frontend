import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QuestionText } from '@/components/ui/QuestionText';

describe('QuestionText option dedupe', () => {
  it('collapses consecutive duplicated option cycles', () => {
    render(
      <QuestionText
        variant="full"
        text={
          '题目\nA. x > 1\nB. x < -1\nC. x > 4\nD. x < -4\nA. x > 1\nB. x < -1\nC. x > 4\nD. x < -4'
        }
      />
    );
    expect(screen.getAllByText('x > 1')).toHaveLength(1);
    expect(screen.getAllByText('x < -1')).toHaveLength(1);
    expect(screen.getAllByText('x > 4')).toHaveLength(1);
    expect(screen.getAllByText('x < -4')).toHaveLength(1);
  });

  it('keeps normal single option cycle unchanged', () => {
    render(<QuestionText variant="full" text={'题目\nA. 甲\nB. 乙\nC. 丙\nD. 丁'} />);
    expect(screen.getAllByText('甲')).toHaveLength(1);
    expect(screen.getAllByText('乙')).toHaveLength(1);
    expect(screen.getAllByText('丙')).toHaveLength(1);
    expect(screen.getAllByText('丁')).toHaveLength(1);
  });

  it('does not collapse different option cycles', () => {
    render(
      <QuestionText
        variant="full"
        text={
          '题目\nA. 苹果\nB. 香蕉\nC. 梨\nD. 桃\nA. 红色\nB. 蓝色\nC. 绿色\nD. 黄色'
        }
      />
    );
    expect(screen.getAllByText('苹果')).toHaveLength(1);
    expect(screen.getAllByText('香蕉')).toHaveLength(1);
    expect(screen.getAllByText('红色')).toHaveLength(1);
    expect(screen.getAllByText('蓝色')).toHaveLength(1);
  });

  it('collapses duplicated cycles even with an empty noise option in-between', () => {
    render(
      <QuestionText
        variant="full"
        text={
          '题目\nA. 甲\nB. 乙\nC. 丙\nD. 丁\nC.\nA. 甲\nB. 乙\nC. 丙\nD. 丁'
        }
      />
    );
    expect(screen.getAllByText('甲')).toHaveLength(1);
    expect(screen.getAllByText('乙')).toHaveLength(1);
    expect(screen.getAllByText('丙')).toHaveLength(1);
    expect(screen.getAllByText('丁')).toHaveLength(1);
    expect(screen.queryByText('（选项为图形，见题图或图示切片）')).not.toBeInTheDocument();
  });
});
