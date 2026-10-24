import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/config/env";
import { errors } from "@/server/errors";
import { reconcileDue } from "@/server/executions/reconcile";
import { route } from "@/server/http/handler";

// Called by a scheduler (e.g. Vercel Cron) to repair anything webhooks missed. Safe to run
// on many instances at once: each run is claimed with a lease before it's checked.
function authorized(header: string | null): boolean {
  const secret = env().CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const GET = route({ auth: false }, async ({ req }) => {
  if (!env().CRON_SECRET) throw errors.notConfigured("The reconciler secret");
  if (!authorized(req.headers.get("authorization"))) throw errors.forbidden();
  return reconcileDue();
});
