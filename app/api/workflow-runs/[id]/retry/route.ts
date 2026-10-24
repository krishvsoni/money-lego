import { z } from "zod";
import { retryRun } from "@/server/engine/runs";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

const body = z.object({ confirmSideEffects: z.boolean().default(false) });

export const POST = route<typeof body, true, { id: string }>({ auth: true, rate: RATE_RULES.write, body }, async ({ user, body }, { id }) => ({
  run: await retryRun(user, id, body.confirmSideEffects),
}));
