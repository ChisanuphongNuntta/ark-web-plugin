import english from './en.json';
import patternList from './patterns.json';

const dictionary = english as Record<string, string>;
const patterns = (patternList as { re: string; en: string }[]).map((p) => ({ re: new RegExp(p.re), en: p.en }));

export const THAI = /[฀-๿]/;
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Exact dictionary hit, else a template such as "ดูรายละเอียดและซื้อ {name}". Returns null when nothing matches. */
function lookup(core: string): string | null {
  const hit = dictionary[core];
  if (hit) return hit;
  for (const { re, en } of patterns) {
    const m = re.exec(core);
    if (!m) continue;
    // captured pieces (a month name, a product name) are translated too when they are known
    return en.replace(/\$(\d)/g, (_, n) => {
      const part = m[Number(n)] ?? '';
      return dictionary[normalize(part)] ?? part;
    });
  }
  return null;
}

/** Translate one UI literal to English. Unknown text is returned unchanged, so user content stays as written. */
export function translateText(text: string, fallback?: string): string {
  const core = normalize(text);
  const translated = lookup(core) ?? fallback;
  if (!translated) return text;
  return `${/^\s/.test(text) ? ' ' : ''}${translated}${/\s$/.test(text) ? ' ' : ''}`;
}
