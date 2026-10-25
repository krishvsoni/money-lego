"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Archive } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { api, errorMessage } from "@/lib/api-client";
import type { WorkflowDTO } from "@/lib/workflow/dto";
import { useResource } from "@/lib/use-resource";
import { FirstWorkflow } from "@/features/workflows/list/first-workflow";
import { integrationsIn, integrationsOf } from "@/features/workflows/list/integrations";
import { TemplateGrid } from "@/features/workflows/list/template-grid";
import { Toolbar, type Shelf } from "@/features/workflows/list/toolbar";
import { WorkflowRow } from "@/features/workflows/list/workflow-row";

type List = { workflows: WorkflowDTO[] };

export function View() {
  const active = useResource<List>("/api/workflows");
  const archived = useResource<List>("/api/workflows?status=archived");
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [shelf, setShelf] = useState<Shelf>("active");
  const [query, setQuery] = useState("");
  const [integration, setIntegration] = useState<string | null>(null);

  const list = shelf === "active" ? active : archived;
  const all = useMemo(() => list.data?.workflows ?? [], [list.data]);
  const integrations = useMemo(() => integrationsIn(all), [all]);
  const q = query.trim().toLowerCase();
  const shown = all.filter(
    (w) => (!q || w.name.toLowerCase().includes(q)) && (!integration || integrationsOf(w).some((i) => i.type === integration)),
  );
  const firstTime = active.data?.workflows.length === 0 && archived.data !== null;

  const create = async (templateId: string) => {
    setBusy(templateId);
    try {
      const { workflow } = await api<{ workflow: WorkflowDTO }>("/api/workflows", { body: { templateId } });
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
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const switchShelf = (s: Shelf) => {
    setShelf(s);
    setIntegration(null);
  };

  if (firstTime) {
    return (
      <div className="flex flex-col gap-14">
        <h1 className="headline text-3xl">Workflows</h1>
        <FirstWorkflow busy={busy} onCreate={create} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-14">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="headline text-3xl">Workflows</h1>
          <Button onClick={() => create("blank")} busy={busy === "blank"} disabled={busy !== null}>
            New workflow
          </Button>
        </div>
        <div className="mt-6">
          <Toolbar
            shelf={shelf}
            counts={{ active: active.data?.workflows.length ?? null, archived: archived.data?.workflows.length ?? null }}
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
            Archived workflows are off and never run. Restore one to use it again, or delete it for good. Its transfers stay on the Transfers page.
          </p>
        )}

        <div className="mt-4">
          {list.loading && !list.data ? (
            <div className="flex flex-col gap-2" aria-busy>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-sunken" />
              ))}
            </div>
          ) : list.error ? (
            <p role="alert" className="text-danger">{list.error}</p>
          ) : shown.length ? (
            <ul className="-mx-3 divide-y divide-line">
              {shown.map((w) => (
                <WorkflowRow
                  key={w.id}
                  workflow={w}
                  busy={busy === w.id}
                  onDuplicate={() => act(w, () => api(`/api/workflows/${w.id}/duplicate`, { body: {} }), "Copy created")}
                  onArchive={() => act(w, () => api(`/api/workflows/${w.id}/status`, { body: { status: "archived" } }), "Archived and turned off")}
                  onRestore={() => act(w, () => api(`/api/workflows/${w.id}/status`, { body: { status: "active" } }), "Restored")}
                  onDelete={() => act(w, () => api(`/api/workflows/${w.id}`, { method: "DELETE" }), "Deleted")}
                />
              ))}
            </ul>
          ) : (
            <EmptyState shelf={shelf} filtered={Boolean(q || integration)} onClear={() => (setQuery(""), setIntegration(null))} />
          )}
        </div>
      </section>

      {shelf === "active" && <TemplateGrid busy={busy} onCreate={create} />}
    </div>
  );
}

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
      <p className="font-semibold">{shelf === "archived" ? "Nothing archived" : "No active workflows"}</p>
      <p className="max-w-[44ch] text-sm text-ink-2">
        {shelf === "archived" ? "Workflows you archive land here, turned off, until you restore or delete them." : "Everything is archived. Create a new one or start from a template below."}
      </p>
    </div>
  );
}
