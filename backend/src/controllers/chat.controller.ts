import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { emitChatMessage } from '../websocket/index.js';
import { sendToDiscord } from '../discord/bot.js';

const prisma = new PrismaClient();

// Get messages for plugin polling
export async function getMessagesForPlugin(req: Request, res: Response) {
  try {
    const serverId = req.query.serverId ? parseInt(req.query.serverId as string) : undefined;
    const since = req.query.since ? new Date(req.query.since as string) : undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const messages = await prisma.chatMessage.findMany({
      where: {
        ...(serverId !== undefined ? { serverId } : { serverId: null }),
        ...(since ? { createdAt: { gt: since } } : {}),
        // Only get messages from web and discord for game broadcast
        source: { in: ['web', 'discord'] },
      },
      include: {
        server: { select: { name: true, chatTag: true, chatColor: true, chatIcon: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    res.json({
      success: true,
      messages: messages.map((m) => ({
        id: m.id,
        source: m.source,
        senderName: m.senderName,
        content: m.content,
        serverName: m.server?.name || null,
        serverStyle: m.server ? {
          chatTag: m.server.chatTag,
          chatColor: m.server.chatColor,
          chatIcon: m.server.chatIcon,
        } : null,
        createdAt: m.createdAt.toISOString(),
      })),
      lastTimestamp: messages.length > 0 ? messages[messages.length - 1].createdAt.toISOString() : null,
    });
  } catch (error) {
    console.error('Error fetching messages for plugin:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
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

// Plugin sends a message (from game chat)
export async function createMessageFromPlugin(req: Request, res: Response) {
  try {
    const { steamId, playerName, content, serverId, playerGroups } = req.body;

    if (!steamId || !playerName || !content) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (content.length > 500) {
      return res.status(400).json({ success: false, error: 'Message too long' });
    }

    // Get server info from the authenticated request
    const authenticatedServerId = (req as any).serverId || serverId;

    // Get server info with styling
    let serverName: string | null = null;
    let serverStyle: { chatTag: string | null; chatColor: string | null; chatIcon: string | null } | null = null;
    if (authenticatedServerId) {
      const server = await prisma.server.findUnique({
        where: { id: authenticatedServerId },
        select: { name: true, chatTag: true, chatColor: true, chatIcon: true },
      });
      serverName = server?.name || null;
      serverStyle = server ? { chatTag: server.chatTag, chatColor: server.chatColor, chatIcon: server.chatIcon } : null;
    }

    // Get player's chat rank (highest priority from their groups)
    let playerRank: { name: string; color: string; icon: string | null } | null = null;
    if (playerGroups && Array.isArray(playerGroups) && playerGroups.length > 0) {
      const ranks = await prisma.chatRank.findMany({
        where: {
          groupKey: { in: playerGroups },
          isActive: true,
          OR: [
            { serverId: null }, // Global ranks
            { serverId: authenticatedServerId }, // Server-specific ranks
          ],
        },
        orderBy: { priority: 'desc' },
        take: 1,
      });
      if (ranks.length > 0) {
        playerRank = { name: ranks[0].name, color: ranks[0].color, icon: ranks[0].icon };
      }
    }

    const message = await prisma.chatMessage.create({
      data: {
        source: 'game',
        serverId: authenticatedServerId,
        senderType: 'player',
        senderId: steamId,
        senderName: playerName,
        content: content.trim(),
      },
    });

    // Emit to WebSocket clients
    emitChatMessage({
      id: message.id,
      source: message.source,
      serverId: message.serverId,
      serverName,
      serverStyle,
      senderType: message.senderType,
      senderId: message.senderId,
      senderName: message.senderName,
      senderAvatar: message.senderAvatar,
      playerRank,
      content: message.content,
      createdAt: message.createdAt,
    });

    // Send to Discord
    sendToDiscord({
      source: message.source,
      serverId: message.serverId,
      serverName,
      serverStyle,
      senderName: message.senderName,
      playerRank,
      content: message.content,
    });

    res.json({ success: true, messageId: message.id });
  } catch (error) {
    console.error('Error creating message from plugin:', error);
    res.status(500).json({ success: false, error: 'Failed to create message' });
  }
}

// Get chat history for web/API
export async function getChatHistory(req: Request, res: Response) {
  try {
    const serverId = req.query.serverId !== undefined ? parseInt(req.query.serverId as string) : null;
    const before = req.query.before ? new Date(req.query.before as string) : undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const messages = await prisma.chatMessage.findMany({
      where: {
        serverId: serverId,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        server: { select: { name: true, chatTag: true, chatColor: true, chatIcon: true } },
      },
    });

    res.json({
      success: true,
      messages: messages.reverse().map((m) => ({
        id: m.id,
        source: m.source,
        serverId: m.serverId,
        serverName: m.server?.name || null,
        serverStyle: m.server ? {
          chatTag: m.server.chatTag,
          chatColor: m.server.chatColor,
          chatIcon: m.server.chatIcon,
        } : null,
        senderType: m.senderType,
        senderId: m.senderId,
        senderName: m.senderName,
        senderAvatar: m.senderAvatar,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch chat history' });
  }
}

// Admin: Get all chat channels
export async function getChatChannels(req: Request, res: Response) {
  try {
    const channels = await prisma.chatChannel.findMany({
      include: {
        server: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, channels });
  } catch (error) {
    console.error('Error fetching chat channels:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch channels' });
  }
}

// Admin: Create/update chat channel mapping
export async function upsertChatChannel(req: Request, res: Response) {
  try {
    const { discordChannelId, discordGuildId, serverId, channelType } = req.body;

    if (!discordChannelId || !channelType) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const channel = await prisma.chatChannel.upsert({
      where: { discordChannelId },
      update: {
        discordGuildId,
        serverId: serverId ?? null,
        channelType,
        isActive: true,
      },
      create: {
        discordChannelId,
        discordGuildId,
        serverId: serverId ?? null,
        channelType,
      },
    });

    res.json({ success: true, channel });
  } catch (error) {
    console.error('Error upserting chat channel:', error);
    res.status(500).json({ success: false, error: 'Failed to save channel' });
  }
}

// Admin: Delete chat channel mapping
export async function deleteChatChannel(req: Request, res: Response) {
  try {
    const { id } = req.params;

    await prisma.chatChannel.delete({
      where: { id: parseInt(id) },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat channel:', error);
    res.status(500).json({ success: false, error: 'Failed to delete channel' });
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
