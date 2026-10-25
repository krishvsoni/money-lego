"use client";

import { CheckCircleIcon, CircleIcon } from "@phosphor-icons/react";
import type { Editor } from "./use-workflow-editor";

// The imported template's setup list, ticked off live from the editor's own validation:
// an item is done when none of its nodes has anything left to fix. Run and enable stay
// blocked by the same validation, so the list and the buttons can never disagree.
export function SetupChecklist({ editor }: { editor: Editor }) {
  const items = editor.workflow.sourceTemplate?.setupChecklist ?? [];
  if (!items.length) return null;
  const blocked = new Set(editor.issues.map((i) => i.nodeId).filter(Boolean));
  const done = items.filter((item) => item.nodeIds.every((id) => !blocked.has(id) && editor.graph.nodes.some((n) => n.id === id)));
  return (
    <section className="mt-5 rounded-lg border border-line bg-paper p-3" aria-labelledby="setup-title">
      <div className="flex items-baseline justify-between">
        <h3 id="setup-title" className="text-sm font-bold">Setup</h3>
        <span className="text-xs text-ink-3">
          {done.length} of {items.length} done
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${(done.length / items.length) * 100}%` }} />
      </div>
      <ul className="mt-3 flex flex-col gap-1">
        {items.map((item) => {
          const ok = done.includes(item);
          const target = item.nodeIds.find((id) => blocked.has(id)) ?? item.nodeIds[0];
          return (
            <li key={item.id}>
              <button onClick={() => target && editor.setSelectedId(target)} className="flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-sunken">
                {ok ? <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-success" aria-label="Done" /> : <CircleIcon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-label="To do" />}
                <span className="min-w-0">
                  <span className={`block text-xs font-semibold ${ok ? "text-ink-2 line-through decoration-ink-3" : "text-ink"}`}>{item.title}</span>
                  {!ok && <span className="block text-[0.6875rem] leading-snug text-ink-2">{item.detail}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[0.6875rem] text-ink-3">The workflow stays off and can&apos;t run until every step is configured. Each payout still needs your approval and wallet signature.</p>
    </section>
  );
}
