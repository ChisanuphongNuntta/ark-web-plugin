import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import { getRealtimeServer } from '../realtime/io.js';
import vipService from './vip.service.js';

export const CHAT_LOCK = 7241024;
export const chatServerSelect = { name: true, chatTag: true, chatColor: true, chatIcon: true } as const;
export function sanitizeChat(value: unknown, truncate = false): string {
  if (typeof value !== 'string') throw new AppError('Message must be text', 400);
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) throw new AppError('Message cannot be empty', 400);
  if (!truncate && text.length > 500) throw new AppError('Message too long (max 500 characters)', 400);
  return text.slice(0, 500);
}
export function discordSafe(value: string): string {
  return value.replace(/@/g, '@\u200b').replace(/([\\`*_~|>])/g, '\\$1');
}
export function parseChatCursor(value: unknown): { seq?: bigint; since?: Date } {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value !== 'string' || value.length > 64) throw new AppError('Invalid chat cursor', 400);
  if (/^seq:\d{1,19}$/.test(value)) {
    const seq = BigInt(value.slice(4));
    if (seq > 9223372036854775807n) throw new AppError('Invalid chat cursor', 400);
    return { seq };
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new AppError('Invalid chat cursor', 400);
  return { since: new Date(value) };
}
export async function chatPayloads(messages: any[]) {
  const badgeOf = await vipService.chatBadgeResolver(messages);
  return messages.map(m => ({
    id: m.id, seq: m.seq?.toString(), source: m.source, serverId: m.serverId,
    serverName: m.server?.name || null,
    serverStyle: m.server ? { chatTag: m.server.chatTag, chatColor: m.server.chatColor, chatIcon: m.server.chatIcon } : null,
    senderType: m.senderType, senderId: m.senderId, senderName: m.senderName,
    senderAvatar: m.senderAvatar, content: m.content, playerRank: m.playerRank ?? null, vip: badgeOf(m), createdAt: m.createdAt.toISOString(),
  }));
}
export async function chatHistory(serverId?: number, before?: Date, limit = 50) {
  const rows = await prisma.chatMessage.findMany({
    where: { deletedAt: null, ...(serverId ? { serverId } : {}), ...(before ? { createdAt: { lt: before } } : {}) },
    include: { server: { select: chatServerSelect } }, orderBy: { seq: 'desc' }, take: limit,
  });
  return chatPayloads(rows.reverse());
}
export interface ChatInput {
  source: 'web'|'game'|'discord'; serverId?: number|null;
  senderId: string; senderName: string; senderAvatar?: string|null; content: unknown;
  externalId?: string; playerGroups?: string[];
}
export async function ingestChat(input: ChatInput) {
  const content = sanitizeChat(input.content, input.source === 'discord');
  const senderType = { web: 'web_user', game: 'player', discord: 'discord_user' }[input.source];
  const result = await prisma.$transaction(async tx => {
    // Serialize sequence allocation through COMMIT. A seq cursor cannot skip a slower insert.
    // It also serializes duplicate/rate checks across both gateway and website processes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAT_LOCK})`;
    if (input.externalId) {
      const existing = await tx.chatMessage.findUnique({ where: { externalId: input.externalId } });
      if (existing) {
        if (existing.senderId !== input.senderId || existing.content !== content || existing.serverId !== (input.serverId ?? null)) throw new AppError('Message id reused for different content', 409);
        return { duplicate: true, message: existing };
      }
    }
    const user = await tx.user.findUnique({ where: input.source === 'web' ? { id: input.senderId } : input.source === 'game' ? { steamId: input.senderId } : { discordId: input.senderId } });
    if (input.source === 'web' && !user) throw new AppError('Account not found', 401);
    if (user?.isBanned) return { reason: 'banned' };
    const subjects = [{ subjectType: senderType, subjectId: input.senderId }];
    if (user) {
      subjects.push({ subjectType: 'web_user', subjectId: user.id });
      if (user.steamId) subjects.push({ subjectType: 'player', subjectId: user.steamId });
      if (user.discordId) subjects.push({ subjectType: 'discord_user', subjectId: user.discordId });
    }
    const now = new Date();
    const mute = await tx.chatMute.findFirst({ where: { AND: [{ OR: subjects }, { revokedAt: null }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] } });
    if (mute) return { reason: 'muted' };
    if (input.serverId && !await tx.server.findFirst({ where: { id: input.serverId, isActive: true } })) throw new AppError('Unknown or inactive server', 400);
    if (input.source === 'game' && !input.externalId) {
      const same = await tx.chatMessage.findFirst({ where: { senderType, senderId: input.senderId, serverId: input.serverId ?? null, content, createdAt: { gte: new Date(now.getTime() - 3000) } } });
      if (same) return { duplicate: true, message: same };
    }
    const windowMs = input.source === 'discord' ? 30000 : 60000;
    const count = await tx.chatMessage.count({ where: { senderType, senderId: input.senderId, createdAt: { gte: new Date(now.getTime() - windowMs) } } });
    if (count >= (input.source === 'discord' ? 10 : 20)) throw new AppError('Too many messages, please wait', 429);
    if (input.source === 'web' && await tx.chatMessage.findFirst({ where: { senderType, senderId: input.senderId, createdAt: { gte: new Date(now.getTime() - 750) } } })) throw new AppError('Please wait before sending again', 429);
    // Keep the Permissions rank with the message: history, Discord and other game servers
    // must see the same rank as the local game's live chat, even after groups later change.
    const groups = input.source === 'game' && Array.isArray(input.playerGroups)
      ? input.playerGroups.filter((g): g is string => typeof g === 'string' && g.length > 0 && g.length <= 64).slice(0, 50) : [];
    if (user) {
      const memberships = await tx.vipMembership.findMany({ where: { userId: user.id, status: 'active', startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { permissionGroup: true } });
      groups.push(...memberships.map(m => m.permissionGroup).filter((g): g is string => Boolean(g)));
    }
    const rank = groups.length ? await tx.chatRank.findFirst({ where: { groupKey: { in: [...new Set(groups)] }, isActive: true, OR: [{ serverId: null }, ...(input.serverId ? [{ serverId: input.serverId }] : [])] }, orderBy: { priority: 'desc' } }) : null;
    const message = await tx.chatMessage.create({ data: {
      source: input.source, serverId: input.serverId ?? null, senderType,
      senderId: input.senderId, senderName: sanitizeChat(input.senderName).slice(0, 100),
      senderAvatar: input.senderAvatar, content, externalId: input.externalId,
      ...(rank ? { playerRank: { name: rank.name, color: rank.color, icon: rank.icon } } : {}),
    }, include: { server: { select: chatServerSelect } } });
    if (input.source !== 'discord') {
      const channels = await tx.chatChannel.findMany({ where: { isActive: true, OR: [{ serverId: null, channelType: 'global' }, ...(input.serverId ? [{ serverId: input.serverId, channelType: 'server' }] : [])] } });
      if (channels.length) await tx.chatRelayDelivery.createMany({ data: channels.map(channel => ({ messageId: message.id, channelId: channel.discordChannelId })) });
    }
    return { message, duplicate: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10000 });
  if (result.message && !result.duplicate) {
    try {
      const [payload] = await chatPayloads([result.message]);
      const rooms = input.serverId ? ['chat:global', `chat:server:${input.serverId}`] : ['chat:global'];
      getRealtimeServer()?.to(rooms).emit('chat:message', payload);
    } catch (error) { console.error('Chat realtime publish failed; stored history remains available', error); }
  }
  return result;
}
