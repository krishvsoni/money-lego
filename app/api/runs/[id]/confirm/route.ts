import { z } from "zod";
import { ObjectId } from "mongodb";
import { advanceRun } from "@/server/engine/advance";
import { confirmRun } from "@/server/executions/service";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

const body = z.object({ stage: z.enum(["funding", "final"]) });

// After the final confirmation, the workflow that created this transfer moves on at once
// instead of waiting for the next scheduler tick.
export const POST = route<typeof body, true, { id: string }>({ auth: true, rate: RATE_RULES.write, body }, async ({ user, body }, { id }) => {
  const run = await confirmRun(user, id, body.stage);
  if (body.stage === "final" && run.workflowRunId) await advanceRun(new ObjectId(run.workflowRunId), 8_000).catch(() => null);
  return { run };
});
