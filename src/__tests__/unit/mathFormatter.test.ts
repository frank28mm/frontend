import { describe, it, expect } from 'vitest';
import { formatLatexDelimiters, normalizeMathText, renderMathHtml } from '@/utils/mathFormatter';

describe('utils: formatLatexDelimiters', () => {
  it('normalizes backslash + newline + paren delimiters', () => {
    const input = 'a \\\n( x^2 + 1 \\\n) b';
    expect(formatLatexDelimiters(input)).toBe('a $ x^2 + 1 $ b');
  });

  it('normalizes backslash + newline + bracket delimiters', () => {
    const input = 'a \\\n[ x^2 + 1 \\\n] b';
    expect(formatLatexDelimiters(input)).toBe('a $$ x^2 + 1 $$ b');
  });

  it('preserves boldsymbol expressions with nested fractions', () => {
    const input = '$\\boldsymbol{x\\geqslant-\\frac{1}{3}}$';
    expect(normalizeMathText(input)).toBe(input);
  });

  it('wraps standalone latex fragments without mutating structure', () => {
    expect(normalizeMathText('\\boldsymbol{x\\geqslant-\\frac{1}{3}}')).toBe(
      '$\\boldsymbol{x\\geqslant-\\frac{1}{3}}$'
    );
    expect(normalizeMathText('\\boldsymbol{x<-\\frac{3}{2}}')).toBe(
      '$\\boldsymbol{x<-\\frac{3}{2}}$'
    );
  });

  it('renders inline math embedded in Chinese text', () => {
    const html = renderMathHtml('应为$x+2$');
    expect(html).toContain('应为');
    expect(html).toContain('katex');
    expect(html).not.toContain('应为$x+2$');
  });

  it('wraps bare latex fragments inside Chinese sentences without corrupting them', () => {
    const normalized = normalizeMathText('解集是 x\\geqslant-\\frac{1}{3} .');
    expect(normalized).toContain('$x\\geqslant-\\frac{1}{3}.$');
    const html = renderMathHtml('解集是 x\\geqslant-\\frac{1}{3} .');
    expect(html).toContain('解集是');
    expect(html).toContain('katex');
    expect(html).not.toContain('\\frac{1}{3}');
  });

  it('repairs form-feed corrupted latex fractions before rendering', () => {
    const corrupted = '已知$rac{1}{2}$x';
    expect(normalizeMathText(corrupted)).toContain('$\\frac{1}{2}$');
    const html = renderMathHtml(corrupted);
    expect(html).toContain('katex');
    expect(html).not.toContain('rac{1}{2}');
  });
});
