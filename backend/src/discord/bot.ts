import {
  Client,
  GatewayIntentBits,
  Partials,
  Message,
  TextChannel,
  ChannelType,
  EmbedBuilder,
  Events,
} from 'discord.js';
import { PrismaClient } from '@prisma/client';
import { io, emitChatMessage } from '../websocket/index.js';

const prisma = new PrismaClient();

let discordClient: Client | null = null;

// Source emoji/icons
const SOURCE_ICONS = {
  game: '🎮',
  web: '🌐',
  discord: '💬',
};

export async function startDiscordBot(): Promise<Client | null> {
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    console.log('DISCORD_BOT_TOKEN not configured, Discord bot disabled');
    return null;
  }

  discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  discordClient.once(Events.ClientReady, (client) => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
    console.log(`Bot is in ${client.guilds.cache.size} server(s)`);
  });

  // Handle incoming Discord messages
  discordClient.on(Events.MessageCreate, async (message: Message) => {
    // Ignore bot messages and DMs
    if (message.author.bot || !message.guild) return;

    try {
      // Check if this channel is configured for cross-chat
      const chatChannel = await prisma.chatChannel.findUnique({
        where: { discordChannelId: message.channel.id },
      });

      if (!chatChannel || !chatChannel.isActive) return;

      // Get server name if this is a server-specific channel
      let serverName: string | null = null;
      if (chatChannel.serverId) {
        const server = await prisma.server.findUnique({
          where: { id: chatChannel.serverId },
          select: { name: true },
        });
        serverName = server?.name || null;
      }

      // Save message to database
      const savedMessage = await prisma.chatMessage.create({
        data: {
          source: 'discord',
          serverId: chatChannel.serverId,
          senderType: 'discord_user',
          senderId: message.author.id,
          senderName: message.author.displayName || message.author.username,
          senderAvatar: message.author.displayAvatarURL({ size: 64 }),
          content: message.content.slice(0, 500), // Limit content length
        },
      });

      // Emit to WebSocket clients
      emitChatMessage({
        id: savedMessage.id,
        source: savedMessage.source,
        serverId: savedMessage.serverId,
        serverName,
        senderType: savedMessage.senderType,
        senderId: savedMessage.senderId,
        senderName: savedMessage.senderName,
        senderAvatar: savedMessage.senderAvatar,
        content: savedMessage.content,
        createdAt: savedMessage.createdAt,
      });

    } catch (error) {
      console.error('Error processing Discord message:', error);
    }
  });

  // Handle slash commands for channel setup
  discordClient.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setchat') {
      // Check if user has admin permissions
      if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({
          content: 'You need Administrator permissions to use this command.',
          ephemeral: true,
        });
        return;
      }

      const channelType = interaction.options.getString('type', true);
      const serverId = interaction.options.getInteger('server');

      try {
        await prisma.chatChannel.upsert({
          where: { discordChannelId: interaction.channelId },
          update: {
            discordGuildId: interaction.guildId,
            channelType,
            serverId: channelType === 'server' ? serverId : null,
            isActive: true,
          },
          create: {
            discordChannelId: interaction.channelId,
            discordGuildId: interaction.guildId,
            channelType,
            serverId: channelType === 'server' ? serverId : null,
          },
        });

        const serverInfo = serverId ? ` (Server ID: ${serverId})` : '';
        await interaction.reply({
          content: `Cross-chat enabled for this channel as **${channelType}**${serverInfo}`,
          ephemeral: true,
        });
      } catch (error) {
        console.error('Error setting up chat channel:', error);
        await interaction.reply({
          content: 'Failed to configure cross-chat for this channel.',
          ephemeral: true,
        });
      }
    }

    if (interaction.commandName === 'removechat') {
      if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({
          content: 'You need Administrator permissions to use this command.',
          ephemeral: true,
        });
        return;
      }

      try {
        await prisma.chatChannel.delete({
          where: { discordChannelId: interaction.channelId },
        });

        await interaction.reply({
          content: 'Cross-chat disabled for this channel.',
          ephemeral: true,
        });
      } catch (error) {
        await interaction.reply({
          content: 'Cross-chat was not configured for this channel.',
          ephemeral: true,
        });
      }
    }
  });

  try {
    await discordClient.login(token);
    return discordClient;
  } catch (error) {
    console.error('Failed to login Discord bot:', error);
    return null;
  }
}

// Send a message to Discord from game/web
export async function sendToDiscord(message: {
  source: string;
  serverId: number | null;
  serverName?: string | null;
  serverStyle?: { chatTag: string | null; chatColor: string | null; chatIcon: string | null } | null;
  senderName: string;
  playerRank?: { name: string; color: string; icon: string | null } | null;
  content: string;
}) {
  if (!discordClient) return;

  try {
    // Find channels that should receive this message
    const channels = await prisma.chatChannel.findMany({
      where: {
        isActive: true,
        OR: [
          { channelType: 'global', serverId: null },
          { serverId: message.serverId },
        ],
      },
    });

    for (const channel of channels) {
      try {
        const discordChannel = await discordClient.channels.fetch(channel.discordChannelId);

        if (discordChannel && discordChannel.type === ChannelType.GuildText) {
          const textChannel = discordChannel as TextChannel;
          const sourceIcon = SOURCE_ICONS[message.source as keyof typeof SOURCE_ICONS] || '📝';

          // Build server tag
          let serverTag = '';
          if (message.source === 'game') {
            const icon = message.serverStyle?.chatIcon || '';
            const tag = message.serverStyle?.chatTag || message.serverName || 'Game';
            serverTag = `${icon}${icon ? ' ' : ''}${tag}`;
          } else if (message.source === 'web') {
            serverTag = 'Web';
          } else {
            serverTag = message.source.charAt(0).toUpperCase() + message.source.slice(1);
          }

          // Build player rank prefix
          let rankPrefix = '';
          if (message.playerRank) {
            const rankIcon = message.playerRank.icon || '';
            rankPrefix = `${rankIcon}${rankIcon ? ' ' : ''}[${message.playerRank.name}] `;
          }

          const formattedMessage = `${sourceIcon} **[${serverTag}]** ${rankPrefix}**${message.senderName}:** ${message.content}`;

          await textChannel.send(formattedMessage);
        }
      } catch (error) {
        console.error(`Failed to send to Discord channel ${channel.discordChannelId}:`, error);
      }
    }
  } catch (error) {
    console.error('Error sending to Discord:', error);
  }
}

// Register slash commands (run once on bot setup)
export async function registerCommands() {
  if (!discordClient) return;

  try {
    const commands = [
      {
        name: 'setchat',
        description: 'Configure this channel for cross-chat',
        options: [
          {
            name: 'type',
            description: 'Chat type',
            type: 3, // STRING
            required: true,
            choices: [
              { name: 'Global', value: 'global' },
              { name: 'Server-specific', value: 'server' },
            ],
          },
          {
            name: 'server',
            description: 'Server ID (required for server-specific)',
            type: 4, // INTEGER
            required: false,
          },
        ],
      },
      {
        name: 'removechat',
        description: 'Remove cross-chat from this channel',
      },
    ];

    await discordClient.application?.commands.set(commands);
    console.log('Discord slash commands registered');
  } catch (error) {
    console.error('Failed to register Discord commands:', error);
  }
}

export function getDiscordClient(): Client | null {
  return discordClient;
}
