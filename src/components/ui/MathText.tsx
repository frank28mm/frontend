import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { renderMathHtml } from '@/utils/mathFormatter';

type AsTag = 'div' | 'span' | 'p';

export interface MathTextProps {
  text?: string | null;
  as?: AsTag;
  className?: string;
}

export const MathText: React.FC<MathTextProps> = ({ text, as = 'div', className }) => {
  const html = useMemo(() => renderMathHtml(String(text || '')), [text]);
  const Tag = as;

  return (
    <Tag
      className={cn('katex-render', className)}
      // renderMathHtml escapes non-math text and uses KaTeX HTML output.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

