import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import walletService from './wallet.service.js';

type WalletEventCursor = { postedAt: string; id: string };

const encodeWalletCursor = (cursor: WalletEventCursor) => Buffer
  .from(JSON.stringify(cursor), 'utf8')
  .toString('base64url');

const decodeWalletCursor = (value?: string): WalletEventCursor | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as WalletEventCursor;
    const rawDate = (parsed as any).postedAt ?? (parsed as any).createdAt;
    const date = new Date(rawDate);
    if (parsed.id && !Number.isNaN(date.getTime())) return { postedAt: date.toISOString(), id: parsed.id };
  } catch {
    // Legacy ISO timestamps remain accepted during the cursor transition.
  }
  const legacyDate = new Date(value);
  return Number.isNaN(legacyDate.getTime()) ? null : { postedAt: legacyDate.toISOString(), id: '' };
};

/**
 * Read-only companion data for the in-game `/iris` surface (CR-PLUGIN-007 / 008).
 *
 * Every method is server-SCOPED: the plugin may only read data for players that belong to the
 * caller's server, and only for steamIds that are LINKED to an IRIS account. The plugin never
 * computes balances or state — it reflects what the backend ledger/journal already decided.
 */
export class PluginCompanionService {
  /**
   * Resolve a steamId to a linked, non-banned user, asserting the player is associated with the
   * caller's server (has at least one order or delivery job there). Throws 404 when the steamId
   * is unknown/unlinked and 403 when the player is not associated with this server.
   */
  async resolveServerPlayer(steamId: string, serverId: number) {
    if (!steamId) throw new AppError('steamId is required', 400);
    const user = await prisma.user.findUnique({
      where: { steamId },
      select: { id: true, steamId: true, isBanned: true },
    });
    if (!user) throw new AppError('Player not linked to an IRIS account', 404);
    if (user.isBanned) throw new AppError('Player account is banned', 403);

    const [orderCount, jobCount] = await Promise.all([
      prisma.order.count({ where: { userId: user.id, serverId } }),
      prisma.deliveryJob.count({ where: { playerSteamId: steamId, serverId } }),
    ]);
    if (orderCount === 0 && jobCount === 0) {
      throw new AppError('Player is not associated with this server', 403);
    }
    return user;
  }

  /** WalletBalance for a linked player on the caller's server. Amounts are decimal strings. */
  async getPlayerWallet(steamId: string, serverId: number) {
    const user = await this.resolveServerPlayer(steamId, serverId);
    return walletService.getBalance(user.id);
  }

  /** Count of pending (not-yet-completed) delivery jobs for a player on the caller's server. */
  async getPendingDeliveries(steamId: string, serverId: number): Promise<{ pending: number }> {
    const user = await this.resolveServerPlayer(steamId, serverId);
    // Pending = anything not terminally completed. Resolve via steamId (delivery jobs key on it),
    // but the resolveServerPlayer gate above guarantees the steamId is linked + on this server.
    void user;
    const pending = await prisma.deliveryJob.count({
      where: {
        serverId,
        playerSteamId: steamId,
        status: { in: ['pending', 'leased', 'failed'] },
      },
    });
    return { pending };
  }

  /**
   * Wallet event feed scoped to players on the caller's server.
   *
   * Emits `wallet.transaction.posted` events (matching contracts/events) with ADDITIVE
   * `playerSteamId` + `userId` fields so the plugin can attribute each event to a player without
   * a second lookup. The opaque cursor contains `(postedAt,id)`, so transactions sharing the
   * same timestamp cannot be skipped. Legacy ISO `since` values remain accepted temporarily.
   */
  async getWalletEvents(serverId: number, cursorValue?: string, limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const cursor = decodeWalletCursor(cursorValue);
    if (cursorValue && !cursor) throw new AppError('Invalid wallet event cursor', 400);

    // Players associated with this server (have at least one delivery job there). The steamId
    // set bounds which users' ledger entries this server is allowed to observe.
    const serverPlayers = await prisma.deliveryJob.findMany({
      where: { serverId },
      select: { playerSteamId: true },
      distinct: ['playerSteamId'],
    });
    const steamIds = serverPlayers.map((p) => p.playerSteamId).filter(Boolean);
    if (steamIds.length === 0) {
      return { success: true, events: [], lastCursor: cursorValue ?? null, lastTimestamp: cursor?.postedAt ?? null };
    }

    const users = await prisma.user.findMany({
      where: { steamId: { in: steamIds } },
      select: { id: true, steamId: true },
    });
    const userIdToSteamId = new Map(users.map((u) => [u.id, u.steamId as string]));
    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) {
      return { success: true, events: [], lastCursor: cursorValue ?? null, lastTimestamp: cursor?.postedAt ?? null };
    }

    const where: any = {
      postedAt: { not: null },
      entries: { some: { account: { userId: { in: userIds } } } },
    };
    if (cursor) {
      const postedAt = new Date(cursor.postedAt);
      where.AND = cursor.id
        ? [{ OR: [{ postedAt: { gt: postedAt } }, { postedAt, id: { gt: cursor.id } }] }]
        : [{ postedAt: { gt: postedAt } }];
    }

    const transactions = await prisma.ledgerTransaction.findMany({
      where,
      include: {
        entries: {
          include: { account: true },
        },
      },
      orderBy: [{ postedAt: 'asc' }, { id: 'asc' }],
      take: safeLimit,
    });

    const events = transactions.map((tx) => {
      // Determine the player this event belongs to from the user-scoped entry.
      const userEntry = tx.entries.find((e) => e.account?.userId && userIdToSteamId.has(e.account.userId));
      const userId = userEntry?.account?.userId ?? null;
      const playerSteamId = userId ? userIdToSteamId.get(userId) ?? null : null;

      return {
        eventId: `evt_${tx.id}`,
        eventType: 'wallet.transaction.posted' as const,
        occurredAt: (tx.postedAt ?? tx.createdAt).toISOString(),
        transactionId: tx.id,
        transactionType: tx.type,
        referenceType: tx.referenceType ?? null,
        referenceId: tx.referenceId ?? null,
        // Additive, server-scoped attribution fields (backward compatible with the event schema).
        playerSteamId,
        userId,
        entries: tx.entries.map((e) => ({
          accountKey: e.account?.key ?? '',
          amount: e.amount.toString(),
          currency: e.account?.currency ?? 'IC',
        })),
      };
    });

    const lastTransaction = transactions.at(-1);
    const lastTimestamp = lastTransaction
      ? (lastTransaction.postedAt ?? lastTransaction.createdAt).toISOString()
      : (cursor?.postedAt ?? null);
    const lastCursor = lastTransaction
      ? encodeWalletCursor({ postedAt: (lastTransaction.postedAt ?? lastTransaction.createdAt).toISOString(), id: lastTransaction.id })
      : (cursorValue ?? null);

    return { success: true, events, lastCursor, lastTimestamp };
  }
}

export default new PluginCompanionService();
