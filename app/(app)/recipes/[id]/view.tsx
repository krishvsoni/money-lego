"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Address } from "@/components/ui/address";
import { Button, ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/toast";
import { shareBps } from "@/lib/amounts";
import { api, errorMessage, newRequestKey } from "@/lib/api-client";
import type { ExecutionDTO, RecipeDTO } from "@/lib/dto";
import { formatDuration, formatToken, relativeTime } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { AllocationBar, brickColor } from "@/features/recipes/allocation-bar";

export function View() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const recipe = useResource<{ recipe: RecipeDTO }>(`/api/recipes/${id}`);
  const runs = useResource<{ runs: ExecutionDTO[] }>(`/api/runs?recipeId=${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);

  if (recipe.error) return <p role="alert" className="text-danger">{recipe.error}</p>;
  if (!recipe.data) return <div className="h-64 animate-pulse rounded-xl bg-sunken" />;
  const r = recipe.data.recipe;
  const total = BigInt(r.totalRaw);
  const archived = r.status === "archived";

  const quote = async () => {
    setBusy("quote");
    requestKey.current ??= newRequestKey();
    try {
      const { run } = await api<{ run: ExecutionDTO }>("/api/runs", { body: { recipeId: r.id, requestKey: requestKey.current } });
      requestKey.current = null;
      router.push(`/runs/${run.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(null);
    }
  };

  const act = async (name: string, path: string, body?: unknown) => {
    setBusy(name);
    try {
      const { recipe: next } = await api<{ recipe: RecipeDTO }>(path, { body: body ?? {} });
      if (name === "duplicate") {
        toast("Copy created", "success");
        router.push(`/recipes/${next.id}`);
        return;
      }
      recipe.setData({ recipe: next });
      toast(next.status === "archived" ? "Recipe archived" : "Recipe restored", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <Link href="/dashboard" className="text-sm text-ink-2 hover:text-ink">
            Recipes
          </Link>
          <h1 className="headline mt-1 text-3xl">{r.name}</h1>
          <p className="mt-2 text-ink-2">
            {formatToken(r.totalRaw, r.config.tokenMint)} to {r.config.destinations.length} {r.config.destinations.length === 1 ? "recipient" : "recipients"}. Version {r.version}, updated {relativeTime(r.updatedAt)}.
          </p>
          {r.description && <p className="mt-2 max-w-[60ch] text-sm text-ink-2">{r.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {archived ? (
            <Button onClick={() => act("status", `/api/recipes/${r.id}/status`, { status: "active" })} busy={busy === "status"}>
              Restore recipe
            </Button>
          ) : (
            <>
              <Button onClick={quote} busy={busy === "quote"}>
                Get a quote
              </Button>
              <ButtonLink href={`/recipes/${r.id}/edit`} variant="secondary">
                Edit
              </ButtonLink>
            </>
          )}
          <Button variant="quiet" onClick={() => act("duplicate", `/api/recipes/${r.id}/duplicate`)} busy={busy === "duplicate"}>
            Duplicate
          </Button>
          {!archived && (
            <Button variant="quiet" onClick={() => act("status", `/api/recipes/${r.id}/status`, { status: "archived" })} busy={busy === "status"}>
              Archive
            </Button>
          )}
        </div>
      </header>

      <section>
        <AllocationBar
          segments={r.config.destinations.map((d, i) => ({ key: `${i}`, title: d.label || d.wallet, amount: BigInt(d.amountRaw) }))}
          label={`Split for ${r.name}`}
        />
        <ul className="mt-5 divide-y divide-line">
          {r.config.destinations.map((d, i) => (
            <li key={d.wallet} className="grid grid-cols-[14px_1fr_auto] items-center gap-x-3 gap-y-0.5 py-3 sm:grid-cols-[14px_1fr_180px_70px]">
              <span className="h-3 w-3 rounded-[3px]" style={{ background: brickColor(i) }} aria-hidden />
              <span className="min-w-0">
                {d.label && <span className="mr-3 font-semibold">{d.label}</span>}
                <Address value={d.wallet} />
              </span>
              <span className="num text-right font-semibold">{formatToken(d.amountRaw, r.config.tokenMint)}</span>
              <span className="num col-start-3 text-right text-sm text-ink-3 sm:col-start-auto">{(shareBps(BigInt(d.amountRaw), total) / 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-2">
          Route: {r.config.route.hops ? `${r.config.route.hops} hops` : "default hop count"},{" "}
          {r.config.route.arrivalSeconds ? `delivered within ${formatDuration(r.config.route.arrivalSeconds)}` : "default delivery window"}.
        </p>
      </section>

      <section>
        <h2 className="headline text-2xl">Runs of this recipe</h2>
        {runs.data?.runs.length ? (
          <ul className="-mx-3 mt-4 divide-y divide-line">
            {runs.data.runs.map((run) => (
              <li key={run.id}>
                <Link href={`/runs/${run.id}`} className="flex items-center justify-between gap-4 rounded-lg px-3 py-3 hover:bg-surface">
                  <span className="text-sm">
                    <span className="font-semibold">{relativeTime(run.createdAt)}</span>
                    <span className="ml-2 text-ink-3">version {run.recipeVersion}</span>
                  </span>
                  <StatusBadge state={run.state} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-2">No runs yet. Get a quote to see exactly what this payout costs before you sign anything.</p>
        )}
      </section>
    </div>
  );
}
