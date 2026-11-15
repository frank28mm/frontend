import type { AppLanguage } from '@/i18n/types';
import { translateText } from '@/i18n/translator';

const TRACKED_ATTRS = ['placeholder', 'title', 'aria-label', 'aria-description', 'alt'] as const;
const SKIP_PARENT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE']);

const originalTextNodeMap = new WeakMap<Text, string>();
const originalAttrMap = new WeakMap<Element, Map<string, string>>();

const getAttrCache = (element: Element): Map<string, string> => {
  let cache = originalAttrMap.get(element);
  if (!cache) {
    cache = new Map<string, string>();
    originalAttrMap.set(element, cache);
  }
  return cache;
};

const applyTextNode = (node: Text, language: AppLanguage) => {
  const parentTag = node.parentElement?.tagName;
  if (parentTag && SKIP_PARENT_TAGS.has(parentTag)) return;

  if (!originalTextNodeMap.has(node)) {
    originalTextNodeMap.set(node, node.nodeValue ?? '');
  }
  const original = originalTextNodeMap.get(node) ?? '';
  const next = language === 'en' ? translateText(original, 'en') : original;

  if (node.nodeValue !== next) {
    node.nodeValue = next;
  }
};

const applyElementAttrs = (element: Element, language: AppLanguage) => {
  const cache = getAttrCache(element);

  for (const attr of TRACKED_ATTRS) {
    if (!element.hasAttribute(attr)) continue;

    if (!cache.has(attr)) {
      cache.set(attr, element.getAttribute(attr) ?? '');
    }

    const original = cache.get(attr) ?? '';
    const next = language === 'en' ? translateText(original, 'en') : original;
    if ((element.getAttribute(attr) ?? '') !== next) {
      element.setAttribute(attr, next);
    }
  }
};

const applyNodeTree = (node: Node, language: AppLanguage) => {
  if (node.nodeType === Node.TEXT_NODE) {
    applyTextNode(node as Text, language);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  applyElementAttrs(element, language);

  element.childNodes.forEach((child) => applyNodeTree(child, language));
};

export const startDomTranslator = (language: AppLanguage): (() => void) => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) {
    return () => {};
  }

  let disposed = false;
  let applying = false;

  const syncOriginalFromMutation = (mutation: MutationRecord) => {
    // IMPORTANT:
    // React frequently updates dynamic text nodes (numbers, timers, counters).
    // If we keep the *first seen* text as "original" forever, the translator will
    // overwrite subsequent React updates back to the old value.
    //
    // We only sync the cache from MutationObserver callbacks (i.e., changes made
    // outside the translator), because translator-originated changes are guarded
    // by `applying` and won't reach here.
    if (mutation.type === 'characterData') {
      const node = mutation.target;
      if (node && node.nodeType === Node.TEXT_NODE) {
        originalTextNodeMap.set(node as Text, (node as Text).nodeValue ?? '');
      }
      return;
    }

    if (mutation.type === 'attributes') {
      const el = mutation.target as Element;
      const attrName = mutation.attributeName;
      if (!el || !attrName) return;
      if (!TRACKED_ATTRS.includes(attrName as (typeof TRACKED_ATTRS)[number])) return;
      getAttrCache(el).set(attrName, el.getAttribute(attrName) ?? '');
    }
  };

  const applyAll = (root: Node = document.body) => {
    if (disposed) return;
    applying = true;
    try {
      applyNodeTree(root, language);
    } finally {
      applying = false;
    }
  };

  applyAll(document.body);

  const observer = new MutationObserver((mutations) => {
    if (disposed || applying) return;

    for (const mutation of mutations) {
      syncOriginalFromMutation(mutation);
      if (mutation.type === 'characterData') {
        applyAll(mutation.target);
      } else if (mutation.type === 'attributes') {
        applyAll(mutation.target);
      } else {
        mutation.addedNodes.forEach((added) => applyAll(added));
      }
    }
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...TRACKED_ATTRS],
  });

  return () => {
    disposed = true;
    observer.disconnect();
  };
};
