'use client';

import { useLanguage } from './LanguageProvider';

export function LanguageSwitcher({ expanded = false }: { expanded?: boolean }) {
  const { language, setLanguage } = useLanguage();
  return (
    <>
      <div role="group" aria-label="Language / ภาษา" className={`${expanded ? 'flex' : 'hidden sm:flex'} items-center rounded-full border border-cyan-300/20 bg-surface-1 p-1`}>
        {(['th', 'en'] as const).map((locale) => <button key={locale} type="button" lang={locale} aria-label={locale === 'th' ? 'ภาษาไทย' : 'English'} aria-pressed={language === locale} onClick={() => setLanguage(locale)} className={`min-h-9 min-w-9 rounded-full px-2 text-[10px] font-bold tracking-wide transition-colors ${language === locale ? 'bg-cyan-100 text-slate-950' : 'text-slate-400 hover:text-white'}`}>{locale.toUpperCase()}</button>)}
      </div>
      {!expanded && <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-cyan-300/25 text-[11px] font-semibold text-cyan-100 sm:hidden" aria-label={language === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'} title="TH / EN" onClick={() => setLanguage(language === 'th' ? 'en' : 'th')}>{language.toUpperCase()}</button>}
    </>
  );
}
