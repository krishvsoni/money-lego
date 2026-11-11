// URL rules for anything that opens a page in a remote browser (the Kernel PoC today, the
// `browser.check` step later). Pure and dependency-free so the script, the executor and the
// tests all run the exact same checks.
//
// The browser runs on Kernel's network, so this isn't SSRF protection for our own services
// (that's safe-fetch.ts). It makes sure the page we report on is the page that was asked
// for: https only, no credentials in the URL, and the same host before and after redirects.

export class UrlPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlPolicyError";
  }
}

// One canonical spelling of a host: lowercase, IDNs in punycode, no trailing dot.
// Throws on anything that isn't a bare host name (ports, paths, credentials, blanks).
export function normalizeHost(raw: string): string {
  const value = raw.trim();
  if (!value || /[/\\@:?#\s]/.test(value)) throw new UrlPolicyError(`"${raw}" isn't a host name like shop.example.com.`);
  let host: string;
  try {
    host = new URL(`https://${value}/`).hostname;
  } catch {
    throw new UrlPolicyError(`"${raw}" isn't a host name like shop.example.com.`);
  }
  host = host.replace(/\.+$/, "");
  if (!host) throw new UrlPolicyError(`"${raw}" isn't a host name like shop.example.com.`);
  return host;
}

const hostOf = (url: URL) => url.hostname.replace(/\.+$/, "");

function parseHttps(raw: string, what: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlPolicyError(`${what} isn't a valid URL.`);
  }
  if (url.protocol !== "https:") throw new UrlPolicyError(`${what} must use https://, not ${url.protocol}`);
  if (url.username || url.password) throw new UrlPolicyError(`${what} must not contain a user name or password.`);
  if (!hostOf(url)) throw new UrlPolicyError(`${what} has no host.`);
  return url;
}

export interface Target {
  url: URL;
  // The host every later check compares against: the allowed host if one was given.
  host: string;
}

// Validates the URL a step was asked to open, before any browser is created.
export function parseTarget(rawUrl: string, allowedHost?: string | null): Target {
  const url = parseHttps(rawUrl, "The URL");
  const host = hostOf(url);
  if (allowedHost && allowedHost.trim()) {
    const allowed = normalizeHost(allowedHost);
    if (host !== allowed) throw new UrlPolicyError(`The URL points at ${host}, not the allowed host ${allowed}.`);
    return { url, host: allowed };
  }
  return { url, host };
}

// Validates where the page actually ended up. A redirect within the same host is fine;
// a different host, or a downgrade to http, means the result isn't for the requested page.
export function assertFinalUrl(finalUrl: unknown, target: Target): URL {
  if (typeof finalUrl !== "string") throw new UrlPolicyError("The browser didn't report where the page ended up.");
  const url = parseHttps(finalUrl, "The page it ended up on");
  const host = hostOf(url);
  if (host !== target.host) throw new UrlPolicyError(`The page redirected to ${host}, not ${target.host}. Its data was discarded.`);
  return url;
}
