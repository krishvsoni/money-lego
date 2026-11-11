"use client";

// Bryntum's icons come from the package, not its CDN default, which the app's CSP blocks.
import "@bryntum/core-community/fontawesome/css/fontawesome.css";
import "@bryntum/core-community/fontawesome/css/solid.css";
import "@bryntum/scheduler-community/scheduler.css";
import "@bryntum/scheduler-community/svalbard-light.css";
import "./timeline-scheduler.css";
import { useMemo, useRef } from "react";
import { BryntumScheduler } from "@bryntum/scheduler-react-community";
import type { EventModel } from "@bryntum/scheduler-community";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { MILESTONE_STATES, type Milestone } from "@/lib/payments/timeline";
import { rowIdOf, type GroupBy, type TimelineRow } from "@/lib/payments/timeline-view";
import { formatMoney } from "@/lib/paypal/types";

// The Bryntum Scheduler that draws the timeline. Loaded only in the browser (it measures the
// DOM), and only when the Timeline tab opens, so its code and styles never weigh on other pages.
// Read-only: nothing on it can be dragged, resized or edited.

const COLOR = Object.fromEntries(MILESTONE_STATES.map((s) => [s.state, s.color]));
const STATE_LABEL = Object.fromEntries(MILESTONE_STATES.map((s) => [s.state, s.label]));

// The part of Bryntum's DomConfig the hover card uses.
interface HoverCard {
  tag?: string;
  className?: string;
  text?: string;
  children?: HoverCard[];
}

// Time-axis scale for each range, chosen so the whole period fits the width without scrolling.
const PRESET_BY_DAYS: Record<number, string> = { 7: "dayAndWeek", 30: "weekAndDayLetter", 90: "weekAndMonth" };

interface Props {
  rows: TimelineRow[];
  milestones: Milestone[];
  groupBy: GroupBy;
  from: string;
  to: string;
  days: number;
  highlighted: Set<string>;
  onSelect: (milestone: Milestone) => void;
}

export function TimelineScheduler({ rows, milestones, groupBy, from, to, days, highlighted, onSelect }: Props) {
  const scheduler = useRef<BryntumScheduler>(null);
  const byId = useMemo(() => new Map(milestones.map((m) => [m.id, m])), [milestones]);

  const events = useMemo(
    () =>
      milestones.map((m) => ({
        id: m.id,
        resourceId: rowIdOf(m, groupBy),
        name: m.label,
        startDate: new Date(m.at),
        // Same start and end makes a milestone (a diamond); runs are drawn as bars.
        endDate: new Date(m.endAt ?? m.at),
        eventColor: COLOR[m.state],
        cls: highlighted.has(m.id) ? "ml-highlight" : "",
      })),
    [milestones, groupBy, highlighted],
  );

  // Hover card. Built as DOM config with `text`, so names and failure reasons from PayPal or a
  // workflow are always shown as text, never interpreted as HTML.
  const tooltip = useMemo(
    () => ({
      template: ({ eventRecord }: { eventRecord: EventModel }): HoverCard => {
        const m = byId.get(String(eventRecord.id));
        if (!m) return { text: eventRecord.name };
        const lines = [
          m.amountMinor ? formatMoney(m.amountMinor, m.currency) : null,
          `${STATE_LABEL[m.state]} · ${new Date(m.at).toLocaleString()}`,
          m.paypalId ? `PayPal ${m.paypalId}${m.environment ? ` · ${m.environment}` : ""}` : null,
          m.workflowName,
          m.reason ? `Why: ${m.reason}` : null,
        ].filter((line): line is string => Boolean(line));
        return { className: "ml-tip", children: [{ tag: "strong", text: m.label }, ...lines.map((text) => ({ tag: "div", text }))] };
      },
    }),
    [byId],
  );

  const zoom = (how: "in" | "out" | "fit") => {
    const instance = scheduler.current?.instance;
    if (!instance) return;
    if (how === "in") void instance.zoomIn();
    else if (how === "out") void instance.zoomOut();
    else void instance.zoomToFit({ leftMargin: 40, rightMargin: 40 });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 self-end rounded-lg border border-line bg-paper p-0.5">
        <ZoomButton label="Zoom in" onClick={() => zoom("in")}>
          <ZoomIn className="h-4 w-4" />
        </ZoomButton>
        <ZoomButton label="Zoom out" onClick={() => zoom("out")}>
          <ZoomOut className="h-4 w-4" />
        </ZoomButton>
        <ZoomButton label="Fit everything" onClick={() => zoom("fit")}>
          <Maximize2 className="h-4 w-4" />
        </ZoomButton>
      </div>
      <div className="h-[560px] overflow-hidden rounded-xl border border-line">
        <BryntumScheduler
          ref={scheduler}
          readOnly
          startDate={new Date(from)}
          endDate={new Date(to)}
          viewPreset={PRESET_BY_DAYS[days] ?? "weekAndDay"}
          rowHeight={46}
          barMargin={9}
          eventStyle="filled"
          milestoneTextPosition="always-outside"
          // Counts each milestone's label as part of its width, so labels close in time stack
          // onto separate lines instead of printing over each other.
          milestoneLayoutMode="estimate"
          columns={[{ text: groupBy === "payment" ? "Payment" : "Workflow", field: "name", width: 230 }]}
          resources={rows}
          events={events}
          eventTooltipFeature={tooltip}
          eventMenuFeature={false}
          scheduleMenuFeature={false}
          cellMenuFeature={false}
          eventDragCreateFeature={false}
          onEventClick={({ eventRecord }) => {
            const m = byId.get(String(eventRecord.id));
            if (m) onSelect(m);
          }}
        />
      </div>
    </div>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="press rounded-md p-1.5 text-ink-2 hover:bg-sunken hover:text-ink">
      {children}
    </button>
  );
}
