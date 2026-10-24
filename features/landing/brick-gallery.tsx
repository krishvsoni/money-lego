"use client";

import { useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { definitionsByCategory } from "@/lib/nodes/registry";
import { CATEGORY_META, type Category } from "@/lib/nodes/types";
import { NodeIcon } from "@/features/workflows/node-icon";

type Filter = "all" | Category;

// The real node catalog as a filterable gallery. Unbuilt connectors carry a "Soon" badge
// so the page never claims more than the builder can do.
export function BrickGallery() {
  const groups = definitionsByCategory();
  const [filter, setFilter] = useState<Filter>("all");
  const reduce = useReducedMotion();
  const tabs: Array<{ id: Filter; label: string }> = [{ id: "all", label: "All" }, ...groups.map((g) => ({ id: g.category as Filter, label: CATEGORY_META[g.category].title }))];
  const nodes = groups.filter((g) => filter === "all" || g.category === filter).flatMap((g) => g.nodes);

  return (
    <div>
      <LayoutGroup id="brick-filter">
        <div className="flex flex-wrap justify-center gap-2" role="tablist" aria-label="Filter bricks by category">
          {tabs.map((t) => {
            const active = filter === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(t.id)}
                className={`press relative rounded-full px-3 py-1 text-sm font-medium ${active ? "text-white" : "tactile text-ink-2 hover:text-ink"}`}
              >
                {active && (
                  <motion.span
                    layoutId="brick-filter-pill"
                    className="tactile-accent absolute inset-0 rounded-full"
                    transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0.12 }}
                  />
                )}
                <span className="relative">{t.label}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
        {nodes.map((n) => {
          const color = CATEGORY_META[n.category].color;
          return (
            <li key={n.type} className="reveal tactile flex gap-3 rounded-2xl p-2">
              <span
                className="tactile-soft relative flex h-16 w-16 shrink-0 items-center justify-center rounded-lg"
                style={{ color: n.unavailable ? "var(--ink-3)" : color }}
              >
                <NodeIcon name={n.icon} className="h-6 w-6" />
              </span>
              <div className="min-w-0 py-1 pr-2">
                <div className="flex items-center gap-2">
                  <h3 className={`text-sm font-semibold ${n.unavailable ? "text-ink-3" : "text-ink"}`}>{n.title}</h3>
                  {n.unavailable && <span className="tactile-soft rounded-full px-2 py-0.5 text-xs font-medium text-ink-2">Soon</span>}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-ink-2">{n.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
