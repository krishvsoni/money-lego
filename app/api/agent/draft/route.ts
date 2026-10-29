import { draftWorkflow } from "@/server/agent/draft";
import { draftRequestSchema } from "@/server/agent/schema";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

export const maxDuration = 120;

export const POST = route({ auth: true, rate: RATE_RULES.agent, body: draftRequestSchema }, async ({ user, body }) =>
  draftWorkflow(user, body.prompt, body.requestKey),
);
