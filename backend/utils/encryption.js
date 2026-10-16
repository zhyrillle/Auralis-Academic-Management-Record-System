const crypto = require('crypto');

// 32-byte (256-bit) encryption key for AES-256-GCM
const DEFAULT_KEY_HEX = 'cbd81d6999576a16dfd8395394422ca496c8b3374c74361a263cf5b7bcb5a8d2';
// 32-byte (256-bit) blind index HMAC key
const DEFAULT_BIDX_HEX = '84f3eb9aadd943c82420bbfc73a150f25626752be849e84c24f81f0d7a8a2364';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits standard for GCM
const PREFIX = 'enc:v1:';

function getEncryptionKey() {
  const keyHex = process.env.LRN_ENCRYPTION_KEY || DEFAULT_KEY_HEX;
  if (keyHex.length === 64) {
    return Buffer.from(keyHex, 'hex');
  }
  return crypto.createHash('sha256').update(keyHex).digest();
}

function getBlindIndexKey() {
  const keyHex = process.env.LRN_BLIND_INDEX_KEY || DEFAULT_BIDX_HEX;
  if (keyHex.length === 64) {
    return Buffer.from(keyHex, 'hex');
  }
  return crypto.createHash('sha256').update(keyHex).digest();
}

/**
 * Encrypts a plaintext LRN (12 digits) using Authenticated Symmetric Encryption (AES-256-GCM).
 * Output format: enc:v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 * @param {string|number} plaintext
 * @returns {string|null}
 */
function encryptLrn(plaintext) {
  if (plaintext === null || plaintext === undefined || String(plaintext).trim() === '') {
    return null;
  }
  const clean = String(plaintext).trim();
  // If already encrypted, return as-is
  if (clean.startsWith(PREFIX)) {
    return clean;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  let ciphertext = cipher.update(clean, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${PREFIX}${iv.toString('hex')}:${authTag}:${ciphertext}`;
}

/**
 * Decrypts an encrypted LRN back to its 12-digit plaintext value.
 * Fully backward-compatible: if stored LRN is legacy plaintext, returns it directly.
 * @param {string} cipherString
 * @returns {string|null}
 */
function decryptLrn(cipherString) {
  if (cipherString === null || cipherString === undefined || String(cipherString).trim() === '') {
    return null;
  }
  const str = String(cipherString).trim();
  if (!str.startsWith(PREFIX)) {
    return str; // Legacy unencrypted plaintext
  }

  try {
    const parts = str.slice(PREFIX.length).split(':');
    if (parts.length !== 3) return str;
    const [ivHex, authTagHex, ciphertextHex] = parts;

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt LRN:', err.message);
    return str;
  }
}

/**
 * Computes a deterministic HMAC-SHA256 blind index for exact-match searching and uniqueness.
 * Does not expose plaintext and cannot be reversed.
 * @param {string|number} plaintext
 * @returns {string|null}
 */
function hashLrn(plaintext) {
  if (plaintext === null || plaintext === undefined || String(plaintext).trim() === '') {
    return null;
  }
  const clean = String(plaintext).trim();
  const realLrn = clean.startsWith(PREFIX) ? decryptLrn(clean) : clean;
  if (!realLrn) return null;
  return crypto.createHmac('sha256', getBlindIndexKey()).update(realLrn).digest('hex');
}

/**
 * Masks an LRN for safe display in general UI views (e.g. "123456******").
 * @param {string|number} lrn
 * @returns {string}
 */
function maskLrn(lrn) {
  if (!lrn) return '';
  const plain = String(lrn).startsWith(PREFIX) ? decryptLrn(lrn) : String(lrn);
  if (!plain || plain.length < 6) return '******';
  return plain.slice(0, 6) + '******';
}

module.exports = {
  encryptLrn,
  decryptLrn,
  hashLrn,
  maskLrn,
};
