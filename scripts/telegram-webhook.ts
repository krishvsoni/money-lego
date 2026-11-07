// Points the Money Lego Telegram bot at this deployment, with the secret Telegram must send
// back on every update. Run once per environment after setting the TELEGRAM_* variables.
// Usage: npm run telegram:webhook

import { env } from "@/server/config/env";

async function main() {
  const e = env();
  if (!e.TELEGRAM_BOT_TOKEN || !e.TELEGRAM_WEBHOOK_SECRET) throw new Error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET first.");
  const url = `${e.APP_URL}/api/integrations/telegram`;
  const res = await fetch(`https://api.telegram.org/bot${e.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, secret_token: e.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ["message"], drop_pending_updates: true }),
  });
  const body = (await res.json()) as { ok?: boolean; description?: string };
  console.log(body.ok ? `Telegram now delivers to ${url}` : `Telegram refused: ${body.description ?? res.status}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Failed.");
  process.exitCode = 1;
});
