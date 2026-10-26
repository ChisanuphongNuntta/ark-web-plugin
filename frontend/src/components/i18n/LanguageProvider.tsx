'use client';

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import english from '@/lib/i18n/en.json';

export type Language = 'th' | 'en';
const KEY = 'iris-language';
const EVENT = 'iris-language-change';
const dictionary = english as Record<string, string>;
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

function readLanguage(): Language {
  if (memoryOnly) return memoryLanguage;
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'th'; } catch { return memoryLanguage; }
}
let memoryLanguage: Language = 'th';
let memoryOnly = false;
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', callback);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener('storage', callback); };
}
function chooseLanguage(language: Language) {
  memoryLanguage = language;
  try { localStorage.setItem(KEY, language); memoryOnly = false; } catch { memoryOnly = true; }
  window.dispatchEvent(new Event(EVENT));
}

const LanguageContext = createContext({ language: 'th' as Language, setLanguage: chooseLanguage, t: (text: string, _fallback?: string) => text });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useSyncExternalStore(subscribe, readLanguage, () => 'th' as Language);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const value = useMemo(() => ({
    language,
    setLanguage: chooseLanguage,
    t: (text: string, fallback?: string) => {
      if (language === 'th') return text;
      const translated = dictionary[normalize(text)] ?? fallback;
      if (!translated) return text;
      return `${/^\s/.test(text) ? ' ' : ''}${translated}${/\s$/.test(text) ? ' ' : ''}`;
    },
  }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() { return useContext(LanguageContext); }

/** Only curated UI literals are translated; user content and game data stay untouched. */
export function T({ text, en }: { text: string; en?: string }) {
  const { t } = useLanguage();
  return <>{t(text, en)}</>;
}
