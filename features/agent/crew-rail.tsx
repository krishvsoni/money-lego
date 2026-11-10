"use client";

import { CheckIcon, XIcon } from "@phosphor-icons/react";
import { BlurSwap } from "@/components/ui/blur-swap";
import { CREW, type CrewState, type CrewStatus } from "./crew";
import { Sage, type SageMood } from "./sage";

// The crew stands in a row, in the order they work. Under them runs one track with a stop
// per member: the track fills behind the work, and a single brick in the current member's
// colour slides from stop to stop as each one hands off to the next. A finished member gets
// a check, a stopped one a cross. Nothing glows, orbits, or pretends to think.

const MOOD: Record<CrewStatus, SageMood> = {
  waiting: "offline",
  working: "building",
  done: "done",
  skipped: "offline",
  failed: "error",
};

const STATUS_LABEL: Record<CrewStatus, string> = {
  waiting: "Waiting",
  working: "Working",
  done: "Done",
  skipped: "Skipped",
  failed: "Stopped",
};

const SETTLED: CrewStatus[] = ["done", "skipped", "failed"];

function seatOf(crew: CrewState): number {
  const working = CREW.findIndex((m) => crew[m.id].status === "working");
  if (working >= 0) return working;
  for (let i = CREW.length - 1; i >= 0; i--) {
    if (SETTLED.includes(crew[CREW[i].id].status)) return i;
  }
  return 0;
}

export function CrewRail({ crew, running = true }: { crew: CrewState; running?: boolean }) {
  const seat = seatOf(crew);
  const moving = CREW.some((m) => crew[m.id].status !== "waiting");
  const finished = CREW.every((m) => crew[m.id].status === "done" || crew[m.id].status === "skipped");
  const progress = finished ? 1 : seat / (CREW.length - 1);
  const tint = CREW[seat]?.tint ?? "var(--ink)";
  const span = 100 / CREW.length;

  return (
    <div>
      <ol className="grid grid-cols-5" aria-label="Sage's crew">
        {CREW.map((member, i) => {
          const { status } = crew[member.id];
          const quiet = status === "waiting" || status === "skipped";
          return (
            <li
              key={member.id}
              className={`flex flex-col items-center rounded-2xl px-1 pt-3 pb-2.5 text-center transition-colors duration-300 ${status === "working" ? "bg-sunken" : ""}`}
            >
              <span className="crew-arrive relative" style={{ ["--i" as string]: i }}>
                <Sage mood={MOOD[status]} tint={member.tint} label={`${member.name}, ${STATUS_LABEL[status].toLowerCase()}`} className="h-12 w-12 sm:h-16 sm:w-16" />
                {(status === "done" || status === "failed") && (
                  <span
                    aria-hidden
                    className={`crew-badge absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full text-paper shadow-[0_0_0_2px_var(--paper)] ${
                      status === "done" ? "bg-ink" : "bg-danger"
                    }`}
                  >
                    {status === "done" ? <CheckIcon size={11} weight="bold" /> : <XIcon size={11} weight="bold" />}
                  </span>
                )}
              </span>
              <span className={`mt-1.5 block w-full truncate text-xs font-semibold sm:text-sm ${quiet ? "text-ink-3" : "text-ink"}`}>{member.name}</span>
              <span className="mt-0.5 block text-[11px] text-ink-3">
                <BlurSwap text={STATUS_LABEL[status]} />
              </span>
            </li>
          );
        })}
      </ol>

      <div aria-hidden className="relative mt-3 h-3.5 overflow-x-clip">
        <span className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-line" style={{ left: `${span / 2}%`, right: `${span / 2}%` }}>
          <span className="rail-fill block h-full origin-left rounded-full bg-ink" style={{ transform: `scaleX(${progress})` }} />
        </span>
        {CREW.map((member, i) => {
          const passed = finished || i < seat || (i === seat && SETTLED.includes(crew[member.id].status));
          return (
            <span
              key={member.id}
              className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-300"
              style={{ left: `${span * (i + 0.5)}%`, background: passed ? "var(--ink)" : "var(--line-strong)" }}
            />
          );
        })}
        {/* A full-width carrier moves by whole columns; the brick rides on it at the first stop. */}
        <span className="rail-carrier absolute inset-0" style={{ transform: `translateX(${seat * span}%)`, opacity: running && moving && !finished ? 1 : 0 }}>
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-[4px] shadow-[0_0_0_3px_var(--paper)] transition-colors duration-300"
            style={{ left: `${span / 2}%`, background: tint }}
          />
        </span>
      </div>
    </div>
  );
}
