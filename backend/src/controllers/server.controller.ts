import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { isServerOnline, HEARTBEAT_ONLINE_WINDOW_MS } from '../utils/serverStatus.js';
import serverDirectoryService, {
  SERVER_SUMMARY_SELECT,
  ServerSummarySource,
  mergeDirectoryLiveStatus,
  toServerSummary,
} from '../services/serverDirectory.service.js';
import serverQueryService from '../services/serverQuery.service.js';

// Re-exported for backward compatibility (tests and older imports).
export { isServerOnline, HEARTBEAT_ONLINE_WINDOW_MS };

const truthy = (value: unknown) => value === 'true' || value === '1';

export class ServerController {
  // GET /servers — public-safe server list for server-selection and live-status surfaces.
  // SECURITY: only non-sensitive fields are selected; apiKey/webhookUrl/credential secrets are
  // never exposed (credentials are selected only as an id to compute `deliverable`).
  // isOnline/online are DERIVED from lastHeartbeat recency, they are not stored columns.
  // Response: { servers: Array<ServerSummary & legacy ServerStatus fields> }.
  // ?deliverable=true keeps only servers shop delivery can target.
  getServers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const onlyDeliverable = truthy(req.query?.deliverable);
      const where = onlyDeliverable
        ? { isActive: true, drainMode: false, credentials: { some: { status: 'active' } } }
        : { isActive: true };

      const servers = await prisma.server.findMany({
        where,
        select: {
          ...SERVER_SUMMARY_SELECT,
          chatTag: true,
          chatColor: true,
          chatIcon: true,
          capabilities: true,
        },
        orderBy: { id: 'asc' },
      });

      const result = servers
        .map((server: any) => {
          const summary = toServerSummary(server as ServerSummarySource, now);
          return {
            // Legacy ServerStatus fields (kept for backward compatibility; id/name/map come
            // from the summary below)
            isActive: server.isActive,
            isOnline: summary.online,
            lastHeartbeat: server.lastHeartbeat ? server.lastHeartbeat.toISOString() : null,
            chatTag: server.chatTag ?? null,
            chatColor: server.chatColor ?? null,
            chatIcon: server.chatIcon ?? null,
            drainMode: Boolean(server.drainMode),
            supportsDinoDelivery: (server.capabilities ?? []).includes('delivery.dino.v2'),
            // ServerSummary (UI redesign 2026-10)
            ...summary,
          };
        })
        // Defensive re-check: the DB filter already enforces this.
        .filter((server) => !onlyDeliverable || server.deliverable);

      res.json({ servers: result });
    } catch (error) {
      next(error);
    }
  };

  // GET /servers/directory — public grouped directory (PVE / PVE Mod / PvPvE sets), with the
  // live A2S/heartbeat status merged into each server (online, playerCount, maxPlayers, version,
  // statusSource, playersRev). Falls back to heartbeat values when the snapshot is unavailable.
  getDirectory = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [directory, live] = await Promise.all([
        serverDirectoryService.getDirectory(),
        serverQueryService.getStatusMap(),
      ]);
      res.json(mergeDirectoryLiveStatus(directory, live));
    } catch (error) {
      next(error);
    }
  };

  // GET /servers/status — full live snapshot; same payload as the `servers:status` socket event.
  getStatus = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.set('Cache-Control', 'public, max-age=5');
      res.json(await serverQueryService.getPublicStatus());
    } catch (error) {
      next(error);
    }
  };

  // GET /servers/:id/players — { serverId, players: [{ name, durationSec }], fetchedAt, online, source }.
  // Names only (A2S); empty names are returned as "ไม่ระบุชื่อ". 404 for unknown/inactive servers.
  getPlayers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const serverId = Number.parseInt(String(req.params.id), 10);
      if (!Number.isSafeInteger(serverId) || serverId <= 0 || String(serverId) !== String(req.params.id)) {
        return res.status(400).json({ error: 'Invalid server id' });
      }
      const result = await serverQueryService.getPlayers(serverId);
      if (!result) return res.status(404).json({ error: 'Server not found' });
      res.set('Cache-Control', 'public, max-age=10');
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}

export default new ServerController();
