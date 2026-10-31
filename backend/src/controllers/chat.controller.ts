import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import vipService from '../services/vip.service.js';
import { chatHistory, chatServerSelect, ingestChat, parseChatCursor } from '../services/chat.service.js';

export function buildPluginChatMessage(m: any, badge: any) {
  return { id: m.id, seq: m.seq?.toString(), source: m.source, senderName: m.senderName,
    content: m.content, serverName: m.server?.name || null,
    serverStyle: m.server ? { chatTag: m.server.chatTag, chatColor: m.server.chatColor, chatIcon: m.server.chatIcon } : null,
    vip: badge, playerRank: m.playerRank ?? null, rankTag: m.playerRank?.name ?? badge?.label ?? null,
    rankColor: /^#[0-9a-f]{6}$/i.test(m.playerRank?.color || '') ? m.playerRank.color : '#E6BD6A',
    vipTag: badge?.label ?? null, createdAt: m.createdAt.toISOString() };
}
export async function getMessagesForPlugin(req: Request, res: Response, next: NextFunction) {
  try {
    const serverId = (req as any).serverId;
    if (!Number.isSafeInteger(serverId) || serverId <= 0) throw new AppError('Authenticated server required', 401);
    const cursor = parseChatCursor(req.query.cursor ?? req.query.since);
    if (cursor.seq === undefined && !cursor.since) {
      const head = await prisma.chatMessage.findFirst({ orderBy: { seq: 'desc' }, select: { seq: true } });
      const current = `seq:${head?.seq ?? 0}`;
      return res.json({ success: true, messages: [], nextCursor: current, lastTimestamp: current });
    }
    const messages = await prisma.chatMessage.findMany({ where: {
      deletedAt: null, OR: [
        { source: { in: ['web', 'discord'] }, OR: [{ serverId: null }, { serverId }] },
        { source: 'game', serverId: { not: serverId } },
      ],
      ...(cursor.seq !== undefined ? { seq: { gt: cursor.seq } } : { createdAt: { gt: cursor.since! } }),
    }, include: { server: { select: chatServerSelect } }, orderBy: { seq: 'asc' }, take: 100 });
    const badgeOf = await vipService.chatBadgeResolver(messages);
    const nextCursor = messages.length ? `seq:${messages[messages.length - 1].seq}` : cursor.seq !== undefined ? `seq:${cursor.seq}` : cursor.since!.toISOString();
    res.json({ success: true, messages: messages.map(m => buildPluginChatMessage(m, badgeOf(m))), nextCursor, lastTimestamp: nextCursor });
  } catch (error) { next(error); }
}
export async function createMessageFromPlugin(req: Request, res: Response, next: NextFunction) {
  try {
    const { steamId, playerName, content, clientMessageId } = req.body;
    const serverId = (req as any).serverId;
    if (!Number.isSafeInteger(serverId) || serverId <= 0) throw new AppError('Authenticated server required', 401);
    if (typeof steamId !== 'string' || !/^\d{17}$/.test(steamId) || typeof playerName !== 'string') throw new AppError('Invalid player identity', 400);
    if (clientMessageId !== undefined && (typeof clientMessageId !== 'string' || !/^[A-Za-z0-9:._-]{1,64}$/.test(clientMessageId))) throw new AppError('Invalid clientMessageId', 400);
    const result = await ingestChat({ source: 'game', serverId, senderId: steamId, senderName: playerName, content,
      externalId: clientMessageId ? `game:${serverId}:${clientMessageId}` : undefined, playerGroups: req.body.playerGroups });
    res.json({ success: true, messageId: result.message?.id, duplicate: result.duplicate ?? false, relayed: !result.reason, reason: result.reason });
  } catch (error) { next(error); }
}
export async function getChatHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const serverId = req.query.serverId === undefined ? undefined : Number(req.query.serverId);
    if (serverId !== undefined && (!Number.isSafeInteger(serverId) || serverId <= 0)) throw new AppError('Invalid serverId', 400);
    const before = req.query.before ? new Date(String(req.query.before)) : undefined;
    if (before && !Number.isFinite(before.getTime())) throw new AppError('Invalid before date', 400);
    res.json({ success: true, messages: await chatHistory(serverId, before) });
  } catch (error) { next(error); }
}
// Get chat config for plugin (server styling + chat ranks)
export async function getChatConfig(req: Request, res: Response) {
  try {
    const authenticatedServerId = (req as any).serverId;

    // Get current server's styling
    let serverStyle = null;
    if (authenticatedServerId) {
      const server = await prisma.server.findUnique({
        where: { id: authenticatedServerId },
        select: { id: true, name: true, chatTag: true, chatColor: true, chatIcon: true },
      });
      serverStyle = server;
    }

    // Get all servers for cross-chat display
    const servers = await prisma.server.findMany({
      where: { isActive: true },
      select: { id: true, name: true, chatTag: true, chatColor: true, chatIcon: true },
    });

    // Get chat ranks (global + current server specific)
    const ranks = await prisma.chatRank.findMany({
      where: {
        isActive: true,
        OR: [
          { serverId: null }, // Global ranks
          { serverId: authenticatedServerId }, // Server-specific ranks
        ],
      },
      orderBy: { priority: 'desc' },
    });

    res.json({
      success: true,
      currentServer: serverStyle,
      servers,
      ranks: ranks.map((r) => ({
        groupKey: r.groupKey,
        name: r.name,
        color: r.color,
        icon: r.icon,
        priority: r.priority,
        serverId: r.serverId,
      })),
    });
  } catch (error) {
    console.error('Error fetching chat config:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch chat config' });
  }
}


// Get servers list for chat room selection
export async function getServersForChat(req: Request, res: Response) {
  try {
    const servers = await prisma.server.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        map: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, servers });
  } catch (error) {
    console.error('Error fetching servers for chat:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch servers' });
  }
}
