"use client";

import { useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { nodeDefinition } from "@/lib/nodes/registry";
import { CATEGORY_META } from "@/lib/nodes/types";
import { TEMPLATES } from "@/lib/workflow/templates";
import { Button } from "@/components/ui/button";
import { BrickGlyph } from "@/features/workflows/node-icon";

// Short names and one-line purposes for the picker tiles; the full descriptions live in
// the template grid.
const TILE: Record<string, { title: string; line: string; icon: string; color: string }> = {
  "manual-payout": { title: "Manual payout", line: "Split, sign, send", icon: "MousePointerClick", color: "var(--brick-1)" },
  "webhook-payout": { title: "Webhook payout", line: "Event in, approved payout out", icon: "Webhook", color: "var(--brick-2)" },
  blank: { title: "Blank canvas", line: "Build it yourself", icon: "Package", color: "var(--ink-3)" },
};
const ORDER = ["manual-payout", "webhook-payout", "blank"];

function stepsOf(templateId: string) {
  const t = TEMPLATES.find((x) => x.id === templateId);
  return (t?.graph().nodes ?? []).map((n) => {
    const def = nodeDefinition(n.type);
    return { id: n.id, label: n.label ?? def?.title ?? n.type, icon: def?.icon ?? "Package", color: def ? CATEGORY_META[def.category].color : "var(--ink-3)" };
  });
}

// Shown instead of an empty list when someone has no workflows yet: pick a square, see
// exactly which steps it opens with, create. Manual payout is picked by default.
export function FirstWorkflow({ busy, onCreate }: { busy: string | null; onCreate: (templateId: string) => void }) {
  const [picked, setPicked] = useState(ORDER[0]);
  const steps = stepsOf(picked);
  const tiles = ORDER.filter((id) => id === "blank" || TEMPLATES.some((t) => t.id === id));

  return (
    <section aria-labelledby="first-workflow" className="tactile rounded-3xl p-4 sm:p-6">
      <h2 id="first-workflow" className="headline text-3xl">Pick a starting point</h2>
      <p className="mt-1 text-ink-2">You can change every step in the editor.</p>

      <div role="radiogroup" aria-label="Starting point" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((id) => {
          const t = TILE[id];
          const on = picked === id;
          return (
            <button
              key={id}
              role="radio"
              aria-checked={on}
              onClick={() => setPicked(id)}
              onDoubleClick={() => onCreate(id)}
              className={`press relative flex aspect-square flex-col justify-between rounded-2xl p-4 text-left outline-none transition-[box-shadow,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-[var(--brick-1)] ${
                on ? "bg-surface shadow-[0_0_0_2px_var(--ink)]" : "tactile-soft hover:bg-surface"
              }`}
            >
              <BrickGlyph name={t.icon} color={t.color} size="md" />
              {on && <CheckCircle size={22} weight="fill" className="absolute right-3 top-3 text-ink" aria-hidden />}
              <span>
                <span className="block font-display text-lg font-semibold leading-tight text-ink sm:text-xl">{t.title}</span>
                <span className="mt-1 block text-sm text-ink-2">{t.line}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ol className="flex min-h-9 flex-wrap items-center gap-y-2" aria-label="Steps it opens with">
          {steps.length ? (
            steps.map((s, i) => (
              <li key={s.id} className="flex items-center" title={s.label}>
                <BrickGlyph name={s.icon} color={s.color} size="sm" />
                <span className="sr-only">{s.label}</span>
                {i < steps.length - 1 && <span className="mx-1 h-px w-3 bg-line-strong" aria-hidden />}
              </li>
            ))
          ) : (
            <li className="text-sm text-ink-3">An empty canvas.</li>
          )}
        </ol>
        <Button onClick={() => onCreate(picked)} busy={busy === picked} disabled={busy !== null} className="h-11 shrink-0 px-5 text-base">
          Create {TILE[picked].title.toLowerCase()}
        </Button>
      </div>
    </section>
  );
}
