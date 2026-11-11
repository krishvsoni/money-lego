import "server-only";
import { validateGraph } from "@/lib/workflow/validate";
import type { SessionUser } from "../auth/session";
import { createDraftWorkflow } from "../workflows/service";
import { systemPrompt } from "./catalog";
import { Crew, missingNotes, plural, type Emit } from "./crew";
import { fillFromRequest } from "./fill";
import { toGraph } from "./guardrails";
import type { ChatMessage } from "./openrouter";

// Building a new workflow from a sentence. Nothing the crew produces can run until the
// owner sets it up and turns it on, and every PayPal money action still needs the owner's
// approval of exactly what it will do.

export type { CrewEvent, CrewId, CrewStatus, PlanNode } from "./crew";

export async function runCrew(user: SessionUser, prompt: string, requestKey: string | undefined, emit: Emit): Promise<void> {
  const crew = new Crew(user, emit);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: `Workflow to build:\n"""\n${prompt}\n"""` },
  ];

  crew.status("planner", "working");
  crew.log("planner", "Reading your request");
  const first = await crew.think("planner", messages).catch((error) => {
    crew.status("planner", "failed");
    throw error;
  });
  crew.status("planner", "done", `Picked ${plural(first.nodes.length, "block")}`);

  const { draft, graph: safe } = await crew.secure(first, messages, (d) => fillFromRequest(toGraph(d), prompt));
  crew.plan(safe);
  const links = await crew.connect(safe);

  crew.status("builder", "working");
  crew.log("builder", `Laying out ${plural(links.graph.nodes.length, "block")} on the canvas`);
  const workflow = await createDraftWorkflow(user, {
    name: draft.name.slice(0, 80),
    description: draft.description || `Built by Sage from: ${prompt.slice(0, 160)}`,
    graph: links.graph,
    requestKey,
  });
  crew.log("builder", "Saved as a draft. It stays off until you switch it on");
  crew.status("builder", "done", "Saved as a draft");

  const setupIssues = validateGraph(links.graph).filter((i) => i.field).length;
  emit({ type: "result", workflow, notes: draft.notes, setupIssues, linked: links.linked, missing: missingNotes(links) });
}
