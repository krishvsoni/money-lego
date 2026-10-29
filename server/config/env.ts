import "server-only";
import { z } from "zod";
import { errors } from "../errors";

// Environment is validated once, lazily, on first use. The MultiHopper base URL is derived
// from the environment name instead of being configurable, so a devnet key can never be
// pointed at production by a typo.

const PROVIDER_BASE_URL = {
  devnet: "https://devnet.multihopper.com",
  production: "https://multihopper.com",
} as const;

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
    MONGODB_DB: z.string().min(1).default("money_lego"),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(72),
    MULTIHOPPER_ENV: z.enum(["devnet", "production"]).default("devnet"),
    MULTIHOPPER_API_KEY: z.string().optional(),
    MULTIHOPPER_WEBHOOK_SECRET: z.string().optional(),
    MULTIHOPPER_ALLOW_PRODUCTION: z.enum(["true", "false"]).default("false"),
    CRON_SECRET: z.string().min(24, "CRON_SECRET must be at least 24 characters").optional(),
    CLIENT_IP_HEADER: z.string().regex(/^[a-z0-9-]+$/).optional(),
    SOLANA_RPC_URL: z.url().optional(),
    CREDENTIALS_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "CREDENTIALS_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)")
      .optional(),
    CREDENTIALS_KEYRING: z.string().optional(),
    CREDENTIALS_KEYRING_FILE: z.string().optional(),
    // The drafting agent. Up to nine comma-separated models, tried in groups of three.
    OPENROUTER_API_KEY: z.string().regex(/^sk-or-/, "OPENROUTER_API_KEY should start with sk-or-").optional(),
    OPENROUTER_MODELS: z.string().regex(/^[\w./:-]+(,[\w./:-]+)*$/).optional(),
    NEXT_PUBLIC_SOLANA_NETWORK: z.enum(["devnet", "mainnet-beta"]).default("devnet"),
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
  })
  .superRefine((env, ctx) => {
    const key = env.MULTIHOPPER_API_KEY;
    if (!key) return;
    const expected = env.MULTIHOPPER_ENV === "devnet" ? "mh_test_" : "mh_live_";
    if (!key.startsWith(expected)) {
      ctx.addIssue({
        code: "custom",
        path: ["MULTIHOPPER_API_KEY"],
        message: `MULTIHOPPER_ENV=${env.MULTIHOPPER_ENV} needs a key starting with ${expected}`,
      });
    }
    const networkMatches = (env.MULTIHOPPER_ENV === "devnet") === (env.NEXT_PUBLIC_SOLANA_NETWORK === "devnet");
    if (!networkMatches) {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_SOLANA_NETWORK"],
        message: "Solana network and MultiHopper environment must match",
      });
    }
  });

export type Env = z.infer<typeof schema> & { MULTIHOPPER_BASE_URL: string };

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
  cached = { ...parsed.data, MULTIHOPPER_BASE_URL: PROVIDER_BASE_URL[parsed.data.MULTIHOPPER_ENV] };
  return cached;
}

export function providerCredentials(): { baseUrl: string; apiKey: string } {
  const e = env();
  if (!e.MULTIHOPPER_API_KEY) throw errors.notConfigured("The MultiHopper API key");
  if (e.MULTIHOPPER_ENV === "production" && e.MULTIHOPPER_ALLOW_PRODUCTION !== "true") {
    throw errors.notConfigured("Production routing");
  }
  return { baseUrl: e.MULTIHOPPER_BASE_URL, apiKey: e.MULTIHOPPER_API_KEY };
}

export function resetEnvForTests(): void {
  cached = null;
}
