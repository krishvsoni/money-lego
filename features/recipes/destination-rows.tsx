"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { MAX_DESTINATIONS } from "@/lib/recipe-schema";
import { brickColor } from "./allocation-bar";
import type { Row } from "./use-recipe-form";

interface Props {
  rows: Row[];
  symbol: string;
  errors: Record<string, string>;
  onChange: (id: string, patch: Partial<Row>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onSplit: (total: string) => string | null;
  onImport: (text: string) => string | null;
}

function Tool({ title, placeholder, action, multiline, onSubmit }: { title: string; placeholder: string; action: string; multiline?: boolean; onSubmit: (v: string) => string | null }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const problem = onSubmit(value);
    setError(problem);
    if (!problem) setValue("");
  };
  return (
    <div className="reveal mt-3 rounded-lg bg-sunken p-3">
      <p className="text-sm font-semibold">{title}</p>
      <div className={`mt-2 flex gap-2 ${multiline ? "flex-col" : ""}`}>
        {multiline ? (
          <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} rows={4} className={`${inputClass} h-auto py-2 font-mono text-xs`} />
        ) : (
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} inputMode="decimal" className={inputClass} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())} />
        )}
        <Button type="button" variant="secondary" onClick={submit} className="self-start">
          {action}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function DestinationRows({ rows, symbol, errors, onChange, onAdd, onRemove, onSplit, onImport }: Props) {
  const [tool, setTool] = useState<"split" | "paste" | null>(null);

  return (
    <div>
      <div className="hidden grid-cols-[18px_1fr_150px_150px_36px] gap-3 px-1 pb-2 text-xs font-semibold text-ink-3 sm:grid">
        <span />
        <span>Wallet address</span>
        <span>Amount ({symbol})</span>
        <span>Private label</span>
        <span />
      </div>
      <ol className="flex flex-col gap-3 sm:gap-2">
        {rows.map((row, i) => {
          const walletError = errors[`rows.${i}.wallet`];
          const amountError = errors[`rows.${i}.amount`];
          return (
            <li key={row.id} className="reveal grid grid-cols-[18px_1fr_36px] gap-x-3 gap-y-2 rounded-lg border border-line p-3 sm:grid-cols-[18px_1fr_150px_150px_36px] sm:items-start sm:border-0 sm:p-1">
              <span className="mt-3 h-3 w-3 rounded-[3px]" style={{ background: brickColor(i) }} aria-hidden />
              <div className="min-w-0">
                <input
                  aria-label={`Recipient ${i + 1} wallet`}
                  value={row.wallet}
                  onChange={(e) => onChange(row.id, { wallet: e.target.value })}
                  placeholder="Solana wallet address"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={Boolean(walletError) || undefined}
                  className={`${inputClass} font-mono text-[0.8125rem]`}
                />
                {walletError && <p className="mt-1 text-xs text-danger">{walletError}</p>}
              </div>
              <button
                type="button"
                onClick={() => onRemove(row.id)}
                disabled={rows.length === 1}
                aria-label={`Remove recipient ${i + 1}`}
                className="press row-span-1 mt-1 h-8 w-8 rounded-md text-ink-3 hover:bg-danger-wash hover:text-danger disabled:opacity-30 sm:order-last"
              >
                ✕
              </button>
              <div className="col-start-2 sm:col-start-auto">
                <input
                  aria-label={`Recipient ${i + 1} amount`}
                  value={row.amount}
                  onChange={(e) => onChange(row.id, { amount: e.target.value })}
                  placeholder="0.00"
                  inputMode="decimal"
                  aria-invalid={Boolean(amountError) || undefined}
                  className={`${inputClass} text-right`}
                />
                {amountError && <p className="mt-1 text-xs text-danger">{amountError}</p>}
              </div>
              <input
                aria-label={`Recipient ${i + 1} label`}
                value={row.label}
                onChange={(e) => onChange(row.id, { label: e.target.value })}
                placeholder="e.g. Design lead"
                maxLength={60}
                className={`${inputClass} col-start-2 sm:col-start-auto`}
              />
            </li>
          );
        })}
      </ol>
      {errors.rows && <p className="mt-2 text-sm text-danger">{errors.rows}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={onAdd} disabled={rows.length >= MAX_DESTINATIONS}>
          Add recipient
        </Button>
        <Button type="button" variant="quiet" onClick={() => setTool(tool === "split" ? null : "split")} aria-expanded={tool === "split"}>
          Split a total evenly
        </Button>
        <Button type="button" variant="quiet" onClick={() => setTool(tool === "paste" ? null : "paste")} aria-expanded={tool === "paste"}>
          Paste a list
        </Button>
        <span className="ml-auto text-xs text-ink-3">
          {rows.length} of {MAX_DESTINATIONS}
        </span>
      </div>
      {tool === "split" && <Tool title={`Total to split across ${rows.length} recipients`} placeholder={`e.g. 4200 ${symbol}`} action="Split" onSubmit={onSplit} />}
      {tool === "paste" && (
        <Tool title="One recipient per line: wallet, amount, optional label" placeholder={"9WzD…AWWM, 1600, Design\n7xKX…gAsU, 1400, Engineering"} action="Add these" multiline onSubmit={onImport} />
      )}
    </div>
  );
}
