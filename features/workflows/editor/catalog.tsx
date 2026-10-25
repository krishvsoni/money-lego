"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { definitionsByCategory } from "@/lib/nodes/registry";
import { CATEGORY_META, type NodeDefinition } from "@/lib/nodes/types";
import { CATEGORY_ICON, NodeIcon } from "../node-icon";
import { DRAG_MIME } from "./canvas";

export interface CatalogHandle {
  focus: () => void;
}

// Searchable node catalog. Drag a node onto the canvas, or click (or press Enter) to add it
// after the selected node. Keyboard-driven, so nothing here animates.
export const Catalog = forwardRef<CatalogHandle, { onAdd: (type: string) => void }>(function Catalog({ onAdd }, ref) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return definitionsByCategory()
      .map((g) => ({ ...g, nodes: g.nodes.filter((n) => !q || `${n.title} ${n.description} ${g.category}`.toLowerCase().includes(q)) }))
      .filter((g) => g.nodes.length);
  }, [query]);
  const flat: NodeDefinition[] = groups.flatMap((g) => g.nodes);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && flat[active] && !flat[active].unavailable) {
      e.preventDefault();
      onAdd(flat[active].type);
    } else if (e.key === "Escape") {
      setQuery("");
      input.current?.blur();
    }
  };

  let index = -1;
  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-line bg-surface" aria-label="Node catalog">
      <div className="border-b border-line p-3">
        <label className="flex h-9 items-center gap-2 rounded-md border border-line-strong bg-paper px-2.5 shadow-[inset_0_1px_2px_rgb(23_32_51/0.06)] focus-within:border-action">
          <Search className="h-4 w-4 text-ink-3" aria-hidden />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            placeholder="Search nodes"
            aria-label="Search nodes"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
          <kbd className="rounded border border-line px-1 text-[0.6875rem] text-ink-3">/</kbd>
        </label>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-6">
        {groups.length === 0 && <p className="px-2 py-6 text-sm text-ink-2">No node matches “{query}”.</p>}
        {groups.map((g) => (
          <section key={g.category} className="pt-3">
            <h3 className="flex items-center gap-2 px-2 pb-1 text-xs font-bold text-ink-2">
              <span className="inline-flex" style={{ color: CATEGORY_META[g.category].color }} aria-hidden>
                <NodeIcon name={CATEGORY_ICON[g.category]} className="h-3.5 w-3.5" />
              </span>
              {CATEGORY_META[g.category].title}
            </h3>
            <ul>
              {g.nodes.map((n) => {
                index += 1;
                const isActive = index === active && query.length > 0;
                return (
                  <li key={n.type}>
                    <button
                      draggable={!n.unavailable}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_MIME, n.type);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => !n.unavailable && onAdd(n.type)}
                      aria-disabled={Boolean(n.unavailable)}
                      title={n.unavailable ?? n.description}
                      className={`group flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left ${
                        n.unavailable ? "cursor-not-allowed opacity-50" : "cursor-grab hover:bg-sunken active:cursor-grabbing"
                      } ${isActive ? "bg-sunken" : ""}`}
                    >
                      <span
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                        style={{ background: `color-mix(in srgb, ${CATEGORY_META[n.category].color} 16%, transparent)`, color: CATEGORY_META[n.category].color }}
                      >
                        <NodeIcon name={n.icon} className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.8125rem] font-semibold leading-tight">
                          {n.title}
                          {n.unavailable && <span className="ml-1.5 text-[0.6875rem] font-semibold text-ink-3">Not built yet</span>}
                        </span>
                        <span className="line-clamp-2 text-xs text-ink-3">{n.description}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
});
