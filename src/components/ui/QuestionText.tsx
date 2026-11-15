import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { MathText } from '@/components/ui/MathText';

const shouldParseChoiceOptions = (answerMode?: string | null) => {
  const mode = String(answerMode || '').trim().toLowerCase();
  if (mode === 'fill_text' || mode === 'fill_from_bank' || mode === 'short_answer' || mode === 'writing') {
    return false;
  }
  return true;
};

const formatQuestionForDisplay = (raw: string, answerMode?: string | null): string => {
  const text = String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!text) return '';

  let out = text;
  if (!shouldParseChoiceOptions(answerMode)) {
    return out.replace(/\n{3,}/g, '\n\n').trim();
  }

  // Ensure choice options render one per line (supports (A) / （A） and A./A、/A:).
  out = out.replace(/([;；])\s*[(（]([A-D])[)）]\s*/g, '\n($2) ');
  out = out.replace(/([;；])\s*([A-D])[.．、:：]\s*/g, '\n$2. ');

  // If multiple options are in one line without separators, try to split before each marker.
  out = out.replace(/\s+(?=[(（][A-D][)）]\s*)/g, '\n');
  out = out.replace(/\s+(?=[A-D][.．、:：]\s*)/g, '\n');
  // OCR sometimes removes spaces: "A.xxxB.yyy" or "(A)xxx(B)yyy".
  out = out.replace(/([^\n])(?=[(（][A-D][)）])/g, '$1\n');
  out = out.replace(/([^\n])(?=[A-D][.．、:：])/g, '$1\n');

  // Put sub-questions on new lines for readability.
  // Only insert a line break when the marker isn't already at a new line.
  out = out.replace(/([^\n])\s*(?=(?:\(|（)\d+(?:\)|）))/g, '$1\n');

  // Remove excessive blank lines.
  out = out.replace(/\n{3,}/g, '\n\n');

  return out.trim();
};

export type QuestionTextAs = 'div' | 'span' | 'p';

export interface QuestionTextProps {
  text?: string | null;
  as?: QuestionTextAs;
  className?: string;
  variant?: 'compact' | 'full';
  answerMode?: string | null;
}

type ParsedOption = { key: string; value: string };

const parseQuestionBlocks = (formatted: string) => {
  const lines = formatted.split('\n');
  const stem: string[] = [];
  const options: ParsedOption[] = [];
  let inOptions = false;

  // Parenthesized options sometimes have no space after the marker: "(B)4x" / "（B）4x".
  // For plain "A." / "A、" / "A:" style, punctuation is required; whitespace is optional.
  // This avoids false positives like "AB//CD" while correctly parsing OCR outputs like "A.1组".
  // Also allow empty option text (e.g. OCR outputs "A." or "(B)" on standalone lines) so we can
  // render consistent option blocks and rely on figure slices to provide the visual content.
  const optParenRe = /^\s*[(（]([A-D])[)）]\s*(.*?)\s*$/;
  const optPlainRe = /^\s*([A-D])[.．、:：]\s*(.*?)\s*$/;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (!inOptions) stem.push('');
      continue;
    }
    const mParen = line.match(optParenRe);
    if (mParen) {
      inOptions = true;
      const key = String(mParen[1] || '').trim();
      const value = String(mParen[2] || '').trim();
      if (key) options.push({ key, value });
      continue;
    }
    const mPlain = line.match(optPlainRe);
    if (mPlain) {
      inOptions = true;
      const key = String(mPlain[1] || '').trim();
      const value = String(mPlain[2] || '').trim();
      if (key) options.push({ key, value });
      continue;
    }
    if (!inOptions) {
      stem.push(line);
      continue;
    }
    // If options already started, treat stray lines as continuation of the previous option.
    const last = options[options.length - 1];
    if (last) last.value = `${last.value}\n${line.trim()}`;
    else stem.push(line);
  }

  const stemText = stem.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { stemText, options };
};

const normalizeOptionValue = (value: string) => String(value || '').replace(/\s+/g, ' ').trim();
const normalizeOptionKey = (key: string) => String(key || '').trim().toUpperCase();

const isSequentialOptionCycle = (cycle: ParsedOption[]) => {
  if (cycle.length < 2) return false;
  return cycle.every((opt, idx) => normalizeOptionKey(opt.key) === String.fromCharCode(65 + idx));
};

const isSameCycle = (left: ParsedOption[], right: ParsedOption[]) =>
  left.length === right.length &&
  left.every((l, idx) => {
    const r = right[idx];
    if (!r) return false;
    return (
      normalizeOptionKey(l.key) === normalizeOptionKey(r.key) &&
      normalizeOptionValue(l.value) === normalizeOptionValue(r.value)
    );
  });

const sanitizeParsedOptions = (options: ParsedOption[]) => {
  if (!options.length) return options;
  const nonEmptyKeys = new Set(
    options
      .filter((opt) => normalizeOptionValue(opt.value))
      .map((opt) => normalizeOptionKey(opt.key))
  );
  return options.filter((opt) => {
    const key = normalizeOptionKey(opt.key);
    const value = normalizeOptionValue(opt.value);
    if (!key) return false;
    if (!value && nonEmptyKeys.has(key)) {
      return false;
    }
    return true;
  });
};

