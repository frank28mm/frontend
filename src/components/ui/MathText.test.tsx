import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MathText } from '@/components/ui/MathText';

describe('MathText', () => {
  it('keeps surrounding prose while rendering inline math', () => {
    const { container } = render(
      <MathText text={'已知函数 \\(f(x)=x^2-2x+1\\)，则 \\(f(2)\\) 的值是 1。'} />
    );

    expect(container.textContent).toContain('已知函数');
    expect(container.textContent).toContain('的值是 1');
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('renders multiline option content with display math blocks', () => {
    const { container } = render(
      <MathText
        text={'题目如下：\n$$x^2-2x+1$$\nA. 0\nB. 1\nC. 2\nD. 3'}
      />
    );

    expect(container.textContent).toContain('题目如下：');
    expect(container.textContent).toContain('A. 0');
    expect(container.textContent).toContain('D. 3');
    expect(container.querySelectorAll('.katex').length).toBeGreaterThan(0);
  });
});
