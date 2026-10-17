// Which half of the API this process serves.
//   web            - public website/user/admin API, Socket.IO clients, Discord bot
//   plugin-gateway - signed game-server API only (/api/plugin/**); reachable from game servers, never the public
//   all            - both (local development and backwards compatibility)
export type ServiceRole = 'all' | 'web' | 'plugin-gateway';

export function getServiceRole(): ServiceRole {
  const value = (process.env.SERVICE_ROLE || 'all').trim().toLowerCase();
  if (value === 'all' || value === 'web' || value === 'plugin-gateway') return value;
  throw new Error(`Invalid SERVICE_ROLE "${process.env.SERVICE_ROLE}" (expected all, web or plugin-gateway)`);
}

export const servesWeb = (role: ServiceRole) => role !== 'plugin-gateway';
export const servesPlugin = (role: ServiceRole) => role !== 'web';
