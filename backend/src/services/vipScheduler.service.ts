// VIP expiry scheduler (contracts/vip-2026-10.md §Expiry). Runs in the web process only; a Redis
// lock keeps each window to one replica. Each tick expires due memberships and queues the
// Permissions removal when nothing else keeps the group (vipService.expireDue).
import crypto from 'node:crypto';
import redis from '../config/redis.js';
import vipService from './vip.service.js';

export const VIP_EXPIRY_LOCK_KEY = 'lock:vip:expiry';
export const DEFAULT_VIP_EXPIRY_INTERVAL_MS = 60 * 1000;

type LockClient = { status?: string; set: (...args: any[]) => Promise<unknown> };
type ExpireResult = { checked: number; expired: number; removalsQueued: number; requeued?: number };

export class VipExpiryScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly instanceId = crypto.randomUUID();

  constructor(
    private readonly intervalMs = Number(process.env.VIP_EXPIRY_INTERVAL_MS) || DEFAULT_VIP_EXPIRY_INTERVAL_MS,
    private readonly lockClient: LockClient = redis,
    // Expire due rows, then re-queue memberships whose Permissions change found no server row.
    private readonly run: (now: Date) => Promise<ExpireResult> = async (now) => {
      const expired = await vipService.expireDue(now);
      const requeued = await vipService.requeueUnqueued(now);
      return { ...expired, requeued };
    },
  ) {}

  start(): void {
    if (this.timer || process.env.VIP_EXPIRY_ENABLED === 'false') return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
    const first = setTimeout(() => void this.tick(), Math.min(15_000, this.intervalMs));
    first.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * One window. Unlike the read-only ledger reconcile, expiry WRITES, so it never runs without
   * the lock: a Redis outage only delays expiry (rows are re-checked next window; every write is
   * conditional on status=active anyway).
   */
  async tick(now: Date = new Date()): Promise<ExpireResult | null> {
    if (this.running) return null;
    this.running = true;
    try {
      if (this.lockClient.status !== undefined && this.lockClient.status !== 'ready') return null;
      const ttl = Math.max(1_000, this.intervalMs - 5_000);
      const acquired = await this.lockClient.set(VIP_EXPIRY_LOCK_KEY, this.instanceId, 'PX', ttl, 'NX');
      if (acquired !== 'OK') return null;
      const result = await this.run(now);
      if (result.expired > 0) console.log(`[vip] expired ${result.expired} membership(s), queued ${result.removalsQueued} removal(s)`);
      if (result.requeued) console.log(`[vip] re-queued Permissions sync for ${result.requeued} user(s)`);
      return result;
    } catch (error) {
      console.error('[vip] expiry tick failed:', error);
      return null;
    } finally {
      this.running = false;
    }
  }
}

export const vipExpiryScheduler = new VipExpiryScheduler();
