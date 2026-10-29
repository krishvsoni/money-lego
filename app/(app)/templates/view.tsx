"use client";

import { PageHeader } from "@/components/page-header";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { inputClass } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { PROVIDERS } from "@/lib/nodes/providers";
import type { TemplateCardDTO } from "@/lib/workflow/dto";
import { useResource } from "@/lib/use-resource";
import { TemplateCard } from "@/features/templates/template-card";
import { useTemplateImport } from "@/features/templates/use-template";

type List = { templates: TemplateCardDTO[] };

// The template gallery. Cards come from the database through /api/templates; filters live
// in the URL so a filtered view can be shared and survives Back.
export function View() {
  const { data, error, reload } = useResource<List>("/api/templates");
  const { busy, importTemplate } = useTemplateImport();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const category = params.get("category");
  const integration = params.get("integration");

  const setParam = (key: string, value: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    router.replace(p.size ? `${pathname}?${p}` : pathname, { scroll: false });
  };

  const all = useMemo(() => data?.templates ?? [], [data]);
  const categories = useMemo(() => [...new Set(all.map((t) => t.category))].sort(), [all]);
  const integrations = useMemo(() => [...new Set(all.flatMap((t) => t.integrations))].sort((a, b) => (PROVIDERS[a]?.label ?? a).localeCompare(PROVIDERS[b]?.label ?? b)), [all]);
  const q = query.trim().toLowerCase();
  const shown = all.filter(
    (t) =>
      (!q || [t.name, t.shortDescription, t.category, ...t.tags, ...t.integrations.map((i) => PROVIDERS[i]?.label ?? i)].some((s) => s.toLowerCase().includes(q))) &&
      (!category || t.category === category) &&
      (!integration || t.integrations.includes(integration)),
  );
  const filtered = Boolean(q || category || integration);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Templates"
        description="Complete payout workflows you can copy and make your own. Each opens in the editor turned off, with a checklist of what to connect. Every one waits for your approval and wallet signature before money moves."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search templates</span>
          <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setParam("q", e.target.value || null);
            }}
            placeholder="Search by name, use case or service"
            className={`${inputClass} pl-9`}
          />
        </label>
        <Select aria-label="Category" value={category ?? ""} onChange={(e) => setParam("category", e.target.value || null)} wrapperClassName="sm:w-48">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select aria-label="Integration" value={integration ?? ""} onChange={(e) => setParam("integration", e.target.value || null)} wrapperClassName="sm:w-48">
          <option value="">All integrations</option>
          {integrations.map((i) => (
            <option key={i} value={i}>
              {PROVIDERS[i]?.label ?? i}
            </option>
          ))}
        </Select>
      </div>

      {error ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl bg-danger-wash p-5 text-sm text-danger">
          <p>Templates couldn&apos;t load. {error}</p>
          <button onClick={reload} className="font-semibold underline underline-offset-2">
            Try again
          </button>
        </div>
      ) : !data ? (
        <ul className="grid gap-5 md:grid-cols-2" aria-busy aria-label="Loading templates">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex flex-col gap-3 rounded-2xl p-2">
              <div className="aspect-video animate-pulse rounded-xl bg-sunken" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-sunken" />
              <div className="h-4 w-full animate-pulse rounded bg-sunken" />
            </li>
          ))}
        </ul>
      ) : shown.length ? (
        <ul className="grid gap-5 md:grid-cols-2">
          {shown.map((t) => (
            <TemplateCard key={t.slug} template={t} busy={busy === t.slug} onUse={() => importTemplate(t.slug)} />
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-sm text-ink-2">
          {filtered ? (
            <>
              No template matches those filters.{" "}
              <button
                onClick={() => {
                  setQuery("");
                  router.replace(pathname, { scroll: false });
                }}
                className="font-medium text-ink underline underline-offset-2"
              >
                Clear filters
              </button>
            </>
          ) : (
            "No templates are published yet."
          )}
        </div>
      )}
    </div>
  );
}
