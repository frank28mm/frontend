const TAG_TRANSLATION_CACHE_KEY = 'knowledge_tag_en_cache_v1';
const CHINESE_RE = /[\u4e00-\u9fff]/;

let cacheLoaded = false;
let tagTranslationCache: Record<string, string> = {};
const inFlight = new Map<string, Promise<string | null>>();

export const hasChinese = (value: string): boolean => CHINESE_RE.test(value);

const normalize = (value: string): string => value.trim();

const loadCache = () => {
  if (cacheLoaded || typeof window === 'undefined') return;
  cacheLoaded = true;
  try {
    const raw = window.localStorage.getItem(TAG_TRANSLATION_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (parsed && typeof parsed === 'object') {
      tagTranslationCache = parsed;
    }
  } catch {
    tagTranslationCache = {};
  }
};

const persistCache = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TAG_TRANSLATION_CACHE_KEY, JSON.stringify(tagTranslationCache));
  } catch {
    // ignore storage quota errors
  }
};

const parseGoogleTranslateResponse = (payload: unknown): string => {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) return '';
  return payload[0]
    .map((row) => (Array.isArray(row) && typeof row[0] === 'string' ? row[0] : ''))
    .join('')
    .trim();
};

const requestTranslation = async (source: string): Promise<string | null> => {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=en&dt=t&q=' +
    encodeURIComponent(source);
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    const translated = parseGoogleTranslateResponse(payload);
    if (!translated || hasChinese(translated)) return null;
    return translated;
  } catch {
    return null;
  }
};

export const getCachedEnglishTagLabel = (source: string): string | null => {
  loadCache();
  const key = normalize(source);
  if (!key) return null;
  return tagTranslationCache[key] || null;
};

const translateOne = async (source: string): Promise<string | null> => {
  const key = normalize(source);
  if (!key) return null;

  loadCache();
  const cached = tagTranslationCache[key];
  if (cached) return cached;

  if (inFlight.has(key)) {
    return inFlight.get(key) || null;
  }

  const promise = requestTranslation(key).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);

  const translated = await promise;
  if (!translated) return null;

  tagTranslationCache[key] = translated;
  persistCache();
  return translated;
};

export const translateAndCacheTagLabels = async (
  sources: string[]
): Promise<Record<string, string>> => {
  loadCache();
  const candidates = Array.from(
    new Set(
      sources
        .map((value) => normalize(value))
        .filter((value) => value && hasChinese(value) && !tagTranslationCache[value])
    )
  );

  const updates: Record<string, string> = {};
  for (const source of candidates) {
    const translated = await translateOne(source);
    if (translated) {
      updates[source] = translated;
    }
  }
  return updates;
};
