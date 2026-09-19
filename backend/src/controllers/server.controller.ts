import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';

// A server is considered "online" when its last heartbeat is within this window.
// Plugins are expected to heartbeat well inside this interval (see openapi HeartbeatRequest).
export const HEARTBEAT_ONLINE_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

export function isServerOnline(lastHeartbeat: Date | null, now: Date = new Date()): boolean {
  if (!lastHeartbeat) return false;
  return now.getTime() - lastHeartbeat.getTime() <= HEARTBEAT_ONLINE_WINDOW_MS;
}

export class ServerController {
  // Public-safe server directory.
  // SECURITY: only non-sensitive fields are selected; apiKey/webhookUrl are never exposed.
  // isOnline is DERIVED from lastHeartbeat recency, it is not a stored column.
  getServers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const servers = await prisma.server.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          map: true,
          isActive: true,
          lastHeartbeat: true,
          chatTag: true,
          chatColor: true,
          chatIcon: true,
          drainMode: true,
          capabilities: true,
        },
        orderBy: { id: 'asc' },
      });

      const result = servers.map((server) => ({
        id: server.id,
        name: server.name,
        map: server.map,
        isActive: server.isActive,
        isOnline: isServerOnline(server.lastHeartbeat, now),
        lastHeartbeat: server.lastHeartbeat ? server.lastHeartbeat.toISOString() : null,
        chatTag: server.chatTag,
        chatColor: server.chatColor,
        chatIcon: server.chatIcon,
        drainMode: server.drainMode,
        supportsDinoDelivery: (server.capabilities ?? []).includes('delivery.dino.v2'),
      }));

      res.json({ servers: result });
    } catch (error) {
      next(error);
    }
  };
}

export default new ServerController();
