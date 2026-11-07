import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";

// The only credentials typed in by hand are ones that belong to the user's own systems: a
// signing secret we generate for their app, or an auth header for their own API. Every
// third-party service is connected by signing in (server/oauth), never by pasting a token.

const name = z.string().trim().min(1).max(60);
export const ZAPIER_HOOK = /^https:\/\/hooks\.zapier\.com\/hooks\/catch\/\d{1,12}\/[A-Za-z0-9]{3,40}\/?$/;

export const credentialInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("webhook_secret"), name }),
  z.object({
    type: z.literal("http_header"),
    name,
    header: z.string().regex(/^[A-Za-z0-9-]{1,64}$/, "Header names use letters, digits and dashes"),
    value: z.string().min(1).max(2_000),
  }),
  // A "Webhooks by Zapier" Catch Hook URL the user created in their own Zap. It works like a
  // password (anyone holding it can trigger the Zap), so it's stored encrypted like one.
  z.object({
    type: z.literal("zapier_hook"),
    name,
    url: z.string().regex(ZAPIER_HOOK, "Paste the Catch Hook URL from Webhooks by Zapier (https://hooks.zapier.com/hooks/catch/…)"),
  }),
]);

export type CredentialInput = z.infer<typeof credentialInputSchema>;

export function materialize(input: CredentialInput): { plain: string; hint: string; revealOnce?: string } {
  if (input.type === "webhook_secret") {
    const plain = `mlwh_${randomBytes(32).toString("base64url")}`;
    return { plain, hint: `${plain.slice(0, 9)}…`, revealOnce: plain };
  }
  if (input.type === "zapier_hook") return { plain: input.url, hint: `hooks.zapier.com/…${input.url.replace(/\/$/, "").slice(-4)}` };
  return { plain: JSON.stringify({ header: input.header, value: input.value }), hint: `${input.header}: …${input.value.slice(-3)}` };
}
