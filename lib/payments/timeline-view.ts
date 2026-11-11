import { KIND_LABEL, type Milestone, type MilestoneKind, type MilestoneState } from "./timeline";

// What the timeline shows: which milestones pass the filter, and which row each one sits on.
// Plain functions, so the filter chips and the AI answer narrow the timeline the same way.

export interface TimelineFilter {
  // Empty means "all" for every list; null means "no limit" for the dates.
  states: MilestoneState[];
  kinds: MilestoneKind[];
  workflowIds: string[];
  from: string | null;
  to: string | null;
}

export const NO_FILTER: TimelineFilter = { states: [], kinds: [], workflowIds: [], from: null, to: null };

export const isFiltered = (f: TimelineFilter): boolean =>
  f.states.length > 0 || f.kinds.length > 0 || f.workflowIds.length > 0 || f.from !== null || f.to !== null;

// Keeps a date range (from an AI answer, or a filter kept across a period change) inside the
// timeline's own period, so it can't widen the view or point it at a stretch with no data.
// Unparseable dates are dropped; a reversed range, or one entirely outside the period, drops
// both bounds. A bound at or past the period's edge is no bound at all, so it becomes null.
export function boundDateRange(from: string | null, to: string | null, period: { from: string; to: string }): { from: string | null; to: string | null } {
  const start = Date.parse(period.from);
  const end = Date.parse(period.to);
  const parse = (value: string | null) => {
    if (!value) return null;
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  };
  const f = parse(from);
  const t = parse(to);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return { from: null, to: null };
  if (f !== null && t !== null && f > t) return { from: null, to: null };
  if ((f !== null && f >= end) || (t !== null && t <= start)) return { from: null, to: null };
  return {
    from: f !== null && f > start ? new Date(f).toISOString() : null,
    to: t !== null && t < end ? new Date(t).toISOString() : null,
  };
}

export function applyFilter(milestones: Milestone[], filter: TimelineFilter): Milestone[] {
  const from = filter.from ? Date.parse(filter.from) : -Infinity;
  const to = filter.to ? Date.parse(filter.to) : Infinity;
  return milestones.filter((m) => {
    const at = Date.parse(m.at);
    return (
      (filter.states.length === 0 || filter.states.includes(m.state)) &&
      (filter.kinds.length === 0 || filter.kinds.includes(m.kind)) &&
      (filter.workflowIds.length === 0 || (m.workflowId !== null && filter.workflowIds.includes(m.workflowId))) &&
      at >= from &&
      at <= to
    );
  });
}

export type GroupBy = "workflow" | "payment";

export interface TimelineRow {
  id: string;
  name: string;
}

const UNLINKED: TimelineRow = { id: "unlinked", name: "Not linked to a workflow" };

export const rowIdOf = (m: Milestone, groupBy: GroupBy): string => (groupBy === "payment" ? m.lifecycleId : (m.workflowId ?? UNLINKED.id));

// One row per workflow, or one per payment lifecycle, named so a person can tell them apart.
// Rows are listed in the order their first milestone happened.
export function rowsFor(milestones: Milestone[], groupBy: GroupBy): TimelineRow[] {
  const rows = new Map<string, TimelineRow>();
  for (const m of milestones) {
    const id = rowIdOf(m, groupBy);
    if (rows.has(id)) continue;
    rows.set(id, { id, name: groupBy === "payment" ? paymentName(m, milestones) : (m.workflowName ?? UNLINKED.name) });
  }
  return [...rows.values()];
}

function paymentName(first: Milestone, all: Milestone[]): string {
  const run = all.find((m) => m.lifecycleId === first.lifecycleId && m.kind === "run");
  if (run) return `${run.workflowName ?? "Workflow"} · run ${new Date(run.at).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  return `${KIND_LABEL[first.kind]} ${first.paypalId ?? ""}`.trim();
}
