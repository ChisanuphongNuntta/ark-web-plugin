import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/websocket/index.js', () => ({ emitChatMessage: vi.fn() }));
vi.mock('../../src/discord/bot.js', () => ({ sendToDiscord: vi.fn() }));

const { buildPluginChatMessage } = await import('../../src/controllers/chat.controller.js');

describe('GET /chat/plugin/messages VIP tag (in-game cross-chat)', () => {
  const base = { id: 'c1', source: 'web', senderName: 'Krit', content: 'hi', createdAt: new Date('2026-10-23T00:00:00.000Z'), server: null };

  it('carries the VIP badge and a plain rankTag for VIP web senders', () => {
    const badge = { tierRank: 1, frameStyle: 'vip-gold', label: 'VIP' };
    expect(buildPluginChatMessage(base, badge)).toMatchObject({ source: 'web', senderName: 'Krit', vip: badge, rankTag: 'VIP' });
  });

  it('non-VIP and discord senders get rankTag null (field stays additive)', () => {
    const out = buildPluginChatMessage({ ...base, source: 'discord' }, null);
    expect(out.rankTag).toBeNull();
    expect(out.vip).toBeNull();
    expect(out).toMatchObject({ id: 'c1', content: 'hi', serverName: null, serverStyle: null, createdAt: '2026-10-23T00:00:00.000Z' });
  });
});
