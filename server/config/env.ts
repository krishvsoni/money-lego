import "server-only";
import { z } from "zod";
import { errors } from "../errors";

// Environment is validated once, lazily, on first use. The PayPal REST base URL is derived
// from PAYPAL_ENVIRONMENT instead of being configurable, so sandbox credentials can never be
// pointed at production by a typo, and production needs a second explicit switch.

const PAYPAL_API_BASE = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

const PAYPAL_WEB_BASE = {
  sandbox: "https://www.sandbox.paypal.com",
  live: "https://www.paypal.com",
} as const;

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().min(1).default("money_lego"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(72),
  CRON_SECRET: z.string().min(24, "CRON_SECRET must be at least 24 characters").optional(),
  CLIENT_IP_HEADER: z.string().regex(/^[a-z0-9-]+$/).optional(),
  CREDENTIALS_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "CREDENTIALS_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)")
    .optional(),
  CREDENTIALS_KEYRING: z.string().optional(),
  CREDENTIALS_KEYRING_FILE: z.string().optional(),

  // PayPal REST app (Developer Dashboard > Apps & Credentials). Server-side only.
  PAYPAL_ENVIRONMENT: z.enum(["sandbox", "live"]).default("sandbox"),
  PAYPAL_ALLOW_LIVE: z.enum(["true", "false"]).default("false"),
  PAYPAL_CLIENT_ID: z.string().min(10).optional(),
  PAYPAL_CLIENT_SECRET: z.string().min(10).optional(),
  // The id PayPal assigned to this app's webhook (npm run paypal:webhook prints it).
  PAYPAL_WEBHOOK_ID: z.string().regex(/^[A-Z0-9]{10,40}$/).optional(),

  // The AI model provider (OpenRouter, OpenAI-compatible). Up to nine comma-separated models.
  OPENROUTER_API_KEY: z.string().regex(/^sk-or-/, "OPENROUTER_API_KEY should start with sk-or-").optional(),
  OPENROUTER_MODELS: z.string().regex(/^[\w./:-]+(,[\w./:-]+)*$/).optional(),

  // Partner tools (all optional; each feature says plainly when it isn't configured).
  // Channel3 product data API: https://channel3.ai/docs
  CHANNEL3_API_KEY: z.string().min(8).optional(),
  // Elastic (Elasticsearch / Elastic Cloud): run and failure search.
  ELASTIC_URL: z.url().optional(),
  ELASTIC_API_KEY: z.string().min(8).optional(),
  ELASTIC_INDEX: z.string().regex(/^[a-z0-9._-]{1,100}$/).default("money-lego-runs"),

  // OAuth apps that identify Money Lego to each provider. They can't read anyone's data
  // by themselves: every call on a user's data uses the token that user granted.
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().regex(/^\d{17,20}$/).optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_PUBLIC_KEY: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  STRIPE_CLIENT_ID: z.string().regex(/^ca_/).optional(),
  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_/).optional(),
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().regex(/^whsec_/).optional(),
  SHOPIFY_CLIENT_ID: z.string().optional(),
  SHOPIFY_CLIENT_SECRET: z.string().optional(),
  AIRTABLE_CLIENT_ID: z.string().optional(),
  AIRTABLE_CLIENT_SECRET: z.string().optional(),
  NOTION_CLIENT_ID: z.string().optional(),
  NOTION_CLIENT_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d{5,15}:[A-Za-z0-9_-]{30,}$/).optional(),
  TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/).optional(),
});

export type Env = z.infer<typeof schema> & { PAYPAL_API_BASE: string; PAYPAL_WEB_BASE: string };

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  // A blank line like `CRON_SECRET=` in an env file means "not set", not "empty secret".
  const present = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ""));
  const parsed = schema.safeParse(present);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment. ${detail}`);
  }
  const e = parsed.data;
  cached = { ...e, PAYPAL_API_BASE: PAYPAL_API_BASE[e.PAYPAL_ENVIRONMENT], PAYPAL_WEB_BASE: PAYPAL_WEB_BASE[e.PAYPAL_ENVIRONMENT] };
  return cached;
}

export function paypalCredentials(): { baseUrl: string; clientId: string; clientSecret: string; environment: "sandbox" | "live" } {
  const e = env();
  if (!e.PAYPAL_CLIENT_ID || !e.PAYPAL_CLIENT_SECRET) throw errors.notConfigured("PayPal (PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET)");
  if (e.PAYPAL_ENVIRONMENT === "live" && e.PAYPAL_ALLOW_LIVE !== "true") throw errors.notConfigured("Live PayPal");
  return { baseUrl: e.PAYPAL_API_BASE, clientId: e.PAYPAL_CLIENT_ID, clientSecret: e.PAYPAL_CLIENT_SECRET, environment: e.PAYPAL_ENVIRONMENT };
}

export function resetEnvForTests(): void {
  cached = null;
}
