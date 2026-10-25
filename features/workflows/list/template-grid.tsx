"use client";

import { ArrowUpRight } from "@phosphor-icons/react";
import { nodeDefinition } from "@/lib/nodes/registry";
import { CATEGORY_META } from "@/lib/nodes/types";
import { TEMPLATES } from "@/lib/workflow/templates";
import { BrickGlyph } from "@/features/workflows/node-icon";

export function TemplateGrid({ busy, onCreate, exclude = [] }: { busy: string | null; onCreate: (templateId: string) => void; exclude?: string[] }) {
  const templates = TEMPLATES.filter((t) => t.id !== "blank" && !exclude.includes(t.id));
  if (!templates.length) return null;
  return (
    <section>
      <h2 className="headline text-2xl">Start from a template</h2>
      <p className="mt-1 text-sm text-ink-2">Each one opens in the editor, ready to configure.</p>
      <ul className="mt-5 grid gap-4 md:grid-cols-2">
        {templates.map((t) => (
          <li key={t.id} className="tactile flex flex-col rounded-2xl p-2">
            <span className="tactile-soft flex h-28 flex-wrap content-center items-center justify-center gap-1.5 rounded-lg px-4" aria-hidden>
              {t.graph().nodes.map((n) => {
                const def = nodeDefinition(n.type);
                return <BrickGlyph key={n.id} name={def?.icon ?? "Package"} color={def ? CATEGORY_META[def.category].color : "var(--ink-3)"} size="md" />;
              })}
            </span>
            <div className="flex flex-1 items-start justify-between gap-4 px-2 pb-2 pt-4">
              <div className="min-w-0">
                <h3 className="font-semibold">{t.name}</h3>
                <p className="mt-1 text-sm text-ink-2">{t.description}</p>
              </div>
              <button
                onClick={() => onCreate(t.id)}
                disabled={busy !== null}
                aria-label={`Use the ${t.name} template`}
                title="Use this template"
                className="press tactile-accent flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-full disabled:opacity-60"
              >
                {busy === t.id ? <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-white" /> : <ArrowUpRight size={16} weight="bold" aria-hidden />}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