const dedupeOptionCycles = (options: ParsedOption[]) => {
  if (options.length < 4) return options;

  const compact = sanitizeParsedOptions(options);
  if (compact.length < 4) return compact;

  const out: ParsedOption[] = [];
  let i = 0;
  while (i < compact.length) {
    const remain = compact.length - i;
    let consumed = false;
    for (let cycleLen = 2; cycleLen <= Math.floor(remain / 2); cycleLen += 1) {
      const first = compact.slice(i, i + cycleLen);
      const second = compact.slice(i + cycleLen, i + cycleLen * 2);
      if (!isSequentialOptionCycle(first)) continue;
      if (!isSameCycle(first, second)) continue;
      out.push(...first);
      i += cycleLen * 2;
      consumed = true;
      break;
    }
    if (consumed) continue;
    out.push(compact[i]);
    i += 1;
  }
  return out;
};

type SubQuestionBlock = { index: string; text: string };

const parseSubQuestions = (stemText: string) => {
  const lines = String(stemText || '').split('\n');
  const blocks: SubQuestionBlock[] = [];
  const intro: string[] = [];

  let current: SubQuestionBlock | null = null;
  const markerRe = /^\s*[(（](\d{1,3})[)）]\s*(.*)\s*$/;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const m = line.match(markerRe);
    if (m) {
      const idx = String(m[1] || '').trim();
      const rest = String(m[2] || '').trim();
      current = { index: idx, text: rest };
      blocks.push(current);
      continue;
    }

    if (current) {
      current.text = current.text ? `${current.text}\n${line}` : line;
      continue;
    }
    intro.push(line);
  }

  const introText = intro.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  // If we only found a single (1) but no real content, keep it as intro to avoid awkward layout.
  const normalizedBlocks = blocks
    .map((b) => ({ ...b, text: String(b.text || '').trim() }))
    .filter((b) => b.index && b.text);
  if (normalizedBlocks.length === 1 && normalizedBlocks[0].text.length < 6) {
    return { introText: stemText, blocks: [] as SubQuestionBlock[] };
  }
  return { introText, blocks: normalizedBlocks };
};

const splitParagraphs = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return [];
  return text
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);
};

export const QuestionText: React.FC<QuestionTextProps> = ({ text, as = 'div', className, variant = 'compact', answerMode }) => {
  const formatted = useMemo(() => formatQuestionForDisplay(String(text || ''), answerMode), [text, answerMode]);
  const Tag = as;
  const parsed = useMemo(() => {
    if (!shouldParseChoiceOptions(answerMode)) {
      return { stemText: formatted, options: [] as ParsedOption[] };
    }
    return parseQuestionBlocks(formatted);
  }, [formatted, answerMode]);
  const dedupedOptions = useMemo(() => dedupeOptionCycles(parsed.options), [parsed.options]);
  const subs = useMemo(() => parseSubQuestions(parsed.stemText), [parsed.stemText]);

  if (variant === 'compact') {
    return <MathText as={as} className={cn('whitespace-pre-wrap', className)} text={formatted} />;
  }

  return (
    <Tag className={cn('w-full', className)}>
      <div className="flex flex-col gap-4">
        {subs.introText ? (
          <div className="flex flex-col gap-3">
            {splitParagraphs(subs.introText).map((p, idx) => (
              <MathText
                key={idx}
                as="div"
                className="text-inherit leading-relaxed whitespace-pre-wrap"
                text={p}
              />
            ))}
          </div>
        ) : null}

        {subs.blocks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {subs.blocks.map((b) => (
              <div
                key={b.index}
                className="flex items-start gap-3 rounded-2xl bg-neu-bg shadow-neu-pressed p-3 border border-white/30"
              >
                <div className="shrink-0 h-8 w-8 rounded-full bg-neu-bg shadow-neu-flat flex items-center justify-center text-sm font-bold text-neu-text-secondary">
                  {b.index}
                </div>
                <MathText as="div" className="text-inherit leading-relaxed whitespace-pre-wrap" text={b.text} />
              </div>
            ))}
          </div>
        ) : null}

        {dedupedOptions.length > 0 ? (
          <div className="flex flex-col gap-2">
            {dedupedOptions.map((opt, idx) => (
              <div
                key={`${idx}-${opt.key}`}
                className="flex items-start gap-3 rounded-2xl bg-neu-bg shadow-neu-pressed p-3 border border-white/30"
              >
                <div className="shrink-0 h-8 w-8 rounded-full bg-neu-bg shadow-neu-flat flex items-center justify-center text-sm font-bold text-neu-text-secondary">
                  {opt.key}
                </div>
                <MathText
                  as="div"
                  className={cn(
                    'text-inherit leading-relaxed whitespace-pre-wrap',
                    opt.value ? '' : 'text-neu-text-secondary'
                  )}
                  text={opt.value || '（选项为图形，见题图或图示切片）'}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Tag>
  );
};
