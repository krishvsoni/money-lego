import "server-only";
import { createHash } from "node:crypto";
import type { WorkflowGraph } from "@/lib/workflow/types";
import type { GraphIssue } from "@/lib/workflow/validate";
import type { SessionUser } from "../auth/session";
import { AppError } from "../errors";
import { log } from "../log";
import { createDraftWorkflow, type WorkflowDTO } from "../workflows/service";
import { systemPrompt } from "./catalog";
import { reviewGraph, toGraph } from "./guardrails";
import { completeJson, type ChatMessage } from "./openrouter";
import { agentDraftSchema, type AgentDraft } from "./schema";

// Plain words in, a disabled workflow out. The agent plans, our validator checks, and on a
// structural problem the model gets one chance to repair its own draft with the exact
// issues. Nothing the agent produces can run until the owner sets it up and turns it on,
// and every transfer in it still needs the owner's approval and wallet signature.

const MAX_ATTEMPTS = 2;

export interface DraftResult {
  workflow: WorkflowDTO;
  notes: string[];
  setupIssues: number;
}

function describeIssues(issues: GraphIssue[]): string {
  return issues.map((i) => `- ${i.nodeId ? `node ${i.nodeId}: ` : ""}${i.message}`).join("\n");
}

function opaqueUserTag(user: SessionUser): string {
  return createHash("sha256").update(`money-lego-agent:${user.userId.toHexString()}`).digest("hex").slice(0, 32);
}

export async function draftWorkflow(user: SessionUser, prompt: string, requestKey?: string): Promise<DraftResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: `Workflow to build:\n"""\n${prompt}\n"""` },
  ];
  const tag = opaqueUserTag(user);

  let last: { draft: AgentDraft; graph: WorkflowGraph; setup: GraphIssue[] } | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const raw = await completeJson(messages, tag);
    const parsed = agentDraftSchema.safeParse(raw);
    if (!parsed.success) {
      messages.push({ role: "assistant", content: JSON.stringify(raw).slice(0, 6_000) });
      messages.push({ role: "user", content: `That JSON doesn't match the required shape: ${parsed.error.issues[0]?.message}. Reply with the corrected JSON only.` });
      continue;
    }
    const graph = toGraph(parsed.data);
    const { blocking, setup } = reviewGraph(graph);
    log.info("agent.draft", { attempt, nodes: graph.nodes.length, blocking: blocking.length, setup: setup.length });
    if (!blocking.length) {
      last = { draft: parsed.data, graph, setup };
      break;
    }
    messages.push({ role: "assistant", content: JSON.stringify(parsed.data).slice(0, 6_000) });
    messages.push({ role: "user", content: `Fix these problems and reply with the full corrected JSON only:\n${describeIssues(blocking)}` });
  }

  if (!last) {
    throw new AppError("AGENT_BAD_OUTPUT", 422, "The agent couldn't produce a safe workflow for that. Try naming the trigger, where the payout list comes from and who approves it.");
  }

  const workflow = await createDraftWorkflow(user, {
    name: last.draft.name.slice(0, 80),
    description: last.draft.description || `Drafted by the agent from: ${prompt.slice(0, 160)}`,
    graph: last.graph,
    requestKey,
  });
  return { workflow, notes: last.draft.notes, setupIssues: last.setup.length };
}
