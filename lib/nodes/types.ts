// The node contract shared by the canvas (rendering, forms, validation) and the engine
// (execution). Executors live server-side in server/engine/executors, keyed by `type`, so
// a new connector is one definition plus one executor, with no change to canvas or engine.

export type Category = "triggers" | "logic" | "data" | "paypal" | "ai" | "integrations" | "utilities";

export const CATEGORY_META: Record<Category, { title: string; color: string }> = {
  triggers: { title: "Triggers", color: "var(--brick-2)" },
  logic: { title: "Logic", color: "var(--brick-4)" },
  data: { title: "Data", color: "var(--brick-5)" },
  paypal: { title: "PayPal", color: "var(--paypal)" },
  ai: { title: "AI", color: "var(--brick-1)" },
  integrations: { title: "Integrations", color: "var(--brick-3)" },
  utilities: { title: "Utilities", color: "var(--brick-6)" },
};

// Two kinds of credential. Connections are made by signing in to the provider and
// approving specific permissions (or, for Telegram, linking a chat through our bot); no one
// ever pastes a provider token. Manual ones are secrets that belong to the user's own
// systems: a signing secret we generate, or a header for their own API.
export const CONNECTION_TYPES = [
  "github_account",
  "google_account",
  "slack_webhook",
  "discord_webhook",
  "discord_server",
  "stripe_account",
  "shopify_store",
  "airtable_account",
  "notion_workspace",
  "telegram_chat",
] as const;

export const MANUAL_CREDENTIAL_TYPES = ["webhook_secret", "http_header", "zapier_hook"] as const;

export const CREDENTIAL_TYPES = [...MANUAL_CREDENTIAL_TYPES, ...CONNECTION_TYPES] as const;

export type ConnectionType = (typeof CONNECTION_TYPES)[number];
export type ManualCredentialType = (typeof MANUAL_CREDENTIAL_TYPES)[number];
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

interface FieldBase {
  key: string;
  label: string;
  help?: string;
  required?: boolean;
  // Whether {{ … }} expressions are allowed; resolved against run data at execution time.
  expression?: boolean;
}

export interface PairColumn {
  key: string;
  label: string;
  kind: "text" | "select";
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export type Field =
  | (FieldBase & { kind: "text"; placeholder?: string; maxLength?: number; pattern?: string; patternMessage?: string })
  | (FieldBase & { kind: "textarea"; placeholder?: string; maxLength?: number })
  | (FieldBase & { kind: "number"; min?: number; max?: number; step?: number })
  | (FieldBase & { kind: "select"; options: Array<{ value: string; label: string }> })
  | (FieldBase & { kind: "boolean" })
  | (FieldBase & { kind: "json"; placeholder?: string })
  | (FieldBase & { kind: "credential"; credentialType: CredentialType })
  | (FieldBase & { kind: "pairs"; columns: PairColumn[]; max: number; addLabel: string });

export interface Port {
  id: string;
  label: string;
}

export interface ConfigIssue {
  field: string;
  message: string;
}

export interface NodeDefinition {
  type: string;
  title: string;
  category: Category;
  description: string;
  // One short line for hover cards; the full description stays in the editor.
  summary: string;
  icon: string;
  fields: Field[];
  inputs: Port[];
  outputs: Port[];
  defaults: Record<string, unknown>;
  // Shown in the catalog but not addable: honest about connectors that aren't built.
  unavailable?: string;
  // True when re-running the node can't repeat an external side effect.
  retrySafe: boolean;
  // Moves money or contacts a customer (payout, refund, invoice send). Such a node must sit
  // directly on a Human approval's Approved output, and the approval fingerprints exactly
  // what it will do (see server/engine/intents.ts).
  sideEffect?: boolean;
  // The outside service this node talks to, for integration badges and setup checklists.
  provider?: string;
  // Explains what the node outputs, for the inspector.
  outputHint: string;
  validate?: (config: Record<string, unknown>) => ConfigIssue[];
}

export const MAIN_IN: Port[] = [{ id: "main", label: "In" }];
export const MAIN_OUT: Port[] = [{ id: "main", label: "Out" }];
