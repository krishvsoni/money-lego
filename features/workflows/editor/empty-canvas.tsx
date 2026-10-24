"use client";

import { definitionsByCategory } from "@/lib/nodes/registry";
import { NodeIcon } from "../node-icon";

// The first thing on a blank canvas: pick how the workflow starts. One choice, then the
// catalog takes over.
export function EmptyCanvas({ onPick }: { onPick: (type: string) => void }) {
  const triggers = definitionsByCategory().find((g) => g.category === "triggers")?.nodes ?? [];
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="reveal pointer-events-auto w-full max-w-[420px] rounded-xl border border-line bg-surface p-6 shadow-[0_18px_40px_-24px_rgb(23_32_51/0.5)]">
        <h2 className="text-lg font-bold">How should this workflow start?</h2>
        <p className="mt-1 text-sm text-ink-2">Every workflow begins with one trigger. Add steps after it from the left panel.</p>
        <ul className="mt-4 flex flex-col gap-2">
          {triggers.map((t) => (
            <li key={t.type}>
              <button onClick={() => onPick(t.type)} className="press flex w-full items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-left hover:border-ink-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--brick-2)_18%,transparent)] text-[var(--brick-2)]">
                  <NodeIcon name={t.icon} className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-bold">{t.title}</span>
                  <span className="block text-xs text-ink-2">{t.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
