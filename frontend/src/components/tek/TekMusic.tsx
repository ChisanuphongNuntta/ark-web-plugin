'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Music, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useLanguage } from '@/components/i18n/LanguageProvider';

const STORAGE_KEY = 'iris-music-v1';
const SNOW_KEY = 'iris-snow-v1';
const SRC = '/audio/ark-iris-happy-xmas-remix-v1.mp3';
const DEFAULT_VOLUME = 0.3;

type Saved = { on: boolean; volume: number };

function readSaved(): Saved {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>;
      return {
        on: parsed.on !== false,
        volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULT_VOLUME,
      };
    }
  } catch {
    /* storage unavailable: fall through to defaults */
  }
  return { on: true, volume: DEFAULT_VOLUME };
}

function writeSaved(next: Saved) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/**
 * Original instrumental ("ARK IRIS Happy Xmas Remix"), bottom-left. Browsers block sound until the
 * visitor interacts, so playback starts on the first tap/click unless they switched it off.
 */
export function TekMusic() {
  const { t } = useLanguage();
  const audioRef = useRef<HTMLAudioElement>(null);
  const wantsOn = useRef(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [open, setOpen] = useState(false);
  const [snow, setSnow] = useState(true);

  const start = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return false;
    try {
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    try { setSnow(window.localStorage.getItem(SNOW_KEY) !== 'off'); } catch { /* default on */ }
    const saved = readSaved();
    wantsOn.current = saved.on;
    setVolume(saved.volume);
    if (audioRef.current) audioRef.current.volume = saved.volume;
    if (!saved.on) return;

    let cancelled = false;
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchend'];
    const cleanup = () => events.forEach((e) => window.removeEventListener(e, onGesture));
    async function onGesture(event: Event) {
      if (cancelled || !wantsOn.current) return;
      // A tap on the music button itself is handled by its own toggle, not by autostart.
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      if (await start()) cleanup();
    }
    start().then((ok) => {
      if (!ok && !cancelled) events.forEach((e) => window.addEventListener(e, onGesture, { passive: true }));
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [start]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      wantsOn.current = true;
      writeSaved({ on: true, volume });
      await start();
    } else {
      wantsOn.current = false;
      writeSaved({ on: false, volume });
      audio.pause();
    }
  };

  const toggleSnow = () => {
    const next = !snow;
    setSnow(next);
    try { window.localStorage.setItem(SNOW_KEY, next ? 'on' : 'off'); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('iris-snow-change', { detail: next }));
  };

  const changeVolume = (value: number) => {
    setVolume(value);
    writeSaved({ on: wantsOn.current, volume: value });
  };

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const label = playing ? t('หยุดเพลง', 'Pause music') : t('เปิดเพลง', 'Play music');
  const percent = Math.round(volume * 100);

  return (
    <div ref={rootRef} className={`tk-music${open ? ' open' : ''}${playing ? ' playing' : ''}`}>
      <audio ref={audioRef} src={SRC} loop preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
      <button
        type="button"
        className="tk-music-btn"
        onClick={toggle}
        onFocus={() => setOpen(true)}
        aria-pressed={playing}
        aria-label={label}
        title={label}
      >
        <Music size={20} aria-hidden="true" />
        <span className="tk-eq" aria-hidden="true"><i /><i /><i /><i /></span>
      </button>
      <div className="tk-music-panel" role="group" aria-label={t('ควบคุมเสียงเพลง', 'Music controls')}>
        <div className="tk-music-title">
          <b>ARK IRIS Happy Xmas Remix</b>
          <small>{playing ? t('กำลังเล่น', 'Now playing') : t('หยุดอยู่', 'Paused')}</small>
        </div>
        <label className="tk-music-vol">
          <VolumeIcon size={16} aria-hidden="true" />
          <span className="tk-sr">{t('ระดับเสียง', 'Volume')}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={percent}
            onChange={(event) => changeVolume(Number(event.target.value) / 100)}
            aria-valuetext={`${percent}%`}
            style={{ ['--p' as string]: `${percent}%` }}
          />
          <output className="tk-mono">{percent}</output>
        </label>
        <button type="button" className="tk-snow-toggle" aria-pressed={snow} onClick={toggleSnow}>
          <span>{t('หิมะตก', 'Snowfall')}</span>
          <b>{snow ? t('เปิด', 'On') : t('ปิด', 'Off')}</b>
        </button>
      </div>
    </div>
  );
}
