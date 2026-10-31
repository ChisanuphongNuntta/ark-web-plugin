import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/config/database.js';
import { sanitizeChat, discordSafe, parseChatCursor, ingestChat, CHAT_LOCK } from '../../src/services/chat.service.js';
import { getMessagesForPlugin, createMessageFromPlugin } from '../../src/controllers/chat.controller.js';
import { setRealtimeServer } from '../../src/realtime/io.js';
const db = prisma as any;
const steam = '76561198000000001';
beforeEach(() => {
  vi.clearAllMocks();
  db.$executeRaw = vi.fn().mockResolvedValue(1);
  db.$transaction.mockImplementation((fn: any) => typeof fn === 'function' ? fn(db) : Promise.all(fn));
  db.chatRelayDelivery = { createMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), count: vi.fn() };
  db.user.findUnique.mockResolvedValue(null);
  db.chatMute.findFirst.mockResolvedValue(null);
  db.chatMessage.findUnique.mockResolvedValue(null);
  db.chatMessage.findFirst.mockResolvedValue(null);
  db.chatMessage.count.mockResolvedValue(0);
  db.vipMembership.findMany.mockResolvedValue([]);
  db.chatRank = { findFirst: vi.fn().mockResolvedValue(null) };
  db.chatChannel.findMany.mockResolvedValue([]);
  db.server.findFirst = vi.fn().mockResolvedValue({ id: 2 });
  db.chatMessage.create.mockImplementation(async ({ data }: any) => ({ ...data, id: 'm1', seq: 1n, createdAt: new Date(), server: null }));
  setRealtimeServer(null);
});
describe('chat input and cursor safety', () => {
  it('cleans controls and whitespace; enforces length and text type', () => {
    expect(sanitizeChat(' a\u0000\n b ')).toBe('a b');
    expect(() => sanitizeChat({})).toThrow();
    expect(() => sanitizeChat('x'.repeat(501))).toThrow();
    expect(sanitizeChat('x'.repeat(501), true)).toHaveLength(500);
    expect(() => sanitizeChat('\n\t')).toThrow();
  });
  it('neutralizes Discord mentions and markdown', () => {
    const safe = discordSafe('@everyone @here <@&123> **bold**');
    expect(safe).not.toContain('@everyone'); expect(safe).not.toContain('@here'); expect(safe).not.toContain('<@&');
    expect(safe).toContain('\\*');
  });
  it('uses opaque exact bigint cursors without floating point loss', () => {
    expect(parseChatCursor('seq:9007199254740993')).toEqual({ seq: 9007199254740993n });
    for (const value of ['seq:-1', 'seq:99999999999999999999', 'junk', {}, ['seq:2']]) expect(() => parseChatCursor(value)).toThrow();
  });
});
describe('one chat pipeline', () => {
  it('preserves the signed game Permissions rank in stored data and history payload', async () => {
    db.chatRank.findFirst.mockResolvedValue({ name: 'Moderator', color: '#123456', icon: null });
    await ingestChat({ source: 'game', serverId: 2, senderId: steam, senderName: 'A', content: 'ranked', playerGroups: ['Mods'] });
    expect(db.chatMessage.create.mock.calls[0][0].data.playerRank).toEqual({ name: 'Moderator', color: '#123456', icon: null });
    expect(db.chatRank.findFirst.mock.calls[0][0].where.groupKey.in).toEqual(['Mods']);
  });

  it('persists game text and durable Discord fanout, emitting once to the union of rooms', async () => {
    db.chatChannel.findMany.mockResolvedValue([{ discordChannelId: '12345678901234567' }]);
    const emit = vi.fn(), to = vi.fn().mockReturnValue({ emit }); setRealtimeServer({ to } as any);
    const result = await ingestChat({ source: 'game', serverId: 2, senderId: steam, senderName: 'A', content: 'hello', externalId: 'game:2:one' });
    expect(result.duplicate).toBe(false);
    expect(db.$executeRaw.mock.calls[0][1]).toBe(CHAT_LOCK);
    expect(db.chatRelayDelivery.createMany).toHaveBeenCalledWith({ data: [{ messageId: 'm1', channelId: '12345678901234567' }] });
    expect(to).toHaveBeenCalledWith(['chat:global', 'chat:server:2']); expect(emit).toHaveBeenCalledTimes(1);
  });
  it('Discord origin never creates an outbound Discord job', async () => {
    await ingestChat({ source: 'discord', senderId: '12345678901234567', senderName: 'A', content: 'hello', externalId: 'discord:1' });
    expect(db.chatRelayDelivery.createMany).not.toHaveBeenCalled();
  });
  it('retries a stable game message id without storing or broadcasting twice', async () => {
    db.chatMessage.findUnique.mockResolvedValue({ id: 'm1', senderId: steam, content: 'hello', serverId: 2 });
    const result = await ingestChat({ source: 'game', serverId: 2, senderId: steam, senderName: 'A', content: 'hello', externalId: 'game:2:one' });
    expect(result.duplicate).toBe(true); expect(db.chatMessage.create).not.toHaveBeenCalled();
  });
  it('rejects replay id reuse with altered payload', async () => {
    db.chatMessage.findUnique.mockResolvedValue({ senderId: steam, content: 'other', serverId: 2 });
    await expect(ingestChat({ source: 'game', serverId: 2, senderId: steam, senderName: 'A', content: 'hello', externalId: 'same' })).rejects.toThrow('reused');
  });
  it.each(['banned', 'muted'])('blocks %s linked players before creating any message', async reason => {
    if (reason === 'banned') db.user.findUnique.mockResolvedValue({ id: 'u', isBanned: true });
    else db.chatMute.findFirst.mockResolvedValue({ id: 'mute' });
    expect(await ingestChat({ source: 'game', senderId: steam, senderName: 'A', content: 'hello' })).toMatchObject({ reason });
    expect(db.chatMessage.create).not.toHaveBeenCalled();
  });
  it('limits per-player sends across game servers inside the transaction', async () => {
    db.chatMessage.count.mockResolvedValue(20);
    await expect(ingestChat({ source: 'game', senderId: steam, senderName: 'A', content: 'hello' })).rejects.toThrow('Too many');
  });
});
describe('signed game chat boundary', () => {
  const response = () => ({ json: vi.fn(), status: vi.fn().mockReturnThis() });
  it('first poll establishes head without replaying history', async () => {
    db.chatMessage.findFirst.mockResolvedValue({ seq: 30n });
    const res = response(); await getMessagesForPlugin({ query: {}, serverId: 2 } as any, res as any, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, messages: [], nextCursor: 'seq:30', lastTimestamp: 'seq:30' });
  });
  it('poll includes global and own-server messages, ignores caller-supplied server id', async () => {
    db.chatMessage.findMany.mockResolvedValue([]);
    await getMessagesForPlugin({ query: { cursor: 'seq:10', serverId: '999' }, serverId: 2 } as any, response() as any, vi.fn());
    expect(db.chatMessage.findMany.mock.calls[0][0].where).toMatchObject({ deletedAt: null, OR: [{ source: { in: ['web', 'discord'] }, OR: [{ serverId: null }, { serverId: 2 }] }, { source: 'game', serverId: { not: 2 } }], seq: { gt: 10n } });
  });
  it('rejects a body-only server identity', async () => {
    const next = vi.fn(); await createMessageFromPlugin({ body: { steamId: steam, playerName: 'A', content: 'hello', serverId: 2 } } as any, response() as any, next);
    expect(next.mock.calls[0][0].statusCode).toBe(401); expect(db.chatMessage.create).not.toHaveBeenCalled();
  });
});
