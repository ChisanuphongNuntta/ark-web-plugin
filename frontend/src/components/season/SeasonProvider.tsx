'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { siteApi } from '@/lib/contracts/console';
import type { SiteAnnouncement, SiteSettings } from '@/lib/contracts/types';
import {
  SEASON_CACHE_KEY,
  SEASON_COPY,
  applySeasonThemeColor,
  isSeason,
  resolveAutoSeason,
  type Season,
  type SeasonCopy,
  type SeasonSetting,
} from './seasons';

export const SITE_SETTINGS_QUERY_KEY = ['site', 'settings'] as const;

export interface SeasonContextValue {
  /** The season the UI is rendering right now (preview > API > fallback). */
  season: Season;
  /** Copy for `season` (hero, ribbon, label). */
  copy: SeasonCopy;
  /** Stored admin setting, or 'auto' when unknown. */
  setting: SeasonSetting;
  /** Admin announcement shown in the ribbon (overrides season copy). */
  announcement: SiteAnnouncement | null;
  /** Where `season` came from. */
  source: 'api' | 'fallback' | 'boot' | 'preview';
  isLoading: boolean;
  /** Local-only preview (admin settings page). `null` clears it. Not persisted. */
  setPreviewSeason: (season: Season | null) => void;
  previewSeason: Season | null;
}

const SeasonContext = React.createContext<SeasonContextValue | null>(null);

const noopSubscribe = () => () => {};

/** Season already applied to <html> by the bootstrap script (client) or 'default' (server). */
function readBootSeason(): Season {
  const value = document.documentElement.getAttribute('data-season');
  return isSeason(value) ? value : 'default';
}

function writeCache(settings: SiteSettings) {
  try {
    window.localStorage.setItem(
      SEASON_CACHE_KEY,
      JSON.stringify({ setting: settings.season, active: settings.activeSeason })
    );
  } catch {
    /* storage unavailable (private mode, blocked) — the date rule still applies */
  }
}

export function SeasonProvider({ children }: { children: React.ReactNode }) {
  const query = useQuery({
    queryKey: SITE_SETTINGS_QUERY_KEY,
    queryFn: siteApi.getSettings,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  const bootSeason = React.useSyncExternalStore(noopSubscribe, readBootSeason, () => 'default' as Season);
  const fallbackSeason = React.useSyncExternalStore(
    noopSubscribe,
    () => resolveAutoSeason(new Date()),
    () => 'default' as Season
  );
  const [previewSeason, setPreviewSeason] = React.useState<Season | null>(null);

  const settings = query.data;
  let season: Season;
  let source: SeasonContextValue['source'];
  if (previewSeason) {
    season = previewSeason;
    source = 'preview';
  } else if (settings) {
    season = settings.activeSeason;
    source = 'api';
  } else if (query.isError) {
    season = fallbackSeason;
    source = 'fallback';
  } else {
    season = bootSeason;
    source = 'boot';
  }

  // Apply to <html>. 'default' removes the attribute so :root tokens apply.
  React.useEffect(() => {
    const root = document.documentElement;
    if (season === 'default') root.removeAttribute('data-season');
    else root.setAttribute('data-season', season);
    applySeasonThemeColor(season);
  }, [season]);

  React.useEffect(() => {
    if (settings) writeCache(settings);
  }, [settings]);

  const value = React.useMemo<SeasonContextValue>(
    () => ({
      season,
      copy: SEASON_COPY[season],
      setting: settings?.season ?? 'auto',
      announcement: settings?.announcement ?? null,
      source,
      isLoading: query.isLoading,
      previewSeason,
      setPreviewSeason,
    }),
    [season, settings, source, query.isLoading, previewSeason]
  );

  return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>;
}

/** Current season, copy and announcement. Must be used under <SeasonProvider>. */
export function useSeason(): SeasonContextValue {
  const ctx = React.useContext(SeasonContext);
  if (!ctx) {
    throw new Error('useSeason() must be used inside <SeasonProvider>');
  }
  return ctx;
}
