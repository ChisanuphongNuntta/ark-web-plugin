/**
 * Seasonal theming. Import from '@/components/season'.
 *
 * - <SeasonProvider> (mounted in app/layout.tsx) fetches GET /site/settings,
 *   sets <html data-season>, falls back to the date rule if the API fails.
 * - useSeason() → { season, copy, setting, announcement, source, previewSeason, setPreviewSeason }
 * - SEASON_COPY[season].hero → eyebrow / title / subtitle / CTAs for the home hero.
 */
export { SeasonProvider, useSeason, SITE_SETTINGS_QUERY_KEY } from './SeasonProvider';
export type { SeasonContextValue } from './SeasonProvider';
export { SeasonRibbon } from './SeasonRibbon';
export { SeasonGlyph, SeasonOrnament, SeasonArtwork } from './SeasonOrnament';
export {
  SEASONS,
  SEASON_SETTINGS,
  SEASON_COPY,
  SEASON_SETTING_LABELS,
  SEASON_BOOTSTRAP_SCRIPT,
  SEASON_CACHE_KEY,
  resolveAutoSeason,
  resolveSeason,
  easterSunday,
  bangkokDate,
  isSeason,
} from './seasons';
export type { Season, SeasonSetting, SeasonCopy } from './seasons';
