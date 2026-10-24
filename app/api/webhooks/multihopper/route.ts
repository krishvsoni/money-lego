import { readBody, route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { receiveWebhook } from "@/server/webhooks/service";

// No body schema here: the signature must be checked against the exact raw bytes, so the
// body is read once as a buffer and only parsed after verification.
export const POST = route({ auth: false, rate: RATE_RULES.webhook }, async ({ req }) => {
  const raw = await readBody(req, 64 * 1024);
  return receiveWebhook(raw, req.headers.get("x-multihopper-signature"));
});
