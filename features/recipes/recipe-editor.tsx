"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, TextInput } from "@/components/ui/field";
import { useToast } from "@/components/toast";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import type { RecipeDTO } from "@/lib/dto";
import { formatAmount } from "@/lib/amounts";
import { formatDuration } from "@/lib/format";
import { HOPS_MAX, HOPS_MIN } from "@/lib/recipe-schema";
import { supportedTokens } from "@/lib/tokens";
import { AllocationBar } from "./allocation-bar";
import { DestinationRows } from "./destination-rows";
import { issueKey, useRecipeForm } from "./use-recipe-form";

const ARRIVAL_PRESETS = [3_600, 6 * 3_600, 86_400, 3 * 86_400, 7 * 86_400];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line py-8 md:grid-cols-[220px_1fr] md:gap-10">
      <div>
        <h2 className="font-bold">{title}</h2>
        {hint && <p className="mt-1 text-sm text-ink-2">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function RecipeEditor({ recipe }: { recipe?: RecipeDTO }) {
  const form = useRecipeForm(recipe);
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const errors = { ...serverErrors, ...form.errors };
  const tokens = supportedTokens();
  const symbol = form.token?.symbol ?? "";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    form.touch();
    setServerErrors({});
    if (!form.input) {
      toast("Some fields need attention before saving.", "error");
      return;
    }
    setSaving(true);
    try {
      const body = recipe ? { ...form.input, expectedVersion: recipe.version } : form.input;
      const { recipe: saved } = await api<{ recipe: RecipeDTO }>(recipe ? `/api/recipes/${recipe.id}` : "/api/recipes", {
        method: recipe ? "PUT" : "POST",
        body,
      });
      toast(recipe ? `Saved as version ${saved.version}` : "Recipe saved", "success");
      router.push(`/recipes/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) {
        setServerErrors(Object.fromEntries(err.issues.map((i) => [issueKey(i.path.split(".")), i.message])));
      }
      toast(errorMessage(err), "error");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} noValidate>
      <Section title="Name" hint="Something your team will recognise on the dashboard.">
        <div className="flex flex-col gap-4">
          <Field label="Recipe name" htmlFor="name" error={errors.name}>
            <TextInput id="name" value={form.state.name} onChange={(e) => form.update({ name: e.target.value })} placeholder="Monthly contributor payout" maxLength={80} invalid={Boolean(errors.name)} />
          </Field>
          <Field label="Notes" htmlFor="description" hint="Optional. Only you can see this.">
            <textarea id="description" value={form.state.description} onChange={(e) => form.update({ description: e.target.value })} rows={2} maxLength={280} className={`${inputClass} h-auto py-2`} />
          </Field>
        </div>
      </Section>

      <Section title="Token" hint="Only tokens MultiHopper supports on this network are listed.">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Token">
          {tokens.map((t) => (
            <button
              key={t.mint}
              type="button"
              role="radio"
              aria-checked={form.state.tokenMint === t.mint}
              onClick={() => form.update({ tokenMint: t.mint })}
              className={`press rounded-md border px-4 py-2 text-left text-sm ${form.state.tokenMint === t.mint ? "border-action bg-progress-wash" : "border-line-strong bg-surface hover:border-ink-3"}`}
            >
              <span className="font-bold">{t.symbol}</span>
              <span className="ml-2 text-ink-2">{t.name}</span>
            </button>
          ))}
        </div>
        {errors.tokenMint && <p className="mt-2 text-sm text-danger">{errors.tokenMint}</p>}
      </Section>

      <Section title="Recipients" hint="Each wallet once. These are gross amounts; your quote shows what each recipient receives after fees.">
        <div className="mb-6">
          <AllocationBar segments={form.segments} label="Current split between recipients" />
          <p className="mt-2 text-sm">
            <span className="text-ink-2">Total </span>
            <span className="font-bold">
              {form.token ? formatAmount(form.total, form.token.decimals) : "0"} {symbol}
            </span>
          </p>
        </div>
        <DestinationRows
          rows={form.state.rows}
          symbol={symbol}
          errors={errors}
          onChange={form.updateRow}
          onAdd={form.addRow}
          onRemove={form.removeRow}
          onSplit={form.splitTotal}
          onImport={form.importLines}
        />
      </Section>

      <Section title="Route" hint="More hops and more time spread the transfer further. Leave both on default if you're unsure.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Hops" htmlFor="hops" error={errors["route.hops"]} hint="MultiHopper's default is used if you don't pick.">
            <select id="hops" value={form.state.hops} onChange={(e) => form.update({ hops: e.target.value })} className={inputClass}>
              <option value="">Provider default</option>
              {Array.from({ length: HOPS_MAX - HOPS_MIN + 1 }, (_, i) => HOPS_MIN + i).map((h) => (
                <option key={h} value={h}>
                  {h} hops
                </option>
              ))}
            </select>
          </Field>
          <Field label="Delivery window" htmlFor="arrival" error={errors["route.arrivalSeconds"]} hint="How long the route may take after funding. Not a schedule.">
            <select id="arrival" value={form.state.arrivalSeconds} onChange={(e) => form.update({ arrivalSeconds: e.target.value })} className={inputClass}>
              <option value="">Provider default</option>
              {ARRIVAL_PRESETS.map((s) => (
                <option key={s} value={s}>
                  Within {formatDuration(s)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-line bg-paper/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        <Button type="button" variant="quiet" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" busy={saving}>
          {recipe ? "Save new version" : "Save recipe"}
        </Button>
      </div>
    </form>
  );
}
