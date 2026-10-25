"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRightIcon, PlusIcon } from "@phosphor-icons/react";
import { allNodeDefinitions } from "@/lib/nodes/registry";
import { CATEGORY_META } from "@/lib/nodes/types";
import { BrickGlyph, NodeIcon } from "@/features/workflows/node-icon";

interface Chip {
  key: string;
  label: string;
  color: string;
  icon: string;
}

const START: Chip[] = [
  { key: "webhook", label: "Signed webhook", color: "var(--brick-2)", icon: "Webhook" },
  { key: "split", label: "Split 60/40", color: "var(--brick-5)", icon: "Split" },
  { key: "approve", label: "Approve", color: "var(--brick-4)", icon: "UserCheck" },
  { key: "sign", label: "Sign", color: "var(--brick-1)", icon: "PenLine" },
];
const IDLE_WORDS = ["Discord message", "Wait for transfer", "Delay", "Slack message", "Execution log"];
const MAX_CHIPS = 8;

// The hero's composer: a workflow written as one line, and an input that works. Type to
// find a brick, ↑/↓ to choose, Enter to add it to the line, Backspace on an empty input to
// remove the last one. While idle it types brick names on its own as a hint; "/" focuses it
// from anywhere on the page. The arrow opens the builder.
export function HeroCard({ brickCount }: { brickCount: number }) {
  const [chips, setChips] = useState<Chip[]>(START);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [hint, setHint] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLOListElement>(null);

  const bricks = useMemo(() => allNodeDefinitions().filter((d) => !d.unavailable && d.category !== "triggers"), []);
  const q = query.trim().toLowerCase();
  const matches = q ? bricks.filter((d) => d.title.toLowerCase().includes(q) || d.category.includes(q)).slice(0, 5) : [];
  const full = chips.length >= MAX_CHIPS;

  // Idle hint: types a brick name, holds, deletes, moves on. Off when focused, typed into,
  // or for people who prefer reduced motion.
  useEffect(() => {
    if (focused || query || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let word = 0;
    let chars = 0;
    let phase: "type" | "hold" | "erase" = "type";
    let wait = 0;
    const timer = setInterval(() => {
      if (wait > 0) {
        wait -= 1;
        return;
      }
      const text = IDLE_WORDS[word];
      if (phase === "type") {
        chars += 1;
        if (chars >= text.length) {
          phase = "hold";
          wait = 18;
        }
      } else if (phase === "hold") {
        phase = "erase";
      } else {
        chars -= 1;
        if (chars <= 0) {
          phase = "type";
          word = (word + 1) % IDLE_WORDS.length;
          wait = 4;
        }
      }
      setHint(text.slice(0, chars));
    }, 70);
    return () => clearInterval(timer);
  }, [focused, query]);

  // "/" focuses the composer from anywhere on the page, like the builder's catalog.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const add = (index: number) => {
    const def = matches[index];
    if (!def || full) return;
    setChips((c) => [...c, { key: `${def.type}-${Date.now()}`, label: def.title, color: CATEGORY_META[def.category].color, icon: def.icon }]);
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => row.current?.scrollTo({ left: row.current.scrollWidth, behavior: "smooth" }));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(matches.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      add(active);
    } else if (e.key === "Backspace" && !query && chips.length > 1) {
      setChips((c) => c.slice(0, -1));
    } else if (e.key === "Escape") {
      setQuery("");
      input.current?.blur();
    }
  };

  return (
    <div
      onClick={() => input.current?.focus()}
      className={`relative w-full max-w-[620px] cursor-text rounded-2xl border bg-white/75 p-2 text-left shadow-[0_16px_48px_-24px_rgb(9_9_11/0.25)] backdrop-blur-md transition-[border-color,box-shadow] duration-200 ease-out ${
        focused ? "border-ink-3 shadow-[0_24px_56px_-24px_rgb(9_9_11/0.35)]" : "border-line"
      }`}
    >
      <div className="px-3 pb-4 pt-3">
        <p className="text-base text-ink-3">When a partner requests a payout</p>
        <ol
          ref={row}
          className="mt-3 [scrollbar-width:none] flex items-center gap-2 overflow-x-auto [mask-image:linear-gradient(90deg,#000_92%,transparent)] sm:gap-2"
          aria-label="Example workflow"
        >
          {chips.map((c, i) => (
            <li key={c.key} className={`flex shrink-0 items-center gap-2 ${i >= START.length ? "brick-snap" : ""}`}>
              <span className="tactile inline-flex items-center gap-2 whitespace-nowrap rounded-full py-1 pl-1 pr-3 text-sm font-medium text-ink">
                <BrickGlyph name={c.icon} color={c.color} size="xs" />
                {c.label}
              </span>
              {i < chips.length - 1 && <span className="hidden h-px w-3 bg-line-strong sm:block" aria-hidden />}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-3 pt-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-base text-ink">
          <PlusIcon size={16} className="shrink-0 text-ink-3" aria-hidden />
          <span className="sr-only">Add a brick to this workflow</span>
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            disabled={full}
            placeholder={full ? "That's a full workflow. Open the builder to keep going." : focused ? "Type a brick, like delay or discord" : hint ? `add ${hint}` : "add a brick"}
            role="combobox"
            aria-expanded={focused && matches.length > 0}
            aria-controls="hero-bricks"
            aria-activedescendant={matches[active] ? `hero-brick-${active}` : undefined}
            // The whole panel carries the focus state (border and lift), so the input itself
            // doesn't draw a second ring inside it.
            style={{ outline: "none" }}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3"
          />
        </label>
        <span className="flex shrink-0 items-center gap-3">
          <span className="hidden font-mono text-xs text-ink-3 sm:inline">{focused ? "enter to add" : `/ search ${brickCount} bricks`}</span>
          <Link
            href="/workflows"
            onClick={(e) => e.stopPropagation()}
            aria-label="Open the builder"
            className="group flex h-8 w-8 items-center justify-center rounded-lg bg-sunken text-ink-2 transition-colors duration-150 hover:bg-ink hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--brick-1)]"
          >
            <ArrowUpRightIcon size={16} className="transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </span>
      </div>

      {focused && matches.length > 0 && (
        <ul id="hero-bricks" role="listbox" className="reveal tactile absolute left-6 top-full z-30 mt-2 w-[340px] rounded-2xl p-1.5">
          {matches.map((d, i) => (
            <li key={d.type} id={`hero-brick-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(i);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left ${i === active ? "bg-sunken" : ""}`}
              >
                <span className="tactile-soft flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ color: CATEGORY_META[d.category].color }}>
                  <NodeIcon name={d.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-medium text-ink">{d.title}</span>
                  <span className="block truncate text-sm text-ink-3">{CATEGORY_META[d.category].title}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
