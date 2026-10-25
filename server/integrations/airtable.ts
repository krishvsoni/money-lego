import "server-only";
import { NodeError } from "../engine/types";
import { callProvider } from "./client";

// Airtable REST API with a personal access token. The filter is built as a formula with
// every value escaped, so data from an event can never change the formula's meaning.

export function escapeFormulaString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, " ")}"`;
}

const fieldRef = (name: string) => {
  if (!/^[^{}]{1,100}$/.test(name)) throw new NodeError(`"${name.slice(0, 40)}" isn't a usable Airtable field name.`);
  return `{${name}}`;
};

export function lookupFormula(matchField: string, matchValue: string, statusField: string, statusValue: string): string {
  return `AND(${fieldRef(matchField)}=${escapeFormulaString(matchValue)},${fieldRef(statusField)}=${escapeFormulaString(statusValue)})`;
}

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

export async function findRecords(
  token: string,
  q: { baseId: string; table: string; matchField: string; matchValue: string; statusField: string; statusValue: string; maxRecords: number },
  signal?: AbortSignal,
): Promise<AirtableRecord[]> {
  if (!/^app[A-Za-z0-9]{14}$/.test(q.baseId)) throw new NodeError("The Airtable base ID looks wrong.");
  if (!q.matchValue.trim()) throw new NodeError("The match value is empty, so nothing was looked up.");
  const params = new URLSearchParams({
    filterByFormula: lookupFormula(q.matchField, q.matchValue, q.statusField, q.statusValue),
    // One more than allowed, so "too many matches" is detectable.
    maxRecords: String(q.maxRecords + 1),
  });
  const res = await callProvider({
    provider: "Airtable",
    url: `https://api.airtable.com/v0/${q.baseId}/${encodeURIComponent(q.table)}?${params}`,
    headers: { authorization: `Bearer ${token}` },
    signal,
  });
  const records = (res.body as { records?: unknown })?.records;
  return Array.isArray(records) ? (records as AirtableRecord[]).map((r) => ({ id: String(r.id), fields: r.fields ?? {} })) : [];
}
