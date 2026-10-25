"use client";

import Link from "next/link";
import { useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
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

function WaitingCard({ run, runs, workflowId, graph }: { run: RunDTO; runs: Runs; workflowId: string; graph: WorkflowGraph }) {
  const w = run.waiting!;
  const node = graph.nodes.find((n) => n.id === w.nodeId) ?? run.nodes?.find((n) => n.nodeId === w.nodeId);
  const title = node && "type" in node ? node.label || nodeDefinition(node.type)?.title : w.nodeId;
  const message = run.nodes?.find((n) => n.nodeId === w.nodeId)?.waitState?.message;
  return (
    <div className="reveal mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-attention/40 bg-attention-wash px-3 py-2.5">
      <div className="min-w-0 text-sm">
        <p className="font-bold text-attention">{w.kind === "approval" ? "Needs your approval" : w.kind === "wallet" ? "Needs your wallet signature" : w.kind === "delay" ? "Delayed" : "Waiting on MultiHopper"}</p>
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
      {w.kind === "wallet" && w.ref && (
        <Link href={`/runs/${w.ref}?workflow=${workflowId}&run=${run.id}`} className="press inline-flex h-10 items-center rounded-md bg-action px-4 text-sm font-semibold text-action-ink hover:bg-action-hover">
          Review and sign
        </Link>
      )}
      {w.kind === "transfer" && w.ref && (
        <Link href={`/runs/${w.ref}`} className="text-sm font-semibold text-action underline underline-offset-2">
          Open transfer
        </Link>
      )}
    </div>
  );
}

export function RunPanel({ runs, graph, workflowId }: { runs: Runs; graph: WorkflowGraph; workflowId: string }) {
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
                {run.waiting && <WaitingCard run={run} runs={runs} workflowId={workflowId} graph={graph} />}
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
                          <span className="min-w-0 truncate text-danger">{n.error}</span>
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
