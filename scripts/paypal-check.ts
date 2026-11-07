// Day-0 gate from the plan: proves the configured PayPal sandbox app works end to end.
// It gets an OAuth token, lists what the app may do (from granted scopes), creates and reads
// back a sandbox order (nothing is charged: nobody approves it), and reports the webhook.
// Usage: npm run paypal:check

import { env } from "@/server/config/env";
import { createOrder, getOrder, listWebhooks } from "@/server/paypal/api";
import { paypalCapabilities } from "@/server/paypal/client";

async function main() {
  const e = env();
  console.log(`PayPal environment: ${e.PAYPAL_ENVIRONMENT} (${e.PAYPAL_API_BASE})`);
  const caps = await paypalCapabilities();
  console.log(`OAuth token OK. App ${caps.appId ?? "?"}, ${caps.scopes.length} scopes.`);
  for (const [feature, on] of Object.entries(caps.features)) console.log(`  ${on ? "✓" : "✗"} ${feature}`);

  const order = await createOrder({ currency: "USD", amountMinor: 100n, itemName: "Money Lego connection check", description: "Connection check, never approved", customId: "ml-check", requestId: `ml-check-${Date.now()}` });
  const back = await getOrder(order.id);
  console.log(`Orders API OK: created ${order.id}, status ${back.status}. (Not approved, so nothing is charged.)`);

  const hooks = (await listWebhooks()).webhooks ?? [];
  const expected = `${e.APP_URL}/api/integrations/paypal`;
  const mine = hooks.find((h) => h.id === e.PAYPAL_WEBHOOK_ID) ?? hooks.find((h) => h.url === expected);
  if (mine) console.log(`Webhook ${mine.id} → ${mine.url} (${mine.event_types.length} events)${mine.id === e.PAYPAL_WEBHOOK_ID ? "" : " — set PAYPAL_WEBHOOK_ID to this id"}`);
  else console.log(`No webhook for ${expected} yet. Run npm run paypal:webhook once APP_URL is public.`);
  if (!caps.features.payouts) console.log("Payouts isn't granted to this app: the payout block will report that honestly. Enable Payouts on the app in the Developer Dashboard.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Failed.");
  process.exitCode = 1;
});
