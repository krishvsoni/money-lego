import "server-only";
import { createHash } from "node:crypto";
import type { SessionUser } from "../auth/session";
import { chatCompletion } from "../agent/openrouter";
import { runCrew, type CrewEvent } from "../agent/draft";
import { env } from "../config/env";
import { isAppError } from "../errors";
import { channel3Configured, searchProducts } from "../integrations/channel3";
import { searchRuns } from "../integrations/elastic";
import { log } from "../log";
import { paymentsOverview } from "../paypal/status";
import { runPaypalAgent } from "./paypal-agent";

// The Money Lego assistant: the main OpenAI agent. It answers questions and gets things done
// by delegating to sub-agents through tool calls:
//   - ask_paypal_agent: the PayPal sub-agent (official PayPal Agent Toolkit, read-only)
//   - build_workflow:   Sage's crew, which drafts a validated workflow (saved turned off)
//   - search_runs:      run history search (Elastic, or the database)
//   - find_products:    Channel3 product search
//   - payments_overview: the account's PayPal totals from Money Lego's ledger
// It can never move money itself: payouts, refunds and invoice sends exist only as workflow
// steps behind a fingerprinted human approval.

const MAX_STEPS = 6;

export interface AssistantStep {
  agent: "PayPal agent" | "Workflow builder" | "Run search" | "Product search" | "Payments";
  detail: string;
  ok: boolean;
}

