"use client";

import "@/features/payments/timeline/bryntum-setup";
import { useMemo } from "react";
import { BryntumScheduler } from "@bryntum/scheduler-react-community";
import type { EventModel } from "@bryntum/scheduler-community";
import { nodeDefinition } from "@/lib/nodes/registry";
import type { NodeRunDTO, RunDTO } from "@/lib/workflow/dto";
import type { WorkflowGraph } from "@/lib/workflow/types";

// One run's steps on a Bryntum timeline: a row per step, a bar from when it started to when it
// finished, so it's plain where the time went (often a wait for approval or for PayPal).
// Read-only, and loaded only when someone switches the Steps view to Timeline.

const STEP_COLOR: Record<string, string> = {
  succeeded: "#17784a",
  failed: "#b93a2b",
  waiting: "#a86400",
  running: "#2c4bd6",
  cancelled: "#a1a1aa",
  skipped: "#a1a1aa",
};

const STEP_WORD: Record<string, string> = { succeeded: "Done", failed: "Failed", waiting: "Waiting", running: "Running", cancelled: "Cancelled", skipped: "Skipped" };

// The time scale that fits a run of this length on screen.
function presetFor(ms: number): string {
  if (ms < 2 * 60_000) return "secondAndMinute";
  if (ms < 2 * 3_600_000) return "minuteAndHour";
  if (ms < 2 * 86_400_000) return "hourAndDay";
  return "dayAndWeek";
}

function lasted(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  return `${(ms / 3_600_000).toFixed(1)} h`;
}

interface Props {
  run: RunDTO;
  graph: WorkflowGraph;
  // Step ids in the order the canvas runs them.
  order: string[];
  // A short note for a step: its error, or the PayPal id it produced.
  noteOf: (step: NodeRunDTO) => string | null;
}

// When an unfinished run was last heard from: its newest log line or step time. Using that
// instead of the clock keeps rendering pure; the panel refreshes the run while it's live.
function lastHeardFrom(run: RunDTO): number {
  const times = [run.startedAt, ...run.log.map((l) => l.at), ...(run.nodes ?? []).flatMap((n) => [n.startedAt, n.finishedAt])];
  return Math.max(...times.filter((t): t is string => Boolean(t)).map((t) => Date.parse(t)));
}

export function RunStepsTimeline({ run, graph, order, noteOf }: Props) {
  const runStart = Date.parse(run.startedAt);
  const runEnd = run.finishedAt ? Date.parse(run.finishedAt) : lastHeardFrom(run);
  const span = Math.max(runEnd - runStart, 1000);

  const steps = useMemo(
    () => [...(run.nodes ?? [])].filter((n) => n.startedAt).sort((a, b) => order.indexOf(a.nodeId) - order.indexOf(b.nodeId)),
    [run.nodes, order],
  );

  const nameOf = (nodeId: string, nodeType: string) => {
    const node = graph.nodes.find((g) => g.id === nodeId);
    return node?.label || nodeDefinition(node?.type ?? nodeType)?.title || nodeId;
  };

  const rows = steps.map((n) => ({ id: n.nodeId, name: nameOf(n.nodeId, n.nodeType) }));
  const events = steps.map((n) => {
    const start = Date.parse(n.startedAt!);
    const end = n.finishedAt ? Date.parse(n.finishedAt) : runEnd;
    // Instant steps still get a sliver of a bar, so every step is visible.
    const visibleEnd = Math.max(end, start + span / 120);
    return { id: n.nodeId, resourceId: n.nodeId, name: "", startDate: new Date(start), endDate: new Date(visibleEnd), eventColor: STEP_COLOR[n.status] ?? "#a1a1aa" };
  });
  const byId = new Map(steps.map((n) => [n.nodeId, n]));

  // Built as DOM config with `text`, so step names and error messages are never read as HTML.
  const tooltip = {
    template: ({ eventRecord }: { eventRecord: EventModel }) => {
      const step = byId.get(String(eventRecord.id));
      if (!step) return { text: "" };
      const ms = (step.finishedAt ? Date.parse(step.finishedAt) : runEnd) - Date.parse(step.startedAt!);
      const note = noteOf(step);
      return {
        className: "ml-tip",
        children: [
          { tag: "strong", text: nameOf(step.nodeId, step.nodeType) },
          { tag: "div", text: `${STEP_WORD[step.status] ?? step.status} · ${step.finishedAt ? "took" : "so far"} ${lasted(ms)}` },
          ...(note ? [{ tag: "div", text: note }] : []),
        ],
      };
    },
  };

  if (!steps.length) return <p className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-xs text-ink-2">No step has started yet.</p>;

  return (
    <div className="overflow-hidden rounded-xl border border-line" style={{ height: Math.min(64 + rows.length * 38, 380) }}>
      <BryntumScheduler
        readOnly
        startDate={new Date(runStart - span * 0.03)}
        endDate={new Date(runEnd + span * 0.05)}
        viewPreset={presetFor(span)}
        rowHeight={38}
        barMargin={9}
        eventStyle="filled"
        columns={[{ text: "Step", field: "name", width: 190 }]}
        resources={rows}
        events={events}
        eventTooltipFeature={tooltip}
        eventMenuFeature={false}
        scheduleMenuFeature={false}
        cellMenuFeature={false}
        eventDragCreateFeature={false}
      />
    </div>
  );
}
