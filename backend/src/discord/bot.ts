import { Client, GatewayIntentBits, Events, PermissionFlagsBits, Message } from 'discord.js';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import vipService from '../services/vip.service.js';
import prisma from '../config/database.js';
import { getServiceRole } from '../config/serviceRole.js';
import { discordSafe, ingestChat } from '../services/chat.service.js';

let discordClient: Client | null = null;
let timer: NodeJS.Timeout | undefined;
let retryTimer: NodeJS.Timeout | undefined;
let draining = false;
let lastError: string | null = null;
let readyAt: string | null = null;
let lastInboundAt: string | null = null;
let lastOutboundAt: string | null = null;
export const getDiscordClient = () => discordClient;
export function getBotStatus() {
  const guild = process.env.DISCORD_GUILD_ID || null;
  const missingContentIntent = /4014|disallowed intents/i.test(lastError || '');
  return { enabled: Boolean(process.env.DISCORD_BOT_TOKEN), connected: Boolean(discordClient?.isReady()),
    user: discordClient?.user ? { id: discordClient.user.id, tag: discordClient.user.tag } : null,
    guilds: discordClient ? [...discordClient.guilds.cache.values()].map(g => ({ id: g.id, name: g.name })) : [],
    configuredGuildId: guild, guildFound: guild && discordClient?.isReady() ? discordClient.guilds.cache.has(guild) : null,
    intents: { messageContent: missingContentIntent ? 'missing' : discordClient?.isReady() ? 'ok' : 'unknown' },
    missingIntents: missingContentIntent ? ['MessageContent'] : [], lastError, readyAt, lastInboundAt, lastOutboundAt,
    inviteUrl: discordClient?.user ? `https://discord.com/oauth2/authorize?client_id=${discordClient.user.id}&scope=bot&permissions=117760` : null };
}
export async function checkDiscordChannel(id: string) {
  try {
    if (!discordClient?.isReady()) throw new Error('Bot is not connected');
    const channel = await discordClient.channels.fetch(id);
    if (!channel || !('guild' in channel) || !channel.isTextBased() || !('send' in channel)) throw new Error('Not a guild text channel');
    if (process.env.DISCORD_GUILD_ID && channel.guild.id !== process.env.DISCORD_GUILD_ID) throw new Error('Channel is outside configured guild');
    const permissions = channel.permissionsFor(discordClient.user!);
    const needed = [['ViewChannel', PermissionFlagsBits.ViewChannel], ['SendMessages', PermissionFlagsBits.SendMessages], ['ReadMessageHistory', PermissionFlagsBits.ReadMessageHistory]] as const;
    const missingPermissions = needed.filter(([, bit]) => !permissions?.has(bit)).map(([name]) => name);
    return { reachable: true, name: 'name' in channel ? channel.name : null, guildId: channel.guild.id,
      canView: !missingPermissions.includes('ViewChannel'), canSend: !missingPermissions.includes('SendMessages'),
      canReadHistory: !missingPermissions.includes('ReadMessageHistory'), canEmbedLinks: Boolean(permissions?.has(PermissionFlagsBits.EmbedLinks)), canAttachFiles: Boolean(permissions?.has(PermissionFlagsBits.AttachFiles)), missingPermissions, error: null };
  } catch (error) { return { reachable: false, name: null, guildId: null, canView: false, canSend: false, canReadHistory: false, missingPermissions: [], error: error instanceof Error ? error.message : 'Channel unavailable' }; }
}
export async function sendDiscordTest(channelId: string, text: string) {
  const check = await checkDiscordChannel(channelId);
  if (!check.reachable || !check.canSend || !check.canView) return { ok: false, error: check.error || check.missingPermissions.join(', ') };
  const channel = await discordClient!.channels.fetch(channelId);
  if (!channel || !('send' in channel)) return { ok: false, error: 'Channel unavailable' };
  const message = await channel.send({ content: discordSafe(text), allowedMentions: { parse: [], repliedUser: false } });
  return { ok: true, discordMessageId: message.id };
}
export async function handleDiscordMessage(message: Message) {
  if (message.author.bot || message.webhookId || message.system || !message.guild) return;
  if (process.env.DISCORD_GUILD_ID && message.guild.id !== process.env.DISCORD_GUILD_ID) return;
  const mapping = await prisma.chatChannel.findUnique({ where: { discordChannelId: message.channelId } });
  if (!mapping?.isActive || (mapping.discordGuildId && mapping.discordGuildId !== message.guild.id)) return;
  const content = `${message.cleanContent.replace(/<a?:([A-Za-z0-9_]+):\d+>/g, ':$1:')}${message.attachments.size ? ' [attachment]' : ''}`;
  if (!content.trim()) return;
  await ingestChat({ source: 'discord', serverId: mapping.serverId, senderId: message.author.id,
    senderName: message.member?.displayName || message.author.username, senderAvatar: message.author.displayAvatarURL(),
    content, externalId: `discord:${message.id}` });
  lastInboundAt = new Date().toISOString();
}
export async function drainDiscordOutbox() {
  if (!discordClient?.isReady() || draining) return;
  draining = true;
  try {
    const rows = await prisma.chatRelayDelivery.findMany({ where: { deliveredAt: null, nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: 50 });
    for (const row of rows) {
      // DB lease coordinates replicas and survives process crashes. Discord nonce also handles an
      // accepted send whose acknowledgement was lost (within Discord's nonce deduplication window).
      const lease = await prisma.chatRelayDelivery.updateMany({ where: { id: row.id, deliveredAt: null, nextAttemptAt: { lte: new Date() } }, data: { nextAttemptAt: new Date(Date.now() + 60000), attempts: { increment: 1 } } });
      if (!lease.count) continue;
      try {
        const [message, mapping] = await Promise.all([
          prisma.chatMessage.findUnique({ where: { id: row.messageId }, include: { server: { select: { name: true, chatTag: true } } } }),
          prisma.chatChannel.findUnique({ where: { discordChannelId: row.channelId } }),
        ]);
        if (!message || message.deletedAt || !mapping?.isActive) {
          await prisma.chatRelayDelivery.update({ where: { id: row.id }, data: { deliveredAt: new Date(), lastError: 'Cancelled: deleted message or inactive mapping' } });
          continue;
        }
        const channel = await discordClient.channels.fetch(row.channelId);
        if (!channel || !('send' in channel) || !('guild' in channel)) throw new Error('Discord channel unavailable');
        if ((process.env.DISCORD_GUILD_ID && channel.guild.id !== process.env.DISCORD_GUILD_ID) || (mapping.discordGuildId && channel.guild.id !== mapping.discordGuildId)) throw new Error('Discord guild mismatch');
        const tag = message.source === 'game' ? message.server?.chatTag || message.server?.name || 'Game' : 'Web';
        const rank = message.playerRank && typeof message.playerRank === 'object' && 'name' in message.playerRank && typeof message.playerRank.name === 'string' ? `[${discordSafe(message.playerRank.name)}] ` : '';
        const badgeOf = await vipService.chatBadgeResolver([message]);
        const vip = badgeOf(message);
        const vipTag = vip && !rank.includes(`[${vip.label}]`) ? `[${discordSafe(vip.label)}] ` : '';
        const permissions = channel.permissionsFor(discordClient.user!);
        const rich = permissions?.has(PermissionFlagsBits.EmbedLinks) && permissions?.has(PermissionFlagsBits.AttachFiles);
        const rankColor = message.playerRank && typeof message.playerRank === 'object' && 'color' in message.playerRank && typeof message.playerRank.color === 'string' && /^#[0-9a-f]{6}$/i.test(message.playerRank.color) ? message.playerRank.color : null;
        const color = parseInt((rankColor || (vip ? '#E6BD6A' : message.source === 'game' ? '#83DFC8' : '#75D9F2')).slice(1), 16);
        const plain = `**[${discordSafe(tag)}] ${rank}${vipTag}${discordSafe(message.senderName)}:** ${discordSafe(message.content)}`;
        const sent = await channel.send({
          ...(rich ? { embeds: [{ color, author: { name: `[${tag}] ${rank ? rank.replace(/\\/g, '') : ''}${vipTag ? vipTag.replace(/\\/g, '') : ''}${message.senderName}`.slice(0, 256), icon_url: 'attachment://iris-logo.webp' },
            description: discordSafe(message.content), footer: { text: 'IRIS · ARK Cross-Chat' }, timestamp: message.createdAt.toISOString() }],
            files: [{ attachment: fileURLToPath(new URL('../../assets/iris-logo-v1.webp', import.meta.url)), name: 'iris-logo.webp' }] } : { content: plain }),
          allowedMentions: { parse: [], repliedUser: false }, nonce: createHash('sha256').update(row.id).digest('hex').slice(0, 24), enforceNonce: true });
        await prisma.chatRelayDelivery.update({ where: { id: row.id }, data: { deliveredAt: new Date(), discordMessageId: sent.id, lastError: null } });
        lastOutboundAt = new Date().toISOString();
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Discord relay failed';
        await prisma.chatRelayDelivery.update({ where: { id: row.id }, data: { lastError: lastError.slice(0, 1000), nextAttemptAt: new Date(Date.now() + Math.min(300000, 2000 * 2 ** Math.min(row.attempts, 7))) } });
      }
    }
  } finally { draining = false; }
}
export async function startDiscordBot(): Promise<Client | null> {
  if (getServiceRole() === 'plugin-gateway' || !process.env.DISCORD_BOT_TOKEN) return null;
  if (discordClient?.isReady()) return discordClient;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = undefined; }
  discordClient?.destroy();
  discordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], allowedMentions: { parse: [], repliedUser: false } });
  discordClient.once(Events.ClientReady, () => {
    readyAt = new Date().toISOString(); lastError = null;
    timer = setInterval(() => { void drainDiscordOutbox().catch(error => { lastError = String(error); }); }, 2000);
    timer.unref(); void drainDiscordOutbox().catch(error => { lastError = String(error); });
  });
  discordClient.on(Events.MessageCreate, message => { void handleDiscordMessage(message).catch(error => { lastError = error instanceof Error ? error.message : String(error); }); });
  discordClient.on(Events.Error, error => { lastError = error.message; });
  discordClient.on(Events.ShardDisconnect, event => { if (event.code === 4014) lastError = '4014: enable Message Content privileged intent'; });
  try { await discordClient.login(process.env.DISCORD_BOT_TOKEN); return discordClient; }
  catch (error) {
    lastError = error instanceof Error ? error.message : 'Discord login failed';
    // Portal intent changes take effect on the next identify. Recover without requiring an
    // operator to recreate the API container after enabling Message Content Intent.
    discordClient?.destroy();
    retryTimer = setTimeout(() => { void startDiscordBot().catch(e => { lastError = String(e); }); }, 30000);
    retryTimer.unref();
    return null;
  }
}
// Kept for old internal callers; persisted outbox is now the single sending path.
export async function sendToDiscord(_message: unknown) { await drainDiscordOutbox(); }
export async function registerCommands() { /* Mappings require website admin authentication. */ }
export function stopDiscordBot() { if (timer) clearInterval(timer); if (retryTimer) clearTimeout(retryTimer); retryTimer = undefined; discordClient?.destroy(); discordClient = null; }
