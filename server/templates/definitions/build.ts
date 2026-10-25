import { nodeDefinition } from "@/lib/nodes/registry";
import { PROVIDERS } from "@/lib/nodes/providers";
import { supportedTokens } from "@/lib/tokens";
import type { TemplateConnection } from "@/lib/templates/types";
import { WORKFLOW_SCHEMA_VERSION, type WorkflowEdge, type WorkflowGraph, type WorkflowNode } from "@/lib/workflow/types";

// Helpers for writing template graphs as data: nodes on a grid, edges as [from, to, port].

const COL = 290;
const ROW = 170;

export interface Spec {
  id: string;
  type: string;
  label?: string;
  at: [col: number, row: number];
  config?: Record<string, unknown>;
}

export function graph(nodes: Spec[], edges: Array<[string, string, string?]>): WorkflowGraph {
  const placed: WorkflowNode[] = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    ...(n.label ? { label: n.label } : {}),
    position: { x: n.at[0] * COL, y: n.at[1] * ROW },
    config: { ...structuredClone(nodeDefinition(n.type)?.defaults ?? {}), ...(n.config ?? {}) },
  }));
  const wired: WorkflowEdge[] = edges.map(([source, target, port], i) => ({ id: `e${i + 1}-${source}-${target}`, source, sourcePort: port ?? "main", target, targetPort: "main" }));
  return { schemaVersion: WORKFLOW_SCHEMA_VERSION, nodes: placed, edges: wired };
}

// The network's vetted USDC, so the token field starts on the one asset the app supports.
export const usdcMint = () => supportedTokens()[0]?.mint ?? "";

// The MultiHopper half every payout template shares: price it, a human approves the exact
// payload, lock the quote, the owner signs in their wallet, then wait for delivery.
export function payoutSteps(start: [number, number], approvalMessage: string): Spec[] {
  const [c, r] = start;
  return [
    { id: "quote", type: "mh.estimate", label: "MultiHopper quote", at: [c, r] },
    { id: "approval", type: "logic.approval", label: "Operator review", at: [c + 1, r], config: { message: approvalMessage, timeoutHours: 24 } },
    { id: "transfer", type: "mh.create_transfer", label: "Create transfer", at: [c + 2, r] },
    { id: "sign", type: "mh.wallet_sign", label: "Wallet authorization", at: [c + 3, r], config: { timeoutHours: 24 } },
    { id: "wait", type: "mh.wait_status", label: "Wait for delivery", at: [c + 4, r], config: { target: "completed", timeoutHours: 72 } },
  ];
}

export const payoutEdges = (from: string): Array<[string, string, string?]> => [
  [from, "quote"],
  ["quote", "approval"],
  ["approval", "transfer", "approved"],
  ["transfer", "sign"],
  ["sign", "wait"],
];

// What the importer has to connect, derived from the graph so it can never disagree with
// it: one entry per provider, listing the nodes and the required fields still empty.
export function connectionsOf(g: WorkflowGraph): TemplateConnection[] {
  const byProvider = new Map<string, TemplateConnection>();
  for (const n of g.nodes) {
    const def = nodeDefinition(n.type);
    if (!def?.provider) continue;
    const credentialField = def.fields.find((f) => f.kind === "credential");
    const credentialType = credentialField?.kind === "credential" ? credentialField.credentialType : (PROVIDERS[def.provider]?.credential ?? null);
    // Discord's trigger and its message node use different credentials, so they list apart.
    const key = `${def.provider}:${credentialField ? credentialType : "none"}`;
    const entry = byProvider.get(key) ?? { provider: def.provider, credentialType: credentialField ? credentialType : null, nodeIds: [], fields: [], why: PROVIDERS[def.provider]?.setup ?? "" };
    entry.nodeIds.push(n.id);
    for (const f of def.fields) {
      const value = n.config[f.key];
      if (f.required && f.kind !== "credential" && (value === undefined || value === "")) entry.fields.push(`${n.id}.${f.key}`);
    }
    byProvider.set(key, entry);
  }
  return [...byProvider.values()];
}
