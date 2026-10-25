import { nodeDefinition } from "@/lib/nodes/registry";
import { CATEGORY_META } from "@/lib/nodes/types";
import type { WorkflowDTO } from "@/lib/workflow/dto";

export interface Integration {
  type: string;
  label: string;
  icon: string;
  color: string;
}

// The outside services a workflow talks to (Discord, Slack, HTTP…), named the way people
// know them rather than by node type.
const SHORT: Record<string, string> = { "http.request": "HTTP", "notify.discord": "Discord", "notify.slack": "Slack", "notify.telegram": "Telegram", "notify.email": "Email" };

export function integrationsOf(w: WorkflowDTO): Integration[] {
  const seen = new Map<string, Integration>();
  for (const n of w.graph.nodes) {
    const def = nodeDefinition(n.type);
    if (!def || def.category !== "integrations" || seen.has(def.type)) continue;
    seen.set(def.type, { type: def.type, label: SHORT[def.type] ?? def.title, icon: def.icon, color: CATEGORY_META.integrations.color });
  }
  return [...seen.values()];
}

// Only integrations that at least one workflow uses become filters, so no chip ever
// leads to an empty list.
export function integrationsIn(workflows: WorkflowDTO[]): Integration[] {
  const all = new Map<string, Integration>();
  for (const w of workflows) for (const i of integrationsOf(w)) all.set(i.type, i);
  return [...all.values()].sort((a, b) => a.label.localeCompare(b.label));
}
