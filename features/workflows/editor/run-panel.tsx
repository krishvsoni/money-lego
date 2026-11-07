"use client";

import Link from "next/link";
import { useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";
import { nodeDefinition } from "@/lib/nodes/registry";
import type { RunDTO } from "@/lib/workflow/dto";
import type { WorkflowGraph } from "@/lib/workflow/types";
import { ApprovalReview } from "./approval-review";
import type { Runs } from "./use-workflow-runs";

const RUN_TONE: Record<string, string> = {
  queued: "bg-ink-3",
  running: "bg-progress pulse-dot",
  waiting: "bg-attention",
  succeeded: "bg-success",
  failed: "bg-danger",
  cancelled: "bg-ink-3",
};

const RUN_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

function PillTabs({ value, onChange }: { value: "runs" | "log"; onChange: (v: "runs" | "log") => void }) {
  const reduce = useReducedMotion();
  return (
    <LayoutGroup id="run-tabs">
      <div className="flex rounded-lg border border-line bg-paper p-0.5 shadow-[inset_0_-1px_2px_rgb(23_32_51/0.06)]" role="tablist">
        {(["runs", "log"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={value === t} onClick={() => onChange(t)} className="relative rounded-md px-3 py-1 text-xs font-semibold">
            {value === t && (
              <motion.span
                layoutId="pill"
                className="absolute inset-0 rounded-md bg-ink"
                transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.28, bounce: 0.12 }}
              />
            )}
            <span className={`relative ${value === t ? "text-paper" : "text-ink-2"}`}>{t === "runs" ? "Runs" : "Log"}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

// The PayPal object a step produced, so the run reads like a ledger: capture, batch, refund, invoices.
function paypalRef(output: unknown): string | null {
  const o = obj(output);
  if (obj(o.purchase).captureId) return `Paid · capture ${String(obj(o.purchase).captureId)}`;
  if (obj(o.purchase).failure) return `Not paid · ${String(obj(o.purchase).status ?? "")}`;
  if (obj(o.checkout).orderId) return `Checkout ${String(obj(o.checkout).orderId)} · ${String(obj(o.checkout).price ?? "")} ${String(obj(o.checkout).currency ?? "")}`;
  if (obj(o.pick).title) return `Picked: ${String(obj(o.pick).title).slice(0, 40)} · ${String(obj(o.pick).price ?? "")} ${String(obj(o.pick).currency ?? "")}`;
  if (typeof o.productCount === "number") return `${o.productCount} product(s) found`;
  if (obj(o.refund).id) return `Refund ${String(obj(o.refund).id)} · ${String(obj(o.refund).status ?? "")}`;
  if (obj(o.payoutStatus).batchId) return `Batch ${String(obj(o.payoutStatus).batchId)} · ${String(obj(o.payoutStatus).status ?? "")}`;
  if (obj(o.payout).batchId) return `Batch ${String(obj(o.payout).batchId)} · ${String(obj(o.payout).status ?? "")}`;
  if (Array.isArray(o.sent)) return `${o.sent.length} invoice(s) ${String(obj(o.sent[0]).action ?? "sent")}`;
  if (obj(o.invoice).id) return `Invoice ${String(obj(o.invoice).id)} · ${String(obj(o.invoice).status ?? "")}`;
  if (typeof o.invoiceCount === "number") return `${o.invoiceCount} invoice(s) found`;
  if (obj(o.subscription).id) return `Subscription ${String(obj(o.subscription).id)} · ${String(obj(o.subscription).status ?? "")}`;
  if (obj(o.order).captureId) return `Capture ${String(obj(o.order).captureId)} · ${String(obj(o.order).captureStatus ?? "")}`;
  if (obj(o.review).risk) return `Risk: ${String(obj(o.review).risk)}`;
  if (obj(o.allocation).total) return `Split ${String(obj(o.allocation).total)} ${String(obj(o.allocation).currency ?? "")}`;
  if (typeof o.captureId === "string" && o.source !== "test") return `Capture ${o.captureId}`;
  return null;
}

interface Explanation {
  headline: string;
  summary: string;
  nextSteps: string[];
}

function ExplainRun({ run }: { run: RunDTO }) {
  const [state, setState] = useState<{ busy: boolean; result: Explanation | null; error: string | null }>({ busy: false, result: null, error: null });
  const ask = async () => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const res = await api<{ explanation: Explanation }>(`/api/workflow-runs/${run.id}/explain`, { method: "POST", body: {} });
      setState((s) => ({ ...s, busy: false, result: res.explanation }));
    } catch (e) {
      setState((s) => ({ ...s, busy: false, error: errorMessage(e) }));
    }
  };
  return (
    <div className="mb-3">
      {!state.result && (
        <Button variant="secondary" className="h-8 gap-1.5" onClick={ask} busy={state.busy}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Explain this run
        </Button>
      )}
      {state.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
      {state.result && (
        <div className="reveal rounded-lg border border-line bg-paper p-3 text-xs">
          <p className="flex items-center gap-1.5 font-bold text-ink">
            <Sparkles className="h-3.5 w-3.5 text-[var(--brick-1)]" aria-hidden /> {state.result.headline}
          </p>
          <p className="mt-1 text-ink-2">{state.result.summary}</p>
          {state.result.nextSteps.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-ink-2">
              {state.result.nextSteps.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[0.6875rem] text-ink-3">AI summary of the stored run record. Check PayPal ids above for the facts.</p>
        </div>
      )}
    </div>
  );
}

function WaitingCard({ run, runs, graph }: { run: RunDTO; runs: Runs; graph: WorkflowGraph }) {
  const w = run.waiting!;
  const node = graph.nodes.find((n) => n.id === w.nodeId) ?? run.nodes?.find((n) => n.nodeId === w.nodeId);
  const title = node && "type" in node ? node.label || nodeDefinition(node.type)?.title : w.nodeId;
  const message = run.nodes?.find((n) => n.nodeId === w.nodeId)?.waitState?.message;
  return (
    <div className="reveal mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-attention/40 bg-attention-wash px-3 py-2.5">
      <div className="min-w-0 text-sm">
        <p className="font-bold text-attention">{w.kind === "approval" ? "Needs your approval" : w.kind === "delay" ? "Delayed" : "Waiting on PayPal"}</p>
        <p className="text-xs text-ink-2">
          {title}
          {typeof message === "string" && message ? `: ${message}` : ""}
          {w.until ? `${typeof message === "string" && /[.?!]$/.test(message) ? "" : "."} Expires ${relativeTime(w.until)}.` : ""}
        </p>
      </div>
      {w.kind === "approval" && <ApprovalReview run={run} nodeId={w.nodeId} />}
      {w.kind === "approval" && (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => runs.decide(w.nodeId, "rejected")} busy={runs.busy === "approve"}>
            Reject
          </Button>
          <Button onClick={() => runs.decide(w.nodeId, "approved")} busy={runs.busy === "approve"}>
            Approve
          </Button>
        </div>
      )}
      {w.kind === "provider" && (
        <Link href="/payments" className="text-sm font-semibold text-action underline underline-offset-2">
          Track on Payments
        </Link>
      )}
    </div>
  );
}

export function RunPanel({ runs, graph }: { runs: Runs; graph: WorkflowGraph; workflowId?: string }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<"runs" | "log">("runs");
  const run = runs.detail && runs.detail.id === runs.selectedId ? runs.detail : null;
  const order = graph.nodes.map((n) => n.id);

  return (
    <section className={`flex shrink-0 flex-col border-t border-line bg-surface ${open ? "h-[300px]" : "h-11"}`} aria-label="Executions">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 px-3">
        <div className="flex items-center gap-3">
          <PillTabs value={tab} onChange={(t) => (setTab(t), setOpen(true))} />
          {run && (
            <span className="flex items-center gap-1.5 text-xs text-ink-2">
              <span className={`h-2 w-2 rounded-full ${RUN_TONE[run.status]}`} aria-hidden />
              {RUN_LABEL[run.status]}, started {relativeTime(run.startedAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {run && ["queued", "running", "waiting"].includes(run.status) && (
            <Button variant="quiet" className="h-8" onClick={runs.cancel} busy={runs.busy === "cancel"}>
              Cancel run
            </Button>
          )}
          {run?.status === "failed" && (
            <Button variant="secondary" className="h-8" onClick={runs.retry} busy={runs.busy === "retry"}>
              Retry from failed step
            </Button>
          )}
          <button onClick={() => setOpen((o) => !o)} className="press rounded-md p-1.5 text-ink-2 hover:bg-sunken" aria-label={open ? "Collapse executions" : "Expand executions"}>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {open && (
        <div className="flex min-h-0 flex-1 border-t border-line">
          <ul className="w-[220px] shrink-0 overflow-y-auto border-r border-line py-1">
            {runs.runs.length === 0 && <li className="px-3 py-4 text-xs text-ink-2">No runs yet. Use Test run to try the workflow.</li>}
            {runs.runs.map((r) => (
              <li key={r.id}>
                <button onClick={() => runs.setSelectedId(r.id)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-sunken ${r.id === runs.selectedId ? "bg-sunken" : ""}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${RUN_TONE[r.status]}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{RUN_LABEL[r.status]}</span>
                    <span className="block text-ink-3">
                      {r.trigger.type.replace("trigger.", "")}, {relativeTime(r.startedAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="min-w-0 flex-1 overflow-y-auto p-3">
            {!run ? (
              <p className="text-sm text-ink-2">Pick a run to see each step&apos;s result, or start a test run.</p>
            ) : tab === "log" ? (
              <ol className="flex flex-col gap-1 text-xs">
                {run.log.map((l, i) => (
                  <li key={i} className={`flex gap-3 ${l.level === "error" ? "text-danger" : l.level === "warn" ? "text-attention" : "text-ink-2"}`}>
                    <time className="num shrink-0 text-ink-3">{new Date(l.at).toLocaleTimeString()}</time>
                    <span>{l.message}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <>
                {run.waiting && <WaitingCard run={run} runs={runs} graph={graph} />}
                {run.status !== "queued" && run.status !== "running" && <ExplainRun key={run.id} run={run} />}
                {run.error && <p className="mb-3 rounded-md bg-danger-wash px-3 py-2 text-xs text-danger">{run.error}</p>}
                <ol className="divide-y divide-line text-xs">
                  {[...(run.nodes ?? [])]
                    .sort((a, b) => order.indexOf(a.nodeId) - order.indexOf(b.nodeId))
                    .map((n) => {
                      const g = graph.nodes.find((x) => x.id === n.nodeId);
                      const ms = n.startedAt && n.finishedAt ? new Date(n.finishedAt).getTime() - new Date(n.startedAt).getTime() : null;
                      return (
                        <li key={n.nodeId} className="flex items-center gap-3 py-1.5">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${RUN_TONE[n.status === "skipped" || n.status === "pending" ? "cancelled" : n.status] ?? "bg-ink-3"}`} aria-hidden />
                          <span className="w-44 shrink-0 truncate font-semibold">{g?.label || nodeDefinition(g?.type ?? "")?.title || n.nodeId}</span>
                          <span className="w-20 shrink-0 text-ink-2">{n.status}</span>
                          <span className="num w-16 shrink-0 text-ink-3">{ms !== null ? `${ms} ms` : ""}</span>
                          {n.error ? <span className="min-w-0 truncate text-danger">{n.error}</span> : <span className="num min-w-0 truncate text-ink-2">{paypalRef(n.output)}</span>}
                        </li>
                      );
                    })}
                </ol>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
