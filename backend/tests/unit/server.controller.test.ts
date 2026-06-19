import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import serverController, { isServerOnline, HEARTBEAT_ONLINE_WINDOW_MS } from '../../src/controllers/server.controller.js';

const db = prisma as any;

describe('Public GET /servers (ServerStatus)', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('isServerOnline (derived from lastHeartbeat)', () => {
    const now = new Date('2026-06-20T03:10:00.000Z');

    it('is false when there is no heartbeat', () => {
      expect(isServerOnline(null, now)).toBe(false);
    });

    it('is true when the heartbeat is within the freshness window', () => {
      const fresh = new Date(now.getTime() - (HEARTBEAT_ONLINE_WINDOW_MS - 1000));
      expect(isServerOnline(fresh, now)).toBe(true);
    });

    it('is false when the heartbeat is older than the freshness window', () => {
      const stale = new Date(now.getTime() - (HEARTBEAT_ONLINE_WINDOW_MS + 1000));
      expect(isServerOnline(stale, now)).toBe(false);
    });
  });

  it('returns active servers with derived isOnline and never leaks secrets', async () => {
    const recent = new Date(Date.now() - 10_000);
    const old = new Date(Date.now() - 60 * 60 * 1000);
    db.server.findMany.mockResolvedValueOnce([
      { id: 1, name: 'IRIS-PVE-01', map: 'TheIsland', isActive: true, lastHeartbeat: recent, chatTag: '[ISL]', chatColor: '#37E5D2', chatIcon: 'A' },
      { id: 4, name: 'IRIS-PVE-04', map: 'Aberration', isActive: true, lastHeartbeat: old, chatTag: '[ABB]', chatColor: '#071A24', chatIcon: 'B' },
    ]);

    const req: any = {};
    const res: any = { json: vi.fn() };
    const next = vi.fn();

    await serverController.getServers(req, res, next);

    // Only active servers are queried
    expect(db.server.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true },
    }));
    // The select must NOT include secret columns
    const selectArg = db.server.findMany.mock.calls[0][0].select;
    expect(selectArg.apiKey).toBeUndefined();
    expect(selectArg.webhookUrl).toBeUndefined();

    const payload = res.json.mock.calls[0][0];
    expect(payload.servers).toHaveLength(2);
    expect(payload.servers[0]).toMatchObject({ id: 1, isOnline: true });
    expect(payload.servers[1]).toMatchObject({ id: 4, isOnline: false });
    // No secret fields in the response
    expect(payload.servers[0].apiKey).toBeUndefined();
    expect(payload.servers[0].webhookUrl).toBeUndefined();
  });
});
