"use client";

import { PageHeader } from "@/components/page-header";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Archive } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { api, errorMessage, newRequestKey } from "@/lib/api-client";
import type { WorkflowDTO } from "@/lib/workflow/dto";
import { useResource } from "@/lib/use-resource";
import { integrationsIn, integrationsOf } from "@/features/workflows/list/integrations";
import { SageComposer } from "@/features/agent/sage-composer";
import { TemplateGrid } from "@/features/workflows/list/template-grid";
import { Toolbar, type Shelf } from "@/features/workflows/list/toolbar";
import { WorkflowRow } from "@/features/workflows/list/workflow-row";
import { ShareDialog } from "@/features/workflows/share/share-dialog";

type List = { workflows: WorkflowDTO[]; sharedCounts: Record<string, number>; sharedWith?: Record<string, { names: string[]; invited: number }> };

const SHELVES: Shelf[] = ["active", "shared", "archived"];

export function View() {
  const active = useResource<List>("/api/workflows");
  const archived = useResource<List>("/api/workflows?status=archived");
  const shared = useResource<List>("/api/workflows?scope=shared");
  const [shareTarget, setShareTarget] = useState<WorkflowDTO | null>(null);
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  // View state lives in the URL. Switching shelves pushes a history entry, so Back from
  // Archived returns to Active; search and filter replace in place, so they survive opening
  // a workflow and coming back without flooding history with keystrokes.
  const params = useSearchParams();
  const pathname = usePathname();
  const shelf: Shelf = SHELVES.find((s) => s !== "active" && s === params.get("shelf")) ?? "active";
  const integration = params.get("integration");
  const setParams = useCallback(
    (next: Record<string, string | null>, mode: "push" | "replace") => {
      const p = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      const url = p.size ? `${pathname}?${p}` : pathname;
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [params, pathname, router],
  );
  // The input owns its text so typing never waits on navigation; the URL mirrors it.
  const [query, setQueryText] = useState(() => params.get("q") ?? "");
  const setQuery = (q: string) => {
    setQueryText(q);
    setParams({ q: q || null }, "replace");
  };
  const setIntegration = (type: string | null) => setParams({ integration: type }, "replace");

  const list = { active, shared, archived }[shelf];
  const counts = active.data?.sharedCounts ?? {};
  const all = useMemo(() => list.data?.workflows ?? [], [list.data]);
  const integrations = useMemo(() => integrationsIn(all), [all]);
  const q = query.trim().toLowerCase();
  const shown = all.filter((w) => (!q || w.name.toLowerCase().includes(q)) && (!integration || integrationsOf(w).some((i) => i.type === integration)));
  const firstTime = active.data?.workflows.length === 0 && archived.data !== null && shared.data?.workflows.length === 0;

  const createBlank = async () => {
    setBusy("blank");
    try {
      const { workflow } = await api<{ workflow: WorkflowDTO }>("/api/workflows", { body: { templateId: "blank", requestKey: newRequestKey() } });
      router.push(`/workflows/${workflow.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(null);
    }
  };

  const act = async (w: WorkflowDTO, request: () => Promise<unknown>, done: string) => {
    setBusy(w.id);
    try {
      await request();
      toast(done, "success");
      active.reload();
      archived.reload();
      shared.reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const switchShelf = (s: Shelf) => {
    if (s !== shelf) setParams({ shelf: s === "active" ? null : s, integration: null }, "push");
  };

  const sage = <SageComposer onManual={createBlank} manualBusy={busy === "blank"} />;

  if (firstTime) {
    return (
      <WithSage sage={sage}>
        <div className="flex flex-col gap-10">
          <PageHeader title="Workflows" description="Ask Sage to build one, start from a template, or build it yourself." />
          <TemplateGrid limit={6} title="Pick a starting point" />
        </div>
      </WithSage>
    );
  }

  return (
    <WithSage sage={sage}>
      <div className="flex flex-col gap-14">
        <section>
          <PageHeader
            title="Workflows"
            actions={
              <Button onClick={createBlank} busy={busy === "blank"} disabled={busy !== null}>
                New workflow
              </Button>
            }
          />
          <div className="mt-6">
            <Toolbar
              shelf={shelf}
              counts={{
                active: active.data?.workflows.length ?? null,
                archived: archived.data?.workflows.length ?? null,
                shared: shared.data?.workflows.length ?? null,
              }}
              onShelf={switchShelf}
              query={query}
              onQuery={setQuery}
              integrations={integrations}
              integration={integration}
              onIntegration={setIntegration}
            />
          </div>

          {shelf === "archived" && all.length > 0 && (
            <p className="mt-5 flex items-center gap-2 rounded-xl bg-sunken px-4 py-3 text-sm text-ink-2">
              <Archive size={16} className="shrink-0" aria-hidden />
              Archived workflows are off and never run. Restore one to use it again, or delete it for good. Its PayPal activity stays on the Payments page.
            </p>
          )}

          <div className="mt-4">
            {list.loading && !list.data ? (
              <div className="grid gap-2.5" aria-busy>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-sunken" />
                ))}
              </div>
            ) : list.error ? (
              <p role="alert" className="text-danger">
                {list.error}
              </p>
            ) : shown.length ? (
              <ul className="grid gap-2.5">
                {shown.map((w) => (
                  <WorkflowRow
                    key={w.id}
                    workflow={w}
                    busy={busy === w.id}
                    sharedWith={counts[w.id]}
                    sharedPeople={active.data?.sharedWith?.[w.id]}
                    onShare={() => setShareTarget(w)}
                    onLeave={() => act(w, () => api(`/api/workflows/${w.id}/shares/me`, { method: "DELETE" }), "Removed from your shared list")}
                    onDuplicate={() => act(w, () => api(`/api/workflows/${w.id}/duplicate`, { body: {} }), "Copy created")}
                    onArchive={() =>
                      act(
                        w,
                        () =>
                          api(`/api/workflows/${w.id}/status`, {
                            body: { status: "archived" },
                          }),
                        "Archived and turned off",
                      )
                    }
                    onRestore={() =>
                      act(
                        w,
                        () =>
                          api(`/api/workflows/${w.id}/status`, {
                            body: { status: "active" },
                          }),
                        "Restored",
                      )
                    }
                    onDelete={() => act(w, () => api(`/api/workflows/${w.id}`, { method: "DELETE" }), "Deleted")}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState
                shelf={shelf}
                filtered={Boolean(q || integration)}
                onClear={() => (setQueryText(""), setParams({ q: null, integration: null }, "replace"))}
              />
            )}
          </div>
        </section>

        {shelf === "active" && <TemplateGrid />}
      </div>
      {shareTarget && (
        <ShareDialog
          workflowId={shareTarget.id}
          workflowName={shareTarget.name}
          open
          onClose={() => {
            setShareTarget(null);
            active.reload();
          }}
          onTransferred={() => {
            setShareTarget(null);
            active.reload();
            shared.reload();
          }}
        />
      )}
    </WithSage>
  );
}

// Sage is a column of the page grid, inside the same width as the nav, so the page's left
// edge meets the logo and Sage's right edge meets the nav's. He stays in view while the
// list scrolls on laptops and up; on phones he sits above the list.
function WithSage({ sage, children }: { sage: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">{children}</div>
      <aside aria-label="Sage" className="order-first lg:sticky lg:top-28 lg:order-last lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto">
        {sage}
      </aside>
    </div>
  );
}

const EMPTY: Record<Shelf, { title: string; body: string }> = {
  active: { title: "No active workflows", body: "Everything is archived. Create a new one or start from a template below." },
  shared: { title: "Nothing shared with you", body: "When someone shares a workflow with your sign-in email, it shows up here, view only. Make a copy to edit your own." },
  archived: { title: "Nothing archived", body: "Workflows you archive land here, turned off, until you restore or delete them." },
};

function EmptyState({ shelf, filtered, onClear }: { shelf: Shelf; filtered: boolean; onClear: () => void }) {
  if (filtered) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong px-6 py-8 text-sm text-ink-2">
        No workflow matches that search.{" "}
        <button onClick={onClear} className="font-medium text-ink underline underline-offset-2">
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      <Archive size={24} className="text-ink-3" aria-hidden />
      <p className="font-semibold">{EMPTY[shelf].title}</p>
      <p className="max-w-[44ch] text-sm text-ink-2">{EMPTY[shelf].body}</p>
    </div>
  );
}
