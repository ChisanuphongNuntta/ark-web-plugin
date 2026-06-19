import crypto from 'crypto';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import { encryptDeterministic, decrypt } from '../utils/encryption.js';

/**
 * Server / plugin signing credential service (M2 hardening, CR-PLUGIN-001).
 *
 * A signing credential is a pair `{ keyId, secret }` scoped to a single server:
 *   - `keyId`  identifies WHICH secret to use. It is safe to log and travels on the wire in
 *              the `X-Plugin-Key-Id` header. It is NOT the secret.
 *   - `secret` is the HMAC-SHA256 signing key. It is stored encrypted-at-rest and NEVER
 *              transmitted or returned by any read endpoint.
 *
 * The signed-plugin middleware resolves `keyId -> secret` here and verifies `X-Signature`
 * against the resolved secret — not against the keyId. Rotation issues a fresh pair; the old
 * keyId is revoked independently. An overlap window can keep multiple keyIds active so a
 * running plugin can switch keyIds with zero downtime.
 */

export interface IssuedCredential {
  /** Public identifier sent on the wire (X-Plugin-Key-Id). Safe to log/store. */
  keyId: string;
  /** Plaintext HMAC secret. Returned ONLY at issuance time; never persisted in clear. */
  secret: string;
  serverId: number;
  id: string;
}

export interface ResolvedCredential {
  id: string;
  serverId: number;
  keyId: string;
  /** Decrypted HMAC secret used to verify X-Signature. */
  secret: string;
  status: string;
}

const generateKeyId = () => `pk_${crypto.randomBytes(12).toString('hex')}`;
const generateSecret = () => crypto.randomBytes(32).toString('hex');

export class PluginCredentialService {
  /**
   * Issue a new `{ keyId, secret }` pair for a server. The plaintext secret is returned exactly
   * once (caller must hand it to the plugin operator); only the encrypted form is persisted.
   */
  async issue(serverId: number, label?: string): Promise<IssuedCredential> {
    const server = await prisma.server.findUnique({ where: { id: serverId }, select: { id: true } });
    if (!server) throw new AppError(`Server ID ${serverId} not found`, 404);

    const keyId = generateKeyId();
    const secret = generateSecret();

    const created = await prisma.serverCredential.create({
      data: {
        serverId,
        keyId,
        secretEnc: encryptDeterministic(secret),
        label: label ?? null,
        status: 'active',
      },
    });

    return { id: created.id, keyId, secret, serverId };
  }

  /**
   * Rotate: issue a new pair AND (optionally) revoke the previous keyId. By default the old
   * keyId stays active during an overlap window so the plugin can switch with zero downtime;
   * pass `revokePreviousKeyId` to flip the old one to revoked immediately.
   */
  async rotate(serverId: number, revokePreviousKeyId?: string, label?: string): Promise<IssuedCredential> {
    const issued = await this.issue(serverId, label);
    if (revokePreviousKeyId) {
      await this.revoke(revokePreviousKeyId);
    }
    return issued;
  }

  /** Revoke a keyId. Reversible at the data level (sets status + revokedAt; row is kept for audit). */
  async revoke(keyId: string): Promise<void> {
    await prisma.serverCredential.updateMany({
      where: { keyId, status: 'active' },
      data: { status: 'revoked', revokedAt: new Date() },
    });
  }

  /**
   * Resolve a keyId to its credential + decrypted secret. Returns null when the keyId is
   * unknown or revoked so the middleware can fall back to the legacy path during overlap.
   */
  async resolve(keyId: string): Promise<ResolvedCredential | null> {
    if (!keyId) return null;
    const cred = await prisma.serverCredential.findUnique({
      where: { keyId },
      select: { id: true, serverId: true, keyId: true, secretEnc: true, status: true },
    });
    if (!cred || cred.status !== 'active') return null;

    const secret = decrypt(cred.secretEnc);
    if (!secret) return null;

    return {
      id: cred.id,
      serverId: cred.serverId,
      keyId: cred.keyId,
      secret,
      status: cred.status,
    };
  }

  /** Touch lastUsedAt for telemetry; best-effort, never throws into the request path. */
  async markUsed(id: string): Promise<void> {
    try {
      await prisma.serverCredential.update({ where: { id }, data: { lastUsedAt: new Date() } });
    } catch {
      /* non-fatal */
    }
  }
}

export default new PluginCredentialService();
