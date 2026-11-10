"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ChevronDown, ChevronUp, CircleCheck, CircleX, Clock, Hourglass, ShieldCheck, Sparkles } from "lucide-react";
import { BlurSwap } from "@/components/ui/blur-swap";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";
import { nodeDefinition } from "@/lib/nodes/registry";
import type { RunDTO } from "@/lib/workflow/dto";
import type { WorkflowGraph } from "@/lib/workflow/types";
import { TEST_MODE_NOTE } from "@/lib/workflow/test-mode";
import { ApprovalReview } from "./approval-review";
import { PurchaseCard } from "./purchase-card";
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

const STEP_LABEL: Record<string, string> = {
  pending: "Not run",
  running: "Running",
  waiting: "Waiting",
  succeeded: "Done",
  failed: "Failed",
  skipped: "Skipped",
  cancelled: "Cancelled",
};

const STEP_TEXT: Record<string, string> = {
  waiting: "text-attention",
  failed: "text-danger",
  running: "text-progress",
  succeeded: "text-ink-2",
};

// Panel height: dragged by its top edge, remembered per browser, clamped to a usable range.
const HEIGHT_KEY = "ml.runPanel.height";
const MIN_H = 180;
const DEFAULT_H = 360;
const maxH = () => (typeof window === "undefined" ? 800 : Math.round(window.innerHeight * 0.75));
const clampH = (h: number) => Math.min(maxH(), Math.max(MIN_H, Math.round(h)));

function triggerTitle(type: string): string {
  return nodeDefinition(type)?.title ?? type.replace("trigger.", "").replaceAll("_", " ");
}

function duration(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

function PillTabs({ value, onChange }: { value: "runs" | "log"; onChange: (v: "runs" | "log") => void }) {
  const reduce = useReducedMotion();
  return (
    <LayoutGroup id="run-tabs">
      <div className="flex rounded-lg border border-line bg-paper p-0.5 shadow-[inset_0_-1px_2px_rgb(23_32_51/0.06)]" role="tablist" aria-label="Run details">
        {(["runs", "log"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={value === t} onClick={() => onChange(t)} className="relative rounded-md px-3 py-1 text-xs font-semibold">
            {value === t && (
              <motion.span
                layoutId="pill"
                className="absolute inset-0 rounded-md bg-ink"
                transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.28, bounce: 0 }}
              />
            )}
            <span className={`relative ${value === t ? "text-paper" : "text-ink-2"}`}>{t === "runs" ? "Steps" : "Log"}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

// The PayPal object a step produced, so the run reads like a ledger: capture, batch, refund, invoices.
// Marks a run started from the trigger's test data (made-up capture ids). Its PayPal steps
// still run for real in the sandbox; the badge only says where the run's data came from.
function TestBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-line-strong px-1.5 text-[0.625rem] font-bold uppercase leading-4 tracking-wide text-ink-2" title={TEST_MODE_NOTE}>
      Test
    </span>
  );
}

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

// While the model reads the run: what it is doing, and for how long, so a slow answer
// never looks like a frozen button.
const EXPLAIN_STAGES = ["Reading the run", "Following each step", "Writing it up"];

function useSeconds(running: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1_000);
    return () => {
      clearInterval(t);
      setSeconds(0);
    };
  }, [running]);
  return seconds;
}

