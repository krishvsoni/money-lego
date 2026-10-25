import "server-only";
import { ObjectId } from "mongodb";
import { missingPermissions } from "@/lib/connections/catalog";
import type { CredentialType } from "@/lib/nodes/types";
import type { SessionUser } from "../auth/session";
import { collections } from "../db/collections";
import { parseId } from "../db/ids";
import type { CredentialDoc } from "../db/types";
import { errors } from "../errors";
import { openFor, revokeConnection, sealFor } from "../oauth/store";
import { materialize, type CredentialInput } from "./credential-schema";

export { credentialInputSchema, type CredentialInput } from "./credential-schema";

// Every secret is envelope-encrypted, bound to its owner, row and kind (see
// server/crypto/envelope.ts). No API ever returns one: the UI sees a name, a hint, the
// account it's connected as and the permissions that account granted.

export interface CredentialDTO {
  id: string;
  type: CredentialType;
  name: string;
  hint: string;
  // Only set after a real call to the provider; a filled-in field alone is never "connected".
  check: { ok: boolean; at: string; message: string } | null;
  account: { id: string; name: string; detail?: string } | null;
  scopes: string[];
  missingScopes: string[];
  connectedAt: string | null;
  createdAt: string;
}

export const credentialDTO = (d: CredentialDoc): CredentialDTO => ({
  id: d._id.toHexString(),
  type: d.type,
  name: d.name,
  hint: d.hint,
  check: d.check ? { ok: d.check.ok, at: d.check.at.toISOString(), message: d.check.message } : null,
  account: d.account ?? null,
  scopes: d.scopes ?? [],
  missingScopes: d.account ? missingPermissions(d.type, d.scopes ?? []) : [],
  connectedAt: d.connectedAt?.toISOString() ?? null,
  createdAt: d.createdAt.toISOString(),
});

export async function listCredentials(user: SessionUser): Promise<CredentialDTO[]> {
  const { credentials } = await collections();
  const docs = await credentials.find({ ownerId: user.userId }, { projection: { secret: 0 } }).sort({ createdAt: -1 }).toArray();
  return docs.map((d) => credentialDTO(d as CredentialDoc));
}

// Returns the new credential and, for generated webhook secrets, the secret itself. That
// response is the only time the secret is ever shown.
export async function createCredential(user: SessionUser, input: CredentialInput): Promise<{ credential: CredentialDTO; revealOnce?: string }> {
  const { plain, hint, revealOnce } = materialize(input);
  const _id = new ObjectId();
  const doc: CredentialDoc = { _id, ownerId: user.userId, type: input.type, name: input.name, secret: sealFor({ _id, ownerId: user.userId, type: input.type }, plain), hint, check: null, createdAt: new Date() };
  const { credentials } = await collections();
  await credentials.insertOne(doc);
  return { credential: credentialDTO(doc), revealOnce };
}

// Disconnecting gives the access back to the provider first (revoking the token, deleting
// the channel webhook, deauthorizing the Stripe account), then deletes our copy.
export async function deleteCredential(user: SessionUser, id: string): Promise<void> {
  const { credentials } = await collections();
  const doc = await credentials.findOne({ _id: parseId(id, "Credential"), ownerId: user.userId });
  if (!doc) throw errors.notFound("Credential");
  if (doc.account) await revokeConnection(doc);
  await credentials.deleteOne({ _id: doc._id, ownerId: user.userId });
}

// Engine-side read of a manual credential. Ownership is enforced here too: a workflow can
// only use credentials that belong to the workflow's owner, whatever id its config holds.
export async function readCredentialSecret(ownerId: ObjectId, id: unknown, type: CredentialType): Promise<string> {
  if (typeof id !== "string" || !ObjectId.isValid(id)) throw errors.validation("Pick a credential for this node.");
  const { credentials } = await collections();
  const doc = await credentials.findOne({ _id: new ObjectId(id), ownerId, type });
  if (!doc) throw errors.validation("The selected credential no longer exists. Pick another.");
  return openFor(doc);
}

export async function readOwnedCredential(user: SessionUser, id: string): Promise<CredentialDoc> {
  const { credentials } = await collections();
  const doc = await credentials.findOne({ _id: parseId(id, "Credential"), ownerId: user.userId });
  if (!doc) throw errors.notFound("Credential");
  return doc;
}

export async function recordCheck(ownerId: ObjectId, id: ObjectId, check: { ok: boolean; message: string }): Promise<CredentialDTO | null> {
  const { credentials } = await collections();
  const next = await credentials.findOneAndUpdate({ _id: id, ownerId }, { $set: { check: { ...check, at: new Date() } } }, { returnDocument: "after", projection: { secret: 0 } });
  return next ? credentialDTO(next as CredentialDoc) : null;
}
