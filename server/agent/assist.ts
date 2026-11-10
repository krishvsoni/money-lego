import "server-only";
import { z } from "zod";
import type { WorkflowGraph } from "@/lib/workflow/types";
import type { SessionUser } from "../auth/session";
import { env } from "../config/env";
import { log } from "../log";
import { Crew, type Emit } from "./crew";
import { describeDiagnosis, diagnose, type Diagnosis, type Finding, type SageAction } from "./doctor";
import { describeForModel, runEdit } from "./edit";
import { completeJson, type ChatMessage } from "./openrouter";

// Sage's front door in the editor. Every message first gets a live health check (doctor.ts,
// plain code). Then one model call reads the findings and the message and either answers it
// — what's wrong, the steps to take, and one-click actions picked from what the findings
// offer — or hands a change request to the edit crew, which works exactly as before.
// Sage never approves money, never writes behind the editor, and never invents an action.

const replySchema = z.object({
  intent: z.enum(["answer", "edit"]).catch("answer"),
  editRequest: z.string().trim().max(1_200).optional().catch(undefined),
  reply: z.string().trim().max(900).catch(""),
  steps: z.array(z.string().trim().max(280)).max(8).catch([]),
  actionIds: z.array(z.string().trim().max(8)).max(4).catch([]),
});

function systemPrompt(): string {
  const e = env();
  return `You are Sage, the assistant inside Money Lego, a no-code workflow editor for PayPal ${e.PAYPAL_ENVIRONMENT} money flows.
The owner is looking at one workflow in the editor and sent you a message. You get FINDINGS from a health check that ran seconds ago: treat them as the only facts about the workflow, its connections, PayPal and its runs.

Decide the intent:
- "edit": the message asks to change the workflow's blocks or their settings (add, remove, rewire, rename, set a value such as an email, amount, percentage, channel or schedule). Put a precise, self-contained restatement of the change in "editRequest", keeping every value the owner gave. Leave "reply" short.
- "answer": anything else — why something failed, what to do next, how to set it up or demo it, whether connections work, what a block does.

For "answer":
- "reply": 1-3 plain sentences answering the question directly. Lead with the most important blocker if there is one.
- "steps": the concrete next steps in order, each one action, naming the real screen or button (toolbar On switch, Test run, the run panel's Approve, the block's settings on the right, the Connections page, developer.paypal.com > Apps & Credentials / Sandbox Accounts). Skip steps for things the findings show are already fine.
- "actionIds": up to 4 ids from ACTIONS that help right now. Never make up an id.

Rules: never claim you did something; you can't approve or reject payments (the owner does that in the run panel); never invent account names, ids or errors beyond the findings; PayPal sandbox buyers log in on the checkout's PayPal popup with a Personal sandbox account; the Business account behind the app receives money and sends Payouts. Reply with JSON only: {"intent","editRequest","reply","steps","actionIds"}.`;
}

type AnswerEvent = { type: "answer"; text: string; steps: string[]; findings: Array<Pick<Finding, "level" | "area" | "text">>; actions: SageAction[] };

const shownFindings = (d: Diagnosis) => d.findings.filter((f) => f.level !== "ok").map(({ level, area, text }) => ({ level, area, text }));

// Without a model (or when it fails), the findings still answer the basic question.
function plainAnswer(d: Diagnosis): Omit<AnswerEvent, "type"> {
  const blockers = d.findings.filter((f) => f.level === "blocker");
  const warns = d.findings.filter((f) => f.level === "warn");
  const text = blockers.length
    ? `${blockers.length} thing${blockers.length === 1 ? "" : "s"} must be sorted before this workflow can run end to end.`
    : warns.length
      ? "Nothing is blocking this workflow. A few things are worth a look."
      : "Everything checks out: settings, accounts, PayPal and the scheduler.";
  const ids = new Set([...blockers, ...warns].map((f) => f.actionId).filter(Boolean));
  return { text, steps: [], findings: shownFindings(d), actions: d.actions.filter((a) => ids.has(a.id)).slice(0, 4) };
}

export async function runAssist(user: SessionUser, input: { workflowId: string; graph: WorkflowGraph; prompt?: string }, emit: Emit): Promise<void> {
  const crew = new Crew(user, emit);

  crew.status("guard", "working", "Health check");
  const d = await diagnose(user, input.workflowId, input.graph, {
    onLog: (area, line) => {
      if (area === "connection" || area === "paypal") crew.status("connector", "working");
      crew.log(area === "connection" || area === "paypal" ? "connector" : "guard", line);
    },
  }).catch((error) => {
    crew.status("guard", "failed");
    throw error;
  });
  const blockers = d.findings.filter((f) => f.level === "blocker").length;
  crew.status("guard", "done", blockers ? `${blockers} to sort out` : "All clear");
  crew.status("connector", "done", d.findings.some((f) => (f.area === "connection" || f.area === "paypal") && f.level === "blocker") ? "An account needs you" : "Accounts work");

  const prompt = input.prompt?.trim();
  if (!prompt) {
    emit({ type: "answer", ...plainAnswer(d) });
    return;
  }

  crew.status("planner", "working", "Reading your message");
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: `${describeDiagnosis(d)}\n\nWORKFLOW:\n${describeForModel(input.graph, d.workflow.name)}\n\nMESSAGE FROM THE OWNER:\n"""\n${prompt}\n"""` },
  ];
  let parsed: z.infer<typeof replySchema> | null = null;
  try {
    const raw = await completeJson(messages, crew.tag, { onLog: (line) => crew.log("planner", line) });
    const r = replySchema.safeParse(raw);
    parsed = r.success ? r.data : null;
  } catch (error) {
    log.warn("agent.assist.model", { message: error instanceof Error ? error.message : "unknown" });
  }

  if (parsed?.intent === "edit") {
    crew.status("planner", "done", "That's a change, handing it to the crew");
    await runEdit(user, { workflowId: input.workflowId, graph: input.graph, action: "edit", prompt: parsed.editRequest || prompt }, emit);
    return;
  }

  crew.status("planner", "done", parsed ? "Answered" : "Answered from the checks");
  if (!parsed || !parsed.reply) {
    emit({ type: "answer", ...plainAnswer(d) });
    return;
  }
  const picked = parsed.actionIds.map((id) => d.actions.find((a) => a.id === id)).filter((a): a is SageAction => Boolean(a));
  emit({ type: "answer", text: parsed.reply, steps: parsed.steps, findings: shownFindings(d), actions: picked.length ? picked : plainAnswer(d).actions });
}
