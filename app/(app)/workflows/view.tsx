"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { api, errorMessage } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";
import { nodeDefinition } from "@/lib/nodes/registry";
import { CATEGORY_META } from "@/lib/nodes/types";
import type { WorkflowDTO } from "@/lib/workflow/dto";
import { TEMPLATES } from "@/lib/workflow/templates";
import { useResource } from "@/lib/use-resource";

// A row of bricks in each node's category colour: the workflow's shape at a glance.
function BrickStrip({ workflow }: { workflow: WorkflowDTO }) {
  const nodes = [...workflow.graph.nodes].sort((a, b) => a.position.x - b.position.x).slice(0, 14);
  if (!nodes.length) return <span className="text-xs text-ink-3">Empty</span>;
  return (
    <span className="flex items-end gap-[3px]" aria-hidden>
      {nodes.map((n) => {
        const def = nodeDefinition(n.type);
        return <span key={n.id} className="h-3 w-4 rounded-[3px]" style={{ background: def ? CATEGORY_META[def.category].color : "var(--line-strong)" }} />;
      })}
    </span>
  );
}

export function View() {
  const [archived, setArchived] = useState(false);
  const list = useResource<{ workflows: WorkflowDTO[] }>(`/api/workflows${archived ? "?status=archived" : ""}`);
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

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

  const act = async (w: WorkflowDTO, path: string, body: unknown, done: string) => {
    setBusy(w.id);
    try {
      await api(path, { body });
      toast(done, "success");
      list.reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-14">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="headline text-3xl">{archived ? "Archived workflows" : "Workflows"}</h1>
            <button onClick={() => setArchived((a) => !a)} className="mt-1 text-sm text-ink-2 underline underline-offset-2 hover:text-ink">
              {archived ? "Show active workflows" : "Show archived"}
            </button>
          </div>
          <Button onClick={() => create("blank")} busy={busy === "blank"}>
            New workflow
          </Button>
        </div>
        <div className="mt-6">
          {list.loading && !list.data ? (
            <div className="h-24 animate-pulse rounded-lg bg-sunken" />
          ) : list.error ? (
            <p role="alert" className="text-danger">{list.error}</p>
          ) : list.data?.workflows.length ? (
            <ul className="-mx-3 divide-y divide-line">
              {list.data.workflows.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg px-3 py-4 hover:bg-surface">
                  <Link href={`/workflows/${w.id}`} className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${w.enabled ? "bg-success" : "bg-line-strong"}`} title={w.enabled ? "On" : "Off"} />
                      <span className="truncate font-bold hover:text-action">{w.name}</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-2">
                      {w.graph.nodes.length} nodes, {w.triggerType ? nodeDefinition(w.triggerType)?.title.toLowerCase() : "no trigger"}. {w.runCount ? `Ran ${relativeTime(w.lastRunAt)}.` : "Not run yet."}
                    </span>
                  </Link>
                  <BrickStrip workflow={w} />
                  <span className="flex gap-1">
                    <Button variant="quiet" className="h-8" onClick={() => act(w, `/api/workflows/${w.id}/duplicate`, {}, "Copy created")} busy={busy === w.id}>
                      Duplicate
                    </Button>
                    <Button variant="quiet" className="h-8" onClick={() => act(w, `/api/workflows/${w.id}/status`, { status: archived ? "active" : "archived" }, archived ? "Restored" : "Archived and turned off")}>
                      {archived ? "Restore" : "Archive"}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-line-strong px-6 py-8 text-sm text-ink-2">
              {archived ? "Nothing archived." : "No workflows yet. Start from a template below or a blank canvas."}
            </p>
          )}
        </div>
      </section>

      {!archived && (
        <section>
          <h2 className="headline text-2xl">Start from a template</h2>
          <p className="mt-1 text-sm text-ink-2">Each one opens in the editor, ready to configure.</p>
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {TEMPLATES.filter((t) => t.id !== "blank").map((t) => {
              const g = t.graph();
              return (
                <li key={t.id} className="tactile flex flex-col rounded-2xl p-2">
                  <span className="tactile-soft flex h-28 flex-wrap content-center items-center justify-center gap-1 rounded-lg px-4" aria-hidden>
                    {g.nodes.map((n) => {
                      const def = nodeDefinition(n.type);
                      return <span key={n.id} className="h-5 w-7 rounded-[4px]" style={{ background: def ? CATEGORY_META[def.category].color : "var(--line)" }} />;
                    })}
                  </span>
                  <div className="flex flex-1 items-start justify-between gap-4 px-2 pb-2 pt-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{t.name}</h3>
                      <p className="mt-1 text-sm text-ink-2">{t.description}</p>
                    </div>
                    <button
                      onClick={() => create(t.id)}
                      disabled={busy === t.id}
                      aria-label={`Use the ${t.name} template`}
                      title="Use this template"
                      className="press tactile-accent flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-full disabled:opacity-60"
                    >
                      {busy === t.id ? <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-white" /> : <ArrowUpRight size={16} weight="bold" aria-hidden />}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
