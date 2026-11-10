import "server-only";
import { createHash } from "node:crypto";
import { isSideEffect, nodeDefinition } from "@/lib/nodes/registry";
import { topologicalOrder, type GraphIssue } from "@/lib/workflow/validate";
import type { WorkflowGraph } from "@/lib/workflow/types";
import type { SessionUser } from "../auth/session";
import { AppError } from "../errors";
import { log } from "../log";
import type { WorkflowDTO } from "../workflows/service";
import { linkConnections, type LinkResult } from "./connector";
import type { FindingArea, FindingLevel, SageAction } from "./doctor";
import { reviewGraph } from "./guardrails";
import { completeJson, type ChatMessage } from "./openrouter";
import { agentDraftSchema, type AgentDraft } from "./schema";

// The steps Sage's crew shares between building a new workflow and editing an open one.
// Planner and Fixer are model calls; Guard, Connector and Builder are plain code, so the
// parts that decide safety and touch the database are deterministic. Every step reports
// what it is doing as it does it, which is what the activity log and the faces show.

export type CrewId = "planner" | "guard" | "fixer" | "connector" | "builder";
export type CrewStatus = "working" | "done" | "skipped" | "failed";

export interface PlanNode {
  id: string;
  type: string;
  label: string | null;
}

export type CrewEvent =
  | { type: "agent"; id: CrewId; status: CrewStatus; detail?: string }
  | { type: "log"; agent: CrewId; text: string }
  | { type: "sketch"; types: string[] }
  | { type: "plan"; nodes: PlanNode[] }
  | { type: "result"; workflow: WorkflowDTO; notes: string[]; setupIssues: number; linked: string[]; missing: string[] }
  | { type: "edited"; graph: WorkflowGraph; name: string | null; notes: string[]; summary: string; linked: string[]; missing: string[] }
  | { type: "answer"; text: string; steps: string[]; findings: Array<{ level: FindingLevel; area: FindingArea; text: string }>; actions: SageAction[] };

export type Emit = (event: CrewEvent) => void;

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Block types the model has written so far, in order, read from its unfinished JSON. Only
// types the registry knows are shown, so a half-written or invented type never flashes up.
const TYPE_IN_STREAM = /"type"\s*:\s*"([a-z]+\.[a-z_]+)"/g;
function sketchTypes(text: string): string[] {
  return [...text.matchAll(TYPE_IN_STREAM)].map((m) => m[1]).filter((t) => nodeDefinition(t));
}

export function planOf(graph: WorkflowGraph): PlanNode[] {
  const order = topologicalOrder(graph) ?? graph.nodes.map((n) => n.id);
  return order.flatMap((id) => {
    const n = graph.nodes.find((node) => node.id === id);
    return n ? [{ id: n.id, type: n.type, label: n.label ?? null }] : [];
  });
}

const describeIssues = (issues: GraphIssue[]) => issues.map((i) => `- ${i.nodeId ? `node ${i.nodeId}: ` : ""}${i.message}`).join("\n");

export class Crew {
  readonly tag: string;

  constructor(
    readonly user: SessionUser,
    private readonly emit: Emit,
  ) {
    // A hashed, opaque tag lets OpenRouter attribute abuse without learning who the user is.
    this.tag = createHash("sha256").update(`money-lego-agent:${user.userId.toHexString()}`).digest("hex").slice(0, 32);
  }

  status(id: CrewId, status: CrewStatus, detail?: string) {
    this.emit({ type: "agent", id, status, detail });
  }

  log(agent: CrewId, text: string) {
    this.emit({ type: "log", agent, text });
  }

  plan(graph: WorkflowGraph) {
    this.emit({ type: "plan", nodes: planOf(graph) });
  }

