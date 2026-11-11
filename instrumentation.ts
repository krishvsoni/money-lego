// Runs once when the Next.js server starts. In development (or when INTERNAL_CRON=true) it
// starts the workflow heartbeat inside the server itself: every 20s it calls the same
// /api/cron/workflows route a production scheduler would, so schedules fire and waiting runs
// (approval expiry, "Wait for payouts to land" re-checks) move on without a second terminal.
// Set INTERNAL_CRON=false to turn it off; CRON_DEV_INTERVAL_MS changes the interval.

import { isLocalUrl, resolveSiteUrl } from "@/lib/site-url";

const KEY = Symbol.for("money-lego.internal-cron");

// Kinde's SDK reads KINDE_SITE_URL once, when it loads, to build its callback address. On
// Vercel a value left at localhost (copied from a local .env) would send people back to
// localhost after signing in, so it's set to the deployment's own address before any request.
function fixKindeUrlsOnVercel() {
  if (!process.env.VERCEL || !process.env.KINDE_CLIENT_ID) return;
  const site = resolveSiteUrl(process.env);
  for (const key of ["KINDE_SITE_URL", "KINDE_POST_LOGOUT_REDIRECT_URL"]) {
    const value = process.env[key]?.trim();
    if (!value || isLocalUrl(value) || value.includes(",")) process.env[key] = site;
  }
}

export async function register() {
  fixKindeUrlsOnVercel();
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const flag = process.env.INTERNAL_CRON;
  const on = flag === "true" || (flag !== "false" && process.env.NODE_ENV !== "production");
  const secret = process.env.CRON_SECRET;
  if (!on || !secret) return;

  // Hot reloads re-run register(); keep exactly one timer per process.
  const g = globalThis as unknown as Record<symbol, NodeJS.Timeout | undefined>;
  if (g[KEY]) return;

  const base = resolveSiteUrl(process.env);
  const everyMs = Math.max(5_000, Number(process.env.CRON_DEV_INTERVAL_MS) || 20_000);
  let busy = false;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const res = await fetch(`${base}/api/cron/workflows`, { headers: { authorization: `Bearer ${secret}` }, cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { workflows?: { scheduled: number; advanced: number } } | null;
      const w = body?.workflows;
      if (!res.ok) console.warn(`[cron] ${res.status} from /api/cron/workflows`);
      else if (w && (w.scheduled || w.advanced)) console.log(`[cron] started ${w.scheduled} scheduled, advanced ${w.advanced} waiting run(s)`);
    } catch {
      // Server not listening yet (first seconds after boot) or briefly restarting: try next tick.
    } finally {
      busy = false;
    }
  };

  g[KEY] = setInterval(tick, everyMs);
  g[KEY].unref?.();
  console.log(`[cron] workflow heartbeat on: ${base}/api/cron/workflows every ${everyMs / 1000}s`);
}
