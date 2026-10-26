'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/components/i18n/LanguageProvider';

/** Live countdown to a Bangkok-time target. Renders zeros on the server to avoid hydration drift. */
export function TekCountdown({ target, label }: { target: string; label: string }) {
  const { t } = useLanguage();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const goal = Date.parse(target);
    const tick = () => setLeft(Math.max(0, Math.floor((goal - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  const s = left ?? 0;
  const cells = [
    { v: Math.floor(s / 86400), l: t('วัน', 'Days') },
    { v: Math.floor((s % 86400) / 3600), l: t('ชั่วโมง', 'Hours') },
    { v: Math.floor((s % 3600) / 60), l: t('นาที', 'Min') },
    { v: s % 60, l: t('วินาที', 'Sec') },
  ];

  return (
    <div className="tk-countdown" role="timer" aria-label={label}>
      <span className="lbl">{label}</span>
      {cells.map((c) => (
        <div key={c.l} className="tk-hex" style={{ ['--hx-line' as string]: 'rgba(226,194,122,.55)', ['--hx-bg' as string]: 'rgba(10,12,18,.92)' }}>
          <b className="tk-mono">{String(c.v).padStart(2, '0')}</b>
          <small>{c.l}</small>
        </div>
      ))}
    </div>
  );
}
