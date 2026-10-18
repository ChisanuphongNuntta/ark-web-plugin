import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../config/database.js';

// Socket.IO authentication — mirrors middlewares/auth.ts `authenticate` exactly:
// JWT signature check + hashed UserSession lookup (active, not expired) + user not banned.
// The website stores the JWT in the httpOnly `token` cookie, so browsers cannot read it from
// JS; with `withCredentials: true` the cookie travels on the Socket.IO handshake and is read
// here. An explicit `auth.token` / `Authorization: Bearer` is also accepted (Discord bot, tools).

export interface SocketIdentity {
  userId: string;
  userName: string;
  userAvatar?: string;
  /** Legacy admin flag (isAdmin || role admin|root) — chat moderation only. */
  isAdmin: boolean;
  /**
   * May join the 'admin' realtime room (admin:transaction, admin:ledger:mismatch, ...). Same
   * rule as REST requireWebsiteAdmin: role ADMIN or ROOT only — never the legacy isAdmin flag.
   */
  canJoinAdminRoom: boolean;
  /** The UserSession this socket authenticated with. */
  sessionId?: string;
}

/** requireWebsiteAdmin's rule (middlewares/auth.ts). */
export const isWebsiteAdminRole = (role: unknown): boolean => role === 'admin' || role === 'root';

export interface HandshakeLike {
  auth?: Record<string, unknown> | undefined;
  headers?: Record<string, string | string[] | undefined>;
}

export type TokenSource = 'auth' | 'header' | 'cookie';

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep raw value
    }
    if (!(name in out)) out[name] = value;
  }
  return out;
}

export function extractSocketToken(handshake: HandshakeLike): { token: string; source: TokenSource } | null {
  const authToken = handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) return { token: authToken.trim(), source: 'auth' };

  const authorization = handshake.headers?.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    if (token) return { token, source: 'header' };
  }

  const cookieHeader = handshake.headers?.cookie;
  const cookies = parseCookieHeader(Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader);
  if (cookies.token) return { token: cookies.token, source: 'cookie' };
  return null;
}

/** Returns the identity, or null when the token is invalid / revoked / expired / banned. */
export async function verifySocketToken(token: string): Promise<SocketIdentity | null> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) return null;
  let decoded: { userId?: string };
  try {
    decoded = jwt.verify(token, jwtSecret) as { userId?: string };
  } catch {
    return null;
  }
  if (!decoded?.userId) return null;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const [session, user] = await Promise.all([
    prisma.userSession.findUnique({ where: { token: tokenHash } }),
    prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, discordUsername: true, discordAvatar: true, isBanned: true, isAdmin: true, role: true },
    }),
  ]);
  if (!session || !session.isActive || session.expiresAt < new Date() || !user || user.isBanned) return null;
  if (session.userId && session.userId !== user.id) return null;

  const role = String(user.role ?? 'user');
  return {
    userId: user.id,
    userName: user.discordUsername || 'Anonymous',
    userAvatar: user.discordAvatar || undefined,
    // Same rule as middlewares/auth.ts requireAdmin.
    isAdmin: Boolean(user.isAdmin) || role === 'admin' || role === 'root',
    canJoinAdminRoom: isWebsiteAdminRole(role),
    ...(session.id ? { sessionId: String(session.id) } : {}),
  };
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

/** FRONTEND_URL plus the optional comma-separated SOCKET_ALLOWED_ORIGINS. */
export function allowedSocketOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const out = new Set<string>();
  for (const raw of [env.FRONTEND_URL || 'http://localhost:3000', ...(env.SOCKET_ALLOWED_ORIGINS || '').split(',')]) {
    if (!raw.trim()) continue;
    const origin = normalizeOrigin(raw);
    if (origin) out.add(origin);
  }
  return out;
}

/**
 * Whether the handshake's ambient credentials (the SameSite=Lax `token` cookie) may be used.
 * Engine.io does not apply CORS to websocket upgrades, so a page on a sibling same-site origin
 * could otherwise open a socket as the logged-in user. Trusted: no Origin (non-browser client),
 * an allow-listed origin, or same-origin (Origin host equals the Host nginx forwards — the site
 * is served on `server_name _`, so the public hostname is not known in config).
 */
export function isTrustedSocketOrigin(handshake: HandshakeLike, allowed: Set<string> = allowedSocketOrigins()): boolean {
  const rawOrigin = handshake.headers?.origin;
  const originHeader = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
  if (!originHeader) return true;
  const origin = normalizeOrigin(originHeader);
  if (!origin) return false;
  if (allowed.has(origin)) return true;
  const rawHost = handshake.headers?.host;
  const host = (Array.isArray(rawHost) ? rawHost[0] : rawHost)?.trim().toLowerCase();
  return Boolean(host) && new URL(origin).host === host;
}
