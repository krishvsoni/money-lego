import { nodeDefinition } from "../nodes/registry";
import { PROVIDERS } from "../nodes/providers";
import { WORKFLOW_SCHEMA_VERSION, workflowGraphSchema, type WorkflowGraph } from "../workflow/types";
import { validateGraph } from "../workflow/validate";
import type { TemplateDefinition } from "./types";

// A template must be a sound graph that is safe to hand to a stranger: every node type is
// registered and built, every edge uses real ports, nothing is wired to anyone's account,
// and money can only move after a human approves. Unconfigured fields are expected; they
// are what the importer fills in. Seeding and tests both run this, so a broken template
// fails the build instead of showing a broken card.

const PLACEHOLDER = /^\{\{\s*configure_[a-z_]+\s*\}\}$/;

// Structural problems only: config issues carry a field, structural ones never do.
export function structuralIssues(graph: WorkflowGraph): string[] {
  return validateGraph(graph)
    .filter((i) => i.field === undefined)
    .map((i) => (i.nodeId ? `${i.nodeId}: ${i.message}` : i.message));
}

function upstreamOf(graph: WorkflowGraph, nodeId: string): Array<{ id: string; viaPort: string; type: string }> {
  const seen = new Map<string, { id: string; viaPort: string; type: string }>();
  const stack = [nodeId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const e of graph.edges.filter((edge) => edge.target === current)) {
      if (seen.has(e.source)) continue;
      const type = graph.nodes.find((n) => n.id === e.source)?.type ?? "";
      seen.set(e.source, { id: e.source, viaPort: e.sourcePort, type });
      stack.push(e.source);
    }
  }
  return [...seen.values()];
}

// Every money-moving or customer-contacting PayPal action must be entered only through a
// Human approval's Approved output (so the approval can fingerprint exactly what it will
// do), and payout status needs a payout before it.
export function moneySafetyIssues(graph: WorkflowGraph): string[] {
  const issues: string[] = [];
  const typeOf = new Map(graph.nodes.map((n) => [n.id, n.type]));
  for (const node of graph.nodes) {
    const def = nodeDefinition(node.type);
    if (def?.sideEffect) {
      const incoming = graph.edges.filter((e) => e.target === node.id);
      const gated = incoming.length > 0 && incoming.every((e) => typeOf.get(e.source) === "logic.approval" && e.sourcePort === "approved");
      if (!gated) issues.push(`${node.id}: ${def.title} must be connected only to a Human approval's Approved output`);
    }
    if (node.type === "paypal.payout_status" && !upstreamOf(graph, node.id).some((u) => u.type === "paypal.payout")) {
      issues.push(`${node.id}: Payout status needs a PayPal payout before it`);
    }
  }
  if (!graph.nodes.some((n) => nodeDefinition(n.type)?.provider === "paypal")) issues.push("A template must use PayPal.");
  return issues;
}

// Values a template may not ship: credential ids, real email addresses, or anything that
// looks like a live secret or endpoint. Placeholders like {{ configure_email }} are allowed.
function leakedValues(graph: WorkflowGraph): string[] {
  const issues: string[] = [];
  const scan = (nodeId: string, path: string, value: unknown) => {
    if (typeof value === "string") {
      if (PLACEHOLDER.test(value.trim())) return;
      if (/@/.test(value) && !/@example\.(com|org)$/i.test(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) issues.push(`${nodeId}.${path}: templates may only use example.com addresses`);
      if (/(whsec_|sk_live|sk_test|xox[bp]-|ntn_|secret_[A-Za-z0-9]{10}|pat[A-Za-z0-9]{10}\.|hooks\.slack\.com|discord\.com\/api\/webhooks|access_token\$)/.test(value)) issues.push(`${nodeId}.${path}: looks like a secret or live webhook`);
    } else if (Array.isArray(value)) value.forEach((v, i) => scan(nodeId, `${path}.${i}`, v));
    else if (value && typeof value === "object") Object.entries(value).forEach(([k, v]) => scan(nodeId, path ? `${path}.${k}` : k, v));
  };
  for (const node of graph.nodes) {
    const def = nodeDefinition(node.type);
    for (const field of def?.fields ?? []) {
      if (field.kind === "credential" && node.config[field.key] !== undefined) issues.push(`${node.id}.${field.key}: templates never carry a credential`);
    }
    scan(node.id, "", node.config);
  }
  return issues;
}

export function validateTemplate(t: TemplateDefinition): string[] {
  const issues: string[] = [];
  const parsed = workflowGraphSchema.safeParse(t.graphDefinition);
  if (!parsed.success) return [`graph doesn't match schema v${WORKFLOW_SCHEMA_VERSION}: ${parsed.error.issues[0]?.message}`];
  const graph = parsed.data;
  if (!/^[a-z0-9-]{3,60}$/.test(t.slug)) issues.push("slug must be lowercase words joined by dashes");

  for (const node of graph.nodes) {
    const def = nodeDefinition(node.type);
    if (!def) issues.push(`${node.id}: unknown node type ${node.type}`);
    else if (def.unavailable) issues.push(`${node.id}: ${node.type} isn't built yet, so a template can't use it`);
  }
  issues.push(...structuralIssues(graph), ...moneySafetyIssues(graph), ...leakedValues(graph));

  const ids = new Set(graph.nodes.map((n) => n.id));
  const used = new Set(graph.nodes.map((n) => nodeDefinition(n.type)?.provider).filter(Boolean) as string[]);
  for (const p of t.integrations) {
    if (!PROVIDERS[p]) issues.push(`integration ${p} isn't a known provider`);
    else if (!used.has(p)) issues.push(`integration ${p} is listed but no node uses it`);
  }
  for (const p of used) if (!t.integrations.includes(p)) issues.push(`node provider ${p} is missing from integrations`);

  const refs = [
    ...t.exampleScenario.expectedStepOutputs.map((s) => s.nodeId),
    ...t.exampleRun.steps.map((s) => s.nodeId),
    ...t.requiredConnections.flatMap((c) => c.nodeIds),
    ...t.setupChecklist.flatMap((c) => c.nodeIds),
  ];
  for (const ref of refs) if (!ids.has(ref)) issues.push(`reference to unknown node ${ref}`);
  if (t.exampleScenario.dryRun !== true || t.exampleRun.dryRun !== true) issues.push("examples must be marked dry run");
  if (t.estimatedSetupMinutes.min > t.estimatedSetupMinutes.max) issues.push("setup estimate range is reversed");
  return issues;
}
