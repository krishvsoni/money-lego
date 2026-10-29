import "server-only";
import { createHash } from "node:crypto";
import { validateGraph, type GraphIssue } from "@/lib/workflow/validate";
import type { WorkflowGraph } from "@/lib/workflow/types";
import type { SessionUser } from "../auth/session";
import { AppError } from "../errors";
import { log } from "../log";
import { createDraftWorkflow, type WorkflowDTO } from "../workflows/service";
import { systemPrompt } from "./catalog";
import { linkConnections } from "./connector";
import { reviewGraph, toGraph } from "./guardrails";
import { completeJson, type ChatMessage } from "./openrouter";
import { agentDraftSchema, type AgentDraft } from "./schema";

// Mason's crew, run in order. Planner and Fixer are model calls; Guard, Connector and
// Builder are plain code, so the parts that decide safety and touch the database are
// deterministic. Each step reports as it goes, which is what the panel shows live.
// Nothing the crew produces can run until the owner sets it up and turns it on, and every
// transfer still needs the owner's approval and wallet signature.

export type CrewId = "planner" | "guard" | "fixer" | "connector" | "builder";
export type CrewStatus = "working" | "done" | "skipped" | "failed";

export type CrewEvent =
  | { type: "agent"; id: CrewId; status: CrewStatus; detail?: string }
  | { type: "result"; workflow: WorkflowDTO; notes: string[]; setupIssues: number; linked: string[]; missing: string[] };

export type Emit = (event: CrewEvent) => void;

function describeIssues(issues: GraphIssue[]): string {
  return issues.map((i) => `- ${i.nodeId ? `node ${i.nodeId}: ` : ""}${i.message}`).join("\n");
}

function opaqueUserTag(user: SessionUser): string {
  return createHash("sha256").update(`money-lego-agent:${user.userId.toHexString()}`).digest("hex").slice(0, 32);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function plan(messages: ChatMessage[], tag: string): Promise<AgentDraft> {
  const raw = await completeJson(messages, tag);
  const parsed = agentDraftSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  messages.push({ role: "assistant", content: JSON.stringify(raw).slice(0, 6_000) });
  messages.push({ role: "user", content: `That JSON doesn't match the required shape: ${parsed.error.issues[0]?.message}. Reply with the corrected JSON only.` });
  const retry = agentDraftSchema.safeParse(await completeJson(messages, tag));
  if (retry.success) return retry.data;
  throw new AppError("AGENT_BAD_OUTPUT", 502, "The plan came back unusable. Try naming the trigger, where the payout list comes from and who approves it.");
}

export async function runCrew(user: SessionUser, prompt: string, requestKey: string | undefined, emit: Emit): Promise<void> {
  const tag = opaqueUserTag(user);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: `Workflow to build:\n"""\n${prompt}\n"""` },
  ];

  emit({ type: "agent", id: "planner", status: "working" });
  let draft = await plan(messages, tag).catch((error) => {
    emit({ type: "agent", id: "planner", status: "failed" });
    throw error;
  });
  let graph: WorkflowGraph = toGraph(draft);
  emit({ type: "agent", id: "planner", status: "done", detail: `Picked ${plural(graph.nodes.length, "block")}` });

  emit({ type: "agent", id: "guard", status: "working" });
  let { blocking } = reviewGraph(graph);
  emit({ type: "agent", id: "guard", status: "done", detail: blocking.length ? `Flagged ${plural(blocking.length, "problem")}` : "Approval and wallet signature are in place" });

  if (!blocking.length) {
    emit({ type: "agent", id: "fixer", status: "skipped", detail: "Nothing to fix" });
  } else {
    emit({ type: "agent", id: "fixer", status: "working", detail: `Repairing ${plural(blocking.length, "problem")}` });
    messages.push({ role: "assistant", content: JSON.stringify(draft).slice(0, 6_000) });
    messages.push({ role: "user", content: `Fix these problems and reply with the full corrected JSON only:\n${describeIssues(blocking)}` });
    draft = await plan(messages, tag).catch((error) => {
      emit({ type: "agent", id: "fixer", status: "failed" });
      throw error;
    });
    graph = toGraph(draft);
    ({ blocking } = reviewGraph(graph));
    log.info("agent.repair", { blocking: blocking.length });
    if (blocking.length) {
      emit({ type: "agent", id: "fixer", status: "failed", detail: `${plural(blocking.length, "problem")} left` });
      throw new AppError("AGENT_BAD_OUTPUT", 422, "Mason couldn't make that safe. Try naming the trigger, where the payout list comes from and who approves it.");
    }
    emit({ type: "agent", id: "fixer", status: "done", detail: "Guard's checks pass now" });
  }

  emit({ type: "agent", id: "connector", status: "working" });
  const links = await linkConnections(user, graph);
  graph = links.graph;
  const connectorDetail = links.linked.length
    ? `Linked ${links.linked.join(", ")}`
    : links.missing.length || links.ambiguous.length
      ? "Nothing connected yet to link"
      : "No accounts needed";
  emit({ type: "agent", id: "connector", status: "done", detail: connectorDetail });

  emit({ type: "agent", id: "builder", status: "working" });
  const workflow = await createDraftWorkflow(user, {
    name: draft.name.slice(0, 80),
    description: draft.description || `Built by Mason from: ${prompt.slice(0, 160)}`,
    graph,
    requestKey,
  });
  const setupIssues = validateGraph(graph).filter((i) => i.field).length;
  emit({ type: "agent", id: "builder", status: "done", detail: "Saved, turned off" });

  const missing = [...links.missing.map((m) => `Connect ${m}`), ...links.ambiguous.map((m) => `Pick which ${m} to use`)];
  emit({ type: "result", workflow, notes: draft.notes, setupIssues, linked: links.linked, missing });
}
