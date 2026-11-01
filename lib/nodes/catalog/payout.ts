import { MAX_DESTINATIONS } from "../../recipe-schema";
import { MAIN_IN, MAIN_OUT, type ConfigIssue, type NodeDefinition } from "../types";

const DECIMAL = /^\d+(\.\d+)?$/;

function limitIssues(config: Record<string, unknown>): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  if (typedRecipients(config).length === 0 && !String(config.rows ?? "").trim()) {
    issues.push({ field: "recipients", message: "Add recipients, or point Records at an earlier step" });
  }
  const max =String(config.maxTotal ?? "").trim();
  if (max && !DECIMAL.test(max)) issues.push({ field: "maxTotal", message: "Use a number of whole tokens, e.g. 5000" });
  for (const key of ["walletField", "amountField"]) {
    if (!/^[A-Za-z_][\w .-]{0,63}$/.test(String(config[key] ?? ""))) issues.push({ field: key, message: "Use the column or field name exactly as it appears" });
  }
  return issues;
}

// The recipients table, when filled in, replaces the Records expression.
export function typedRecipients(config: Record<string, unknown>): Array<Record<string, unknown>> {
  const rows = Array.isArray(config.recipients) ? (config.recipients as Array<Record<string, unknown>>) : [];
  return rows.filter((r) => ["wallet", "amount", "label"].some((k) => String(r?.[k] ?? "").trim() !== ""));
}

// Business rules that sit between "data arrived" and "money is priced". They never
// redistribute or round amounts: a payout is exactly what the approved records say, or
// the run stops with the reason.

export const payoutNodes: NodeDefinition[] = [
  {
    type: "data.payout_rows",
    summary: "Turn approved records into an exact payout.",
    title: "Validate payout",
    category: "data",
    description: `Check approved records and build the exact recipient list: 1 to ${MAX_DESTINATIONS} distinct valid wallets, positive amounts within the token's precision, an optional exact total and an optional spending cap. Amounts are never rounded or redistributed; anything off stops the run with the reason.`,
    icon: "ListChecks",
    fields: [
      {
        key: "recipients",
        label: "Recipients",
        kind: "pairs",
        max: MAX_DESTINATIONS,
        addLabel: "Add recipient",
        help: "Type wallets and amounts here for a one-off payout. When this table has rows, Records below is ignored.",
        columns: [
          { key: "wallet", label: "Wallet", kind: "text", placeholder: "Solana address" },
          { key: "amount", label: "Amount", kind: "text", placeholder: "25.5" },
          { key: "label", label: "Label", kind: "text", placeholder: "Alice" },
        ],
      },
      { key: "rows", label: "Records", kind: "text", expression: true, placeholder: "{{ input.rows }}", help: "Or pull them from an earlier step, e.g. the rows from Google Sheets or records from Airtable. Used only when Recipients is empty." },
      { key: "tokenMint", label: "Token", kind: "token", required: true },
      { key: "walletField", label: "Wallet field", kind: "text", required: true, placeholder: "wallet" },
      { key: "amountField", label: "Amount field", kind: "text", required: true, placeholder: "amount", help: "Whole tokens, e.g. 25.5. Never a fiat amount." },
      { key: "labelField", label: "Label field", kind: "text", placeholder: "name" },
      { key: "expectedTotal", label: "Exact total", kind: "text", expression: true, placeholder: "Optional, e.g. {{ input.body.total }}", help: "If set, the amounts must add up to exactly this." },
      { key: "maxTotal", label: "Spending cap", kind: "text", placeholder: "5000", help: "Optional. Stop if the payout is larger than this many tokens." },
    ],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { rows: "{{ input.rows }}", walletField: "wallet", amountField: "amount", labelField: "name" },
    retrySafe: true,
    outputHint: "{ tokenMint, symbol, decimals, amountRaw, amount, destinations: [{ wallet, amountRaw, label }] } in base units, ready for MultiHopper.",
    validate: limitIssues,
  },
  {
    type: "logic.once",
    summary: "Never pay the same thing twice.",
    title: "Once per key",
    category: "logic",
    description:
      "Claim a business key, such as an order, invoice or bounty ID, for this workflow. If an earlier run already claimed it, this run stops. A key is only released when its run failed before any transfer was funded.",
    icon: "Fingerprint",
    fields: [{ key: "key", label: "Key", kind: "text", required: true, expression: true, maxLength: 200, placeholder: "order:{{ trigger.order.id }}" }],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: {},
    retrySafe: true,
    outputHint: "The input plus { onceKey } after the key is claimed for this run.",
  },
];
