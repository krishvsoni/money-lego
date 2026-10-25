import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { env } from "../config/env";
import { errors } from "../errors";
import { masterKey, open } from "./aead";

// Envelope encryption for connection tokens and other user secrets.
//  - Every secret gets its own random 256-bit data key (DEK). The secret is sealed with the
//    DEK, and the DEK is sealed with a key-encryption key (KEK). Only the wrapped DEK is
//    stored, so one leaked DEK exposes one secret, never the rest.
//  - KEKs are derived with HKDF from master keys that exist only in the server's secret
//    store (a mounted file or env), never in the database or any response.
//  - Both layers authenticate associated data naming the owner, row and kind, so a
//    ciphertext copied to another user's row, or another field, refuses to decrypt.
//  - Master keys carry ids. New writes use the first key in the keyring; older ids still
//    decrypt, so keys rotate without downtime (scripts/rotate-credential-keys.ts rewraps).

const VERSION = 1;
const IV = 12;
const TAG = 16;

interface Keyring {
  active: string;
  keks: Map<string, Buffer>;
}

let cached: Keyring | null = null;

function parseKeyring(spec: string): Keyring {
  const keks = new Map<string, Buffer>();
  let active = "";
  for (const entry of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [kid, b64] = entry.split(":");
    const raw = Buffer.from(b64 ?? "", "base64");
    if (!/^[a-z0-9-]{1,16}$/.test(kid ?? "") || raw.length !== 32) throw new Error("Each keyring entry must be <id>:<32 bytes base64>.");
    keks.set(kid, Buffer.from(hkdfSync("sha256", raw, Buffer.alloc(0), "money-lego/credential-kek/v1", 32)));
    raw.fill(0);
    active ||= kid;
  }
  if (!active) throw new Error("The credential keyring is empty.");
  return { active, keks };
}

// Prefer a mounted secret file (Docker/Kubernetes secrets, a vault agent) so the key never
// shows up in process listings or env dumps; fall back to the env var, then to
// CREDENTIALS_KEY as a single key with id "k0".
function keyring(): Keyring {
  if (cached) return cached;
  const e = env();
  let spec = e.CREDENTIALS_KEYRING;
  if (e.CREDENTIALS_KEYRING_FILE) spec = readFileSync(e.CREDENTIALS_KEYRING_FILE, "utf8").trim();
  if (!spec && e.CREDENTIALS_KEY) spec = `k0:${e.CREDENTIALS_KEY}`;
  if (!spec) throw errors.notConfigured("Encryption at rest (CREDENTIALS_KEYRING)");
  cached = parseKeyring(spec);
  return cached;
}

function gcmSeal(key: Buffer, plain: Buffer, aad: string): Buffer {
  const iv = randomBytes(IV);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

function gcmOpen(key: Buffer, packed: Buffer, aad: string): Buffer {
  if (packed.length <= IV + TAG) throw errors.internal();
  const d = createDecipheriv("aes-256-gcm", key, packed.subarray(0, IV));
  d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(packed.subarray(IV, IV + TAG));
  try {
    return Buffer.concat([d.update(packed.subarray(IV + TAG)), d.final()]);
  } catch {
    throw errors.internal();
  }
}

export function sealSecret(plain: string, aad: string): string {
  const { active, keks } = keyring();
  const dek = randomBytes(32);
  try {
    const ct = gcmSeal(dek, Buffer.from(plain, "utf8"), `${aad}|data`);
    const wrapped = gcmSeal(keks.get(active)!, dek, `${aad}|dek|${active}`);
    return `ev${VERSION}.${active}.${wrapped.toString("base64url")}.${ct.toString("base64url")}`;
  } finally {
    dek.fill(0);
  }
}

export function openSecret(packed: string, aad: string): string {
  const parts = packed.split(".");
  if (parts[0] !== `ev${VERSION}` || parts.length !== 4) {
    // Written before envelope encryption: AES-GCM under the master key, no AAD.
    return open(masterKey(), packed);
  }
  const [, kid, wrapped, ct] = parts;
  const kek = keyring().keks.get(kid);
  if (!kek) throw errors.notConfigured(`Credential key "${kid}"`);
  const dek = gcmOpen(kek, Buffer.from(wrapped, "base64url"), `${aad}|dek|${kid}`);
  try {
    return gcmOpen(dek, Buffer.from(ct, "base64url"), `${aad}|data`).toString("utf8");
  } finally {
    dek.fill(0);
  }
}

// True when a value isn't sealed under the active key yet (legacy or an older key id).
export function needsRewrap(packed: string): boolean {
  const parts = packed.split(".");
  return parts[0] !== `ev${VERSION}` || parts[1] !== keyring().active;
}

export const credentialAad = (ownerId: string, credentialId: string, type: string) => `credential:${ownerId}:${credentialId}:${type}`;

export function resetKeyringForTests(): void {
  cached = null;
}
