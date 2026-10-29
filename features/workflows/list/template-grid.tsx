"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react";
import type { TemplateCardDTO } from "@/lib/workflow/dto";
import { useResource } from "@/lib/use-resource";
import { TemplateTile } from "@/features/templates/template-tile";
import { useTemplateImport } from "@/features/templates/use-template";

// Published templates from the database, shown under the workflow list. The full gallery
// with search and filters lives at /templates.
export function TemplateGrid({ limit = 6, title = "Start from a template" }: { limit?: number; title?: string }) {
  const { data, error } = useResource<{ templates: TemplateCardDTO[] }>("/api/templates");
  const { busy, importTemplate } = useTemplateImport();
  if (error) return null;
  const templates = data?.templates.slice(0, limit) ?? [];
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="headline text-2xl">{title}</h2>
          <p className="mt-1 text-sm text-ink-2">Complete payout workflows. Each opens turned off, with a checklist of what to connect.</p>
        </div>
        <Link href="/templates" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink hover:underline">
          All templates <ArrowRightIcon size={14} aria-hidden />
        </Link>
      </div>
      {!data ? (
        <div className="mt-5 grid gap-2.5" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-sunken" />
          ))}
        </div>
      ) : (
        <ul className="mt-5 grid gap-2.5">
          {templates.map((t) => (
            <TemplateTile key={t.slug} template={t} busy={busy === t.slug} onUse={() => importTemplate(t.slug)} />
          ))}
        </ul>
      )}
    </section>
  );
}
