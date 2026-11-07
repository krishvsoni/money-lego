import { isCurrency } from "../paypal/types";
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function allocateIssues(config: Record<string, unknown>): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  // Rows can hold numbers (imported JSON, a model's draft), so every cell is read as text.
  const rows = Array.isArray(config.recipients) ? (config.recipients as Array<Record<string, unknown>>) : [];
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const email = String(row.email ?? "").trim().toLowerCase();
    const share = String(row.share ?? "").trim();
    if (email && !hasExpression(email) && !EMAIL.test(email)) issues.push({ field: `recipients.${i}.email`, message: `Recipient ${i + 1}: not an email address` });
    else if (email && seen.has(email)) issues.push({ field: `recipients.${i}.email`, message: `Recipient ${i + 1}: same email as an earlier row` });
    if (email) seen.add(email);
    if (!email && !String(row.label ?? "").trim()) issues.push({ field: `recipients.${i}.label`, message: `Recipient ${i + 1}: name the reserve this row keeps` });
    if (config.mode !== "even" && !hasExpression(share) && !/^\d+(\.\d{1,2})?$/.test(share)) {
      issues.push({ field: `recipients.${i}.share`, message: `Recipient ${i + 1}: enter a number with up to 2 decimals` });
    }
  });
  if (config.mode === "percent") {
    const shares = rows.map((r) => String(r.share ?? ""));
    if (!shares.some(hasExpression)) {
      const hundredths = shares.reduce((acc, s) => acc + Math.round(Number(s) * 100), 0);
      if (hundredths !== 10_000) issues.push({ field: "recipients", message: `Percentages add up to ${hundredths / 100}%, not 100%` });
    }
  }
  const currency = String(config.currency ?? "").trim();
  if (currency && !hasExpression(currency) && !isCurrency(currency)) issues.push({ field: "currency", message: "Use USD, EUR, GBP, CAD or AUD" });
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
  "data.allocate": allocateIssues,
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
