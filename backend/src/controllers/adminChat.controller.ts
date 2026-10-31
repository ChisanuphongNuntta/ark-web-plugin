import { Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import auditService from '../services/audit.service.js';
import { chatPayloads, chatServerSelect, sanitizeChat } from '../services/chat.service.js';
import { checkDiscordChannel, getBotStatus, sendDiscordTest } from '../discord/bot.js';
import { emitChatDeleted } from '../realtime/emit.js';
import { parsePagination, paginateQuery } from '../utils/pagination.js';

const snowflake = z.string().regex(/^\d{17,20}$/);
const channelSchema = z.object({ discordChannelId: snowflake, discordGuildId: snowflake.nullable().optional(),
  scope: z.enum(['global', 'server']).optional(), channelType: z.enum(['global', 'server']).optional(),
  serverId: z.number().int().positive().nullable().optional(), isActive: z.boolean().optional() }).strict();
function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new AppError(result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '), 400);
  return result.data;
}
const id = (value: string) => {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new AppError('Invalid channel id', 400);
  return Number(value);
};
const handler = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) => async (req: AuthRequest, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (error) { next(error); } };
async function audit(req: AuthRequest, action: string, resourceId: string, newValue?: unknown) {
  await auditService.log({ userId: req.user!.id, action, resource: 'chat', resourceId, newValue }, req);
}
async function channelData(body: any, current?: any) {
  const scope = body.scope ?? body.channelType ?? current?.channelType ?? (body.serverId ? 'server' : 'global');
  if (body.scope && body.channelType && body.scope !== body.channelType) throw new AppError('Conflicting scope and channelType', 400);
  const serverId = scope === 'global' ? null : body.serverId === undefined ? current?.serverId : body.serverId;
  if (scope === 'server' && !serverId) throw new AppError('serverId required for server scope', 400);
  if (serverId && !await prisma.server.findUnique({ where: { id: serverId } })) throw new AppError('Server not found', 404);
  return { discordChannelId: body.discordChannelId ?? current?.discordChannelId, discordGuildId: body.discordGuildId === undefined ? current?.discordGuildId ?? null : body.discordGuildId,
    serverId, channelType: scope, isActive: body.isActive ?? current?.isActive ?? true };
}
export const botStatus = handler(async (_req, res) => {
  const [mappedChannels, activeMappedChannels, pendingDeliveries] = await Promise.all([prisma.chatChannel.count(), prisma.chatChannel.count({ where: { isActive: true } }), prisma.chatRelayDelivery.count({ where: { deliveredAt: null } })]);
  res.json({ ...getBotStatus(), mappedChannels, activeMappedChannels, pendingDeliveries });
});
export const listChannels = handler(async (req, res) => {
  const rows = await prisma.chatChannel.findMany({ include: { server: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } });
  const channels = await Promise.all(rows.map(async row => ({ ...row, scope: row.channelType, ...(req.query.check === '1' ? { discord: await checkDiscordChannel(row.discordChannelId) } : {}) })));
  res.json({ channels });
});
export const createChannel = handler(async (req, res) => {
  const body = parse(channelSchema, req.body);
  const data = await channelData(body);
  if (await prisma.chatChannel.findUnique({ where: { discordChannelId: data.discordChannelId } })) throw new AppError('Channel already mapped', 409);
  const channel = await prisma.chatChannel.create({ data });
  await audit(req, 'chat_channel_create', String(channel.id), data);
  res.status(201).json({ channel });
});
export const updateChannel = handler(async (req, res) => {
  const current = await prisma.chatChannel.findUnique({ where: { id: id(req.params.id) } });
  if (!current) throw new AppError('Channel not found', 404);
  const data = await channelData(parse(channelSchema.partial(), req.body), current);
  const channel = await prisma.chatChannel.update({ where: { id: current.id }, data });
  await audit(req, 'chat_channel_update', String(channel.id), data); res.json({ channel });
});
export const deleteChannel = handler(async (req, res) => {
  const channel = await prisma.chatChannel.delete({ where: { id: id(req.params.id) } });
  await audit(req, 'chat_channel_delete', String(channel.id)); res.json({ success: true });
});
export const testChannel = handler(async (req, res) => {
  const body = parse(z.object({ text: z.string().max(500).optional() }).strict(), req.body ?? {});
  const channel = await prisma.chatChannel.findUnique({ where: { id: id(req.params.id) } });
  if (!channel) throw new AppError('Channel not found', 404);
  const result = await sendDiscordTest(channel.discordChannelId, sanitizeChat(body.text || 'IRIS chat connection test'));
  await audit(req, 'chat_channel_test', String(channel.id), { ok: result.ok }); res.json(result);
});
function dateFilter(value: unknown): Date | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new AppError('Invalid date', 400);
  return new Date(value);
}
export const listMessages = handler(async (req, res) => {
  const query = parse(z.object({ source: z.enum(['game', 'web', 'discord']).optional(), senderType: z.enum(['player', 'web_user', 'discord_user']).optional(), senderId: z.string().max(64).optional(), search: z.string().max(100).optional() }).passthrough(), req.query);
  const where: any = { ...(req.query.includeDeleted === 'true' || req.query.includeDeleted === '1' ? {} : { deletedAt: null }),
    ...(query.source ? { source: query.source } : {}), ...(query.senderType ? { senderType: query.senderType } : {}),
    ...(query.senderId ? { senderId: query.senderId } : {}), ...(query.search ? { content: { contains: query.search, mode: 'insensitive' } } : {}) };
  if (req.query.serverId !== undefined) {
    if (req.query.serverId === 'global') where.serverId = null;
    else where.serverId = id(String(req.query.serverId));
  }
  const from = dateFilter(req.query.from), to = dateFilter(req.query.to);
  if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const { result, pagination } = await paginateQuery(parsePagination(req.query), (skip, take) => prisma.$transaction([prisma.chatMessage.count({ where }), prisma.chatMessage.findMany({ where, skip, take, orderBy: { seq: 'desc' }, include: { server: { select: chatServerSelect } } })]));
  const rows = result[1];
  const items = await chatPayloads(rows);
  res.json({ items: items.map((row, i) => ({ ...row, deletedAt: rows[i].deletedAt, deletedBy: rows[i].deletedBy })), pagination });
});
export const deleteMessage = handler(async (req, res) => {
  const body = parse(z.object({ reason: z.string().max(500).optional() }).strict(), req.body ?? {});
  const message = await prisma.chatMessage.update({ where: { id: req.params.id }, data: { deletedAt: new Date(), deletedBy: req.user!.id } });
  await audit(req, 'chat_message_delete', message.id, body); emitChatDeleted(message.id, message.serverId);
  res.json({ success: true, message: { ...message, seq: message.seq.toString() } });
});
export const listMutes = handler(async (req, res) => {
  const now = new Date();
  const mutes = await prisma.chatMute.findMany({ where: req.query.active === '1' ? { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } : {}, orderBy: { createdAt: 'desc' }, take: 500 });
  res.json({ mutes: mutes.map(m => ({ ...m, active: !m.revokedAt && (!m.expiresAt || m.expiresAt > now) })) });
});
export const createMute = handler(async (req, res) => {
  const body = parse(z.object({ subjectType: z.enum(['web_user', 'player', 'discord_user']), subjectId: z.string().min(1).max(64), reason: z.string().min(3).max(500), durationMinutes: z.number().int().min(1).max(525600).nullable().optional() }).strict(), req.body);
  if (body.subjectType !== 'web_user' && !/^\d{17,20}$/.test(body.subjectId)) throw new AppError('Invalid player/Discord id', 400);
  const mute = await prisma.chatMute.create({ data: { subjectType: body.subjectType, subjectId: body.subjectId, reason: body.reason, createdBy: req.user!.id,
    expiresAt: body.durationMinutes ? new Date(Date.now() + body.durationMinutes * 60000) : null } });
  await audit(req, 'chat_mute', mute.id, body); res.status(201).json({ mute });
});
export const revokeMute = handler(async (req, res) => {
  const mute = await prisma.chatMute.update({ where: { id: req.params.id }, data: { revokedAt: new Date(), revokedBy: req.user!.id } });
  await audit(req, 'chat_unmute', mute.id); res.json({ mute });
});
