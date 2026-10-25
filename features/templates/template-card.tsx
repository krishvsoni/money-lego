"use client";

import Link from "next/link";
import { ClockIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { TemplateCardDTO } from "@/lib/workflow/dto";
import { ProviderBadges } from "./provider-badges";
import { TemplateThumbnail } from "./template-thumbnail";

export const setupRange = (m: TemplateCardDTO["estimatedSetupMinutes"]) => (m.min === m.max ? `${m.min} min` : `${m.min}–${m.max} min`);

export function TemplateCard({ template: t, busy, onUse }: { template: TemplateCardDTO; busy: boolean; onUse: () => void }) {
  const href = `/templates/${t.slug}`;
  return (
    <li className="tactile reveal flex flex-col rounded-2xl p-2">
      <Link href={href} className="block rounded-xl outline-offset-2" aria-label={`Preview ${t.name}`} tabIndex={-1}>
        <TemplateThumbnail src={t.thumbnailUrl} alt={t.thumbnailAlt} />
      </Link>
      <div className="flex flex-1 flex-col gap-3 px-2 pb-2 pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-ink-2">
          <span className="rounded-full bg-sunken px-2 py-0.5 text-ink">{t.category}</span>
          <span>{t.difficulty}</span>
          <span className="inline-flex items-center gap-1">
            <ClockIcon size={13} aria-hidden />
            {setupRange(t.estimatedSetupMinutes)} setup
          </span>
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold leading-snug">
            <Link href={href} className="hover:underline">
              {t.name}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-ink-2">{t.shortDescription}</p>
        </div>
        <ProviderBadges ids={t.integrations} />
        <div className="mt-auto flex gap-2 pt-1">
          <Button onClick={onUse} busy={busy} className="flex-1">
            Use template
          </Button>
          <Link href={href} className="press tactile inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-ink hover:border-line-strong">
            Preview
          </Link>
        </div>
      </div>
    </li>
  );
}
