"use client";

import Link from "next/link";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ExecutionDTO, RecipeDTO } from "@/lib/dto";
import { formatToken, relativeTime } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { AllocationBar } from "@/features/recipes/allocation-bar";

function RecipeRow({ recipe }: { recipe: RecipeDTO }) {
  const segments = recipe.config.destinations.map((d, i) => ({ key: `${i}`, title: d.label || d.wallet, amount: BigInt(d.amountRaw) }));
  return (
    <li>
      <Link href={`/recipes/${recipe.id}`} className="group grid gap-3 rounded-lg px-3 py-4 hover:bg-surface sm:grid-cols-[1fr_200px_auto] sm:items-center sm:gap-6">
        <div className="min-w-0">
          <p className="truncate font-bold group-hover:text-action">{recipe.name}</p>
          <p className="mt-0.5 text-sm text-ink-2">
            {formatToken(recipe.totalRaw, recipe.config.tokenMint)} to {recipe.config.destinations.length}{" "}
            {recipe.config.destinations.length === 1 ? "recipient" : "recipients"}
          </p>
        </div>
        <div className="[&_div]:!h-2.5">
          <AllocationBar segments={segments} label={`Split for ${recipe.name}`} />
        </div>
        <p className="text-sm text-ink-3 sm:text-right">
          {recipe.runCount ? `Ran ${relativeTime(recipe.lastRunAt)}` : "Not run yet"}
        </p>
      </Link>
    </li>
  );
}

function RunRow({ run }: { run: ExecutionDTO }) {
  return (
    <li>
      <Link href={`/runs/${run.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-lg px-3 py-3 hover:bg-surface sm:grid-cols-[1fr_180px_160px_100px]">
        <span className="truncate font-semibold">{run.recipeName}</span>
        <span className="text-sm text-ink-2 sm:order-none">{formatToken(run.amountRaw, run.config.tokenMint, 2)}</span>
        <span>
          <StatusBadge state={run.state} />
        </span>
        <span className="text-sm text-ink-3 sm:text-right">{relativeTime(run.createdAt)}</span>
      </Link>
    </li>
  );
}

export default function Dashboard() {
  const [archived, setArchived] = useState(false);
  const recipes = useResource<{ recipes: RecipeDTO[] }>(`/api/recipes${archived ? "?status=archived" : ""}`);
  const runs = useResource<{ runs: ExecutionDTO[] }>("/api/runs");

  return (
    <div className="flex flex-col gap-14">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="headline text-3xl">{archived ? "Archived recipes" : "Recipes"}</h1>
            <button onClick={() => setArchived((a) => !a)} className="mt-1 text-sm text-ink-2 underline underline-offset-2 hover:text-ink">
              {archived ? "Show active recipes" : "Show archived"}
            </button>
          </div>
          <ButtonLink href="/recipes/new">New recipe</ButtonLink>
        </div>

        <div className="mt-6">
          {recipes.loading && !recipes.data ? (
            <div className="h-24 animate-pulse rounded-lg bg-sunken" />
          ) : recipes.error ? (
            <p role="alert" className="text-danger">{recipes.error}</p>
          ) : recipes.data?.recipes.length ? (
            <ul className="-mx-3 divide-y divide-line">
              {recipes.data.recipes.map((r) => (
                <RecipeRow key={r.id} recipe={r} />
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-line-strong px-6 py-10">
              <p className="font-bold">{archived ? "Nothing archived" : "No recipes yet"}</p>
              <p className="mt-1 max-w-[52ch] text-sm text-ink-2">
                {archived
                  ? "Recipes you archive land here. You can restore them any time."
                  : "A recipe holds who you pay, how much, and in which token. Build one now and run it whenever payday comes."}
              </p>
              {!archived && (
                <ButtonLink href="/recipes/new" className="mt-5">
                  Create your first recipe
                </ButtonLink>
              )}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="headline text-2xl">Recent runs</h2>
        <div className="mt-4">
          {runs.loading && !runs.data ? (
            <div className="h-16 animate-pulse rounded-lg bg-sunken" />
          ) : runs.error ? (
            <p role="alert" className="text-danger">{runs.error}</p>
          ) : runs.data?.runs.length ? (
            <ul className="-mx-3 divide-y divide-line">
              {runs.data.runs.map((r) => (
                <RunRow key={r.id} run={r} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">Runs appear here once you quote a recipe.</p>
          )}
        </div>
      </section>
    </div>
  );
}
