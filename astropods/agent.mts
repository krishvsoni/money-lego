// Money Lego on Astropods: the Money Lego assistant served as an Astropods chat agent.
//
// One agent, the same one the app's chat bubble uses (server/ai/assistant.ts). It works through
// Money Lego's own crew as tools: the read-only PayPal agent (PayPal Agent Toolkit), the
// workflow builder (Sage's planner, guard, fixer and connector), run search and the payments
// ledger. It never moves money: anything that would is drafted as a workflow, saved turned off,
// with every money step behind an approval in the Money Lego app.
//
// It acts as one Money Lego account (MONEY_LEGO_ACCOUNT_ID), with the same per-account rules as
// the app: that account's workflows, runs and PayPal objects only. Deploy it private.
//
// An ES module (.mts): @astropods/adapter-core only ships an ESM entry.
// Run: tsx --conditions=react-server astropods/agent.mts   (see astropods/Dockerfile)

import { serve, type AgentAdapter } from "@astropods/adapter-core";
import { ObjectId } from "mongodb";
import { runAssistant } from "@/server/ai/assistant";
import type { SessionUser } from "@/server/auth/session";

const accountId = process.env.MONEY_LEGO_ACCOUNT_ID ?? "";
if (!ObjectId.isValid(accountId)) {
  console.error("MONEY_LEGO_ACCOUNT_ID must be the Money Lego account id this agent acts as (24 hex characters).");
  process.exit(1);
}
const user: SessionUser = { userId: new ObjectId(accountId), name: "Astropods", kind: "clerk" };
const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Conversation memory, per Astropods conversation: the assistant answers from the whole
// exchange, like the app's panel does. Bounded so a long-running pod can't grow without limit.
type Turn = { role: "user" | "assistant"; content: string };
const MAX_TURNS = 20;
const MAX_CONVERSATIONS = 500;
const conversations = new Map<string, Turn[]>();

function remember(id: string, turn: Turn): Turn[] {
  const turns = [...(conversations.get(id) ?? []), turn].slice(-MAX_TURNS);
  conversations.delete(id); // re-insert so the Map's order is least-recently-used first
  conversations.set(id, turns);
  if (conversations.size > MAX_CONVERSATIONS) conversations.delete(conversations.keys().next().value!);
  return turns;
}

const SYSTEM_PROMPT =
  "Money Lego assistant: answers questions about PayPal sandbox payments, invoices, payouts and workflow runs, and drafts Money Lego workflows. Read-only on PayPal; every money action is a workflow step that waits for the owner's approval in the Money Lego app.";

const adapter: AgentAdapter = {
  name: "Money Lego",

  async stream(prompt, hooks, options) {
    const text = prompt.trim();
    if (!text) {
      hooks.onChunk("Ask me about your PayPal payments, invoices, payouts or workflow runs, or describe an automation to build.");
      hooks.onFinish();
      return;
    }
    try {
      hooks.onStatusUpdate({ status: "THINKING" });
      const history = remember(options.conversationId, { role: "user", content: text.slice(0, 4_000) });
      const reply = await runAssistant(user, history);
      remember(options.conversationId, { role: "assistant", content: reply.reply });

      let out = reply.reply;
      if (reply.workflow) out += `\n\n**Drafted workflow:** [${reply.workflow.name}](${appUrl}/workflows/${reply.workflow.id}). It's saved turned off; review it and turn it on in Money Lego.`;
      if (reply.steps.length) out += `\n\n_Checked: ${reply.steps.map((s) => `${s.agent}${s.ok ? "" : " (needs attention)"}`).join(", ")}._`;
      hooks.onChunk(out);
      hooks.onFinish();
    } catch (error) {
      console.error("money-lego.stream_failed", error instanceof Error ? error.message : error);
      hooks.onError(error instanceof Error ? error : new Error("Money Lego couldn't answer that. Try again in a moment."));
    }
  },

  getConfig() {
    return { systemPrompt: SYSTEM_PROMPT, tools: [] };
  },
};

serve(adapter);
