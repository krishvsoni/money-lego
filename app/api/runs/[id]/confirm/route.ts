import { z } from "zod";
import { confirmRun } from "@/server/executions/service";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

const body = z.object({ stage: z.enum(["funding", "final"]) });

export const POST = route<typeof body, true, { id: string }>(
  { auth: true, rate: RATE_RULES.write, body },
  async ({ user, body }, { id }) => ({ run: await confirmRun(user, id, body.stage) }),
);
