/**
 * Cross-chat admin API (Discord <> Web <> Game). Contract: backend/contracts/chat-setup.md
 * (owner setup) + the chat section of backend/contracts/entitlements-2026-10.md.
 *
 * All routes use /admin/chat. Channel tests send only to Discord; they do not insert
 * public messages. Moderation identifies subjects with subjectType / subjectId.
 *
 * Parsers are defensive (an older backend returns `{ success, channels }`).
 */
import { api, type AdminListRequest } from '@/lib/api';
import { fetchEnvelopePage, verifyFields } from '@/lib/adminConsoleApi';
import { toVipBadge, type VipBadge } from '@/lib/vip';

export const CHAT_ADMIN_PATHS = {
  channels: '/admin/chat/channels',
  channel: (id: number | string) => `/admin/chat/channels/${encodeURIComponent(String(id))}`,
  status: '/admin/chat/bot-status',
  messages: '/admin/chat/messages',
  message: (id: string) => `/admin/chat/messages/${encodeURIComponent(id)}`,
  mutes: '/admin/chat/mutes',
  mute: (id: string) => `/admin/chat/mutes/${encodeURIComponent(id)}`,
} as const;

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const idOf = (v: unknown): string | null => (typeof v === 'number' && Number.isFinite(v) ? String(v) : str(v));
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []);

/** Discord snowflake (17–20 digits). */
export const SNOWFLAKE_RE = /^\d{17,20}$/;

export type ChatSource = 'game' | 'discord' | 'web';
export const CHAT_SOURCES: readonly ChatSource[] = ['game', 'discord', 'web'];
export const CHAT_SOURCE_TH: Record<string, string> = { game: 'ในเกม', discord: 'Discord', web: 'เว็บ' };

export interface ChatChannelRow {
  id: number;
  discordChannelId: string;
  discordGuildId: string | null;
  /** Discord channel name when the bot can see it. */
  discordChannelName: string | null;
  /** null = global chat. */
  serverId: number | null;
  serverName: string | null;
  channelType: string;
  isActive: boolean;
  discordCheck: { reachable: boolean; missingPermissions: string[]; error: string | null } | null;
}

export interface ChatChannelInput {
  discordChannelId: string;
  discordGuildId: string | null;
  serverId: number | null;
  channelType: 'global' | 'server';
  isActive: boolean;
}

export interface BotChannelCheck {
  channelId: string;
  name: string | null;
  ok: boolean;
  missingPermissions: string[];
}

export interface ChatBotStatus {
  /** DISCORD_BOT_TOKEN configured. */
  configured: boolean;
  connected: boolean;
  botTag: string | null;
  guilds: { id: string; name: string }[];
  /** e.g. ['MessageContent'] when the privileged intent is not enabled in the developer portal. */
  missingIntents: string[];
  lastError: string | null;
  readyAt: string | null;
  channels: BotChannelCheck[];
  /** Messages relayed in the last hour per direction, when reported. */
  stats: Record<string, number>;
}

export interface ChatLogRow {
  id: string;
  source: string;
  serverId: number | null;
  serverName: string | null;
  senderType: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  content: string;
  createdAt: string | null;
  deletedAt: string | null;
  vip: VipBadge | null;
}

export interface ChatMuteRow {
  id: string;
  senderType: string;
  senderId: string;
  senderName: string | null;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string | null;
}

export type ChatLogFilter = 'source' | 'serverId' | 'senderId' | 'from' | 'to';

export function toChatChannelRow(raw: unknown): ChatChannelRow | null {
  if (!isObj(raw)) return null;
  const id = num(raw.id);
  const discordChannelId = idOf(raw.discordChannelId);
  if (id === null || !discordChannelId) return null;
  const server = isObj(raw.server) ? raw.server : {};
  return {
    id,
    discordChannelId,
    discordGuildId: idOf(raw.discordGuildId),
    discordChannelName: str(raw.discordChannelName) ?? str(raw.channelName) ?? (isObj(raw.discord) ? str(raw.discord.name) : null),
    serverId: num(raw.serverId),
    serverName: str(raw.serverName) ?? str(server.name),
    channelType: str(raw.channelType) ?? (num(raw.serverId) === null ? 'global' : 'server'),
    isActive: raw.isActive !== false,
    discordCheck: isObj(raw.discord) ? { reachable: raw.discord.reachable === true, missingPermissions: strList(raw.discord.missingPermissions), error: str(raw.discord.error) } : null,
  };
}

export function toChatBotStatus(raw: unknown): ChatBotStatus {
  const b = isObj(raw) ? (isObj(raw.bot) ? { ...raw, ...raw.bot } : raw) : {};
  const guilds = (Array.isArray(b.guilds) ? b.guilds : [])
    .map((g) => (isObj(g) ? { id: idOf(g.id) ?? '', name: str(g.name) ?? '—' } : null))
    .filter((g): g is { id: string; name: string } => Boolean(g && g.id));
  const channels = (Array.isArray(b.channels) ? b.channels : [])
    .map((c): BotChannelCheck | null => {
      if (!isObj(c)) return null;
      const channelId = idOf(c.channelId) ?? idOf(c.id) ?? idOf(c.discordChannelId);
      if (!channelId) return null;
      return {
        channelId,
        name: str(c.name),
        ok: c.ok === true || (c.ok === undefined && strList(c.missingPermissions).length === 0 && c.found !== false),
        missingPermissions: strList(c.missingPermissions),
      };
    })
    .filter((c): c is BotChannelCheck => c !== null);
  const stats: Record<string, number> = {};
  if (isObj(b.stats)) for (const [k, v] of Object.entries(b.stats)) if (typeof v === 'number') stats[k] = v;
  return {
    configured: b.configured === true || b.enabled === true || b.tokenConfigured === true,
    connected: b.connected === true || b.ready === true,
    botTag: str(b.botTag) ?? str(b.tag) ?? (isObj(b.user) ? str(b.user.tag) : str(b.user)),
    guilds,
    missingIntents: strList(b.missingIntents),
    lastError: str(b.lastError) ?? str(b.error),
    readyAt: str(b.readyAt),
    channels,
    stats,
  };
}

