import "server-only";
import { nodeDefinition } from "@/lib/nodes/registry";
import { moneySafetyIssues } from "@/lib/templates/validate";
import { WORKFLOW_SCHEMA_VERSION, type WorkflowGraph, type WorkflowNode } from "@/lib/workflow/types";
import { validateGraph, type GraphIssue } from "@/lib/workflow/validate";
import { layoutGraph } from "@/lib/workflow/layout";
import type { AgentDraft } from "./schema";

// Turns a model's draft into a graph we are willing to save. The model is untrusted: every
// node and field is checked against the registry, credentials are blanked, and every PayPal
// money action must sit directly behind a human approval before it can be saved.


function cleanConfig(type: string, config: Record<string, unknown>): Record<string, unknown> {
  const def = nodeDefinition(type)!;
  const out: Record<string, unknown> = structuredClone(def.defaults);
  for (const field of def.fields) {
    if (field.kind === "credential") continue;
    const value = config[field.key];
    if (value === undefined || value === null) continue;
    if (field.kind === "select" && !field.options.some((o) => o.value === value)) continue;
    // Pair rows are edited as text in the inspector, so a model's numbers become strings.
    if (field.kind === "pairs" && Array.isArray(value)) {
      out[field.key] = value
        .filter((row) => row && typeof row === "object")
        .map((row) => Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)])));
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
  return layoutGraph({ schemaVersion: WORKFLOW_SCHEMA_VERSION, nodes, edges });
}

// Template rules (every PayPal money action directly behind an approval, payout status after
// a payout). The template-only "must use PayPal" rule is dropped; a notify-only draft is fine.
function moneyIssues(graph: WorkflowGraph): GraphIssue[] {
  return moneySafetyIssues(graph)
    .filter((m) => m.includes(":"))
    .map((m) => ({ nodeId: m.slice(0, m.indexOf(":")), message: m.slice(m.indexOf(":") + 1).trim() }));
}

// Structural problems block saving and go back to the model; missing settings (an empty
// spreadsheet ID, an unconnected Slack) are expected in a draft and become the checklist.
export function reviewGraph(graph: WorkflowGraph): { blocking: GraphIssue[]; setup: GraphIssue[] } {
  const all = validateGraph(graph);
  const blocking = [...all.filter((i) => !i.field), ...moneyIssues(graph)];
  if (graph.nodes.length > 20) blocking.push({ nodeId: null, message: "Use at most 20 nodes." });
  return { blocking, setup: all.filter((i) => i.field) };
}
