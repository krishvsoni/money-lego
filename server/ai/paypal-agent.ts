import "server-only";
import type { ObjectId } from "mongodb";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import { env, paypalCredentials } from "../config/env";
import { chatCompletion } from "../agent/openrouter";
import { log } from "../log";
import { ownPaypalIds, ownsPaypalAccount } from "../paypal/ownership";
import { maskEmails } from "./model";

// The PayPal sub-agent: an OpenAI tool-calling loop over PayPal's official Agent Toolkit
// (@paypal/agent-toolkit), restricted to read-only actions. It can look things up (invoices,
// orders, refunds, disputes, subscriptions, transactions, merchant insights) but cannot create,
// send, refund, cancel or capture anything: those go through a workflow with a human approval.

// Toolkit action switches: reads only.
const READ_ONLY_ACTIONS = {
  invoices: { list: true, get: true, search: true, getRecurringSeries: true },
  products: { list: true, show: true },
  subscriptionPlans: { list: true, show: true },
  subscriptions: { show: true },
  shipment: { get: true },
  orders: { get: true },
  disputes: { list: true, get: true },
  transactions: { list: true },
  payments: { getRefunds: true },
  insights: { get: true },
};

// A second, explicit allowlist of tool names, in case a toolkit version maps actions to more
// tools than expected. Anything not named here is never offered to the model or executed.
const READ_ONLY_TOOLS = new Set([
  "list_invoices",
  "get_invoice",
  "search_invoicing",
  "get_recurring_series",
  "list_products",
  "show_product_details",
  "list_subscription_plans",
  "show_subscription_plan_details",
  "show_subscription_details",
  "get_shipment_tracking",
  "get_order",
  "list_disputes",
  "get_dispute",
  "list_transactions",
  "get_refund",
  "get_merchant_insights",
]);

const MAX_STEPS = 6;

// The PayPal app feature (Developer Dashboard > app > Features) each read tool needs.
function featureFor(tool: string): string {
  if (/invoic|recurring_series/.test(tool)) return "Invoicing";
  if (/transaction|insights/.test(tool)) return "Transaction Search (Reporting)";
  if (/subscription|product/.test(tool)) return "Subscriptions";
  if (/dispute/.test(tool)) return "Disputes";
  if (/shipment/.test(tool)) return "Shipment Tracking";
  return "the matching feature";
}
const MAX_TOOL_CHARS = 8_000;

let toolkit: PayPalAgentToolkit | null = null;

function getToolkit(): PayPalAgentToolkit {
  if (toolkit) return toolkit;
  const { clientId, clientSecret, environment } = paypalCredentials();
  toolkit = new PayPalAgentToolkit({ clientId, clientSecret, configuration: { actions: READ_ONLY_ACTIONS, context: { sandbox: environment === "sandbox" } } });
  return toolkit;
}

export function paypalAgentTools(): string[] {
  return getToolkit()
    .getTools()
    .map((t) => t.function.name)
    .filter((n) => READ_ONLY_TOOLS.has(n));
}

export interface PaypalAgentResult {
  answer: string;
  calls: Array<{ tool: string; ok: boolean }>;
}

const SYSTEM = `You are the PayPal agent inside Money Lego, working on the merchant's PayPal ${"sandbox"} account.
Use the PayPal tools to look up facts, then answer briefly and concretely, quoting PayPal ids, statuses, amounts and dates from the tool results.
You can only read data. If asked to create, send, refund, cancel or pay anything, say that it must be done through a Money Lego workflow with a human approval.
Never invent data that a tool didn't return. Today's date is ${new Date().toISOString().slice(0, 10)}.`;

// The PayPal account is shared by every Money Lego account. Its owner may browse all of it;
// anyone else may only look up objects their own workflows created, by id. Listing and
// searching tools would show other accounts' invoices, transactions and customers, so they
// are not offered to them at all.
const LOOKUP_BY_ID = new Set(["get_invoice", "get_order", "get_refund", "show_subscription_details", "get_dispute", "get_shipment_tracking"]);
const ID_LIKE = /^[A-Z0-9][A-Z0-9-]{5,40}$/i;

function idsIn(args: string): string[] {
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>;
    return Object.values(parsed).filter((v): v is string => typeof v === "string" && ID_LIKE.test(v.trim())).map((v) => v.trim());
  } catch {
    return [];
  }
}

export async function runPaypalAgent(question: string, userTag: string, ownerId: ObjectId, onStep?: (tool: string) => void): Promise<PaypalAgentResult> {
  const kit = getToolkit();
  const fullAccess = ownsPaypalAccount(ownerId);
  const mine = fullAccess ? null : await ownPaypalIds(ownerId, ["order", "capture", "refund", "payout_batch", "payout_item", "invoice", "subscription"]);
  const tools = kit.getTools().filter((t) => READ_ONLY_TOOLS.has(t.function.name) && (fullAccess || LOOKUP_BY_ID.has(t.function.name)));
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM.replace("sandbox", env().PAYPAL_ENVIRONMENT) },
    { role: "user", content: question.slice(0, 2_000) },
  ];
  const calls: PaypalAgentResult["calls"] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const turn = await chatCompletion({ messages, tools: tools as unknown as Array<Record<string, unknown>>, tool_choice: "auto" }, userTag, "fast");
    if (!turn.toolCalls.length) return { answer: turn.content || "PayPal didn't return anything for that.", calls };

    messages.push({ role: "assistant", content: turn.content || null, tool_calls: turn.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })) });
    for (const call of turn.toolCalls) {
      onStep?.(call.name);
      let content: string;
      let ok = true;
      if (!READ_ONLY_TOOLS.has(call.name)) {
        ok = false;
        content = JSON.stringify({ error: "This action isn't allowed for the assistant. Money actions run only in a workflow with a human approval." });
      } else if (mine && (!LOOKUP_BY_ID.has(call.name) || idsIn(call.arguments).some((id) => !mine.has(id)) || !idsIn(call.arguments).length)) {
        ok = false;
        content = JSON.stringify({
          error: "Not available to this account: the PayPal account is shared, so you can only look up PayPal objects your own workflows created, by their id (see the Payments page). Listing the whole PayPal account is limited to its owner.",
        });
      } else {
        try {
          const res = await kit.handleToolCall({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } });
          content = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
          // The toolkit returns PayPal errors as ordinary content instead of throwing. Count them
          // as failures, and turn a permission refusal into the exact switch to flip, so the
          // answer says "turn on Invoicing" rather than guessing "not configured".
          if (/insufficient permissions|NOT_AUTHORIZED|PERMISSION_DENIED|\b403\b/i.test(content)) {
            ok = false;
            const feature = featureFor(call.name);
            content = JSON.stringify({
              error: `PayPal refused this lookup: the PayPal app behind Money Lego doesn't have ${feature} enabled. The keys work; only this permission is missing. Fix: developer.paypal.com > Apps & Credentials > open the app > Features > tick ${feature}, save, then ask again.`,
            });
          } else if (/PAYPAL_API_HTTP_ERROR|"error"\s*:/i.test(content)) {
            ok = false;
          }
        } catch (error) {
          ok = false;
          log.warn("paypal_agent.tool_failed", { tool: call.name, error: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
          content = JSON.stringify({ error: "PayPal returned an error for this lookup." });
        }
      }
      calls.push({ tool: call.name, ok });
      // Customer emails are masked before tool output reaches the model.
      messages.push({ role: "tool", tool_call_id: call.id, content: maskEmails(content).slice(0, MAX_TOOL_CHARS) });
    }
  }
  return { answer: "I looked up several things in PayPal but couldn't finish the answer. Try a narrower question.", calls };
}
