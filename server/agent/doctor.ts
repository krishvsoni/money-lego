import "server-only";
import { nodeDefinition } from "@/lib/nodes/registry";
import { PROVIDERS } from "@/lib/nodes/providers";
import { moneySafetyIssues } from "@/lib/templates/validate";
import type { WorkflowGraph, WorkflowNode } from "@/lib/workflow/types";
import { validateGraph } from "@/lib/workflow/validate";
import type { SessionUser } from "../auth/session";
import { env } from "../config/env";
import { listRuns } from "../engine/runs";
import { testCredential } from "../integrations/credential-check";
import { paypalCapabilities } from "../paypal/client";
import { listCredentials } from "../workflows/credentials";
import { getWorkflowDoc, toWorkflowDTO, type WorkflowDTO } from "../workflows/service";

// Sage's doctor: a plain-code health check of one workflow and everything it depends on —
// its settings, whether its trigger is live, the accounts it uses (tested live), the PayPal
// app, recent runs and the server's scheduler. It only reads. The model never decides what
// is true here; it only explains these findings and picks from the actions they offer.

export type FindingLevel = "blocker" | "warn" | "ok";
export type FindingArea = "workflow" | "connection" | "paypal" | "runs" | "server";

export type SageAction =
  | { id: string; kind: "enable"; label: string }
  | { id: string; kind: "fix"; label: string }
  | { id: string; kind: "link"; label: string }
  | { id: string; kind: "test"; label: string }
  | { id: string; kind: "open"; label: string; href: string };

export interface Finding {
  level: FindingLevel;
  area: FindingArea;
  text: string;
  actionId?: string;
}

export interface Diagnosis {
  workflow: WorkflowDTO;
  findings: Finding[];
  actions: SageAction[];
  checklist: string[];
}

// Triggers that only fire while the workflow is on. Manual runs work either way.
const LIVE_ONLY = (type: string) => nodeDefinition(type)?.category === "triggers" && type !== "trigger.manual";
// Steps that pause and are resumed by the scheduler heartbeat.
const RESUMES = new Set(["logic.approval", "paypal.payout_status", "paypal.wait_checkout", "trigger.schedule"]);
// The PayPal app permission each block needs.
const PAYPAL_FEATURE: Array<[RegExp, string, string]> = [
  [/^paypal\.payout/, "payouts", "Payouts"],
  [/invoice/, "invoicing", "Invoicing"],
  [/subscription/, "subscriptions", "Subscriptions"],
  [/^(trigger\.paypal_checkout|paypal\.(get_order|refund|checkout_link|wait_checkout))$/, "checkout", "Checkout"],
  [/^paypal\.transactions$/, "reporting", "Transaction search (reporting)"],
];
// example.com addresses are placeholders; PayPal sandbox accounts (…@personal.example.com) are real.
const PLACEHOLDER_EMAIL = /[\w.+-]+@example\.(com|org|net)\b/i;

function title(n: WorkflowNode): string {
  return n.label || nodeDefinition(n.type)?.title || n.id;
}

function placeholders(value: unknown, path: string[] = []): string[] {
  if (typeof value === "string") return PLACEHOLDER_EMAIL.test(value) ? [`${path.join(" › ") || "a setting"} (${value.match(PLACEHOLDER_EMAIL)![0]})`] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => placeholders(v, [...path, typeof v === "object" && v && "label" in v ? String((v as { label: unknown }).label) : `#${i + 1}`]));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => placeholders(v, Array.isArray(v) ? path : [...path, k]));
  return [];
}

