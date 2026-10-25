import "server-only";
import { NodeError } from "../engine/types";
import { callProvider } from "./client";

// Notion's public API, pinned to one version so a Notion release can't change the shapes
// under a running payout. Only pages the integration was explicitly shared with are
// reachable; nothing here searches a workspace.

const VERSION = "2022-06-28";
const headers = (token: string) => ({ authorization: `Bearer ${token}`, "notion-version": VERSION });

export function normalizeId(id: string): string {
  const hex = id.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new NodeError("That Notion ID should be 32 hex characters.");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type RichText = Array<{ plain_text?: string }>;

// Flattens Notion's typed property objects to plain values for expressions.
export function plainProperties(properties: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, p] of Object.entries(properties ?? {})) {
    const t = p.type as string;
    const v = p[t] as unknown;
    if (t === "title" || t === "rich_text") out[name] = (v as RichText).map((r) => r.plain_text ?? "").join("");
    else if (t === "number" || t === "checkbox" || t === "url" || t === "email") out[name] = v;
    else if (t === "select" || t === "status") out[name] = (v as { name?: string } | null)?.name ?? null;
    else if (t === "multi_select") out[name] = (v as Array<{ name: string }>).map((o) => o.name);
    else if (t === "date") out[name] = (v as { start?: string } | null)?.start ?? null;
  }
  return out;
}

export async function getPage(token: string, pageId: string, signal?: AbortSignal) {
  const id = normalizeId(pageId);
  const res = await callProvider({ provider: "Notion", url: `https://api.notion.com/v1/pages/${id}`, headers: headers(token), signal });
  const page = res.body as { id: string; url?: string; last_edited_time?: string; archived?: boolean; properties?: Record<string, Record<string, unknown>> };
  if (page.archived) throw new NodeError("That Notion page is archived. Pick the current policy page.");
  const properties = plainProperties(page.properties ?? {});
  const titleEntry = Object.entries(page.properties ?? {}).find(([, p]) => p.type === "title");
  return { pageId: page.id, title: titleEntry ? String(properties[titleEntry[0]] ?? "") : "", url: page.url ?? null, version: page.last_edited_time ?? null, properties };
}

export async function createPage(token: string, input: { databaseId: string; titleProperty: string; title: string; summary: string }, signal?: AbortSignal) {
  const text = (content: string) => [{ type: "text", text: { content: content.slice(0, 1_900) } }];
  const res = await callProvider({
    provider: "Notion",
    url: "https://api.notion.com/v1/pages",
    headers: headers(token),
    json: {
      parent: { database_id: normalizeId(input.databaseId) },
      properties: { [input.titleProperty]: { title: text(input.title) } },
      children: input.summary ? [{ object: "block", type: "paragraph", paragraph: { rich_text: text(input.summary) } }] : [],
    },
    signal,
  });
  const page = res.body as { id: string; url?: string };
  return { id: page.id, url: page.url ?? null };
}
