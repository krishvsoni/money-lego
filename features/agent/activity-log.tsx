"use client";

import { useEffect, useRef, useState } from "react";
import { CREW, type CrewId } from "./crew";

// What the crew is doing, line by line, as the server streams it: which model is thinking,
// a switch to backups, each check Guard makes, each account Connector finds. New lines
// sharpen in at the bottom and the list follows them, unless you've scrolled up to read.

export interface LogLine {
  agent: CrewId;
  text: string;
  at: number;
}

const MEMBER = Object.fromEntries(CREW.map((m) => [m.id, m]));

function useElapsed(running: boolean, startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [running]);
  return startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
}

export function ActivityLog({ lines, running, listClassName = "max-h-44" }: { lines: LogLine[]; running: boolean; listClassName?: string }) {
  const list = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);
  const elapsed = useElapsed(running, lines[0]?.at ?? null);

  useEffect(() => {
    const el = list.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  if (!lines.length) return null;
  return (
    <section aria-label="Crew activity" className="rounded-2xl bg-paper shadow-[0_0_0_1px_var(--line)]">
      <header className="flex items-center justify-between px-3.5 pt-2.5 pb-1 text-xs">
        <span className="font-semibold text-ink-2">Activity</span>
        <span className="num text-ink-3">{running ? `${elapsed}s` : `Took ${elapsed}s`}</span>
      </header>
      <ol
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className={`flex flex-col gap-1.5 overflow-y-auto px-3.5 pb-3 [mask-image:linear-gradient(to_bottom,transparent,black_14px)] ${listClassName}`}
        aria-live="polite"
      >
        {lines.map((line, i) => {
          const member = MEMBER[line.agent];
          return (
            <li key={`${line.at}-${i}`} className="blur-swap-in flex items-baseline gap-2 text-xs leading-relaxed">
              <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: member?.tint }} />
              <span className="shrink-0 font-semibold text-ink">{member?.name ?? line.agent}</span>
              <span className="text-ink-2">{line.text}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
