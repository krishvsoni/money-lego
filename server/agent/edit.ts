import "server-only";
import { nodeDefinition } from "@/lib/nodes/registry";
import { moneySafetyIssues } from "@/lib/templates/validate";
import type { WorkflowGraph, WorkflowNode } from "@/lib/workflow/types";
import { validateGraph } from "@/lib/workflow/validate";
import type { SessionUser } from "../auth/session";
import { getWorkflowDoc } from "../workflows/service";
import { systemPrompt } from "./catalog";
import { Crew, missingNotes, plural, type Emit } from "./crew";
import { fillFromRequest } from "./fill";
import { toGraph } from "./guardrails";
import type { ChatMessage } from "./openrouter";
import type { AgentDraft } from "./schema";

// The crew working on a workflow that is open in the editor. Nothing is saved here: the
// changed graph goes back to the editor, which applies it as one undoable change and saves
// it the way it saves any edit, so the crew can never overwrite work the owner did meanwhile.

export type EditAction = "edit" | "fix" | "link";

// What the model sees of the current workflow: ids, types, labels and settings, but never a
// credential id, which means nothing to it and isn't its business.
export function describeForModel(graph: WorkflowGraph, name: string): string {
  const nodes = graph.nodes.map((n) => {
    const def = nodeDefinition(n.type);
    const hidden = new Set(def?.fields.filter((f) => f.kind === "credential").map((f) => f.key));
    const config = Object.fromEntries(Object.entries(n.config).filter(([k]) => !hidden.has(k)));
    return { id: n.id, type: n.type, label: n.label, config };
  });
  const edges = graph.edges.map((e) => ({ from: e.source, to: e.target, port: e.sourcePort }));
  return JSON.stringify({ name, nodes, edges });
}

// Blocks that survive the edit keep their place on the canvas and the accounts the owner
// linked; new blocks land below the existing ones so nothing is drawn on top of anything.
function mergeWithCurrent(next: WorkflowGraph, current: WorkflowGraph): WorkflowGraph {
  const before = new Map(current.nodes.map((n) => [n.id, n]));
  const floor = Math.max(0, ...current.nodes.map((n) => n.position.y)) + 200;
  const nodes = next.nodes.map((n): WorkflowNode => {
    const old = before.get(n.id);
    if (!old || old.type !== n.type) return { ...n, position: { x: n.position.x, y: n.position.y + floor } };
    const config = { ...n.config };
    for (const f of nodeDefinition(n.type)?.fields ?? []) {
      if (f.kind === "credential" && old.config[f.key] && !config[f.key]) config[f.key] = old.config[f.key];
    }
    return { ...n, position: old.position, config };
  });
  return { ...next, nodes };
}

function summarize(next: WorkflowGraph, current: WorkflowGraph): string {
  const before = new Map(current.nodes.map((n) => [n.id, n]));
  const after = new Set(next.nodes.map((n) => n.id));
  const added = next.nodes.filter((n) => !before.has(n.id)).length;
  const removed = current.nodes.filter((n) => !after.has(n.id)).length;
  const changed = next.nodes.filter((n) => {
    const old = before.get(n.id);
    return old && (old.type !== n.type || old.label !== n.label || JSON.stringify(old.config) !== JSON.stringify(n.config));
  }).length;
  const parts = [added && `added ${plural(added, "block")}`, removed && `removed ${plural(removed, "block")}`, changed && `updated ${plural(changed, "block")}`].filter(Boolean);
  return parts.length ? `${parts.join(", ").replace(/^./, (c) => c.toUpperCase())}.` : "No changes were needed.";
}

function fixRequest(graph: WorkflowGraph): string | null {
  const problems = [...validateGraph(graph).map((i) => `${i.nodeId ? `${i.nodeId}: ` : ""}${i.field ? `${i.field}: ` : ""}${i.message}`), ...moneySafetyIssues(graph)];
  if (!problems.length) return null;
  return `Fix these problems. For a setting only the owner can know (a spreadsheet, an email address, an account), leave it empty and say so in notes.\n${problems.map((p) => `- ${p}`).join("\n")}`;
}

export async function runEdit(
  user: SessionUser,
  input: { workflowId: string; graph: WorkflowGraph; action: EditAction; prompt?: string },
  emit: Emit,
): Promise<void> {
  const crew = new Crew(user, emit);
  const doc = await getWorkflowDoc(user, input.workflowId, "edit");
  const current = input.graph;

  if (input.action === "link") {
    const links = await crew.connect(current);
    const linkedCount = links.linked.length;
    emit({ type: "edited", graph: links.graph, name: null, notes: [], summary: linkedCount ? `Linked ${links.linked.join(", ")}.` : "Nothing new to link.", linked: links.linked, missing: missingNotes(links) });
    return;
  }

  const request = input.action === "fix" ? fixRequest(current) : input.prompt?.trim();
  const lead = input.action === "fix" ? "fixer" : "planner";
  if (!request) {
    crew.status(lead, "done", "Nothing to fix");
    emit({ type: "edited", graph: current, name: null, notes: [], summary: "Everything checks out. Nothing to fix.", linked: [], missing: [] });
    return;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    {
      role: "user",
      content: `Current workflow:\n${describeForModel(current, doc.name)}\n\nChange requested:\n"""\n${request}\n"""\n\nReply with the FULL updated workflow in the same JSON format. Keep the id of every block you keep. Keep the name unless the change asks for a new one. Apply the change by editing the matching block's settings wherever one exists; only add blocks for steps the workflow doesn't have yet.`,
    },
  ];

  crew.status(lead, "working");
  crew.log(lead, input.action === "fix" ? "Reading the problems in this workflow" : "Reading your change and the current workflow");
  const first = await crew.think(lead, messages).catch((error) => {
    crew.status(lead, "failed");
    throw error;
  });
  if (lead === "planner") crew.status("planner", "done", `Planned ${plural(first.nodes.length, "block")}`);

  const build = (d: AgentDraft) => mergeWithCurrent(fillFromRequest(toGraph(d), request), current);
  const { draft, graph: safe } = await crew.secure(first, messages, build);
  if (lead === "fixer") crew.status("fixer", "done", "Repaired");
  crew.plan(safe);
  const links = await crew.connect(safe);

  crew.status("builder", "working");
  crew.log("builder", "Handing the changes to the editor. Undo reverts them in one step");
  crew.status("builder", "done", "Changes are on the canvas");

  const name = draft.name && draft.name !== doc.name ? draft.name.slice(0, 80) : null;
  emit({ type: "edited", graph: links.graph, name, notes: draft.notes, summary: summarize(links.graph, current), linked: links.linked, missing: missingNotes(links) });
}
