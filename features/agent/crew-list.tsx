"use client";

import { BlurSwap } from "@/components/ui/blur-swap";
import { CREW, type CrewState, type CrewStatus } from "./crew";
import { Sage, type SageMood } from "./sage";

// The crew as a row of five, left to right in the order they work. Each face carries its
// own status (asleep while waiting, scanning while working, happy when done, frowning if it
// failed) and the rail behind them fills as work passes along. One line underneath says
// what is happening right now, so the row never needs badges.

const MOOD: Record<CrewStatus, SageMood> = {
  waiting: "offline",
  working: "building",
  done: "done",
  skipped: "offline",
  failed: "error",
};

function nowLine(crew: CrewState): string {
  const working = CREW.find((m) => crew[m.id].status === "working");
  if (working) return `${working.name}: ${crew[working.id].detail ?? working.job}`;
  const failed = CREW.find((m) => crew[m.id].status === "failed");
  if (failed) return `${failed.name} stopped${crew[failed.id].detail ? `: ${crew[failed.id].detail}` : ""}`;
  const last = [...CREW].reverse().find((m) => crew[m.id].status === "done");
  return last ? `${last.name}: ${crew[last.id].detail ?? "done"}` : "Getting the crew ready";
}

export function CrewList({ crew }: { crew: CrewState }) {
  const passed = CREW.filter((m) => ["done", "skipped"].includes(crew[m.id].status)).length;
  return (
    <div>
      <ol className="relative grid grid-cols-5" aria-label="Sage's crew">
        <span aria-hidden className="absolute top-5 right-[10%] left-[10%] h-0.5 rounded-full bg-line">
          <span
            className="block h-full origin-left rounded-full bg-ink-3 transition-transform duration-500 ease-[var(--ease-out)]"
            style={{ transform: `scaleX(${Math.min(passed, CREW.length - 1) / (CREW.length - 1)})` }}
          />
        </span>
        {CREW.map((member) => {
          const { status } = crew[member.id];
          return (
            <li key={member.id} className="relative flex flex-col items-center gap-1">
              <span className="rounded-full bg-paper px-0.5">
                <Sage mood={MOOD[status]} tint={member.tint} label={`${member.name}, ${status}`} className="h-10 w-10" />
              </span>
              <span className={`text-[11px] font-semibold transition-colors duration-200 ${status === "waiting" || status === "skipped" ? "text-ink-3" : "text-ink"}`}>
                {member.name}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-center text-xs text-ink-2" aria-live="polite">
        <BlurSwap text={nowLine(crew)} />
      </p>
    </div>
  );
}
