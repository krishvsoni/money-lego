import "server-only";
import { nodeDefinition } from "@/lib/nodes/registry";
import { PROVIDERS } from "@/lib/nodes/providers";
import type { WorkflowGraph } from "@/lib/workflow/types";
import type { SessionUser } from "../auth/session";
import { listCredentials } from "../workflows/credentials";

// The Connector sub-agent. It wires accounts the owner has already connected into the
// blocks that need them, and only when the choice is unambiguous: exactly one usable
// connection of the right kind. Two Slack channels means the owner picks, not us. It only
// ever reads the owner's own credentials, and never sees a secret, just ids and types.

export interface LinkResult {
  graph: WorkflowGraph;
  linked: string[];
  missing: string[];
  ambiguous: string[];
}

function labelFor(type: string): string {
  const def = nodeDefinition(type);
  if (!def) return type;
  if (def.provider && PROVIDERS[def.provider]) return PROVIDERS[def.provider].label;
  return type === "trigger.webhook" ? "Webhook signing secret" : def.title;
}

export async function linkConnections(user: SessionUser, graph: WorkflowGraph): Promise<LinkResult> {
  const owned = await listCredentials(user);
  const usable = owned.filter((c) => !c.account || c.missingScopes.length === 0);
  const linked = new Set<string>();
  const missing = new Set<string>();
  const ambiguous = new Set<string>();

  const nodes = graph.nodes.map((node) => {
    const def = nodeDefinition(node.type);
    const field = def?.fields.find((f) => f.kind === "credential");
    if (!field || field.kind !== "credential" || node.config[field.key]) return node;
    const matches = usable.filter((c) => c.type === field.credentialType);
    const label = labelFor(node.type);
    if (matches.length === 1) {
      linked.add(label);
      return { ...node, config: { ...node.config, [field.key]: matches[0].id } };
    }
    (matches.length ? ambiguous : missing).add(label);
    return node;
  });

  return { graph: { ...graph, nodes }, linked: [...linked], missing: [...missing], ambiguous: [...ambiguous] };
}
