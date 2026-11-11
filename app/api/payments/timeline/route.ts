import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { paymentTimeline, TIMELINE_RANGES, type TimelineRange } from "@/server/paypal/timeline";

// GET /api/payments/timeline?days=7|30|90 (default 30). The signed-in owner's milestones.
export const GET = route({ auth: true, rate: RATE_RULES.read }, async ({ req, user }) => {
  const days = Number(req.nextUrl.searchParams.get("days") ?? 30);
  const range: TimelineRange = TIMELINE_RANGES.find((r) => r === days) ?? 30;
  return { timeline: await paymentTimeline(user, range) };
});
