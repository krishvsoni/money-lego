import { isSolanaAddress } from "../solana-address";
import { findToken } from "../tokens";
import { hasExpression } from "../workflow/expressions";
import { OPERATORS } from "./catalog/logic";
import type { ConfigIssue, Field, NodeDefinition } from "./types";

// Config validation driven by each node's field declarations, plus node-specific rules.
// Values containing {{ expressions }} are checked at run time, once they resolve.

function empty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);
}

function checkField(field: Field, value: unknown): string | null {
  if (empty(value)) return field.required ? `${field.label} is required` : null;
  if (field.expression && hasExpression(value)) return null;
  switch (field.kind) {
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return `${field.label} must be a number`;
      if (field.min !== undefined && n < field.min) return `${field.label} must be at least ${field.min}`;
      if (field.max !== undefined && n > field.max) return `${field.label} must be at most ${field.max}`;
      return null;
    }
    case "select":
      return field.options.some((o) => o.value === value) ? null : `Pick a ${field.label.toLowerCase()}`;
    case "token":
      return findToken(String(value)) ? null : "This token isn't supported on this network";
    case "json":
      try {
        JSON.parse(String(value));
        return null;
      } catch {
        return `${field.label} must be valid JSON`;
      }
    case "text":
      if (field.pattern && !new RegExp(field.pattern).test(String(value))) return field.patternMessage ?? `${field.label} looks wrong`;
      if (field.maxLength && String(value).length > field.maxLength) return `${field.label} is too long`;
      return null;
    case "textarea":
      return field.maxLength && String(value).length > field.maxLength ? `${field.label} is too long` : null;
    case "pairs":
      if (!Array.isArray(value)) return `${field.label} must be a list`;
      return value.length > field.max ? `At most ${field.max} rows` : null;
    default:
      return null;
  }
}

function splitIssues(config: Record<string, unknown>): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const rows = Array.isArray(config.recipients) ? (config.recipients as Array<Record<string, string>>) : [];
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const wallet = (row.wallet ?? "").trim();
    if (!hasExpression(wallet) && !isSolanaAddress(wallet)) issues.push({ field: `recipients.${i}.wallet`, message: `Recipient ${i + 1}: not a valid Solana address` });
    else if (seen.has(wallet)) issues.push({ field: `recipients.${i}.wallet`, message: `Recipient ${i + 1}: same wallet as an earlier row` });
    seen.add(wallet);
    if (config.mode !== "even" && !hasExpression(row.share) && !/^\d+(\.\d+)?$/.test((row.share ?? "").trim())) {
      issues.push({ field: `recipients.${i}.share`, message: `Recipient ${i + 1}: enter a number` });
    }
  });
  if (config.mode === "percent") {
    const shares = rows.map((r) => r.share);
    if (!shares.some(hasExpression)) {
      const hundredths = shares.reduce((acc, s) => acc + Math.round(Number(s) * 100), 0);
      if (hundredths !== 10_000) issues.push({ field: "recipients", message: `Percentages add up to ${hundredths / 100}%, not 100%` });
    }
  }
  if (config.mode !== "fixed" && empty(config.total)) issues.push({ field: "total", message: "Total amount is required" });
  return issues;
}

function comparisonIssues(config: Record<string, unknown>): ConfigIssue[] {
  if (config.operator === "exists") return [];
  if (!OPERATORS.some((o) => o.value === config.operator)) return [{ field: "operator", message: "Pick an operator" }];
  return empty(config.right) ? [{ field: "right", message: "Compare with is required" }] : [];
}

function rulesIssues(config: Record<string, unknown>): ConfigIssue[] {
  const rows = Array.isArray(config.rules) ? (config.rules as Array<Record<string, string>>) : [];
  return rows.flatMap((r, i) => (/^[A-Za-z_$][\w$.[\]-]*$/.test(r.path ?? "") ? [] : [{ field: `rules.${i}.path`, message: `Rule ${i + 1}: enter a field path like amount or body.event` }]));
}

const EXTRA: Record<string, (config: Record<string, unknown>) => ConfigIssue[]> = {
  "data.split": splitIssues,
  "logic.condition": comparisonIssues,
  "logic.filter": comparisonIssues,
  "data.validate": rulesIssues,
};

export function validateNodeConfig(def: NodeDefinition, config: Record<string, unknown>): ConfigIssue[] {
  if (def.unavailable) return [{ field: "", message: def.unavailable }];
  const issues: ConfigIssue[] = [];
  for (const field of def.fields) {
    const message = checkField(field, config[field.key]);
    if (message) issues.push({ field: field.key, message });
  }
  return [...issues, ...(EXTRA[def.type]?.(config) ?? []), ...(def.validate?.(config) ?? [])];
}
