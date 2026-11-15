export type QuestionNumberKey = {
  base: number;
  sub: number;
  text: string;
};

export const parseQuestionNumberKey = (raw: unknown): QuestionNumberKey => {
  const text = String(raw ?? '').trim();
  const m = text.match(/^(\d+)(?:\s*[(（](\d+)[)）])?\s*$/);
  if (m) {
    return {
      base: Number.parseInt(m[1] || '0', 10),
      sub: Number.parseInt(m[2] || '0', 10),
      text,
    };
  }

  const m2 = text.match(/(\d+)/);
  if (m2) {
    return {
      base: Number.parseInt(m2[1] || '0', 10),
      sub: 0,
      text,
    };
  }

  return { base: Number.POSITIVE_INFINITY, sub: Number.POSITIVE_INFINITY, text };
};

export const compareQuestionNumbers = (a: unknown, b: unknown): number => {
  const ka = parseQuestionNumberKey(a);
  const kb = parseQuestionNumberKey(b);

  if (ka.base !== kb.base) return ka.base - kb.base;
  if (ka.sub !== kb.sub) return ka.sub - kb.sub;
  return ka.text.localeCompare(kb.text);
};

