"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon, ClockIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { CredentialDTO, TemplateDetailDTO } from "@/lib/workflow/dto";
import { useResource } from "@/lib/use-resource";
import { ConnectionList } from "@/features/templates/connection-list";
import { GraphPreview } from "@/features/templates/graph-preview";
import { ProviderBadges } from "@/features/templates/provider-badges";
import { ScenarioPanel } from "@/features/templates/scenario-panel";
import { setupRange } from "@/features/templates/template-card";
import { TemplateThumbnail } from "@/features/templates/template-thumbnail";
import { useTemplateImport } from "@/features/templates/use-template";

export function View() {
  const { slug } = useParams<{ slug: string }>();
  const { data, error } = useResource<{ template: TemplateDetailDTO }>(`/api/templates/${encodeURIComponent(slug)}`);
  const credentials = useResource<{ credentials: CredentialDTO[] }>("/api/credentials");
  const { busy, importTemplate } = useTemplateImport();

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-danger">{error}</p>
        <Link href="/templates" className="text-sm font-semibold underline underline-offset-2">
          Back to templates
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-4" aria-busy aria-label="Loading template">
        <div className="h-8 w-1/2 animate-pulse rounded bg-sunken" />
        <div className="aspect-video animate-pulse rounded-2xl bg-sunken" />
      </div>
    );
  }

  const t = data.template;
  const use = (
    <Button onClick={() => importTemplate(t.slug)} busy={busy === t.slug} className="h-11 px-5 text-base">
      Use template
    </Button>
  );

  return (
    <article className="flex flex-col gap-10">
      <div className="flex flex-col gap-5">
        <Link href="/templates" className="inline-flex items-center gap-1.5 self-start text-sm text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={14} aria-hidden /> All templates
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
              <span className="rounded-full bg-sunken px-2 py-0.5 font-medium text-ink">{t.category}</span>
              <span>{t.difficulty}</span>
              <span className="inline-flex items-center gap-1">
                <ClockIcon size={14} aria-hidden /> {setupRange(t.estimatedSetupMinutes)} setup
              </span>
            </div>
            <h1 className="headline mt-2 text-3xl sm:text-4xl">{t.name}</h1>
            <p className="mt-2 max-w-[62ch] text-ink-2">{t.shortDescription}</p>
          </div>
          {use}
        </div>
        <TemplateThumbnail src={t.thumbnailUrl} alt={t.thumbnailAlt} priority />
        <ProviderBadges ids={t.integrations} size="md" />
      </div>

      <section className="grid gap-8 md:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-semibold">What it does</h2>
          <p className="text-ink-2">{t.fullDescription}</p>
          <h3 className="mt-2 font-semibold">The problem</h3>
          <p className="text-ink-2">{t.useCase}</p>
        </div>
        <aside className="flex flex-col gap-3 rounded-2xl bg-sunken p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldCheckIcon size={18} weight="fill" className="text-success" aria-hidden /> Safety
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-ink-2">
            {t.safetyNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold">The workflow</h2>
        <p className="text-sm text-ink-2">Drawn from the template&apos;s saved graph: {t.graphDefinition.nodes.length} steps. This is exactly what opens in your editor.</p>
        <GraphPreview graph={t.graphDefinition} />
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-ink-2">
          {t.howItWorks.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-semibold">What you&apos;ll connect</h2>
          <ConnectionList connections={t.requiredConnections} credentials={credentials.data?.credentials ?? null} />
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-semibold">Setup checklist</h2>
          <ol className="flex flex-col gap-3">
            {t.setupChecklist.map((item, i) => (
              <li key={item.id} className="flex gap-3">
                <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-semibold">{i + 1}</span>
                <span>
                  <span className="block font-semibold">{item.title}</span>
                  <span className="block text-sm text-ink-2">{item.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <ScenarioPanel template={t} />

      <div className="flex flex-col items-start gap-3 rounded-2xl border border-line p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-2">Creates your own copy, turned off. Changing it never changes this template.</p>
        {use}
      </div>
    </article>
  );
}
