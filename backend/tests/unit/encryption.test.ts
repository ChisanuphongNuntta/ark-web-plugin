import { beforeEach, describe, expect, it } from 'vitest';
import {
  decrypt,
  encrypt,
  encryptDeterministic,
  encryptDeterministicLegacy,
} from '../../src/utils/encryption.js';

describe('credential encryption', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'unit-test-encryption-key-with-at-least-32-characters';
  });

  it('uses randomized authenticated encryption for recoverable secrets', () => {
    const first = encrypt('server-signing-secret');
    const second = encrypt('server-signing-secret');
    expect(first).not.toBe(second);
    expect(decrypt(first)).toBe('server-signing-secret');
    expect(decrypt(second)).toBe('server-signing-secret');
  });

  it('fails closed when authenticated ciphertext is modified', () => {
    const encrypted = encrypt('server-signing-secret');
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith('A') ? 'B' : 'A'}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('creates stable one-way API-key lookup tokens', () => {
    const first = encryptDeterministic('high-entropy-api-key');
    const second = encryptDeterministic('high-entropy-api-key');
    expect(first).toBe(second);
    expect(first).toMatch(/^h1\./);
    expect(() => decrypt(first)).toThrow();
  });

  it('can decrypt legacy AES-CBC rows during credential rotation', () => {
    const legacy = encryptDeterministicLegacy('legacy-server-secret');
    expect(decrypt(legacy)).toBe('legacy-server-secret');
  });
});
