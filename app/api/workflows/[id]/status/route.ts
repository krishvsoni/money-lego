import { z } from "zod";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { setWorkflowStatus } from "@/server/workflows/service";

const body = z.object({ status: z.enum(["active", "archived"]) });

export const POST = route<typeof body, true, { id: string }>({ auth: true, rate: RATE_RULES.write, body }, async ({ user, body }, { id }) => ({
  workflow: await setWorkflowStatus(user, id, body.status),
}));
