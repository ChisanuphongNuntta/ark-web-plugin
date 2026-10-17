import { createClient } from 'redis';

// The Discord bot runs only in the web process. The plugin gateway hands in-game chat to it
// over Redis pub/sub so Discord relay keeps working after the API split.
export const DISCORD_RELAY_CHANNEL = 'iris:discord-relay:v1';

let publisher: ReturnType<typeof createClient> | null = null;

async function getPublisher() {
  if (!process.env.REDIS_URL) return null;
  if (!publisher) {
    publisher = createClient({ url: process.env.REDIS_URL });
    publisher.on('error', (error) => console.error('Discord relay publisher error:', error));
    await publisher.connect();
  }
  return publisher;
}

export async function publishDiscordRelay(message: unknown): Promise<void> {
  try {
    const client = await getPublisher();
    if (client) await client.publish(DISCORD_RELAY_CHANNEL, JSON.stringify(message));
  } catch (error) {
    console.error('Failed to publish Discord relay message:', error);
  }
}

export async function startDiscordRelaySubscriber(handle: (message: any) => Promise<void>): Promise<void> {
  if (!process.env.REDIS_URL) return;
  const subscriber = createClient({ url: process.env.REDIS_URL });
  subscriber.on('error', (error) => console.error('Discord relay subscriber error:', error));
  await subscriber.connect();
  await subscriber.subscribe(DISCORD_RELAY_CHANNEL, (raw) => {
    try {
      void handle(JSON.parse(raw)).catch((error) => console.error('Discord relay handler failed:', error));
    } catch (error) {
      console.error('Invalid Discord relay payload:', error);
    }
  });
  console.log('Discord relay subscriber ready');
}
