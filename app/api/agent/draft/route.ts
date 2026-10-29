import { runCrew } from "@/server/agent/draft";
import { draftRequestSchema } from "@/server/agent/schema";
import { crewStream } from "@/server/agent/stream-response";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

// Two model calls at most (Planner, Fixer), each of which may fall through model groups.
export const maxDuration = 300;

export const POST = route({ auth: true, rate: RATE_RULES.agent, body: draftRequestSchema }, async ({ user, body, requestId }) =>
  crewStream(requestId, (emit) => runCrew(user, body.prompt, body.requestKey, emit)),
);
