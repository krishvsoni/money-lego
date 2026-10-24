import { z } from "zod";
import { advanceRun } from "@/server/engine/advance";
import { createRun, getRunDetail, listRuns } from "@/server/engine/runs";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { getWorkflowDoc } from "@/server/workflows/service";

type Params = { id: string };

export const GET = route<undefined, true, Params>({ auth: true }, async ({ user }, { id }) => ({ runs: await listRuns(user, id) }));

const body = z.object({ requestKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/), payload: z.unknown().optional() });

// A test run from the editor. It uses the saved version of the workflow, so what runs is
// exactly what's stored, and the request key makes a double-click start one run.
export const POST = route<typeof body, true, Params>({ auth: true, rate: RATE_RULES.quote, body }, async ({ user, body }, { id }) => {
  const workflow = await getWorkflowDoc(user, id);
  const trigger = workflow.graph.nodes.find((n) => n.type.startsWith("trigger."));
  let payload = body.payload;
  if (payload === undefined) {
    try {
      payload = JSON.parse(String(trigger?.config.samplePayload ?? trigger?.config.payload ?? "{}"));
    } catch {
      payload = {};
    }
  }
  const wrapped = trigger?.type === "trigger.webhook" ? { body: payload, receivedAt: new Date().toISOString(), deliveryId: "test" } : payload;
  const { run, created } = await createRun(workflow, { type: trigger?.type ?? "trigger.manual", key: `manual:${body.requestKey}`, payload: wrapped });
  if (created) await advanceRun(run._id, 15_000);
  return { run: await getRunDetail(user, run._id.toHexString(), false) };
});
