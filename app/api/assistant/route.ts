import { z } from "zod";
import { runAssistant } from "@/server/ai/assistant";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

const body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4_000) })).min(1).max(30),
});

// The Money Lego assistant (main OpenAI agent with sub-agents). Read-only on PayPal; anything
// that moves money becomes a workflow draft with a human approval.
export const POST = route({ auth: true, rate: RATE_RULES.agent, body }, async ({ user, body }) => runAssistant(user, body.messages));
