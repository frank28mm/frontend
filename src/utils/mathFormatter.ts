import katex from 'katex';

type Token =
  | { type: 'text'; content: string }
  | { type: 'math'; content: string; display: boolean };

const stripBackticks = (input: string) => String(input || '').replace(/`+/g, '');
const FORM_FEED = String.fromCharCode(12);
const BACKSPACE = String.fromCharCode(8);
const repairCorruptedLatexEscapes = (input: string) =>
  String(input || '')
    .replaceAll(FORM_FEED, '\\f')
    .replaceAll(BACKSPACE, '\\b')
    .replace(/\t(?=(?:riangle|ext|imes|heta|frac)\b)/g, '\\t')
    .replace(/\r(?=(?:ight)\b)/g, '\\r');
const BARE_LATEX_COMMAND_RE =
  /\\(?:boldsymbol|frac|dfrac|tfrac|geqslant|leqslant|geq|leq|neq|approx|times|cdot|div|sqrt|left|right|sum|prod|int|alpha|beta|gamma|theta|pi|text|mathrm|operatorname)\b/;
const BARE_LATEX_COMMAND_GLOBAL_RE =
  /\\(?:boldsymbol|frac|dfrac|tfrac|geqslant|leqslant|geq|leq|neq|approx|times|cdot|div|sqrt|left|right|sum|prod|int|alpha|beta|gamma|theta|pi|text|mathrm|operatorname)\b/g;
const CJK_RE = /[\u3400-\u9fff]/;
const LATEX_RUN_CHAR_RE = /[A-Za-z0-9\\{}[\]()^_+\-*/=<>|.,:;!?\s≤≥≠±×÷·]/;

const escapeHtml = (input: string) => {
  return (input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const renderTextHtml = (text: string) => {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\r?\n/g, '<br>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
};

/**
 * Convert LaTeX delimiters to a unified form:
 * - \\[ ... \\] → $$...$$ (display math)
 * - \\( ... \\) → $...$ (inline math)
 * Also handles LLM output quirks like backslash + newline + paren
 */
export const formatLatexDelimiters = (text: string): string => {
  if (!text) return '';

  return String(text)
    // Handle LLM quirk: backslash + whitespace/newline + paren → proper delimiter
    .replace(/\\\s*\n\s*\[/g, '$$$$')
    .replace(/\\\s*\n\s*\]/g, '$$$$')
    .replace(/\\\s*\n\s*\(/g, '$')
    .replace(/\\\s*\n\s*\)/g, '$')
    .replace(/\\\[/g, '$$$$')
    .replace(/\\\]/g, '$$$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
};

const wrapBareLatexInPlainText = (input: string): string => {
  const text = String(input || '');
  if (!text || !BARE_LATEX_COMMAND_RE.test(text)) return text;

  const ranges: Array<{ start: number; end: number }> = [];
  for (const match of text.matchAll(BARE_LATEX_COMMAND_GLOBAL_RE)) {
    const matchIndex = typeof match.index === 'number' ? match.index : -1;
    if (matchIndex < 0) continue;

    let start = matchIndex;
    while (start > 0) {
      const ch = text[start - 1];
      if (ch === '\n' || CJK_RE.test(ch) || !LATEX_RUN_CHAR_RE.test(ch)) break;
      start -= 1;
    }

    let end = matchIndex + String(match[0] || '').length;
    while (end < text.length) {
      const ch = text[end];
      if (ch === '\n' || CJK_RE.test(ch) || !LATEX_RUN_CHAR_RE.test(ch)) break;
      end += 1;
    }

    while (start < end && /\s/.test(text[start])) start += 1;
    while (end > start && /\s/.test(text[end - 1])) end -= 1;
    if (end <= start) continue;
    const candidate = text.slice(start, end);
    if (!candidate || CJK_RE.test(candidate) || !BARE_LATEX_COMMAND_RE.test(candidate)) {
      continue;
    }
    ranges.push({ start, end });
  }

  if (!ranges.length) return text;

  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges.sort((left, right) => left.start - right.start)) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      continue;
    }
    merged.push({ ...range });
  }

  let cursor = 0;
  let out = '';
  for (const range of merged) {
    out += text.slice(cursor, range.start);
    const raw = text.slice(range.start, range.end);
    const leading = raw.match(/^\s*/)?.[0] ?? '';
    const trailing = raw.match(/\s*$/)?.[0] ?? '';
    const core = raw.trim().replace(/\s+([.,;:!?])/g, '$1');
    out += `${leading}$${core}$${trailing}`;
    cursor = range.end;
  }
  out += text.slice(cursor);
  return out;
};

const normalizeBareLatexOutsideMath = (input: string): string => {
  const text = String(input || '');
  if (!text || !BARE_LATEX_COMMAND_RE.test(text)) return text;

  let out = '';
  let cursor = 0;
  while (cursor < text.length) {
    const nextDollar = text.indexOf('$', cursor);
    if (nextDollar === -1) {
      out += wrapBareLatexInPlainText(text.slice(cursor));
      break;
    }

    out += wrapBareLatexInPlainText(text.slice(cursor, nextDollar));
    const isDouble = text.startsWith('$$', nextDollar);
    const openLen = isDouble ? 2 : 1;
    const close = isDouble ? '$$' : '$';
    const closeIdx = text.indexOf(close, nextDollar + openLen);
    if (closeIdx === -1) {
      out += text.slice(nextDollar);
      break;
    }
    out += text.slice(nextDollar, closeIdx + openLen);
    cursor = closeIdx + openLen;
  }

  return out;
};

export const normalizeMathText = (text: string): string => {
  if (!text) return '';
  const normalized = normalizeBareLatexOutsideMath(
    stripBackticks(formatLatexDelimiters(repairCorruptedLatexEscapes(text)))
  );
  const trimmed = normalized.trim();
  if (!trimmed || trimmed.includes('$')) return normalized;
  if (CJK_RE.test(trimmed)) return normalized;
  if (!BARE_LATEX_COMMAND_RE.test(trimmed)) return normalized;
  return `$${trimmed}$`;
};

const tokenizeMath = (raw: string): Token[] => {
  const tokens: Token[] = [];
  const text = raw || '';
  let i = 0;

  const pushText = (start: number, end: number) => {
    if (end <= start) return;
    tokens.push({ type: 'text', content: text.slice(start, end) });
  };

  while (i < text.length) {
    const nextDollar = text.indexOf('$', i);
    if (nextDollar === -1) {
      pushText(i, text.length);
      break;
    }

    pushText(i, nextDollar);

    const isDouble = text.startsWith('$$', nextDollar);
    const openLen = isDouble ? 2 : 1;
    const close = isDouble ? '$$' : '$';
    const closeIdx = text.indexOf(close, nextDollar + openLen);

    if (closeIdx === -1) {
      tokens.push({ type: 'text', content: text.slice(nextDollar) });
      break;
    }

    const content = text.slice(nextDollar + openLen, closeIdx);
    tokens.push({ type: 'math', content, display: isDouble });
    i = closeIdx + openLen;
  }

  return tokens;
};

export const renderMathHtml = (text: string): string => {
  if (!text) return '';
  const formatted = normalizeMathText(text);
  const tokens = tokenizeMath(formatted);

  return tokens
    .map((t) => {
      if (t.type === 'text') return renderTextHtml(t.content);
      const latex = (t.content || '').trim();
      if (!latex) return '';
      // Render with KaTeX
      const katexHtml = katex.renderToString(latex, {
        displayMode: t.display,
        throwOnError: false,
        strict: 'ignore',
        output: 'html',
      });
      const wrapperClass = t.display
        ? 'my-1 block max-w-full overflow-x-auto text-inherit'
        : 'inline-flex max-w-full items-center align-middle text-inherit';
      return `<span class="${wrapperClass}">${katexHtml}</span>`;
    })
    .join('');
};