export function toChatLogRow(raw: unknown): ChatLogRow | null {
  if (!isObj(raw)) return null;
  const id = idOf(raw.id);
  if (!id) return null;
  const server = isObj(raw.server) ? raw.server : {};
  return {
    id,
    source: str(raw.source) ?? 'web',
    serverId: num(raw.serverId),
    serverName: str(raw.serverName) ?? str(server.name),
    senderType: str(raw.senderType) ?? '',
    senderId: idOf(raw.senderId) ?? '',
    senderName: str(raw.senderName) ?? '—',
    senderAvatar: str(raw.senderAvatar),
    content: typeof raw.content === 'string' ? raw.content : '',
    createdAt: str(raw.createdAt),
    deletedAt: str(raw.deletedAt),
    vip: toVipBadge(raw.vip),
  };
}

export function toChatMuteRow(raw: unknown): ChatMuteRow | null {
  if (!isObj(raw)) return null;
  const id = idOf(raw.id);
  const senderId = idOf(raw.subjectId) ?? idOf(raw.senderId) ?? idOf(raw.userKey);
  if (!id || !senderId) return null;
  return {
    id,
    senderType: str(raw.subjectType) ?? str(raw.senderType) ?? '',
    senderId,
    senderName: str(raw.senderName),
    reason: str(raw.reason),
    expiresAt: str(raw.expiresAt),
    createdAt: str(raw.createdAt),
  };
}

function listFrom<T>(data: unknown, keys: string[], map: (raw: unknown) => T | null): T[] {
  const body = isObj(data) ? data : {};
  for (const k of [...keys, 'items']) {
    if (Array.isArray(body[k])) return (body[k] as unknown[]).map(map).filter((x): x is T => x !== null);
  }
  return Array.isArray(data) ? data.map(map).filter((x): x is T => x !== null) : [];
}

export const chatAdminApi = {
  getChannels: async (signal?: AbortSignal): Promise<ChatChannelRow[]> => {
    const { data } = await api.get(CHAT_ADMIN_PATHS.channels, { signal, params: { check: 1 } });
    return listFrom(data, ['channels'], toChatChannelRow);
  },
  /** Create a mapping; duplicate Discord channels are rejected by the backend. */
  saveChannel: async (input: ChatChannelInput): Promise<ChatChannelRow | null> => {
    const { data } = await api.post(CHAT_ADMIN_PATHS.channels, { ...input, scope: input.channelType });
    return toChatChannelRow(isObj(data) ? (data.channel ?? data) : data);
  },
  deleteChannel: async (id: number): Promise<void> => {
    await api.delete(CHAT_ADMIN_PATHS.channel(id));
  },
  updateChannel: async (id: number, input: Partial<ChatChannelInput>): Promise<void> => {
    await api.put(CHAT_ADMIN_PATHS.channel(id), { ...input, ...(input.channelType ? { scope: input.channelType } : {}) });
  },

  getStatus: async (signal?: AbortSignal): Promise<ChatBotStatus> => {
    const { data } = await api.get(CHAT_ADMIN_PATHS.status, { signal });
    return toChatBotStatus(data);
  },

  /** Tests the mapped Discord channel without adding a public chat message. */
  testSend: async (input: { channelId: number; content: string }): Promise<{ delivered: string[] }> => {
    const { data } = await api.post(`${CHAT_ADMIN_PATHS.channel(input.channelId)}/test`, { text: input.content });
    const body = isObj(data) ? data : {};
    if (body.ok !== true) throw new Error(str(body.error) ?? 'Discord test failed');
    return { delivered: ['Discord'] };
  },

  getMessagesPage: (req: AdminListRequest<ChatLogFilter>, signal?: AbortSignal) =>
    fetchEnvelopePage<ChatLogRow>(CHAT_ADMIN_PATHS.messages, req, {
      signal,
      itemsKeys: ['items', 'messages'],
      mapItem: toChatLogRow,
      verify: verifyFields<ChatLogRow>({
        source: (m) => m.source,
        serverId: (m) => (m.serverId === null ? null : String(m.serverId)),
        senderId: (m) => m.senderId,
      }),
    }),

  deleteMessage: async (id: string, reason: string): Promise<void> => {
    await api.delete(CHAT_ADMIN_PATHS.message(id), { data: { reason } });
  },

  getMutes: async (signal?: AbortSignal): Promise<ChatMuteRow[]> => {
    const { data } = await api.get(CHAT_ADMIN_PATHS.mutes, { signal, params: { active: 1 } });
    return listFrom(data, ['mutes'], toChatMuteRow);
  },
  /** minutes null = until lifted. */
  mute: async (input: { senderType: string; senderId: string; senderName?: string | null; minutes: number | null; reason: string }): Promise<void> => {
    await api.post(CHAT_ADMIN_PATHS.mutes, { subjectType: input.senderType, subjectId: input.senderId, durationMinutes: input.minutes, reason: input.reason });
  },
  unmute: async (id: string): Promise<void> => {
    await api.delete(CHAT_ADMIN_PATHS.mute(id));
  },
};