  // One model call, streamed: block types are sketched as they are written, and a switch to
  // backup models clears the sketch so a dropped answer never leaves ghost blocks behind.
  async think(agent: "planner" | "fixer", messages: ChatMessage[]): Promise<AgentDraft> {
    let seen = 0;
    const hooks = {
      onLog: (line: string) => {
        this.log(agent, line);
        if (/trying again/.test(line) && seen) {
          seen = 0;
          this.emit({ type: "sketch", types: [] });
        }
      },
      onText: (text: string) => {
        const types = sketchTypes(text);
        if (types.length > seen) {
          seen = types.length;
          this.emit({ type: "sketch", types });
        }
      },
    };
    const raw = await completeJson(messages, this.tag, hooks);
    const parsed = agentDraftSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    this.log(agent, "The answer was missing pieces, asking again");
    messages.push({ role: "assistant", content: JSON.stringify(raw).slice(0, 6_000) });
    messages.push({ role: "user", content: `That JSON doesn't match the required shape: ${parsed.error.issues[0]?.message}. Reply with the corrected JSON only.` });
    const retry = agentDraftSchema.safeParse(await completeJson(messages, this.tag, hooks));
    if (retry.success) return retry.data;
    throw new AppError("AGENT_BAD_OUTPUT", 502, "The plan came back unusable. Try naming what starts it, what PayPal should do and who approves it.");
  }

  // Guard checks the money path; if it finds problems, Fixer gets one repair with the exact
  // list, and Guard checks again. Returns the draft and graph that passed, or throws.
  async secure(draft: AgentDraft, messages: ChatMessage[], build: (d: AgentDraft) => WorkflowGraph): Promise<{ draft: AgentDraft; graph: WorkflowGraph }> {
    let graph = build(draft);
    this.status("guard", "working");
    const transfers = graph.nodes.filter((n) => isSideEffect(n.type)).length;
    this.log("guard", transfers ? `Found ${plural(transfers, "PayPal money action")}, checking each one` : "No money actions in this workflow, checking the wiring");
    let { blocking } = reviewGraph(graph);
    if (!blocking.length) {
      if (transfers) this.log("guard", "Every PayPal money action waits for your approval of exactly what it will do");
      this.status("guard", "done", transfers ? "Approvals are in place" : "Wiring is sound");
      this.status("fixer", "skipped", "Nothing to fix");
      return { draft, graph };
    }
    for (const issue of blocking.slice(0, 3)) this.log("guard", issue.message);
    this.status("guard", "done", `Flagged ${plural(blocking.length, "problem")}`);

    this.status("fixer", "working", `Repairing ${plural(blocking.length, "problem")}`);
    messages.push({ role: "assistant", content: JSON.stringify(draft).slice(0, 6_000) });
    messages.push({ role: "user", content: `Fix these problems and reply with the full corrected JSON only:\n${describeIssues(blocking)}` });
    const fixed = await this.think("fixer", messages).catch((error) => {
      this.status("fixer", "failed");
      throw error;
    });
    graph = build(fixed);
    ({ blocking } = reviewGraph(graph));
    log.info("agent.repair", { blocking: blocking.length });
    if (blocking.length) {
      this.status("fixer", "failed", `${plural(blocking.length, "problem")} left`);
      throw new AppError("AGENT_BAD_OUTPUT", 422, "Sage couldn't make that safe. Try naming what starts it, what PayPal should do and who approves it.");
    }
    this.log("guard", "Checked again: every money action is behind an approval now");
    this.status("fixer", "done", "Guard's checks pass now");
    return { draft: fixed, graph };
  }

  async connect(graph: WorkflowGraph): Promise<LinkResult> {
    this.status("connector", "working");
    this.log("connector", "Looking through the accounts you've connected");
    const links = await linkConnections(this.user, graph);
    for (const l of links.linked) this.log("connector", `Linked ${l}`);
    for (const m of links.missing) this.log("connector", `No ${m} connected yet`);
    for (const a of links.ambiguous) this.log("connector", `You have more than one ${a}, so you'll pick`);
    const detail = links.linked.length ? `Linked ${links.linked.join(", ")}` : links.missing.length || links.ambiguous.length ? "Nothing to link yet" : "No accounts needed";
    this.status("connector", "done", detail);
    return links;
  }
}

export const missingNotes = (links: LinkResult) => [...links.missing.map((m) => `Connect ${m}`), ...links.ambiguous.map((m) => `Pick which ${m} to use`)];
