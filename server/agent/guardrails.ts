import "server-only";
import { nodeDefinition } from "@/lib/nodes/registry";
import { moneySafetyIssues } from "@/lib/templates/validate";
import { supportedTokens } from "@/lib/tokens";
import { WORKFLOW_SCHEMA_VERSION, type WorkflowGraph, type WorkflowNode } from "@/lib/workflow/types";
import { topologicalOrder, validateGraph, type GraphIssue } from "@/lib/workflow/validate";
import type { AgentDraft } from "./schema";

// Turns a model's draft into a graph we are willing to save. The model is untrusted: every
// node and field is checked against the registry, credentials are blanked, and the money
// path must contain a human approval and a wallet signature before it can be saved.

const COL = 290;
const ROW = 170;

function cleanConfig(type: string, config: Record<string, unknown>): Record<string, unknown> {
  const def = nodeDefinition(type)!;
  const out: Record<string, unknown> = structuredClone(def.defaults);
  for (const field of def.fields) {
    if (field.kind === "credential") continue;
    const value = config[field.key];
    if (value === undefined || value === null) continue;
    if (field.kind === "token" && !supportedTokens().some((t) => t.mint === value)) {
      out[field.key] = supportedTokens()[0]?.mint ?? "";
      continue;
    }
    if (typeof value === "object" && field.kind !== "pairs") {
      out[field.key] = JSON.stringify(value);
      continue;
    }
    out[field.key] = value;
  }
  return out;
}

// Columns follow the longest path from the trigger so the canvas reads left to right.
function layout(nodes: WorkflowNode[], edges: WorkflowGraph["edges"]): void {
  const order = topologicalOrder({ schemaVersion: WORKFLOW_SCHEMA_VERSION, nodes, edges }) ?? nodes.map((n) => n.id);
  const depth = new Map<string, number>();
  for (const id of order) {
    const parents = edges.filter((e) => e.target === id).map((e) => depth.get(e.source) ?? 0);
    depth.set(id, parents.length ? Math.max(...parents) + 1 : 0);
  }
  const rows = new Map<number, number>();
  for (const n of nodes) {
    const col = depth.get(n.id) ?? 0;
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    n.position = { x: col * COL, y: row * ROW };
  }
}

export function toGraph(draft: AgentDraft): WorkflowGraph {
  const nodes: WorkflowNode[] = draft.nodes
    .filter((n) => nodeDefinition(n.type) && !nodeDefinition(n.type)!.unavailable)
    .map((n) => ({
      id: n.id,
      type: n.type,
      ...(n.label ? { label: n.label.slice(0, 60) } : {}),
      position: { x: 0, y: 0 },
      config: cleanConfig(n.type, n.config ?? {}),
    }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = draft.edges
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e, i) => ({ id: `e${i + 1}`, source: e.from, sourcePort: e.port || "main", target: e.to, targetPort: "main" }));
  layout(nodes, edges);
  return { schemaVersion: WORKFLOW_SCHEMA_VERSION, nodes, edges };
}

// Template rules (approval before any transfer, a transfer before any signature) plus one
// more for drafts: a created quote goes straight to the wallet, never sideways first. The
// template-only "must contain a payout" rule is dropped; a notify-only draft is fine.
function moneyIssues(graph: WorkflowGraph): GraphIssue[] {
  const issues: GraphIssue[] = moneySafetyIssues(graph)
    .filter((m) => m.includes(":"))
    .map((m) => ({ nodeId: m.slice(0, m.indexOf(":")), message: m.slice(m.indexOf(":") + 1).trim() }));
  const typeOf = new Map(graph.nodes.map((n) => [n.id, n.type]));
  for (const create of graph.nodes.filter((n) => n.type === "mh.create_transfer")) {
    if (!graph.edges.some((e) => e.source === create.id && typeOf.get(e.target) === "mh.wallet_sign")) {
      issues.push({ nodeId: create.id, message: "mh.create_transfer must be followed directly by mh.wallet_sign." });
    }
  }
  return issues;
}

// Structural problems block saving and go back to the model; missing settings (an empty
// spreadsheet ID, an unconnected Slack) are expected in a draft and become the checklist.
export function reviewGraph(graph: WorkflowGraph): { blocking: GraphIssue[]; setup: GraphIssue[] } {
  const all = validateGraph(graph);
  const blocking = [...all.filter((i) => !i.field), ...moneyIssues(graph)];
  if (graph.nodes.length > 20) blocking.push({ nodeId: null, message: "Use at most 20 nodes." });
  return { blocking, setup: all.filter((i) => i.field) };
}