export async function diagnose(user: SessionUser, workflowId: string, graph: WorkflowGraph, opts: { onLog?: (area: FindingArea, line: string) => void } = {}): Promise<Diagnosis> {
  const say = opts.onLog ?? (() => undefined);
  const workflow = toWorkflowDTO(await getWorkflowDoc(user, workflowId, "edit"));
  const findings: Finding[] = [];
  const actions: SageAction[] = [];
  const action = <A extends Omit<SageAction, "id">>(a: A): string => {
    const existing = actions.find((x) => x.kind === a.kind && x.label === a.label);
    if (existing) return existing.id;
    const id = `a${actions.length + 1}`;
    actions.push({ ...a, id } as SageAction);
    return id;
  };
  const add = (f: Finding) => findings.push(f);
  const e = env();

  // ---- The workflow itself ----
  say("workflow", "Checking every block's settings and the money rules");
  const issues = [...validateGraph(graph).map((i) => i.message), ...moneySafetyIssues(graph)];
  if (issues.length) {
    const fix = action({ kind: "fix", label: "Let Fixer repair what it can" });
    for (const i of issues.slice(0, 6)) add({ level: "blocker", area: "workflow", text: i, actionId: fix });
  }
  for (const n of graph.nodes) {
    for (const p of placeholders(n.config)) add({ level: "blocker", area: "workflow", text: `${title(n)}: ${p} is a placeholder. Put the real address in.` });
  }

  const trigger = graph.nodes.find((n) => nodeDefinition(n.type)?.category === "triggers");
  if (trigger && LIVE_ONLY(trigger.type)) {
    if (!workflow.enabled) {
      add({ level: issues.length ? "warn" : "blocker", area: "workflow", text: `The workflow is off, so "${title(trigger)}" isn't live. Test runs still work.`, actionId: issues.length ? undefined : action({ kind: "enable", label: "Turn the workflow on" }) });
    } else if (trigger.type === "trigger.paypal_checkout") {
      add({ level: "ok", area: "workflow", text: "The workflow is on and its checkout page is taking payments.", actionId: action({ kind: "open", label: "Open the checkout page", href: workflow.checkoutPath }) });
    } else {
      add({ level: "ok", area: "workflow", text: `The workflow is on and "${title(trigger)}" is live.` });
    }
  }
  if (!issues.length && !findings.some((f) => f.area === "workflow" && f.level === "blocker")) add({ level: "ok", area: "workflow", text: "Every block's settings check out." });

  // ---- Connected accounts, tested live ----
  const needs = graph.nodes.flatMap((n) => {
    const field = nodeDefinition(n.type)?.fields.find((f) => f.kind === "credential");
    return field && field.kind === "credential" ? [{ node: n, key: field.key, type: field.credentialType }] : [];
  });
  if (needs.length) {
    say("connection", "Testing the accounts this workflow uses");
    const owned = await listCredentials(user);
    const tested = new Map<string, { ok: boolean; message: string }>();
    for (const need of needs) {
      const id = need.node.config[need.key];
      const provider = nodeDefinition(need.node.type)?.provider;
      const label = (provider && PROVIDERS[provider]?.label) || need.type.replace(/_/g, " ");
      if (typeof id !== "string" || !id) {
        const sameKind = owned.filter((c) => c.type === need.type);
        add({
          level: "blocker",
          area: "connection",
          text: sameKind.length ? `${title(need.node)} has no ${label} account picked.` : `${title(need.node)} needs a ${label} connection, and none is connected yet.`,
          actionId: sameKind.length === 1 ? action({ kind: "link", label: "Link my connected accounts" }) : action({ kind: "open", label: `Connect ${label}`, href: "/connections" }),
        });
        continue;
      }
      const cred = owned.find((c) => c.id === id);
      if (!cred) {
        add({ level: "blocker", area: "connection", text: `${title(need.node)} points at a ${label} connection that was removed. Pick another in the block's settings.`, actionId: action({ kind: "open", label: `Connect ${label}`, href: "/connections" }) });
        continue;
      }
      if (cred.missingScopes.length) {
        add({ level: "blocker", area: "connection", text: `${label} (${cred.name}) is missing access: ${cred.missingScopes.join(", ")}. Reconnect it.`, actionId: action({ kind: "open", label: `Reconnect ${label}`, href: "/connections" }) });
        continue;
      }
      if (!tested.has(cred.id)) {
        try {
          const r = await testCredential(user, cred.id);
          tested.set(cred.id, { ok: r.credential.check?.ok ?? true, message: r.message });
        } catch {
          tested.set(cred.id, { ok: cred.check?.ok ?? true, message: cred.check?.message ?? "Couldn't test it right now." });
        }
      }
      const t = tested.get(cred.id)!;
      add(
        t.ok
          ? { level: "ok", area: "connection", text: `${label} is connected (${cred.account?.name ?? cred.name}). ${t.message}` }
          : { level: "blocker", area: "connection", text: `${label} (${cred.name}) failed its check: ${t.message}`, actionId: action({ kind: "open", label: `Reconnect ${label}`, href: "/connections" }) },
      );
    }
  }

  // ---- The PayPal app (server-wide) ----
  const paypalNodes = graph.nodes.filter((n) => n.type.startsWith("paypal.") || n.type.startsWith("trigger.paypal_"));
  if (paypalNodes.length) {
    say("paypal", "Asking PayPal what this app is allowed to do");
    if (!e.PAYPAL_CLIENT_ID || !e.PAYPAL_CLIENT_SECRET) {
      add({ level: "blocker", area: "paypal", text: "PayPal isn't configured on this server: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env and restart." });
    } else {
      try {
        const caps = await paypalCapabilities();
        add({ level: "ok", area: "paypal", text: `PayPal ${e.PAYPAL_ENVIRONMENT} app ${caps.appId ?? ""} answers and its keys work.`.replace("  ", " ") });
        const missing = new Set<string>();
        for (const n of paypalNodes) for (const [re, key, name] of PAYPAL_FEATURE) if (re.test(n.type) && !caps.features[key]) missing.add(name);
        for (const m of missing) add({ level: "blocker", area: "paypal", text: `The PayPal app doesn't have ${m} turned on. In developer.paypal.com open the app and tick ${m} under Features.` });
      } catch (error) {
        add({ level: "blocker", area: "paypal", text: `PayPal didn't accept the app's keys: ${error instanceof Error ? error.message : "unknown error"}` });
      }
    }
    if (graph.nodes.some((n) => n.type === "trigger.paypal_event") && !e.PAYPAL_WEBHOOK_ID) {
      add({ level: "blocker", area: "paypal", text: "PayPal events need the app's webhook: run npm run paypal:webhook on a public https URL, then set PAYPAL_WEBHOOK_ID." });
    }
  }

  // ---- Recent runs ----
  say("runs", "Reading the latest runs");
  const runs = await listRuns(user, workflowId);
  const latest = runs[0];
  if (!latest) {
    add({ level: "warn", area: "runs", text: "No runs yet. A test run uses sample data and stops before any real PayPal money moves without your approval.", actionId: issues.length ? undefined : action({ kind: "test", label: "Start a test run" }) });
  } else if (latest.status === "failed") {
    let text = `The latest run failed: ${latest.error ?? "no error recorded"}`;
    if (/not allowed to send this payout|doesn't allow Payouts from this merchant/i.test(latest.error ?? "")) {
      text += " PayPal blocks Payouts from this business account's country (India is one). Create a US sandbox business account, make a PayPal app for it, and put that app's keys in .env.";
    }
    add({ level: "blocker", area: "runs", text });
  } else if (latest.status === "waiting" && latest.waiting?.kind === "approval") {
    add({ level: "warn", area: "runs", text: "A run is waiting for your approval. Review it in the run panel below the canvas and click Approve or Reject there." });
  } else if (latest.status === "waiting") {
    add({ level: "ok", area: "runs", text: `A run is waiting on ${latest.waiting?.kind === "provider" ? "PayPal" : "a timer"}. The scheduler resumes it on its own.` });
  } else {
    add({ level: "ok", area: "runs", text: `The latest run ${latest.status === "succeeded" ? "succeeded" : `is ${latest.status}`}.` });
  }

  // ---- The scheduler that resumes paused runs ----
  if (graph.nodes.some((n) => RESUMES.has(n.type))) {
    const internal = process.env.INTERNAL_CRON === "true" || (process.env.INTERNAL_CRON !== "false" && e.NODE_ENV !== "production");
    if (!e.CRON_SECRET) add({ level: "blocker", area: "server", text: "CRON_SECRET isn't set, so paused steps (approval expiry, waiting for payouts to land) never resume. Add it to .env and restart." });
    else if (internal) add({ level: "ok", area: "server", text: "The server's built-in scheduler resumes paused steps every 20 seconds." });
    else add({ level: "warn", area: "server", text: "Paused steps resume only when something calls /api/cron/workflows every minute (a cron job with CRON_SECRET)." });
  }

  const checklist = workflow.sourceTemplate?.setupChecklist.map((c) => `${c.title}: ${c.detail}`) ?? [];
  return { workflow, findings, actions, checklist };
}

// The findings as the model reads them: numbered, with the action id it may offer.
export function describeDiagnosis(d: Diagnosis): string {
  const lines = d.findings.map((f) => `- [${f.level}] (${f.area}) ${f.text}${f.actionId ? ` {action ${f.actionId}}` : ""}`);
  const acts = d.actions.map((a) => `- ${a.id}: ${a.label}`);
  return [
    `Workflow "${d.workflow.name}" is ${d.workflow.enabled ? "ON" : "OFF"}.`,
    "FINDINGS (checked just now, these are facts):",
    ...lines,
    acts.length ? "ACTIONS you may offer (by id only):" : "No one-click actions are available.",
    ...acts,
    d.checklist.length ? "TEMPLATE SETUP CHECKLIST:" : "",
    ...d.checklist.map((c) => `- ${c}`),
  ]
    .filter(Boolean)
    .join("\n");
}
