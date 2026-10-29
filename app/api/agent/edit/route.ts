import { z } from "zod";
import { workflowGraphSchema } from "@/lib/workflow/types";
import { runEdit } from "@/server/agent/edit";
import { crewStream } from "@/server/agent/stream-response";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

export const maxDuration = 300;

// The graph comes from the open editor, which may hold unsaved changes; the workflow id is
// only used to check ownership and read its name, never to write.
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), workflowId: z.string().regex(/^[0-9a-f]{24}$/), graph: workflowGraphSchema, prompt: z.string().trim().min(4, "Say what to change.").max(1_200) }),
  z.object({ action: z.literal("fix"), workflowId: z.string().regex(/^[0-9a-f]{24}$/), graph: workflowGraphSchema }),
  z.object({ action: z.literal("link"), workflowId: z.string().regex(/^[0-9a-f]{24}$/), graph: workflowGraphSchema }),
]);

export const POST = route({ auth: true, rate: RATE_RULES.agent, body }, async ({ user, body, requestId }) =>
  crewStream(requestId, (emit) => runEdit(user, { workflowId: body.workflowId, graph: body.graph, action: body.action, prompt: "prompt" in body ? body.prompt : undefined }, emit)),
);
