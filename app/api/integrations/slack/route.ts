import { NextResponse } from "next/server";
import { receiveSlack } from "@/server/engine/inbound/platform";
import { readBody, route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

// POST /api/integrations/slack: the Slack app's Event Subscriptions Request URL.
export const POST = route({ auth: false, rate: RATE_RULES.webhook }, async ({ req }) => {
  const result = await receiveSlack(await readBody(req, 256 * 1024), req.headers);
  return NextResponse.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
});
