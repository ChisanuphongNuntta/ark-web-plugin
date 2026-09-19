import crypto from 'crypto';

const GCM_ALGORITHM = 'aes-256-gcm';
const GCM_IV_LENGTH = 12;
const LEGACY_ALGORITHM = 'aes-256-cbc';
const LEGACY_IV_LENGTH = 16;

function configuredSecret(): string {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error('ENCRYPTION_KEY must be configured with at least 32 characters');
  }
  return secret;
}

function encryptionKey(): Buffer {
  return crypto.createHash('sha256').update(configuredSecret(), 'utf8').digest();
}

function lookupKey(): Buffer {
  return crypto.createHmac('sha256', encryptionKey()).update('heartshop:lookup:v1').digest();
}

/**
 * Authenticated, randomized encryption for secrets that must be recovered at runtime
 * (for example a server plugin HMAC secret). The IV and authentication tag are stored
 * with the ciphertext; tampering always causes decryption to fail closed.
 */
export const encrypt = (text: string): string => {
  if (!text) return text;
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv(GCM_ALGORITHM, encryptionKey(), iv);
  cipher.setAAD(Buffer.from('heartshop:secret:v2'));
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
};

/**
 * One-way deterministic lookup token for high-entropy API keys. HMAC is appropriate
 * here because callers only need equality lookup; plaintext keys are returned once at
 * issuance and are never decrypted or displayed again.
 */
export const encryptDeterministic = (text: string): string => {
  if (!text) return text;
  return `h1.${crypto.createHmac('sha256', lookupKey()).update(text, 'utf8').digest('base64url')}`;
};

/** Compatibility token for existing AES-CBC API-key rows during online migration. */
export const encryptDeterministicLegacy = (text: string): string => {
  if (!text) return text;
  const iv = crypto.createHash('sha256').update('global-static-iv-salt').digest().subarray(0, LEGACY_IV_LENGTH);
  const legacyKey = crypto.createHash('sha256').update(configuredSecret()).digest('base64').substring(0, 32);
  const cipher = crypto.createCipheriv(LEGACY_ALGORITHM, legacyKey, iv);
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('hex');
};

function decryptLegacy(text: string): string {
  if (!/^[0-9a-f]+$/i.test(text) || text.length % 2 !== 0) {
    throw new Error('Unsupported legacy ciphertext format');
  }
  const iv = crypto.createHash('sha256').update('global-static-iv-salt').digest().subarray(0, LEGACY_IV_LENGTH);
  const legacyKey = crypto.createHash('sha256').update(configuredSecret()).digest('base64').substring(0, 32);
  const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, legacyKey, iv);
  return Buffer.concat([decipher.update(Buffer.from(text, 'hex')), decipher.final()]).toString('utf8');
}

export const decrypt = (text: string): string => {
  if (!text) return text;
  if (!text.startsWith('v2.')) return decryptLegacy(text);

  const [version, ivEncoded, tagEncoded, ciphertextEncoded, extra] = text.split('.');
  if (version !== 'v2' || !ivEncoded || !tagEncoded || !ciphertextEncoded || extra) {
    throw new Error('Invalid encrypted secret format');
  }

  const iv = Buffer.from(ivEncoded, 'base64url');
  const tag = Buffer.from(tagEncoded, 'base64url');
  if (iv.length !== GCM_IV_LENGTH || tag.length !== 16) {
    throw new Error('Invalid encrypted secret parameters');
  }

  const decipher = crypto.createDecipheriv(GCM_ALGORITHM, encryptionKey(), iv);
  decipher.setAAD(Buffer.from('heartshop:secret:v2'));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};
