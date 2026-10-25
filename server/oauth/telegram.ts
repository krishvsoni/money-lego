import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SessionUser } from "../auth/session";
import { env } from "../config/env";
import { collections } from "../db/collections";
import { errors } from "../errors";
import { log } from "../log";
import { oauthRequest } from "./http";
import { saveConnection } from "./store";

// Telegram has no OAuth. Linking works like a sign-in instead: the user taps a one-time
// link that opens our bot with a code, the bot receives "/start <code>" from that chat, and
// the chat is bound to the account that created the code. The code lives ten minutes,
// is stored hashed, and is consumed atomically.

const TTL_MS = 10 * 60_000;
const hash = (code: string) => createHash("sha256").update(code).digest("hex");

export const telegramConfigured = () => Boolean(env().TELEGRAM_BOT_TOKEN && env().TELEGRAM_BOT_USERNAME && env().TELEGRAM_WEBHOOK_SECRET);

export async function startTelegramLink(user: SessionUser): Promise<{ chatUrl: string; groupUrl: string; expiresAt: string }> {
  if (!telegramConfigured()) throw errors.notConfigured("Telegram linking");
  const code = randomBytes(18).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + TTL_MS);
  const { telegramLinks } = await collections();
  await telegramLinks.insertOne({ _id: hash(code), userId: user.userId, createdAt: now, expiresAt: expires });
  const bot = env().TELEGRAM_BOT_USERNAME;
  return { chatUrl: `https://t.me/${bot}?start=${code}`, groupUrl: `https://t.me/${bot}?startgroup=${code}`, expiresAt: expires.toISOString() };
}

export async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = env().TELEGRAM_BOT_TOKEN;
  if (!token) throw errors.notConfigured("Telegram");
  await oauthRequest({ provider: "Telegram", url: `https://api.telegram.org/bot${token}/sendMessage`, json: { chat_id: chatId, text: text.slice(0, 4_000), disable_web_page_preview: true } });
}

function secretValid(given: string | null): boolean {
  const expected = env().TELEGRAM_WEBHOOK_SECRET ?? "";
  return Boolean(given && expected) && given!.length === expected.length && timingSafeEqual(Buffer.from(given!), Buffer.from(expected));
}

interface Update {
  message?: { text?: string; chat?: { id: number; type: string; title?: string; username?: string; first_name?: string } };
}

// Telegram calls this for every update to the bot; Telegram adds the secret header we set
// with setWebhook. Anything that isn't a valid link code is acknowledged and ignored.
export async function handleTelegramUpdate(raw: Buffer, headers: Headers): Promise<void> {
  if (!secretValid(headers.get("x-telegram-bot-api-secret-token"))) throw errors.forbidden();
  let update: Update;
  try {
    update = JSON.parse(raw.toString("utf8")) as Update;
  } catch {
    return;
  }
  const text = update.message?.text ?? "";
  const chat = update.message?.chat;
  const match = text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{24})$/);
  if (!match || !chat) return;
  const { telegramLinks } = await collections();
  const link = await telegramLinks.findOneAndDelete({ _id: hash(match[1]), expiresAt: { $gt: new Date() } });
  const chatId = String(chat.id);
  if (!link) {
    await sendTelegram(chatId, "That link expired. Start again from Connections in Money Lego.").catch(() => null);
    return;
  }
  const name = chat.title ?? (chat.username ? `@${chat.username}` : (chat.first_name ?? "Telegram chat"));
  await saveConnection(link.userId, "telegram_chat", { account: { id: chatId, name, detail: chat.type }, scopes: ["chat"], secret: {} });
  log.info("telegram.linked", { userId: link.userId.toHexString(), chatType: chat.type });
  await sendTelegram(chatId, "Linked to Money Lego. Payout updates you set up for this chat will appear here.").catch(() => null);
}
