"use client";

import { useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { definitionsByCategory } from "@/lib/nodes/registry";
import type { NodeDefinition } from "@/lib/nodes/types";
import { CATEGORY_META, type Category } from "@/lib/nodes/types";
import { NodeIcon } from "@/features/workflows/node-icon";

type Filter = "all" | Category;

const LIST = "col-start-1 row-start-1 flex flex-wrap content-start justify-center gap-3";

// The real node catalog as a filterable gallery. Unbuilt connectors carry a "Soon" badge
// so the page never claims more than the builder can do.
export function BrickGallery() {
  const groups = definitionsByCategory();
  const [filter, setFilter] = useState<Filter>("all");
  const reduce = useReducedMotion();
  const tabs: Array<{ id: Filter; label: string }> = [{ id: "all", label: "All" }, ...groups.map((g) => ({ id: g.category as Filter, label: CATEGORY_META[g.category].title }))];
  const all = groups.flatMap((g) => g.nodes);
  const nodes = filter === "all" ? all : groups.filter((g) => g.category === filter).flatMap((g) => g.nodes);

  return (
    <div>
      <LayoutGroup id="brick-filter">
        <div className="flex justify-center">
          <div className="tab-track flex max-w-full flex-wrap justify-center gap-0.5 rounded-3xl p-1 sm:rounded-full" role="tablist" aria-label="Filter bricks by category">
            {tabs.map((t) => {
              const active = filter === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(t.id)}
                  className="relative inline-flex h-9 shrink-0 items-center rounded-full px-4 text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--brick-1)] focus-visible:ring-offset-1"
                >
                  {active && (
                    <motion.span
                      layoutId="brick-filter-keycap"
                      className="absolute inset-0"
                      transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.32, bounce: 0.14 }}
                    >
                      <span className="keycap absolute inset-0 rounded-full" />
                    </motion.span>
                  )}
                  <span className={`relative ${active ? "letterpress-dark text-white" : "letterpress-light text-ink-2 hover:text-ink"}`}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </LayoutGroup>

      {/* The full catalog is laid out invisibly in the same grid cell, so the gallery is
          always as tall as "All" at the current width. Filtering to a short category then
          leaves space below instead of shrinking the section, which is vertically centred
          and would otherwise drag the header and the tabs down. */}
      <div className="mx-auto mt-8 grid max-w-[1080px] [@media(max-height:860px)]:mt-6">
        <ul className={`invisible ${LIST}`} aria-hidden inert>
          {all.map((n) => (
            <BrickCard key={n.type} node={n} ghost />
          ))}
        </ul>
        <ul className={LIST} aria-live="polite">
          {nodes.map((n) => (
            <BrickCard key={n.type} node={n} />
          ))}
        </ul>
      </div>
    </div>
  );
}

// The ghost copy only reserves space, so it skips focus, the tooltip and its id.
function BrickCard({ node: n, ghost = false }: { node: NodeDefinition; ghost?: boolean }) {
  const color = CATEGORY_META[n.category].color;
  return (
    <li
      tabIndex={ghost ? undefined : 0}
      aria-describedby={ghost ? undefined : `brick-${n.type}`}
      className={`${ghost ? "" : "reveal "}tactile group relative flex w-36 flex-col rounded-2xl p-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brick-1)]`}
    >
      <span
        className="tactile-soft relative flex h-16 items-center justify-center rounded-lg [@media(max-height:860px)]:h-12"
        style={{ color: n.unavailable ? "var(--ink-3)" : color }}
      >
        <NodeIcon name={n.icon} className="h-6 w-6" />
        {n.unavailable && <span className="tactile absolute right-1 top-1 rounded-full px-2 text-sm font-medium leading-5 text-ink-2">Soon</span>}
      </span>
      {/* Titles start at the same line under the icon in every card, with room for two
          lines, so one-line and two-line names never shift the row's rhythm. */}
      <h3 className={`mt-3 line-clamp-2 h-10 px-1 text-center text-[15px] font-semibold leading-5 ${n.unavailable ? "text-ink-3" : "text-ink"}`}>{n.title}</h3>
      {!ghost && (
        <span
          id={`brick-${n.type}`}
          role="tooltip"
          className="tactile pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-52 -translate-x-1/2 translate-y-1 rounded-lg px-3 py-2 text-center text-sm text-ink-2 text-balance opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
        >
          {n.summary}
        </span>
      )}
    </li>
  );
}
