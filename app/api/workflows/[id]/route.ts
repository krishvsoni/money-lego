import { z } from "zod";
import { workflowGraphSchema } from "@/lib/workflow/types";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { deleteWorkflow, getWorkflow, saveWorkflow } from "@/server/workflows/service";

type Params = { id: string };

export const GET = route<undefined, true, Params>({ auth: true }, async ({ user }, { id }) => ({
  workflow: await getWorkflow(user, id),
}));

const body = z.object({ name: z.string().trim().min(1, "Give the workflow a name").max(80), graph: workflowGraphSchema, expectedVersion: z.number().int().min(1) });

export const PUT = route<typeof body, true, Params>({ auth: true, rate: RATE_RULES.save, body }, async ({ user, body }, { id }) => saveWorkflow(user, id, body));

export const DELETE = route<undefined, true, Params>({ auth: true, rate: RATE_RULES.write }, async ({ user }, { id }) => {
  await deleteWorkflow(user, id);
  return { deleted: true };
});
