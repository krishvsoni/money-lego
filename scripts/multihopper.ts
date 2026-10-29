// Operator commands for the MultiHopper integration. Integration-wide numbers stay here,
// in the operator's terminal, and are never served by the web app.
// Usage: bun --conditions=react-server scripts/multihopper.ts <command>
//   usage [fromDate] [toDate]   volume, transfers and integrator fees earned
//   webhooks                    list registered webhook endpoints
//   webhooks:add                register APP_URL/api/webhooks/multihopper (prints the secret once)
//   webhooks:rm <id>            delete a webhook endpoint

import { formatAmount } from "@/lib/amounts";
import { env } from "@/server/config/env";
import { ProviderRejected } from "@/server/multihopper/http";
import { createWebhook, deleteWebhook, getUsage, listWebhooks } from "@/server/multihopper/account";

const WEBHOOK_PATH = "/api/webhooks/multihopper";

async function usage(fromDate?: string, toDate?: string) {
  const u = await getUsage({ fromDate, toDate });
  console.log(`Environment       ${env().MULTIHOPPER_ENV}${u.isTestMode ? " (test accounting)" : ""}`);
  console.log(`Transfers         ${u.totalTransfers} total, ${u.completedTransfers} completed, ${u.failedTransfers} failed`);
  console.log(`Volume (raw)      ${u.totalVolumeRaw}`);
  console.log(`Flat fees earned  ${formatAmount(String(u.totalFlatFeeEarned), 9, 6)} SOL`);
  for (const fee of u.tokenFeesEarned) {
    console.log(`Token fees        ${formatAmount(fee.amountRaw, fee.tokenDecimals ?? 0)} of ${fee.tokenMint}`);
  }
  console.log(`Payouts           ${u.totalPayouts}`);
}

async function webhooks() {
  const items = await listWebhooks();
  if (!items.length) return console.log("No webhook endpoints. Transfers are still tracked by the reconcile cron.");
  for (const w of items) console.log(`${w.id}  ${w.url}  ${w.events.length ? w.events.join(",") : "all events"}`);
}

async function addWebhook() {
  const url = `${env().APP_URL}${WEBHOOK_PATH}`;
  if (!url.startsWith("https://")) throw new Error(`MultiHopper only delivers to public HTTPS. APP_URL is ${env().APP_URL}; deploy first or use a tunnel.`);
  const created = await createWebhook(url);
  console.log(`Registered endpoint ${created.id} for ${created.url}`);
  if (created.secret) {
    console.log("Signing secret (shown once). Put it in MULTIHOPPER_WEBHOOK_SECRET on the deployment, then redeploy:");
    console.log(created.secret);
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "usage") return usage(args[0], args[1]);
  if (command === "webhooks") return webhooks();
  if (command === "webhooks:add") return addWebhook();
  if (command === "webhooks:rm") {
    const id = Number(args[0]);
    if (!Number.isInteger(id)) throw new Error("Pass the numeric endpoint id from `webhooks`.");
    await deleteWebhook(id);
    return console.log(`Deleted endpoint ${id}.`);
  }
  console.log("Commands: usage [fromDate] [toDate] | webhooks | webhooks:add | webhooks:rm <id>");
}

main().catch((error) => {
  console.error(error instanceof ProviderRejected ? `MultiHopper ${error.code}: ${error.message}` : error instanceof Error ? error.message : "Failed.");
  process.exitCode = 1;
});
