import "server-only";
import { safeFetch } from "../engine/safe-fetch";

// Finding a Slack person: blocks accept a member ID (U0123ABCD) or the email address the
// person uses in Slack. An email is looked up with the workspace's bot token
// (users.lookupByEmail, which needs the users:read.email permission).

export type SlackTarget = { kind: "id"; id: string } | { kind: "email"; email: string } | { kind: "invalid" };

export function slackTarget(value: unknown): SlackTarget {
  const v = String(value ?? "").trim();
  if (/^[UW][A-Z0-9]{6,}$/.test(v)) return { kind: "id", id: v };
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v) && v.length <= 254) return { kind: "email", email: v.toLowerCase() };
  return { kind: "invalid" };
}

export class SlackLookupError extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "SlackLookupError";
  }
}

// Member IDs don't change, so a found person is remembered for a while: a busy channel must
// not cost one Slack call per message.
const TTL_MS = 10 * 60_000;
const found = new Map<string, { id: string; at: number }>();

export async function slackUserIdByEmail(token: string, email: string, signal?: AbortSignal): Promise<string> {
  const key = `${token.slice(-12)}:${email}`;
  const hit = found.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.id;
  const res = await safeFetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, { method: "GET", headers: { authorization: `Bearer ${token}` }, timeoutMs: 8_000, signal });
  const body = (res.body && typeof res.body === "object" ? res.body : {}) as { ok?: boolean; error?: string; user?: { id?: string } };
  if (res.status === 200 && body.ok === true && typeof body.user?.id === "string") {
    found.set(key, { id: body.user.id, at: Date.now() });
    return body.user.id;
  }
  const reason = String(body.error ?? `HTTP ${res.status}`);
  if (reason === "users_not_found") throw new SlackLookupError(reason, `No one in this Slack workspace uses ${email}. Use the email they sign in to Slack with, or their member ID.`);
  if (reason === "missing_scope") throw new SlackLookupError(reason, "This Slack connection can't look people up by email yet. Reconnect Slack in Connections, or use a member ID.");
  throw new SlackLookupError(reason, `Slack couldn't look up ${email} (${reason}).`);
}

// A member ID for whatever the block was given, or a SlackLookupError saying what to fix.
export async function resolveSlackUser(token: string, value: unknown, signal?: AbortSignal): Promise<string> {
  const target = slackTarget(value);
  if (target.kind === "id") return target.id;
  if (target.kind === "email") return slackUserIdByEmail(token, target.email, signal);
  throw new SlackLookupError("invalid", `"${String(value ?? "").slice(0, 60)}" isn't an email address or a Slack member ID (like U0123ABCD).`);
}
