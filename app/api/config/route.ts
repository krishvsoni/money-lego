import { route } from "@/server/http/handler";
import { env } from "@/server/config/env";

export const GET = route({ auth: false }, async () => {
  const e = env();
  return {
    paypalEnvironment: e.PAYPAL_ENVIRONMENT,
    paypalReady: Boolean(e.PAYPAL_CLIENT_ID && e.PAYPAL_CLIENT_SECRET),
    // The client id is public by design (it is in every PayPal button script URL).
    paypalClientId: e.PAYPAL_CLIENT_SECRET ? (e.PAYPAL_CLIENT_ID ?? null) : null,
    channel3Ready: Boolean(e.CHANNEL3_API_KEY),
    elasticReady: Boolean(e.ELASTIC_URL && e.ELASTIC_API_KEY),
    webhookReady: Boolean(e.PAYPAL_WEBHOOK_ID),
    agentReady: Boolean(e.OPENROUTER_API_KEY),
  };
});
