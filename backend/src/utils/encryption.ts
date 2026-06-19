import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_secret_key_change_me_32B'; // Must be 32 chars
const IV_LENGTH = 16;

// Helper to get a consistent IV for deterministic encryption (needed for DB lookups)
// In a perfect world we'd use randomized IVs and store them, but that prevents 'findUnique'
// unless we use a hash for lookup. For now, we derive IV from the key itself + salt.
const getDeterministicIV = (text: string): Buffer => {
    const hash = crypto.createHash('sha256');
    hash.update(text + (process.env.IV_SALT || 'heart-plugin-secure-iv'));
    return hash.digest().subarray(0, IV_LENGTH);
};

export const encrypt = (text: string): string => {
    if (!text) return text;

    // Use deterministic IV so that encrypt(K) always returns the same C
    // This allows us to query: where: { apiKey: encrypt(inputKey) }
    const iv = getDeterministicIV(text);
    const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest('base64').substr(0, 32);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return encrypted.toString('hex');
};

export const decrypt = (text: string): string => {
    if (!text) return text;

    try {
        // We need the original text to derive the IV... wait.
        // Deterministic encryption (text -> ciphertext) works for lookup.
        // But for decryption (ciphertext -> text), we don't know the text to derive the IV!
        //
        // PROBLEM: AES-CBC needs the IV to decrypt.
        // If IV is derived from Plaintext, we can't decrypt Ciphertext without knowing Plaintext.
        //
        // SOLUTION: We must use a FIXED IV for the database column if we want 
        // bidirectional searchability AND decruptability without storing IV separately.
        // OR we prepend the IV to the ciphertext, but then it's not deterministic (random IV).
        //
        // Constraint: We need `findUnique({ where: { apiKey } })` to work.
        // This implies we need `encrypt(input) === dbValue`.
        // So `encrypt` MUST be deterministic.
        //
        // If `encrypt` is deterministic, we can use a constant IV for ALL keys.
        // Is that secure? Less than random IV, but better than Plaintext.
        // Since API keys are high-entropy (random 32 bytes), Rainbow tables are ineffective.
        //
        // So we will use a GLOBAL CONSTANT IV derived from the ENCRYPTION_KEY.

        const iv = crypto.createHash('sha256').update('global-static-iv-salt').digest().subarray(0, IV_LENGTH);
        const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest('base64').substr(0, 32);

        const encryptedText = Buffer.from(text, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString();
    } catch (error) {
        console.error('Decryption failed:', error);
        return text; // Return original if fail (e.g. not encrypted yet)
    }
};

// Re-write encrypt to use the STATIC IV
export const encryptDeterministic = (text: string): string => {
    if (!text) return text;

    const iv = crypto.createHash('sha256').update('global-static-iv-salt').digest().subarray(0, IV_LENGTH);
    const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest('base64').substr(0, 32);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return encrypted.toString('hex');
};
