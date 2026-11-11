import { z } from "zod";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { askTimeline, TIMELINE_RANGES } from "@/server/paypal/timeline";

const body = z.object({
  question: z.string().trim().min(3, "Ask a question about your payments.").max(300, "Keep the question under 300 characters."),
  days: z.literal(TIMELINE_RANGES).default(30),
});

// POST /api/payments/timeline/ask: a read-only AI answer, plus a filter for the timeline.
export const POST = route({ auth: true, rate: RATE_RULES.agent, body }, async ({ user, body }) => ({
  answer: await askTimeline(user, body.question, body.days),
}));
