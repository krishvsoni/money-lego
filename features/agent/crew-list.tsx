"use client";

import { CREW, type CrewState, type CrewStatus } from "./crew";
import { Mason, type MasonMood } from "./mason";

// Each crew member's face carries its status, so the list needs no badges: grey and asleep
// while waiting, scanning while it works, happy when done, squinting if it failed. The rail
// between them fills as work passes down the line.

const MOOD: Record<CrewStatus, MasonMood> = {
  waiting: "offline",
  working: "building",
  done: "done",
  skipped: "offline",
  failed: "error",
};

const STATUS_TEXT: Partial<Record<CrewStatus, string>> = { working: "Working", skipped: "Skipped", failed: "Stopped" };

export function CrewList({ crew }: { crew: CrewState }) {
  return (
    <ol className="flex flex-col" aria-label="Mason's crew" aria-live="polite">
      {CREW.map((member, i) => {
        const { status, detail } = crew[member.id];
        const active = status === "working";
        const passed = status === "done" || status === "skipped";
        const last = i === CREW.length - 1;
        return (
          <li key={member.id} className="relative flex gap-3 pb-3 last:pb-0">
            {!last && (
              <span aria-hidden className="absolute top-10 bottom-0 left-[17px] w-0.5 rounded-full bg-line">
                <span
                  className="block h-full w-full origin-top rounded-full transition-transform duration-300 ease-[var(--ease-out)]"
                  style={{ background: member.tint, transform: `scaleY(${passed ? 1 : 0})` }}
                />
              </span>
            )}
            <Mason mood={MOOD[status]} tint={member.tint} label={`${member.name}, ${status}`} className="relative h-9 w-9 shrink-0" />
            <div className="min-w-0 pt-0.5">
              <p className={`text-sm font-semibold transition-colors duration-200 ${status === "waiting" ? "text-ink-3" : "text-ink"}`}>
                {member.name}
                {STATUS_TEXT[status] && <span className={`ml-2 text-xs font-medium ${active ? "text-progress" : status === "failed" ? "text-danger" : "text-ink-3"}`}>{STATUS_TEXT[status]}</span>}
              </p>
              <p className={`text-xs transition-colors duration-200 ${status === "waiting" ? "text-ink-3" : "text-ink-2"}`}>{detail ?? member.job}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
