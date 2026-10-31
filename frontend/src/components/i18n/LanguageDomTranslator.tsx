'use client';

import { useEffect } from 'react';
import { THAI, translateText } from '@/lib/i18n/translate';
import type { Language } from './LanguageProvider';

const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'] as const;
// Text nodes inside these are never touched; attributes (a textarea's placeholder, say) are still translated.
const SKIP_TEXT = 'script,style,noscript,textarea,code,pre,[translate="no"],[contenteditable="true"]';
const SKIP_ATTR = 'script,style,noscript,[translate="no"]';

// Original Thai text of every node or attribute we replaced, so switching back restores it exactly.
const textOriginals = new WeakMap<Text, string>();
const attrOriginals = new WeakMap<Element, Map<string, string>>();

function translateTextNode(node: Text) {
  const value = node.nodeValue ?? '';
  if (!THAI.test(value)) return;
  if (node.parentElement?.closest(SKIP_TEXT)) return;
  const next = translateText(value);
  if (next === value) return;
  textOriginals.set(node, value);
  node.nodeValue = next;
}

function translateAttrs(el: Element) {
  if (el.closest(SKIP_ATTR)) return;
  for (const name of ATTRS) {
    const value = el.getAttribute(name);
    if (!value || !THAI.test(value)) continue;
    const next = translateText(value);
    if (next === value) continue;
    const saved = attrOriginals.get(el) ?? new Map<string, string>();
    saved.set(name, value);
    attrOriginals.set(el, saved);
    el.setAttribute(name, next);
  }
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  translateAttrs(el);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) translateTextNode(n as Text);
    else translateAttrs(n as Element);
  }
}

function restoreTree(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const original = textOriginals.get(n as Text);
      if (original !== undefined) { (n as Text).nodeValue = original; textOriginals.delete(n as Text); }
    } else {
      const saved = attrOriginals.get(n as Element);
      if (saved) { saved.forEach((value, name) => (n as Element).setAttribute(name, value)); attrOriginals.delete(n as Element); }
    }
  }
}

/**
 * Most pages hold Thai literals that are not wrapped in <T>. In English mode this walks the document once and keeps
 * watching for changes, replacing only text that matches the curated dictionary or a template; anything else
 * (product names, user content) is left alone. Switching back to Thai restores the saved originals.
 */
export function LanguageDomTranslator({ language }: { language: Language }) {
  useEffect(() => {
    if (language !== 'en') return;
    translateTree(document.body);
    let queue: Node[] = [];
    let frame = 0;
    const flush = () => {
      frame = 0;
      const batch = queue; queue = [];
      for (const node of batch) if (node.isConnected) translateTree(node);
    };
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'childList') r.addedNodes.forEach((n) => queue.push(n));
        else queue.push(r.target);
      }
      if (!frame) frame = window.requestAnimationFrame(flush);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      restoreTree(document.body);
    };
  }, [language]);
  return null;
}
