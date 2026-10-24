import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import type { CredentialType } from "@/lib/nodes/types";
import type { SessionUser } from "../auth/session";
import { env } from "../config/env";
import { collections } from "../db/collections";
import { parseId } from "../db/ids";
import type { CredentialDoc } from "../db/types";
import { errors } from "../errors";

// Secrets are encrypted at rest with AES-256-GCM under a key that lives only in the server
// environment. A database dump alone yields nothing usable. No API ever returns a secret;
// the UI only sees a name and a short hint.

function key(): Buffer {
  const k = env().CREDENTIALS_KEY;
  if (!k) throw errors.notConfigured("Credential encryption (CREDENTIALS_KEY)");
  return Buffer.from(k, "base64");
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

function decrypt(packed: string): string {
  const raw = Buffer.from(packed, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

const discordUrl = z.url().refine((u) => /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(u), "Use a Discord webhook URL (https://discord.com/api/webhooks/…)");
const slackUrl = z.url().refine((u) => u.startsWith("https://hooks.slack.com/services/"), "Use a Slack incoming webhook URL (https://hooks.slack.com/services/…)");

export const credentialInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("webhook_secret"), name: z.string().trim().min(1).max(60) }),
  z.object({ type: z.literal("discord_webhook"), name: z.string().trim().min(1).max(60), url: discordUrl }),
  z.object({ type: z.literal("slack_webhook"), name: z.string().trim().min(1).max(60), url: slackUrl }),
  z.object({
    type: z.literal("http_header"),
    name: z.string().trim().min(1).max(60),
    header: z.string().regex(/^[A-Za-z0-9-]{1,64}$/, "Header names use letters, digits and dashes"),
    value: z.string().min(1).max(2_000),
  }),
]);

export type CredentialInput = z.infer<typeof credentialInputSchema>;

export interface CredentialDTO {
  id: string;
  type: CredentialType;
  name: string;
  hint: string;
  createdAt: string;
}

const toDTO = (d: CredentialDoc): CredentialDTO => ({ id: d._id.toHexString(), type: d.type, name: d.name, hint: d.hint, createdAt: d.createdAt.toISOString() });

export async function listCredentials(user: SessionUser): Promise<CredentialDTO[]> {
  const { credentials } = await collections();
  const docs = await credentials.find({ ownerId: user.userId }, { projection: { secret: 0 } }).sort({ createdAt: -1 }).toArray();
  return docs.map((d) => toDTO(d as CredentialDoc));
}

// Returns the new credential and, for generated webhook secrets, the secret itself. That
// response is the only time the secret is ever shown.
export async function createCredential(user: SessionUser, input: CredentialInput): Promise<{ credential: CredentialDTO; revealOnce?: string }> {
  let plain: string;
  let hint: string;
  let revealOnce: string | undefined;
  switch (input.type) {
    case "webhook_secret":
      plain = `mlwh_${randomBytes(32).toString("base64url")}`;
      hint = `${plain.slice(0, 9)}…`;
      revealOnce = plain;
      break;
    case "discord_webhook":
    case "slack_webhook":
      plain = input.url;
      hint = `${new URL(input.url).host}/…${input.url.slice(-4)}`;
      break;
    case "http_header":
      plain = JSON.stringify({ header: input.header, value: input.value });
      hint = `${input.header}: …${input.value.slice(-3)}`;
      break;
  }
  const doc: CredentialDoc = { _id: new ObjectId(), ownerId: user.userId, type: input.type, name: input.name, secret: encrypt(plain), hint, createdAt: new Date() };
  const { credentials } = await collections();
  await credentials.insertOne(doc);
  return { credential: toDTO(doc), revealOnce };
}

export async function deleteCredential(user: SessionUser, id: string): Promise<void> {
  const { credentials } = await collections();
  const result = await credentials.deleteOne({ _id: parseId(id, "Credential"), ownerId: user.userId });
  if (!result.deletedCount) throw errors.notFound("Credential");
}

// Engine-side read. Ownership is enforced here too: a workflow can only use credentials
// that belong to the workflow's owner, whatever id its config holds.
export async function readCredentialSecret(ownerId: ObjectId, id: unknown, type: CredentialType): Promise<string> {
  if (typeof id !== "string" || !ObjectId.isValid(id)) throw errors.validation("Pick a credential for this node.");
  const { credentials } = await collections();
  const doc = await credentials.findOne({ _id: new ObjectId(id), ownerId, type });
  if (!doc) throw errors.validation("The selected credential no longer exists. Pick another.");
  return decrypt(doc.secret);
}
