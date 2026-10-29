"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { TemplateCardDTO } from "@/lib/workflow/dto";
import { ProviderMark } from "./provider-badges";
import { setupRange } from "./template-card";
import { TemplateThumbnail } from "./template-thumbnail";

// The small form of a template, for the Workflows page where templates are a starting
// point beside your own work rather than the main event. The gallery keeps the big card.
export function TemplateTile({ template: t, busy, onUse }: { template: TemplateCardDTO; busy: boolean; onUse: () => void }) {
  const href = `/templates/${t.slug}`;
  return (
    <li className="flex items-center gap-4 rounded-2xl bg-paper p-2.5 shadow-[0_0_0_1px_var(--line)]">
      <Link href={href} tabIndex={-1} aria-hidden className="w-28 shrink-0 sm:w-32">
        <TemplateThumbnail src={t.thumbnailUrl} alt="" className="rounded-lg" />
      </Link>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold leading-snug">
          <Link href={href} className="hover:underline">
            {t.name}
          </Link>
        </h3>
        <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{t.shortDescription}</p>
        <div className="mt-2 flex items-center gap-2 text-xs text-ink-3">
          <span className="flex items-center gap-1" aria-label={`Uses ${t.integrations.join(", ")}`}>
            {t.integrations.slice(0, 5).map((id) => (
              <ProviderMark key={id} id={id} size={13} />
            ))}
          </span>
          <span aria-hidden>·</span>
          <span>{setupRange(t.estimatedSetupMinutes)} setup</span>
        </div>
      </div>
      <Button variant="secondary" onClick={onUse} busy={busy} className="h-9 shrink-0 px-3.5">
        Use
      </Button>
    </li>
  );
}
