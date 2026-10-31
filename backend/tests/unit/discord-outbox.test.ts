import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  send: vi.fn(), fetch: vi.fn(), handlers: {} as Record<string, (...args: any[]) => void>,
  ready: false, messageHandler: null as any,
}));
vi.mock('discord.js', async importOriginal => {
  const original = await importOriginal<typeof import('discord.js')>();
  return { ...original, Client: class {
    user = { id: '12345678901234567', tag: 'Test bot' };
    guilds = { cache: new Map() };
    channels = { fetch: fake.fetch };
    once(event: string, fn: any) { fake.handlers[event] = fn; }
    on(event: string, fn: any) { fake.handlers[event] = fn; }
    isReady() { return fake.ready; }
    async login() { fake.ready = true; fake.handlers[original.Events.ClientReady]?.(); }
    destroy() { fake.ready = false; }
  } };
});
import prisma from '../../src/config/database.js';
import { startDiscordBot, stopDiscordBot, drainDiscordOutbox, handleDiscordMessage, sendDiscordTest } from '../../src/discord/bot.js';
const db = prisma as any;
const row = { id: 'job', messageId: 'msg', channelId: '12345678901234567', attempts: 0 };
beforeEach(async () => {
  vi.clearAllMocks(); fake.ready = false; fake.handlers = {};
  process.env.DISCORD_BOT_TOKEN = 'unit-test-only'; process.env.SERVICE_ROLE = 'web'; delete process.env.DISCORD_GUILD_ID;
  db.chatRelayDelivery = { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn().mockResolvedValue({}) };
  db.chatMessage.findUnique.mockResolvedValue({ id: 'msg', source: 'web', content: '@everyone **hello**', senderName: '<@&123>', deletedAt: null, createdAt: new Date(), senderType: 'web_user', senderId: 'test-user' });
  db.chatChannel.findUnique.mockResolvedValue({ isActive: true, channelType: 'global', serverId: null });
  fake.send.mockResolvedValue({ id: 'discord-result' });
  fake.fetch.mockResolvedValue({ send: fake.send, guild: { id: 'guild' }, name: 'channel', isTextBased: () => true, permissionsFor: () => ({ has: () => true }) });
  await startDiscordBot(); await new Promise(resolve => setImmediate(resolve));
});
afterEach(() => { stopDiscordBot(); delete process.env.DISCORD_BOT_TOKEN; delete process.env.SERVICE_ROLE; delete process.env.DISCORD_GUILD_ID; });
describe('durable Discord outbox', () => {
  it('sends once after claiming a DB lease and disables all Discord mentions', async () => {
    db.chatRelayDelivery.findMany.mockResolvedValue([row]);
    await drainDiscordOutbox();
    expect(fake.send).toHaveBeenCalledTimes(1);
    const options = fake.send.mock.calls[0][0];
    expect(options.allowedMentions).toEqual({ parse: [], repliedUser: false });
    expect(options.embeds[0].description).not.toContain('@everyone'); expect(options.embeds[0].color).toBe(0x75D9F2); expect(options.files[0].name).toBe('iris-logo.webp'); expect(options.enforceNonce).toBe(true);
    expect(options.nonce).toHaveLength(24);
    expect(db.chatRelayDelivery.update).toHaveBeenCalledWith({ where: { id: 'job' }, data: expect.objectContaining({ discordMessageId: 'discord-result', deliveredAt: expect.any(Date) }) });
  });
  it('falls back to mention-safe plain text without embed permissions', async () => {
    fake.fetch.mockResolvedValue({ send: fake.send, guild: { id: 'guild' }, permissionsFor: () => ({ has: () => false }) });
    db.chatRelayDelivery.findMany.mockResolvedValue([row]); await drainDiscordOutbox();
    expect(fake.send.mock.calls[0][0].content).not.toContain('@everyone');
    expect(fake.send.mock.calls[0][0].embeds).toBeUndefined();
  });
  it('does not send a job claimed by another replica', async () => {
    db.chatRelayDelivery.findMany.mockResolvedValue([row]); db.chatRelayDelivery.updateMany.mockResolvedValue({ count: 0 });
    await drainDiscordOutbox(); expect(fake.send).not.toHaveBeenCalled();
  });
  it('retains failed sends for retry and keeps the same nonce on retry', async () => {
    db.chatRelayDelivery.findMany.mockResolvedValue([row]); fake.send.mockRejectedValueOnce(new Error('network timeout'));
    await drainDiscordOutbox();
    expect(db.chatRelayDelivery.update).toHaveBeenCalledWith({ where: { id: 'job' }, data: expect.objectContaining({ lastError: 'network timeout', nextAttemptAt: expect.any(Date) }) });
    await drainDiscordOutbox();
    expect(fake.send.mock.calls[0][0].nonce).toBe(fake.send.mock.calls[1][0].nonce);
  });
  it('cancels deleted messages before sending and never sends to the wrong guild', async () => {
    db.chatRelayDelivery.findMany.mockResolvedValue([row]); db.chatMessage.findUnique.mockResolvedValueOnce({ deletedAt: new Date() });
    await drainDiscordOutbox(); expect(fake.send).not.toHaveBeenCalled();
    process.env.DISCORD_GUILD_ID = 'different'; await drainDiscordOutbox(); expect(fake.send).not.toHaveBeenCalled();
  });
  it('ignores bots/webhooks/system messages and unconfigured channels', async () => {
    for (const props of [{ author: { bot: true } }, { author: { bot: false }, webhookId: 'hook' }, { author: { bot: false }, system: true }]) await handleDiscordMessage({ ...props, guild: { id: 'guild' } } as any);
    expect(db.chatChannel.findUnique).not.toHaveBeenCalled();
    db.chatChannel.findUnique.mockResolvedValue(null);
    await handleDiscordMessage({ author: { bot: false }, guild: { id: 'guild' }, channelId: 'unmapped' } as any);
    expect(db.chatMessage.create).not.toHaveBeenCalled();
  });
  it('test sends also suppress mentions', async () => {
    expect(await sendDiscordTest('12345678901234567', '@everyone')).toEqual({ ok: true, discordMessageId: 'discord-result' });
    expect(fake.send.mock.calls[0][0].allowedMentions.parse).toEqual([]);
  });
});
