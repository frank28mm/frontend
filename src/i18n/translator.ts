import { GENERATED_EN_MAP } from '@/i18n/generated-en';
import { EN_OVERRIDES, EN_PARTIAL_REPLACEMENTS } from '@/i18n/overrides';
import type { AppLanguage } from '@/i18n/types';

const HAS_CHINESE_RE = /[\u4e00-\u9fff]/;

const EXACT_MAP: Record<string, string> = {
  ...GENERATED_EN_MAP,
  ...EN_OVERRIDES,
};

const PARTIAL_ENTRIES = Object.entries(EN_PARTIAL_REPLACEMENTS).sort(
  (a, b) => b[0].length - a[0].length
);

const applyDynamicRules = (value: string): string => {
  let out = value;

  out = out.replace(
    /^第\s*(\d+)\s*\/\s*(\d+)\s*页$/,
    (_m, current: string, total: string) => `Page ${current}/${total}`
  );
  out = out.replace(/^第\s*(\d+)\s*页$/, (_m, page: string) => `Page ${page}`);
  out = out.replace(
    /^共\s*(\d+)\s*题\s*·\s*错\s*(\d+)\s*·\s*待定\s*(\d+)$/,
    (_m, total: string, wrong: string, pending: string) =>
      `${total}Q · W${wrong} · P${pending}`
  );
  out = out.replace(
    /^今天\s*(\d{1,2})月(\d{1,2})日$/,
    (_m, month: string, day: string) => `Today ${month}/${day}`
  );
  out = out.replace(
    /^昨天\s*(\d{1,2})月(\d{1,2})日$/,
    (_m, month: string, day: string) => `Yesterday ${month}/${day}`
  );
  out = out.replace(
    /^(\d{1,2})月(\d{1,2})日$/,
    (_m, month: string, day: string) => `${month}/${day}`
  );
  out = out.replace(
    /^(\d{4})年\s*(\d{1,2})月$/,
    (_m, year: string, month: string) => `${year}-${month.padStart(2, '0')}`
  );
  out = out.replace(
    /^选择第\s*(\d+)\s*张$/,
    (_m, index: string) => `Select Image ${index}`
  );
  out = out.replace(/^已切换到：\s*(.+)$/, (_m, name: string) => `Switched to: ${name}`);
  out = out.replace(/^上传失败：\s*(.+)$/, (_m, reason: string) => `Upload failed: ${reason}`);
  out = out.replace(
    /^操作失败：\s*(.+)$/,
    (_m, reason: string) => `Operation failed: ${reason}`
  );
  out = out.replace(/^请求失败：\s*(.+)$/, (_m, reason: string) => `Request failed: ${reason}`);
  out = out.replace(
    /^激活成功！获得\s*(.+)$/,
    (_m, reward: string) => `Activated successfully! Reward: ${reward}`
  );
  out = out.replace(
    /^AI 服务返回异常（(\d+)）(.+)$/,
    (_m, code: string, tail: string) => `AI service returned error (${code})${tail}`
  );

  return out;
};

const translateCore = (value: string): string => {
  if (!value || !HAS_CHINESE_RE.test(value)) return value;

  const exact = EXACT_MAP[value];
  if (exact) return exact;

  let out = applyDynamicRules(value);
  if (EXACT_MAP[out]) return EXACT_MAP[out];

  for (const [from, to] of PARTIAL_ENTRIES) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
    }
  }

  return EXACT_MAP[out] || out;
};

export const translateText = (input: string, language: AppLanguage): string => {
  if (language !== 'en' || !input || !HAS_CHINESE_RE.test(input)) return input;

  const leading = input.match(/^\s*/)?.[0] || '';
  const trailing = input.match(/\s*$/)?.[0] || '';
  const core = input.slice(leading.length, input.length - trailing.length);
  if (!core) return input;

  return `${leading}${translateCore(core)}${trailing}`;
};

export const translateUnknown = (input: unknown, language: AppLanguage): unknown => {
  if (typeof input !== 'string') return input;
  return translateText(input, language);
};
