"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { MILESTONE_STATES, type Milestone, type PaymentTimeline } from "@/lib/payments/timeline";
import { rowsFor } from "@/lib/payments/timeline-view";
import { useResource } from "@/lib/use-resource";

// The top of the Payments dashboard: the last seven days of payments and the runs that handled
// them, on the same Bryntum timeline as the Timeline tab, kept short. Clicking a milestone opens
// its run; everything else (filters, AI questions, longer periods) lives on the Timeline tab.

const TimelineScheduler = dynamic(() => import("./timeline-scheduler").then((m) => m.TimelineScheduler), {
  ssr: false,
  loading: () => <div className="h-[340px] animate-pulse rounded-xl bg-sunken" aria-label="Loading recent activity" />,
});

const NO_HIGHLIGHT = new Set<string>();

export function RecentActivity({ onOpenTimeline }: { onOpenTimeline: () => void }) {
  const router = useRouter();
  const { data, error } = useResource<{ timeline: PaymentTimeline }>("/api/payments/timeline?days=7");
  const timeline = data?.timeline ?? null;
  const rows = useMemo(() => rowsFor(timeline?.milestones ?? [], "workflow"), [timeline]);

  const open = (m: Milestone) => {
    if (m.workflowId && m.runId) router.push(`/workflows/${m.workflowId}?run=${m.runId}`);
    else onOpenTimeline();
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-4" aria-labelledby="recent-activity">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="recent-activity" className="text-sm font-semibold">
          Last 7 days
        </h2>
        <button type="button" onClick={onOpenTimeline} className="press text-xs font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
          Open the full timeline
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Colours">
        {MILESTONE_STATES.map((s) => (
          <li key={s.state} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="mt-3">
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : !timeline ? (
          <div className="h-[340px] animate-pulse rounded-xl bg-sunken" aria-label="Loading recent activity" />
        ) : timeline.milestones.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-2">
            No payment activity in the last 7 days. Pay a workflow&apos;s checkout page in the PayPal sandbox and it shows up here.
          </p>
        ) : (
          <TimelineScheduler
            rows={rows}
            milestones={timeline.milestones}
            groupBy="workflow"
            from={timeline.from}
            to={timeline.to}
            days={7}
            highlighted={NO_HIGHLIGHT}
            onSelect={open}
            height={300}
          />
        )}
      </div>
    </section>
  );
}
