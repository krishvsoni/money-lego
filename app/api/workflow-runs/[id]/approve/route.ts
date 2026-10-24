import { z } from "zod";
import { decideApproval } from "@/server/engine/runs";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

const body = z.object({ nodeId: z.string().max(40), decision: z.enum(["approved", "rejected"]) });

export const POST = route<typeof body, true, { id: string }>({ auth: true, rate: RATE_RULES.write, body }, async ({ user, body }, { id }) => ({
  run: await decideApproval(user, id, body.nodeId, body.decision),
}));
