// Which server a delivery goes to when the buyer did not pick one ("auto"), and whether a waiting
// delivery may follow the buyer to the server they just logged into.
//
// The backend cannot see which server a player is on right now (heartbeats carry a head count, the
// public query returns names, not Steam IDs). It does see every login: the plugin calls
// GET /api/plugin/player/:steamId when a player joins. Auto delivery therefore means:
//   1. at checkout, target the server of the buyer's most recent login (else the best ready server);
//   2. the plugin delivers on its next poll if the buyer is there, otherwise it releases the lease and
//      the job waits (existing behaviour);
//   3. when the buyer logs into any other server, plugin.controller moves the waiting job there
//      (`canRetarget`), so it is delivered automatically or by /claim.
import { isServerDeliverable } from './serverDirectory.service.js';

/** Credential include every delivery-readiness check needs (only an active credential lets a plugin lease jobs). */
export const ACTIVE_CREDENTIAL_INCLUDE = {
  credentials: { where: { status: 'active' }, select: { id: true }, take: 1 },
} as const;

export interface DeliveryServer {
  id: number;
  name: string;
  isActive: boolean;
  drainMode?: boolean | null;
  isAvailable?: boolean | null;
  playerCount?: number | null;
  capabilities?: string[] | null;
  credentials?: Array<{ id: string }> | null;
}

/**
 * Why a server cannot take a delivery right now (null = OK). Mirrors frontend `deliveryBlockReason`: closed
 * (isAvailable=false), inactive, drained, or no active plugin credential. Without this a direct API caller
 * could pay for a DeliveryJob that no plugin can ever lease.
 */
export function serverDeliveryBlock(server: DeliveryServer): { message: string; status: number } | null {
  if (!server.isActive) return { message: `Server "${server.name}" is inactive`, status: 400 };
  if (server.isAvailable === false) return { message: `Server "${server.name}" is closed`, status: 409 };
  if (server.drainMode) return { message: `Server "${server.name}" is temporarily draining deliveries`, status: 409 };
  if (!isServerDeliverable(server as Parameters<typeof isServerDeliverable>[0])) {
    return { message: `Server "${server.name}" is not connected for delivery yet`, status: 409 };
  }
  return null;
}

export function missingCapabilities(required: readonly string[] | null | undefined, server: Pick<DeliveryServer, 'capabilities'>): string[] {
  const have = new Set(server.capabilities ?? []);
  return (required ?? []).filter((capability) => !have.has(capability));
}

/**
 * Pick one server that can take every line of the cart. Prefers the server of the buyer's last login, then the
 * server with the most players online (someone is usually there), then the lowest id so the choice is stable.
 * Returns null when no single server can deliver everything.
 */
export function pickAutoServer(
  servers: DeliveryServer[],
  requiredCapabilitiesPerLine: ReadonlyArray<readonly string[] | null | undefined>,
  lastLoginServerId: number | null,
): DeliveryServer | null {
  const eligible = servers.filter(
    (server) =>
      serverDeliveryBlock(server) === null &&
      requiredCapabilitiesPerLine.every((required) => missingCapabilities(required, server).length === 0),
  );
  if (eligible.length === 0) return null;
  const last = lastLoginServerId === null ? undefined : eligible.find((server) => server.id === lastLoginServerId);
  if (last) return last;
  return [...eligible].sort((a, b) => (b.playerCount ?? 0) - (a.playerCount ?? 0) || a.id - b.id)[0];
}

/** Marker kept in the delivery job payload for deliveries that may follow the buyer to another server. */
export const ANY_SERVER_FLAG = 'anyServer';

/** Whether a waiting job may move to `target`: it must be able to deliver there (capabilities) and the target must be ready. */
export function canRetarget(requiredCapabilities: readonly string[] | null | undefined, target: DeliveryServer): boolean {
  return serverDeliveryBlock(target) === null && missingCapabilities(requiredCapabilities, target).length === 0;
}