export interface AssistantReply {
  reply: string;
  steps: AssistantStep[];
  workflow: { id: string; name: string } | null;
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "ask_paypal_agent",
      description:
        "Ask the PayPal agent to look something up in the merchant's PayPal account: invoices, orders, refunds, disputes, subscriptions, subscription plans, products, shipment tracking, transactions or merchant insights. Read-only.",
      parameters: { type: "object", properties: { question: { type: "string", description: "A specific question for PayPal, with ids or dates if known." } }, required: ["question"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "build_workflow",
      description:
        "Have the workflow builder draft a Money Lego workflow from a plain-English description. Use it whenever the user wants something to happen automatically or wants money to move (payouts, refunds, invoice sends, purchases); those always run behind a human approval inside the workflow. The draft is saved turned off for the user to review.",
      parameters: { type: "object", properties: { description: { type: "string", description: "What the workflow should do: what starts it, what PayPal should do, who approves, who gets notified." } }, required: ["description"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_runs",
      description: "Search the user's workflow run history: errors, failed steps, workflow names, PayPal ids.",
      parameters: { type: "object", properties: { query: { type: "string" }, failed_only: { type: "boolean" } }, required: ["query"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "find_products",
      description: "Search real products with live prices and availability (Channel3).",
      parameters: { type: "object", properties: { query: { type: "string" }, max_price: { type: "number" } }, required: ["query"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "payments_overview",
      description: "Totals from Money Lego's ledger of PayPal activity: captured, paid out, refunded, invoices, run success rate.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

const system = () => `You are the Money Lego assistant: an AI operations assistant for a small business that gets paid through PayPal (${env().PAYPAL_ENVIRONMENT} environment).
You work through sub-agents and tools: the PayPal agent (read-only lookups in PayPal), the workflow builder, run search, product search and the payments overview.
Rules:
- Use tools to get facts; never invent PayPal data, amounts, ids or products.
- You cannot move money or contact customers yourself. If the user wants a payout, refund, invoice sent, purchase or any recurring automation, call build_workflow; tell them it's saved turned off and that every money step waits for their approval.
- Be brief and concrete. Use short paragraphs or bullets. Quote ids and amounts from tool results.
Today's date is ${new Date().toISOString().slice(0, 10)}.`;

export async function runAssistant(user: SessionUser, history: Array<{ role: "user" | "assistant"; content: string }>): Promise<AssistantReply> {
  const tag = createHash("sha256").update(`money-lego-assistant:${user.userId.toHexString()}`).digest("hex").slice(0, 32);
  const steps: AssistantStep[] = [];
  let workflow: AssistantReply["workflow"] = null;
  const messages: Array<Record<string, unknown>> = [{ role: "system", content: system() }, ...history.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 4_000) }))];

  const run = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    switch (name) {
      case "ask_paypal_agent": {
        const question = String(args.question ?? "").slice(0, 1_000);
        const res = await runPaypalAgent(question, tag, user.userId);
        const used = res.calls.map((c) => c.tool).join(", ");
        steps.push({ agent: "PayPal agent", detail: used ? `Used ${used}` : "Answered without a lookup", ok: res.calls.every((c) => c.ok) });
        return { answer: res.answer, toolsUsed: res.calls };
      }
      case "build_workflow": {
        const description = String(args.description ?? "").slice(0, 1_200);
        let result: Extract<CrewEvent, { type: "result" }> | null = null;
        await runCrew(user, description, undefined, (event) => {
          if (event.type === "result") result = event;
        });
        const r = result as Extract<CrewEvent, { type: "result" }> | null;
        if (!r) throw new Error("The builder didn't finish.");
        workflow = { id: r.workflow.id, name: r.workflow.name };
        steps.push({ agent: "Workflow builder", detail: `Drafted "${r.workflow.name}"`, ok: true });
        return { workflowId: r.workflow.id, name: r.workflow.name, nodes: r.workflow.graph.nodes.map((n) => n.label || n.type), stillToSetUp: [...r.notes, ...r.missing].slice(0, 6), savedTurnedOff: true };
      }
      case "search_runs": {
        const res = await searchRuns(user.userId, String(args.query ?? ""), { status: args.failed_only ? "failed" : undefined, limit: 8 });
        steps.push({ agent: "Run search", detail: `${res.hits.length} run(s) via ${res.engine === "elastic" ? "Elastic" : "database"}`, ok: true });
        return res.hits.map((h) => ({ workflow: h.workflowName, status: h.status, error: h.error, at: h.startedAt, runId: h.runId }));
      }
      case "find_products": {
        if (!channel3Configured()) {
          steps.push({ agent: "Product search", detail: "Channel3 isn't configured", ok: false });
          return { error: "Product search isn't configured on this server." };
        }
        const products = await searchProducts({ query: String(args.query ?? ""), maxPrice: typeof args.max_price === "number" ? args.max_price : null, limit: 5 });
        steps.push({ agent: "Product search", detail: `${products.length} product(s) from Channel3`, ok: true });
        return products.map(({ id, title, brand, price, currency, merchant, availability, rating }) => ({ id, title, brand, price, currency, merchant, availability, rating }));
      }
      case "payments_overview": {
        const o = await paymentsOverview(user);
        steps.push({ agent: "Payments", detail: "Read the PayPal ledger", ok: true });
        return o.kpis;
      }
      default:
        return { error: `Unknown tool ${name}` };
    }
  };

  for (let i = 0; i < MAX_STEPS; i++) {
    const turn = await chatCompletion({ messages, tools: TOOLS, tool_choice: "auto" }, tag, "main");
    if (!turn.toolCalls.length) return { reply: turn.content || "Done.", steps, workflow };
    messages.push({ role: "assistant", content: turn.content || null, tool_calls: turn.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })) });
    for (const call of turn.toolCalls) {
      let output: unknown;
      try {
        output = await run(call.name, JSON.parse(call.arguments || "{}") as Record<string, unknown>);
      } catch (error) {
        log.warn("assistant.tool_failed", { tool: call.name, error: isAppError(error) ? error.code : error instanceof Error ? error.message.slice(0, 120) : "unknown" });
        output = { error: isAppError(error) ? error.message : "That step failed." };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output).slice(0, 10_000) });
    }
  }
  return { reply: "I did several steps but couldn't wrap up. Try asking one thing at a time.", steps, workflow };
}
