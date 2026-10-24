import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { NodeError } from "./types";

// Outbound HTTP for workflow nodes. Workflows are user-authored, so every request is
// treated as hostile to our own network: HTTPS only, no redirects, and every resolved
// address is checked inside the socket's own lookup, which also defeats DNS rebinding
// (the address we check is the address we connect to).

const MAX_RESPONSE_BYTES = 64 * 1024;

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
}

export function isBlockedAddress(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateV4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
}

const guardedLookup = ((hostname: string, options: object, callback: (err: Error | null, address: string | LookupAddress[], family?: number) => void) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => isBlockedAddress(a.address))) {
      return callback(new Error(`Refusing to connect to a private or internal address for ${hostname}`), []);
    }
    const wantsAll = (options as { all?: boolean }).all;
    return wantsAll ? callback(null, list) : callback(null, list[0].address, list[0].family);
  });
}) as never;

const agent = new Agent({ connect: { lookup: guardedLookup, timeout: 10_000 } });

export interface SafeResponse {
  status: number;
  body: unknown;
}

export async function safeFetch(
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string; timeoutMs: number; signal?: AbortSignal },
): Promise<SafeResponse> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new NodeError("That URL isn't valid.");
  }
  if (parsed.protocol !== "https:") throw new NodeError("Only https:// URLs are allowed.");
  if (parsed.username || parsed.password) throw new NodeError("Put credentials in a header credential, not the URL.");
  if (isIP(parsed.hostname.replace(/^\[|\]$/g, "")) && isBlockedAddress(parsed.hostname.replace(/^\[|\]$/g, ""))) {
    throw new NodeError("Private and internal addresses are blocked.");
  }

  const signals = [AbortSignal.timeout(init.timeoutMs), ...(init.signal ? [init.signal] : [])];
  let res: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    res = await undiciFetch(parsed, {
      method: init.method,
      headers: { "user-agent": "MoneyLego-Workflow/1", ...init.headers },
      body: init.body,
      redirect: "manual",
      dispatcher: agent,
      signal: AbortSignal.any(signals),
    });
  } catch (error) {
    const reason = error instanceof Error && /private or internal/.test(String(error.cause ?? error.message)) ? "Private and internal addresses are blocked." : "The request didn't complete (timeout or network error).";
    throw new NodeError(reason);
  }

  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text.slice(0, 4_000);
  }
  return { status: res.status, body };
}
