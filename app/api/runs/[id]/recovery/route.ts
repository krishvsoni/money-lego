import { z } from "zod";
import { prepareRunRecovery } from "@/server/executions/recovery";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

const body = z.object({ kind: z.enum(["rescue", "reclaim"]) });

export const POST = route<typeof body, true, { id: string }>({ auth: true, rate: RATE_RULES.write, body }, async ({ user, body }, { id }) => ({
  bundle: await prepareRunRecovery(user, id, body.kind),
}));
