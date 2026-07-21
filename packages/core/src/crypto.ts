import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { serverEnv } from "./env.ts";

/**
 * AES-256-GCM encryption for third-party secrets (Evolution apiKey, AI provider
 * keys) stored at rest. Ciphertext layout, base64-encoded:
 *   [ 12-byte IV | 16-byte auth tag | ciphertext ]
 */
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = "aes-256-gcm";

function key(): Buffer {
  return Buffer.from(serverEnv().APP_ENCRYPTION_KEY, "base64");
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** Last 4 visible chars for display, e.g. "••••3f9a". Never returns the secret. */
export function maskSecret(plaintext: string): string {
  const tail = plaintext.slice(-4);
  return `••••${tail}`;
}
