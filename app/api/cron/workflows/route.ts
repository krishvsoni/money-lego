import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/config/env";
import { runDueWork } from "@/server/engine/runs";
import { errors } from "@/server/errors";
import { reconcileDue } from "@/server/executions/reconcile";
import { route } from "@/server/http/handler";

// The durable heartbeat: call every minute. It reconciles transfers with MultiHopper,
// starts due schedules and resumes waiting runs. Many concurrent callers are safe.
function authorized(header: string | null): boolean {
  const secret = env().CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const GET = route({ auth: false }, async ({ req }) => {
  if (!env().CRON_SECRET) throw errors.notConfigured("The scheduler secret");
  if (!authorized(req.headers.get("authorization"))) throw errors.forbidden();
  const transfers = await reconcileDue();
  const workflows = await runDueWork();
  return { transfers, workflows };
});
