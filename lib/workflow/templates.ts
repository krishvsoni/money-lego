import { supportedTokens } from "../tokens";
import { WORKFLOW_SCHEMA_VERSION, type WorkflowEdge, type WorkflowGraph, type WorkflowNode } from "./types";

export interface Template {
  id: string;
  name: string;
  description: string;
  graph: () => WorkflowGraph;
}

const X = 300;
const Y = 190;
const PER_ROW = 4;

function chain(nodes: Array<Omit<WorkflowNode, "position"> & { row?: number }>, ports: Record<string, string> = {}): WorkflowGraph {
  // Wrap long chains into rows so the whole flow reads at a comfortable zoom.
  const placed = nodes.map((n, i) => ({ ...n, position: { x: (i % PER_ROW) * X, y: Math.floor(i / PER_ROW) * Y + (n.row ?? 0) * Y } }));
  const edges: WorkflowEdge[] = [];
  for (let i = 0; i < placed.length - 1; i++) {
    const source = placed[i].id;
    edges.push({ id: `e-${source}`, source, sourcePort: ports[source] ?? "main", target: placed[i + 1].id, targetPort: "main" });
  }
  return { schemaVersion: WORKFLOW_SCHEMA_VERSION, nodes: placed.map((n) => ({ id: n.id, type: n.type, ...(n.label ? { label: n.label } : {}), position: n.position, config: n.config })), edges };
}

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Blank workflow",
    description: "Start from an empty canvas.",
    graph: () => ({ schemaVersion: WORKFLOW_SCHEMA_VERSION, nodes: [], edges: [] }),
  },
  {
    id: "webhook-payout",
    name: "Signed webhook to approved payout",
    description:
      "A signed event asks for a payout. It's validated, split across recipients, priced, approved by you, signed in your wallet, tracked to completion and announced on Discord.",
    graph: () =>
      chain(
        [
          { id: "webhook", type: "trigger.webhook", config: {} },
          { id: "validate", type: "data.validate", label: "Validate event", config: { rules: [{ path: "body.type", type: "string" }, { path: "body.amount", type: "string" }] } },
          { id: "condition", type: "logic.condition", label: "Is a payout request", config: { left: "{{ input.body.type }}", operator: "equals", right: "payout.requested" } },
          {
            id: "split",
            type: "data.split",
            config: {
              tokenMint: supportedTokens()[0]?.mint ?? "",
              mode: "percent",
              total: "{{ input.body.amount }}",
              recipients: [
                { wallet: "", share: "60", label: "Design" },
                { wallet: "", share: "40", label: "Engineering" },
              ],
            },
          },
          { id: "estimate", type: "mh.estimate", config: {} },
          { id: "approval", type: "logic.approval", config: { message: "Pay {{ input.amount }} {{ input.symbol }} to {{ input.destinations.length }} recipients?", timeoutHours: 24 } },
          { id: "create", type: "mh.create_transfer", config: {} },
          { id: "sign", type: "mh.wallet_sign", config: { timeoutHours: 24 } },
          { id: "wait", type: "mh.wait_status", label: "Wait for confirmation", config: { target: "completed", timeoutHours: 72 } },
          { id: "result", type: "mh.result", config: {} },
          { id: "discord", type: "notify.discord", config: { message: "Payout {{ input.state }}: {{ input.amount }} to {{ input.recipients }} recipients. {{ input.receiptUrl }}" } },
          { id: "log", type: "util.log", config: { message: "Payout finished as {{ input.state }}." } },
        ],
        { condition: "true", approval: "approved" },
      ),
  },
  {
    id: "manual-payout",
    name: "Manual payout",
    description: "Run a fixed split by hand: split, price, sign, wait.",
    graph: () =>
      chain(
        [
          { id: "manual", type: "trigger.manual", config: { samplePayload: '{ "amount": "100" }' } },
          { id: "split", type: "data.split", config: { tokenMint: supportedTokens()[0]?.mint ?? "", mode: "even", total: "{{ input.amount }}", recipients: [{ wallet: "", share: "", label: "" }] } },
          { id: "create", type: "mh.create_transfer", config: {} },
          { id: "sign", type: "mh.wallet_sign", config: { timeoutHours: 24 } },
          { id: "wait", type: "mh.wait_status", config: { target: "completed", timeoutHours: 72 } },
        ],
      ),
  },
];

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
