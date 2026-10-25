"use client";

import { useEffect, useRef } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { BrickGlyph } from "@/features/workflows/node-icon";
import type { Integration } from "./integrations";

export type Shelf = "active" | "archived";

interface Props {
  shelf: Shelf;
  counts: Record<Shelf, number | null>;
  onShelf: (s: Shelf) => void;
  query: string;
  onQuery: (q: string) => void;
  integrations: Integration[];
  integration: string | null;
  onIntegration: (type: string | null) => void;
}

// Search, the active/archived switch and integration filters in one row. "/" focuses search.
export function Toolbar({ shelf, counts, onShelf, query, onQuery, integrations, integration, onIntegration }: Props) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.closest("input, textarea, [contenteditable]") !== null);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="tactile-soft flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full px-4 focus-within:ring-2 focus-within:ring-[var(--brick-1)] sm:max-w-sm">
          <MagnifyingGlass size={16} className="shrink-0 text-ink-3" aria-hidden />
          <input
            ref={input}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onQuery("")}
            placeholder="Search workflows"
            aria-label="Search workflows"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
          {query ? (
            <button onClick={() => onQuery("")} aria-label="Clear search" className="press rounded-full p-0.5 text-ink-3 hover:text-ink">
              <X size={14} weight="bold" aria-hidden />
            </button>
          ) : (
            <kbd className="rounded border border-line px-1 text-[0.6875rem] text-ink-3">/</kbd>
          )}
        </label>

        <div className="tab-track ml-auto flex gap-0.5 rounded-full p-1" role="tablist" aria-label="Show workflows">
          {(["active", "archived"] as const).map((s) => {
            const active = shelf === s;
            return (
              <button
                key={s}
                role="tab"
                aria-selected={active}
                onClick={() => onShelf(s)}
                className={`press relative inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ${active ? "tactile-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {s === "active" ? "Active" : "Archived"}
                {counts[s] !== null && <span className={`num text-xs ${active ? "text-white/70" : "text-ink-3"}`}>{counts[s]}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {integrations.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by integration">
          <Chip active={integration === null} onClick={() => onIntegration(null)}>
            All
          </Chip>
          {integrations.map((i) => (
            <Chip key={i.type} active={integration === i.type} onClick={() => onIntegration(integration === i.type ? null : i.type)}>
              <BrickGlyph name={i.icon} color={i.color} size="xs" />
              {i.label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`press inline-flex h-8 items-center gap-1.5 rounded-full py-1 pl-1.5 pr-3 text-sm font-medium first:pl-3 ${
        active ? "bg-ink text-white" : "tactile text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
