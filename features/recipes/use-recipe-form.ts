"use client";

import { useMemo, useState } from "react";
import { fromRaw, splitEvenly, toRaw, tryToRaw } from "@/lib/amounts";
import type { RecipeDTO } from "@/lib/dto";
import { MAX_DESTINATIONS, recipeInputSchema, type RecipeInput } from "@/lib/recipe-schema";
import { findToken, supportedTokens } from "@/lib/tokens";

export interface Row {
  id: string;
  wallet: string;
  amount: string;
  label: string;
}

export interface FormState {
  name: string;
  description: string;
  tokenMint: string;
  rows: Row[];
  hops: string;
  arrivalSeconds: string;
}

let rowCounter = 0;
export const newRow = (partial: Partial<Row> = {}): Row => ({ id: `r${++rowCounter}`, wallet: "", amount: "", label: "", ...partial });

export function initialState(recipe?: RecipeDTO): FormState {
  if (!recipe) {
    return { name: "", description: "", tokenMint: supportedTokens()[0]?.mint ?? "", rows: [newRow()], hops: "", arrivalSeconds: "" };
  }
  const decimals = findToken(recipe.config.tokenMint)?.decimals ?? 0;
  return {
    name: recipe.name,
    description: recipe.description,
    tokenMint: recipe.config.tokenMint,
    rows: recipe.config.destinations.map((d) => newRow({ wallet: d.wallet, amount: fromRaw(d.amountRaw, decimals), label: d.label })),
    hops: recipe.config.route.hops?.toString() ?? "",
    arrivalSeconds: recipe.config.route.arrivalSeconds?.toString() ?? "",
  };
}

// Converts what the person typed into the wire shape, collecting every problem keyed by a
// path the form understands, so errors can sit next to the field that caused them.
function compile(state: FormState): { input: RecipeInput | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const token = findToken(state.tokenMint);
  const destinations = state.rows.map((row, i) => {
    let amountRaw = "";
    if (!row.amount.trim()) errors[`rows.${i}.amount`] = "Enter an amount";
    else if (token) {
      try {
        amountRaw = toRaw(row.amount, token.decimals).toString();
      } catch (e) {
        errors[`rows.${i}.amount`] = (e as Error).message;
      }
    }
    return { wallet: row.wallet.trim(), amountRaw, label: row.label.trim() };
  });

  const candidate = {
    name: state.name,
    description: state.description,
    config: {
      tokenMint: state.tokenMint,
      destinations,
      route: {
        mode: "standard" as const,
        ...(state.hops ? { hops: Number(state.hops) } : {}),
        ...(state.arrivalSeconds ? { arrivalSeconds: Number(state.arrivalSeconds) } : {}),
      },
    },
  };
  const parsed = recipeInputSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issueKey(issue.path.map(String));
      if (!errors[key]) errors[key] = issue.message;
    }
  }
  return { input: parsed.success && Object.keys(errors).length === 0 ? parsed.data : null, errors };
}

export function issueKey(path: string[]): string {
  if (path[0] === "config" && path[1] === "destinations") {
    if (path.length === 2) return "rows";
    const field = path[3] === "amountRaw" ? "amount" : path[3];
    return `rows.${path[2]}.${field}`;
  }
  if (path[0] === "config") return path.slice(1).join(".");
  return path.join(".");
}

export function useRecipeForm(recipe?: RecipeDTO) {
  const [state, setState] = useState<FormState>(() => initialState(recipe));
  const [touched, setTouched] = useState(false);
  const token = findToken(state.tokenMint);
  const compiled = useMemo(() => compile(state), [state]);

  const segments = state.rows.map((r) => ({
    key: r.id,
    title: r.label || r.wallet || "Recipient",
    amount: (token && tryToRaw(r.amount, token.decimals)) || 0n,
  }));
  const total = segments.reduce((acc, s) => acc + s.amount, 0n);

  const update = (patch: Partial<FormState>) => setState((s) => ({ ...s, ...patch }));
  const updateRow = (id: string, patch: Partial<Row>) =>
    setState((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const addRow = () => setState((s) => (s.rows.length >= MAX_DESTINATIONS ? s : { ...s, rows: [...s.rows, newRow()] }));
  const removeRow = (id: string) => setState((s) => ({ ...s, rows: s.rows.length > 1 ? s.rows.filter((r) => r.id !== id) : s.rows }));

  // Splits a total across current rows in exact base units; any remainder goes one unit at
  // a time to the first rows, which the person sees in the amounts before saving.
  const splitTotal = (totalInput: string): string | null => {
    if (!token) return "Pick a token first";
    try {
      const parts = splitEvenly(toRaw(totalInput, token.decimals), state.rows.length);
      setState((s) => ({ ...s, rows: s.rows.map((r, i) => ({ ...r, amount: fromRaw(parts[i], token.decimals) })) }));
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  // Accepts lines of "wallet, amount, label" pasted from a spreadsheet.
  const importLines = (text: string): string | null => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return "Paste at least one line";
    const rows = lines.map((line) => {
      const [wallet = "", amount = "", ...label] = line.split(/[,\t;]/).map((p) => p.trim());
      return newRow({ wallet, amount, label: label.join(" ") });
    });
    const keep = state.rows.filter((r) => r.wallet || r.amount);
    if (keep.length + rows.length > MAX_DESTINATIONS) return `That makes ${keep.length + rows.length} recipients. The limit is ${MAX_DESTINATIONS}.`;
    setState((s) => ({ ...s, rows: [...keep, ...rows] }));
    return null;
  };

  return {
    state,
    token,
    total,
    segments,
    input: compiled.input,
    errors: touched ? compiled.errors : {},
    touch: () => setTouched(true),
    update,
    updateRow,
    addRow,
    removeRow,
    splitTotal,
    importLines,
  };
}
