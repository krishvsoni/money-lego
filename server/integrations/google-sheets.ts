import "server-only";
import { NodeError } from "../engine/types";
import { callProvider } from "./client";

// Google Sheets with the user's own Google sign-in (read-only scope). The access token is
// renewed by server/oauth/store.ts; this module only reads.

const truthy = (v: unknown) => ["true", "yes", "1", "y", "x", "✓"].includes(String(v ?? "").trim().toLowerCase());

export interface RowQuery {
  approvedColumn: string;
  paidColumn?: string;
  matchColumn?: string;
  matchValue?: string;
}

// Pure filter over the raw grid, so the selection rules are testable. Columns are found
// by header name; a missing approval column is an error, never "approve everything".
export function selectRows(grid: unknown[][], q: RowQuery): Array<Record<string, string>> {
  const [header, ...data] = grid;
  if (!header?.length) throw new NodeError("The sheet is empty. The first row must hold the column names.");
  const names = header.map((h) => String(h ?? "").trim());
  const need = (col: string | undefined, what: string) => {
    if (!col) return -1;
    const i = names.indexOf(col);
    if (i < 0) throw new NodeError(`The sheet has no "${col}" column for ${what}. Columns: ${names.slice(0, 12).join(", ")}.`);
    return i;
  };
  const approved = need(q.approvedColumn, "approval");
  const paid = need(q.paidColumn || undefined, "paid");
  const match = need(q.matchColumn || undefined, "the filter");
  if (match >= 0 && !String(q.matchValue ?? "").trim()) throw new NodeError("The filter value is empty, so no rows were selected.");
  return data
    .filter((row) => truthy(row[approved]) && (paid < 0 || !truthy(row[paid])) && (match < 0 || String(row[match] ?? "").trim() === String(q.matchValue).trim()))
    .map((row) => Object.fromEntries(names.map((n, i) => [n, String(row[i] ?? "").trim()])));
}

export async function readRows(token: string, spreadsheetId: string, sheet: string, signal?: AbortSignal): Promise<unknown[][]> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(spreadsheetId)) throw new NodeError("The spreadsheet ID looks wrong.");
  const range = encodeURIComponent(`'${sheet.replace(/'/g, "''")}'`);
  const res = await callProvider({
    provider: "Google Sheets",
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
    headers: { authorization: `Bearer ${token}` },
    signal,
  });
  const values = (res.body as { values?: unknown })?.values;
  return Array.isArray(values) ? (values as unknown[][]) : [];
}
