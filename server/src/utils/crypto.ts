/**
 * AES-256-GCM encryption/decryption for sensitive API keys.
 * Uses STRIPE_ENCRYPTION_KEY env var as the symmetric key.
 */
import crypto from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = config.stripe.encryptionKey;
  if (!hex || hex.length < 32) {
    throw new Error('STRIPE_ENCRYPTION_KEY must be set (64 hex chars = 32 bytes)');
  }
  // Accept hex string (64 chars) or raw 32-byte string
  if (hex.length === 64 && /^[0-9a-fA-F]+$/.test(hex)) {
    return Buffer.from(hex, 'hex');
  }
  return Buffer.from(hex.slice(0, 32), 'utf8');
}

/**
 * Encrypt a plaintext API key.
 * Output format: base64(iv + authTag + ciphertext)
 */
export function encryptApiKey(plainKey: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack: iv(16) + authTag(16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt an encrypted API key back to plaintext.
 */
export function decryptApiKey(encryptedBase64: string): string {
  const key = getKey();
  const packed = Buffer.from(encryptedBase64, 'base64');
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
