import "server-only";
import { ObjectId } from "mongodb";
import type { ConnectionType } from "@/lib/nodes/types";
import { credentialAad, openSecret, sealSecret } from "../crypto/envelope";
import { collections, isDuplicateKeyError } from "../db/collections";
import { withLease } from "../db/locks";
import type { CredentialDoc } from "../db/types";
import { log } from "../log";
import { adapterFor } from "./adapters";
import { OAuthError, type ConnectionSecret, type Grant } from "./types";

// Connections are stored in the credentials collection, one per user and account, so
// workflows reference them exactly like any credential. Secrets are envelope-encrypted
// with associated data naming owner, row and kind (server/crypto/envelope.ts).

const REFRESH_EARLY_MS = 90_000;
const aadOf = (d: Pick<CredentialDoc, "_id" | "ownerId" | "type">) => credentialAad(d.ownerId.toHexString(), d._id.toHexString(), d.type);

export function sealFor(doc: Pick<CredentialDoc, "_id" | "ownerId" | "type">, secret: ConnectionSecret | string): string {
  return sealSecret(typeof secret === "string" ? secret : JSON.stringify(secret), aadOf(doc));
}

export function openFor(doc: CredentialDoc): string {
  return openSecret(doc.secret, aadOf(doc));
}

function parseSecret(doc: CredentialDoc): ConnectionSecret {
  const plain = openFor(doc);
  try {
    const parsed = JSON.parse(plain);
    if (parsed && typeof parsed === "object") return parsed as ConnectionSecret;
  } catch {
    // Connections made before JSON secrets stored a bare webhook URL.
  }
  return { webhookUrl: plain };
}

// Reconnecting the same account keeps the same id, so workflows that use it keep working.
export async function saveConnection(ownerId: ObjectId, type: ConnectionType, grant: Grant): Promise<CredentialDoc> {
  const { credentials } = await collections();
  const filter = { ownerId, type, "account.id": grant.account.id };
  const existing = await credentials.findOne(filter, { projection: { _id: 1 } });
  const id = existing?._id ?? new ObjectId();
  const now = new Date();
  const fields = {
    name: grant.account.name.slice(0, 60),
    hint: grant.account.detail?.slice(0, 60) ?? grant.account.name.slice(0, 60),
    account: grant.account,
    scopes: grant.scopes,
    connectedAt: now,
    check: { ok: true, at: now, message: "Connected by signing in." },
  };
  const write = async (target: ObjectId) =>
    credentials.findOneAndUpdate(
      filter,
      { $set: { ...fields, secret: sealFor({ _id: target, ownerId, type }, grant.secret) }, $setOnInsert: { _id: target, ownerId, type, createdAt: now } },
      { upsert: true, returnDocument: "after" },
    );
  let doc: CredentialDoc | null;
  try {
    doc = await write(id);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    doc = await write(id);
  }
  // A concurrent callback inserted first under another id: reseal for the row that exists.
  if (doc && !doc._id.equals(id)) doc = await write(doc._id);
  if (!doc) throw new OAuthError("Couldn't save the connection.");
  return doc;
}

async function loadOwned(ownerId: ObjectId, id: unknown, types: readonly string[]): Promise<CredentialDoc> {
  if (typeof id !== "string" || !ObjectId.isValid(id)) throw new OAuthError("Pick a connection for this step.");
  const { credentials } = await collections();
  const doc = await credentials.findOne({ _id: new ObjectId(id), ownerId, type: { $in: [...types] as CredentialDoc["type"][] } });
  if (!doc) throw new OAuthError("The selected connection no longer exists. Connect it again.");
  return doc;
}

// The engine's way to use a connection. Expired access tokens are refreshed under a lease,
// so instances racing on one connection refresh once; rotating refresh tokens (Airtable)
// would otherwise invalidate each other.
export async function openConnection(ownerId: ObjectId, id: unknown, type: ConnectionType): Promise<{ secret: ConnectionSecret; account: NonNullable<CredentialDoc["account"]> }> {
  const doc = await loadOwned(ownerId, id, [type]);
  const secret = parseSecret(doc);
  const account = doc.account ?? { id: "", name: doc.name };
  if (!secret.expiresAt || secret.expiresAt - REFRESH_EARLY_MS > Date.now()) return { secret, account };

  // One refresh per connection: callers in this process share a single in-flight promise,
  // and the database lease covers other instances.
  const key = doc._id.toHexString();
  let pending = inflight.get(key);
  if (!pending) {
    pending = refreshShared(ownerId, id, type).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return { secret: await pending, account };
}

const inflight = new Map<string, Promise<ConnectionSecret>>();

async function refreshShared(ownerId: ObjectId, id: unknown, type: ConnectionType): Promise<ConnectionSecret> {
  const adapter = adapterFor(type);
  if (!adapter?.refresh) throw new OAuthError("This connection expired. Reconnect it in Connections.", true);
  const { credentials, locks } = await collections();
  let doc = await loadOwned(ownerId, id, [type]);
  for (let attempt = 0; attempt < 4; attempt++) {
    const outcome = await withLease(locks, `oauth-refresh:${doc._id.toHexString()}`, 30_000, async () => {
      const fresh = await credentials.findOne({ _id: doc._id, ownerId });
      if (!fresh) throw new OAuthError("The connection was removed.");
      const current = parseSecret(fresh);
      if (current.expiresAt && current.expiresAt - REFRESH_EARLY_MS > Date.now()) return current;
      try {
        const next = await adapter.refresh!(current);
        await credentials.updateOne({ _id: fresh._id, secret: fresh.secret }, { $set: { secret: sealFor(fresh, next), check: { ok: true, at: new Date(), message: "Access renewed." } } });
        return next;
      } catch (error) {
        const reconnect = error instanceof OAuthError && error.reconnect;
        if (reconnect) await credentials.updateOne({ _id: fresh._id }, { $set: { check: { ok: false, at: new Date(), message: "Access was revoked or expired. Reconnect." } } });
        log.warn("oauth.refresh_failed", { type, credentialId: fresh._id.toHexString(), reconnect });
        throw error;
      }
    });
    if (outcome.acquired) return outcome.value;
    // Another instance is refreshing; wait for its result to land.
    await new Promise((r) => setTimeout(r, 400));
    doc = await loadOwned(ownerId, id, [type]);
    const secret = parseSecret(doc);
    if (secret.expiresAt && secret.expiresAt - REFRESH_EARLY_MS > Date.now()) return secret;
  }
  throw new OAuthError("Couldn't renew access right now. Retry in a minute.");
}

export async function revokeConnection(doc: CredentialDoc): Promise<void> {
  const adapter = adapterFor(doc.type);
  if (!adapter?.revoke || !doc.account) return;
  try {
    await adapter.revoke(parseSecret(doc), doc.account);
  } catch (error) {
    // The local copy is deleted regardless; the user can also remove access at the provider.
    log.warn("oauth.revoke_failed", { type: doc.type, error: error instanceof Error ? error.message : "unknown" });
  }
}

export async function probeConnection(doc: CredentialDoc): Promise<string | null> {
  const adapter = adapterFor(doc.type);
  if (!adapter?.probe || !doc.account) return null;
  const { secret } = await openConnection(doc.ownerId, doc._id.toHexString(), doc.type as ConnectionType);
  return adapter.probe(secret, doc.account);
}
