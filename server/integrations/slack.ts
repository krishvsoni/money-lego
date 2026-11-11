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
  if (reason === "missing_scope") throw new SlackLookupError(reason, "This Slack connection was made before Money Lego could find people by email. Open Connections, press Reconnect on your Slack connection and allow it, then run this again. Until then, use a member ID or {{ trigger.taggedUserId }}.");
  throw new SlackLookupError(reason, `Slack couldn't look up ${email} (${reason}).`);
}

// A member ID for whatever the block was given, or a SlackLookupError saying what to fix.
export async function resolveSlackUser(token: string, value: unknown, signal?: AbortSignal): Promise<string> {
  const target = slackTarget(value);
  if (target.kind === "id") return target.id;
  if (target.kind === "email") return slackUserIdByEmail(token, target.email, signal);
  throw new SlackLookupError("invalid", `"${String(value ?? "").slice(0, 60)}" isn't an email address or a Slack member ID (like U0123ABCD).`);
}

// ---------- sending a direct message ----------

export interface SlackDmResult {
  channel: string;
  ts: string;
  // "dm": a real direct message. "private_note": Slack wouldn't allow a DM from the app, so
  // the person got the message in the channel instead, visible only to them.
  via: "dm" | "private_note";
}

const MESSAGES_TAB_FIX =
  "Slack blocks direct messages from this app because its Messages tab is off. In your Slack app settings (api.slack.com/apps), open App Home, turn on Messages Tab under Show Tabs, and tick \"Allow users to send Slash commands and messages from the messages tab\". Then run this again.";

async function slackPost(token: string, method: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<{ ok: boolean; error: string; body: Record<string, unknown> }> {
  const res = await safeFetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    timeoutMs: 10_000,
    signal,
  });
  const body = (res.body && typeof res.body === "object" ? res.body : {}) as Record<string, unknown>;
  const ok = res.status === 200 && body.ok === true;
  return { ok, error: ok ? "" : String(body.error ?? `HTTP ${res.status}`), body };
}

// Sends `text` to one member. When the app's Messages tab is off, Slack refuses every DM from
// it; if the run started in a channel, the person gets the message there instead, visible
// only to them, so a payment link still reaches them and nobody else. Throws
// SlackLookupError (reason = Slack's error code) with what to fix.
export async function sendSlackDm(input: { token: string; userId: string; text: string; fallbackChannel?: string | null; signal?: AbortSignal }): Promise<SlackDmResult> {
  const dm = await slackPost(input.token, "chat.postMessage", { channel: input.userId, text: input.text }, input.signal);
  if (dm.ok) return { channel: String(dm.body.channel ?? ""), ts: String(dm.body.ts ?? ""), via: "dm" };

  if (dm.error === "messages_tab_disabled") {
    const channel = input.fallbackChannel && /^[CG][A-Z0-9]{6,}$/.test(input.fallbackChannel) ? input.fallbackChannel : null;
    if (channel) {
      const note = await slackPost(input.token, "chat.postEphemeral", { channel, user: input.userId, text: input.text }, input.signal);
      if (note.ok) return { channel, ts: String(note.body.message_ts ?? ""), via: "private_note" };
    }
    throw new SlackLookupError(dm.error, MESSAGES_TAB_FIX);
  }
  if (dm.error === "missing_scope") throw new SlackLookupError(dm.error, "This Slack connection can't send direct messages yet. Open Connections, press Reconnect on your Slack connection and allow it.");
  if (dm.error === "user_not_found" || dm.error === "channel_not_found") throw new SlackLookupError(dm.error, "Slack couldn't find that person. Check the email or member ID.");
  throw new SlackLookupError(dm.error, `Slack didn't deliver the direct message (${dm.error}).`);
}
