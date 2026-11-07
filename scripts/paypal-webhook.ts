// Registers (or updates) this deployment's PayPal webhook on the configured sandbox app,
// subscribed to exactly the events Money Lego routes, then prints the id for PAYPAL_WEBHOOK_ID.
// APP_URL must be a public https address; PayPal can't deliver to localhost.
// Usage: npm run paypal:webhook

import { PAYPAL_EVENT_TYPES } from "@/lib/paypal/types";
import { env } from "@/server/config/env";
import { createWebhook, listWebhooks, updateWebhookEvents } from "@/server/paypal/api";

async function main() {
  const e = env();
  const url = `${e.APP_URL}/api/integrations/paypal`;
  if (!/^https:\/\//.test(url) || /localhost|127\.0\.0\.1/.test(url)) throw new Error(`APP_URL must be public https (got ${e.APP_URL}).`);
  const existing = ((await listWebhooks()).webhooks ?? []).find((h) => h.url === url);
  const hook = existing ? await updateWebhookEvents(existing.id, PAYPAL_EVENT_TYPES) : await createWebhook(url, PAYPAL_EVENT_TYPES);
  console.log(`${existing ? "Updated" : "Created"} webhook ${hook.id} → ${url}`);
  console.log(`Subscribed: ${PAYPAL_EVENT_TYPES.join(", ")}`);
  console.log(`\nSet this on the server:\nPAYPAL_WEBHOOK_ID=${hook.id}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Failed.");
  process.exitCode = 1;
});
