// Site-wide settings (UI redesign 2026-10): seasonal theme + announcement banner +
// server-directory status pages. Stored as SiteSetting key/value rows.
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import {
  SEASON_SETTINGS,
  SeasonSetting,
  ActiveSeason,
  isSeasonSetting,
  resolveActiveSeason,
} from './season.service.js';

export const SITE_SETTING_KEYS = {
  season: 'season',
  announcement: 'announcement',
  directoryStatusPages: 'directory.statusPages',
} as const;

// Default status pages from the legacy site (seed-data/server-directory.json).
export const DEFAULT_STATUS_PAGES: readonly string[] = [
  'https://ark-status.iris-th.cloud/status/ark-pve-10',
  'https://ark-status.iris-th.cloud/status/ark-pve-20',
  'https://ark-status.iris-th.cloud/status/ark-pvp-10',
];

export interface Announcement {
  text: string;
  href?: string;
}

export interface SiteSettingsResponse {
  season: SeasonSetting;
  activeSeason: ActiveSeason;
  announcement: Announcement | null;
}

// href must be an https URL or a same-site absolute path. Blocks javascript:/data: etc.
const hrefSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine(
    (value) => (value.startsWith('/') && !value.startsWith('//')) || /^https:\/\/[^\s]+$/i.test(value),
    { message: 'href must be an https:// URL or a path starting with /' },
  );

export const announcementSchema = z
  .object({
    text: z.string().trim().min(1).max(280),
    href: hrefSchema.optional(),
  })
  .strict();

export const updateSiteSettingsSchema = z
  .object({
    season: z.enum(SEASON_SETTINGS).optional(),
    announcement: announcementSchema.nullable().optional(),
  })
  .strict()
  .refine((body) => body.season !== undefined || body.announcement !== undefined, {
    message: 'Provide at least one of: season, announcement',
  });

export type UpdateSiteSettingsInput = z.infer<typeof updateSiteSettingsSchema>;

export function parseUpdateSiteSettings(body: unknown): UpdateSiteSettingsInput {
  const parsed = updateSiteSettingsSchema.safeParse(body ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new AppError(`Invalid site settings: ${message}`, 400);
  }
  return parsed.data;
}

// Tolerant readers: a malformed stored value degrades to the safe default instead of 500ing
// the public endpoint.
function readSeason(value: unknown): SeasonSetting {
  return isSeasonSetting(value) ? value : 'auto';
}

function readAnnouncement(value: unknown): Announcement | null {
  if (value === null || value === undefined) return null;
  const parsed = announcementSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.href ? { text: parsed.data.text, href: parsed.data.href } : { text: parsed.data.text };
}

export function buildSiteSettings(
  rows: Array<{ key: string; value: unknown }>,
  now: Date = new Date(),
): SiteSettingsResponse {
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const season = readSeason(map.get(SITE_SETTING_KEYS.season));
  return {
    season,
    activeSeason: resolveActiveSeason(season, now),
    announcement: readAnnouncement(map.get(SITE_SETTING_KEYS.announcement)),
  };
}

export function readStatusPages(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_STATUS_PAGES];
  return value.filter((entry): entry is string => typeof entry === 'string' && /^https:\/\//i.test(entry));
}

class SiteSettingsService {
  async get(now: Date = new Date()): Promise<SiteSettingsResponse> {
    const rows = await prisma.siteSetting.findMany({
      where: { key: { in: [SITE_SETTING_KEYS.season, SITE_SETTING_KEYS.announcement] } },
    });
    return buildSiteSettings(rows, now);
  }

  async getStatusPages(): Promise<string[]> {
    const row = await prisma.siteSetting.findUnique({ where: { key: SITE_SETTING_KEYS.directoryStatusPages } });
    return readStatusPages(row?.value);
  }

  // Returns the previous and next public shape so the caller can audit the change.
  async update(input: UpdateSiteSettingsInput, actorId: string, now: Date = new Date()) {
    const before = await this.get(now);
    await prisma.$transaction(async (tx) => {
      if (input.season !== undefined) {
        await tx.siteSetting.upsert({
          where: { key: SITE_SETTING_KEYS.season },
          create: { key: SITE_SETTING_KEYS.season, value: input.season, updatedById: actorId },
          update: { value: input.season, updatedById: actorId },
        });
      }
      if (input.announcement !== undefined) {
        // A cleared announcement is stored as JSON null (Prisma.JsonNull), not SQL NULL.
        await tx.siteSetting.upsert({
          where: { key: SITE_SETTING_KEYS.announcement },
          create: { key: SITE_SETTING_KEYS.announcement, value: input.announcement ?? JSON_NULL, updatedById: actorId },
          update: { value: input.announcement ?? JSON_NULL, updatedById: actorId },
        });
      }
    });
    const after = await this.get(now);
    return { before, after };
  }
}

const JSON_NULL = Prisma.JsonNull;

export const siteSettingsService = new SiteSettingsService();
export default siteSettingsService;