function ExplainRun({ run }: { run: RunDTO }) {
  const [state, setState] = useState<{ busy: boolean; result: Explanation | null; error: string | null }>({ busy: false, result: null, error: null });
  const seconds = useSeconds(state.busy);
  const ask = async () => {
    if (state.busy) return;
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const res = await api<{ explanation: Explanation }>(`/api/workflow-runs/${run.id}/explain`, { method: "POST", body: {} });
      setState({ busy: false, result: res.explanation, error: null });
    } catch (e) {
      setState((s) => ({ ...s, busy: false, error: errorMessage(e) }));
    }
  };

  if (state.busy) {
    return (
      <div className="mb-3 rounded-lg border border-line bg-paper p-3 text-xs" role="status" aria-live="polite">
        <p className="flex items-center gap-1.5 font-semibold text-ink">
          <Sparkles className="h-3.5 w-3.5 text-[var(--brick-1)]" aria-hidden />
          <BlurSwap text={EXPLAIN_STAGES[Math.min(EXPLAIN_STAGES.length - 1, Math.floor(seconds / 3))]} />
          <span className="num ml-auto font-normal text-ink-3">{seconds}s</span>
        </p>
        <div className="mt-2.5 flex flex-col gap-1.5" aria-hidden>
          <span className="build-ghost h-2.5 w-full rounded-full" />
          <span className="build-ghost h-2.5 w-11/12 rounded-full" style={{ ["--i" as string]: 1 }} />
          <span className="build-ghost h-2.5 w-2/3 rounded-full" style={{ ["--i" as string]: 2 }} />
        </div>
      </div>
    );
  }

  if (state.result) {
    const { headline, summary, nextSteps } = state.result;
    return (
      <section aria-label="Explanation" className="reveal mb-3 rounded-lg border border-line bg-paper p-3 text-xs">
        <p className="flex items-start gap-1.5 text-[0.8125rem] font-semibold leading-snug text-ink">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brick-1)]" aria-hidden />
          <span className="text-pretty">{headline}</span>
        </p>
        <p className="mt-1.5 whitespace-pre-line leading-relaxed text-pretty text-ink-2">{summary}</p>
        {nextSteps.length > 0 && (
          <div className="mt-2.5 border-t border-line pt-2.5">
            <p className="font-semibold text-ink">Next steps</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4 leading-relaxed text-ink-2 marker:text-ink-3">
              {nextSteps.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ol>
          </div>
        )}
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <p className="text-[0.6875rem] text-ink-3">AI summary of the stored run. The PayPal ids below are the facts.</p>
          <button type="button" onClick={ask} className="press shrink-0 text-[0.6875rem] font-semibold text-ink underline underline-offset-2">
            Explain again
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="mb-3">
      <Button variant="secondary" className="h-8 gap-1.5" onClick={ask}>
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> {state.error ? "Try again" : "Explain this run"}
      </Button>
      {state.error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}

// The decision lives in a header that sticks to the top of the scroll area, so Approve and
// Reject stay in reach however long the review below it is.
function WaitingCard({ run, runs, graph }: { run: RunDTO; runs: Runs; graph: WorkflowGraph }) {
  const w = run.waiting!;
  const node = graph.nodes.find((n) => n.id === w.nodeId);
  const title = node ? node.label || nodeDefinition(node.type)?.title : w.nodeId;
  const raw = run.nodes?.find((n) => n.nodeId === w.nodeId)?.waitState?.message;
  const message = typeof raw === "string" ? raw : "";
  // Set the instant Approve or Reject is clicked, before the server answers.
  const decision = runs.decided?.runId === run.id && runs.decided.nodeId === w.nodeId ? runs.decided.decision : null;
  const heading = decision === "approved" ? "Approved" : decision === "rejected" ? "Rejected" : w.kind === "approval" ? "Needs your approval" : w.kind === "delay" ? "Delayed" : "Waiting on PayPal";
  const Icon = decision === "approved" ? CircleCheck : decision === "rejected" ? CircleX : w.kind === "approval" ? ShieldCheck : w.kind === "delay" ? Clock : Hourglass;
  const tone =
    decision === "approved"
      ? { card: "border-success/35", bar: "border-success/25 bg-success-wash", icon: "text-success" }
      : decision === "rejected"
        ? { card: "border-line-strong", bar: "border-line bg-sunken", icon: "text-ink-2" }
        : { card: "border-attention/35", bar: "border-attention/25 bg-attention-wash", icon: "text-attention" };

  return (
    <div className={`reveal mb-3 rounded-xl border bg-paper transition-colors duration-200 ${tone.card}`}>
      <div className={`sticky -top-3 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-t-xl border-b px-3.5 py-2.5 transition-colors duration-200 ${tone.bar}`}>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.06)] transition-colors duration-200 ${tone.icon}`} aria-hidden>
          <Icon key={decision ?? "wait"} className={`h-4 w-4 ${decision ? "decide-pop" : ""}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold leading-tight ${decision === "approved" ? "text-success" : "text-ink"}`} role={decision ? "status" : undefined}>
            <BlurSwap text={heading} />
          </p>
          <p className="truncate text-xs text-ink-2">
            {decision === "approved" ? "Carrying on with exactly what you approved…" : decision === "rejected" ? "Taking the Rejected branch…" : title}
            {w.until && !decision ? ` · expires ${relativeTime(w.until)}` : ""}
          </p>
        </div>
        {w.kind === "approval" && !decision && (
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" className="h-9" onClick={() => runs.decide(w.nodeId, "rejected")}>
              Reject
            </Button>
            <Button className="h-9" onClick={() => runs.decide(w.nodeId, "approved")}>
              Approve
            </Button>
          </div>
        )}
        {w.kind === "provider" && (
          <Link href="/payments" className="shrink-0 text-sm font-semibold text-action underline underline-offset-2">
            Track on Payments
          </Link>
        )}
      </div>
      {(message || w.kind === "approval") && (
        <div className="px-3.5 py-3">
          {message && <p className="max-w-[80ch] text-[0.8125rem] leading-relaxed text-ink">{message}</p>}
          {w.kind === "approval" && <ApprovalReview run={run} nodeId={w.nodeId} />}
        </div>
      )}
    </div>
  );
}

// The saved height lives in localStorage; read it as an external store so the server render
// and first client render agree (default height), then the saved value takes over.
const heightListeners = new Set<() => void>();
function readSavedHeight(): number {
  try {
    const n = Number(window.localStorage.getItem(HEIGHT_KEY));
    return n ? clampH(n) : DEFAULT_H;
  } catch {
    return DEFAULT_H;
  }
}
function saveHeight(h: number) {
  try {
    window.localStorage.setItem(HEIGHT_KEY, String(h));
  } catch {
    /* storage blocked: the height just isn't remembered */
  }
  heightListeners.forEach((l) => l());
}
const subscribeHeight = (l: () => void) => (heightListeners.add(l), () => void heightListeners.delete(l));

function useResizableHeight() {
  const saved = useSyncExternalStore(subscribeHeight, readSavedHeight, () => DEFAULT_H);
  const [live, setLive] = useState<number | null>(null); // only while dragging
  const drag = useRef<{ startY: number; startH: number } | null>(null);
  const height = live ?? saved;

  const handle = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { startY: e.clientY, startH: height };
      setLive(height);
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (!drag.current) return;
      setLive(clampH(drag.current.startH + (drag.current.startY - e.clientY)));
    },
    onPointerUp: () => {
      drag.current = null;
      if (live !== null) saveHeight(live);
      setLive(null);
    },
    onDoubleClick: () => saveHeight(DEFAULT_H),
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const step = e.shiftKey ? 80 : 24;
      saveHeight(clampH(height + (e.key === "ArrowUp" ? step : -step)));
    },
  };
  return { height, dragging: live !== null, handle };
}

export function RunPanel({ runs, graph }: { runs: Runs; graph: WorkflowGraph; workflowId?: string }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<"runs" | "log">("runs");
  const { height, dragging, handle } = useResizableHeight();
  const run = runs.detail && runs.detail.id === runs.selectedId ? runs.detail : null;
  const order = graph.nodes.map((n) => n.id);

  return (
    <section className="relative flex shrink-0 flex-col border-t border-line bg-surface" style={{ height: open ? height : 44 }} aria-label="Executions">
      {open && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize run panel"
          aria-valuenow={height}
          aria-valuemin={MIN_H}
          tabIndex={0}
          title="Drag to resize, double-click to reset"
          {...handle}
          className="group absolute inset-x-0 -top-1.5 z-20 flex h-3 cursor-row-resize touch-none items-center justify-center outline-none"
        >
          <span
            className={`h-1 w-10 rounded-full transition-[background-color,width] duration-150 group-hover:w-14 group-hover:bg-ink-3 group-focus-visible:w-14 group-focus-visible:bg-action ${dragging ? "w-14 bg-action" : "bg-line-strong"}`}
          />
        </div>
      )}

      <header className="flex h-11 shrink-0 items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-3">
          <PillTabs value={tab} onChange={(t) => (setTab(t), setOpen(true))} />
          {run && (
            <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-ink-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${RUN_TONE[run.status]}`} aria-hidden />
              <span className="font-semibold text-ink">{RUN_LABEL[run.status]}</span>
              {run.test && <TestBadge />}
              <span className="truncate">· started {relativeTime(run.startedAt)}</span>
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {run && ["queued", "running", "waiting"].includes(run.status) && (
            <Button variant="danger" className="h-8 px-3 text-xs" onClick={runs.cancel} busy={runs.busy === "cancel"}>
              Cancel run
            </Button>
          )}
          {run?.status === "failed" && (
            <Button variant="secondary" className="h-8 px-3 text-xs" onClick={runs.retry} busy={runs.busy === "retry"}>
              Retry from failed step
            </Button>
          )}
          <button
            onClick={() => setOpen((o) => !o)}
            className="press rounded-md p-2 text-ink-2 hover:bg-sunken hover:text-ink"
            aria-label={open ? "Collapse executions" : "Expand executions"}
            aria-expanded={open}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {open && (
        <div className="flex min-h-0 flex-1 border-t border-line">
          <ul className="w-[232px] shrink-0 overflow-y-auto border-r border-line p-1.5" aria-label="Runs">
            {runs.runs.length === 0 && <li className="px-2 py-4 text-xs leading-relaxed text-ink-2">No runs yet. Use Test run to try the workflow.</li>}
            {runs.runs.map((r) => {
              const selected = r.id === runs.selectedId;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => runs.setSelectedId(r.id)}
                    aria-current={selected || undefined}
                    className={`press relative flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${selected ? "bg-paper shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(0_0_0/0.04)]" : "hover:bg-sunken"}`}
                  >
                    <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${RUN_TONE[r.status]}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-ink">{RUN_LABEL[r.status]}</span>
                        <span className="shrink-0 text-[0.6875rem] text-ink-3">{relativeTime(r.startedAt)}</span>
                      </span>
                      <span className="flex items-center gap-1.5 truncate text-ink-3">
                        {r.test && <TestBadge />}
                        <span className="truncate">{triggerTitle(r.trigger.type)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="min-w-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
            {!run ? (
              <p className="text-sm text-ink-2">Pick a run to see each step&apos;s result, or start a test run.</p>
            ) : tab === "log" ? (
              run.log.length === 0 ? (
                <p className="text-sm text-ink-2">No log lines for this run yet.</p>
              ) : (
                <ol className="flex flex-col text-xs">
                  {run.log.map((l, i) => (
                    <li
                      key={i}
                      className={`grid grid-cols-[5.5rem_1fr] gap-3 border-l-2 py-1 pl-2.5 ${
                        l.level === "error" ? "border-danger text-danger" : l.level === "warn" ? "border-attention text-attention" : "border-transparent text-ink-2"
                      }`}
                    >
                      <time className="num text-ink-3">{new Date(l.at).toLocaleTimeString()}</time>
                      <span className="min-w-0 break-words leading-relaxed">{l.message}</span>
                    </li>
                  ))}
                </ol>
              )
            ) : (
              <>
                {run.waiting && <WaitingCard run={run} runs={runs} graph={graph} />}
                <PurchaseCard key={`p-${run.id}`} run={run} />
                {run.status !== "queued" && run.status !== "running" && <ExplainRun key={run.id} run={run} />}
                {run.error && <p className="mb-3 rounded-lg bg-danger-wash px-3 py-2 text-xs text-danger">{run.error}</p>}
                <ol className="overflow-hidden rounded-xl border border-line bg-paper text-xs" aria-label="Steps">
                  {[...(run.nodes ?? [])]
                    .sort((a, b) => order.indexOf(a.nodeId) - order.indexOf(b.nodeId))
                    .map((n) => {
                      const g = graph.nodes.find((x) => x.id === n.nodeId);
                      const ms = n.startedAt && n.finishedAt ? new Date(n.finishedAt).getTime() - new Date(n.startedAt).getTime() : null;
                      const ref = n.error ?? paypalRef(n.output);
                      return (
                        <li key={n.nodeId} className="grid grid-cols-[0.5rem_minmax(8rem,12rem)_5rem_3.5rem_1fr] items-center gap-3 border-t border-line px-3 py-2 first:border-t-0">
                          <span className={`h-2 w-2 rounded-full ${RUN_TONE[n.status === "skipped" || n.status === "pending" ? "cancelled" : n.status] ?? "bg-ink-3"}`} aria-hidden />
                          <span className="truncate font-semibold text-ink" title={g?.label || undefined}>
                            {g?.label || nodeDefinition(g?.type ?? n.nodeType)?.title || n.nodeId}
                          </span>
                          <span className={STEP_TEXT[n.status] ?? "text-ink-3"}>{STEP_LABEL[n.status] ?? n.status}</span>
                          <span className="num text-right text-ink-3">{duration(ms)}</span>
                          <span className={`num min-w-0 truncate ${n.error ? "text-danger" : "text-ink-2"}`} title={ref ?? undefined}>
                            {ref}
                          </span>
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
