import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "../config/env";
import { errors } from "../errors";

// AES-256-GCM with a random 96-bit IV per value. Output is base64 of iv(12) | tag(16) |
// ciphertext. The optional associated data binds a ciphertext to where it is stored, so a
// value copied from one field into another fails authentication instead of decrypting.

const IV_BYTES = 12;
const TAG_BYTES = 16;

export function masterKey(): Buffer {
  const k = env().CREDENTIALS_KEY;
  if (!k) throw errors.notConfigured("Encryption at rest (CREDENTIALS_KEY)");
  return Buffer.from(k, "base64");
}

// Independent subkeys per purpose: the key that encrypts one kind of secret never doubles as the key
// that indexes them, and neither is the raw credentials key.
const derived = new Map<string, Buffer>();
export function subkey(purpose: string): Buffer {
  let k = derived.get(purpose);
  if (!k) {
    k = Buffer.from(hkdfSync("sha256", masterKey(), Buffer.alloc(0), `money-lego/${purpose}`, 32));
    derived.set(purpose, k);
  }
  return k;
}

export function seal(key: Buffer, plain: string, aad?: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function open(key: Buffer, packed: string, aad?: string): string {
  const raw = Buffer.from(packed, "base64");
  if (raw.length <= IV_BYTES + TAG_BYTES) throw errors.internal();
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_BYTES));
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  try {
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    // Tampered, truncated or moved ciphertext. Never surface crypto detail to callers.
    throw errors.internal();
  }
}
