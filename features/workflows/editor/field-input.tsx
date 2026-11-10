"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Plus, X } from "lucide-react";
import { inputClass } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { Field } from "@/lib/nodes/types";
import type { CredentialDTO } from "@/lib/workflow/dto";
import { connectionInfo } from "@/lib/connections/catalog";
import { useConnect, type ConnectResult } from "@/features/connections/use-connect";
import { CredentialForm } from "@/features/credentials/credential-form";

interface Props {
  field: Field;
  value: unknown;
  error?: string;
  rowErrors: Record<string, string>;
  credentials: CredentialDTO[];
  onChange: (value: unknown) => void;
  onCredentialCreated: (c: CredentialDTO) => void;
  onRefreshCredentials: () => Promise<CredentialDTO[]>;
}

const isExpr = (v: unknown) => typeof v === "string" && v.includes("{{");

function PairsInput({ field, value, onChange, rowErrors }: Props & { field: Extract<Field, { kind: "pairs" }> }) {
  const rows = (Array.isArray(value) ? value : []) as Array<Record<string, string>>;
  const set = (i: number, key: string, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i} className="reveal rounded-md border border-line p-2">
          <div className={`grid gap-1.5 ${field.columns.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {field.columns.map((c, ci) =>
              c.kind === "select" ? (
                <Select key={c.key} aria-label={`${c.label} ${i + 1}`} value={row[c.key] ?? ""} onChange={(e) => set(i, c.key, e.target.value)} size="sm">
                  {c.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                // Every box has a visible label: a grey placeholder alone reads as a value
                // already filled in, which hid empty PayPal emails.
                <label key={c.key} className={`flex min-w-0 flex-col gap-0.5 ${field.columns.length > 2 && ci === 0 ? "col-span-2" : ""}`}>
                  <span className="text-[0.6875rem] font-semibold text-ink-3">{c.label}</span>
                  <input
                    aria-label={`${c.label} ${i + 1}`}
                    value={row[c.key] ?? ""}
                    onChange={(e) => set(i, c.key, e.target.value)}
                    placeholder={c.placeholder ? `e.g. ${c.placeholder}` : c.label}
                    spellCheck={false}
                    aria-invalid={Boolean(rowErrors[`${field.key}.${i}.${c.key}`]) || undefined}
                    className={`${inputClass} h-8 text-xs placeholder:text-ink-3/70 ${c.key === "email" ? "font-mono" : ""}`}
                  />
                </label>
              ),
            )}
          </div>
          <div className="mt-1 flex items-start justify-between gap-2">
            <p className="text-[0.6875rem]">
              {field.columns.map((c) => rowErrors[`${field.key}.${i}.${c.key}`]).filter(Boolean).length ? (
                <span className="text-danger">{field.columns.map((c) => rowErrors[`${field.key}.${i}.${c.key}`]).filter(Boolean).join(" ")}</span>
              ) : field.columns.some((c) => c.key === "email") && !String(row.email ?? "").trim() ? (
                <span className="text-attention">No PayPal email: this share stays with the business and isn&apos;t paid out.</span>
              ) : null}
            </p>
            <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="press rounded p-0.5 text-ink-3 hover:text-danger" aria-label={`Remove row ${i + 1}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={() => onChange([...rows, Object.fromEntries(field.columns.map((c) => [c.key, c.options?.[0]?.value ?? ""]))])}
        disabled={rows.length >= field.max}
        className="press flex h-8 items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong text-xs font-semibold text-ink-2 hover:border-ink-3 hover:text-ink disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" /> {field.addLabel}
      </button>
    </div>
  );
}

function CredentialInput({ field, value, onChange, credentials, onCredentialCreated, onRefreshCredentials }: Props & { field: Extract<Field, { kind: "credential" }> }) {
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const options = credentials.filter((c) => c.type === field.credentialType);
  const info = connectionInfo(field.credentialType);
  // Connections are made by signing in; the newest one for this kind is picked automatically.
  const onDone = useCallback(
    async (r: ConnectResult) => {
      setNote(r.ok ? null : r.message);
      if (!r.ok) return;
      const list = await onRefreshCredentials();
      const newest = list.filter((c) => c.type === field.credentialType).sort((a, b) => (b.connectedAt ?? "").localeCompare(a.connectedAt ?? ""))[0];
      if (newest) onChange(newest.id);
    },
    [field.credentialType, onChange, onRefreshCredentials],
  );
  const { busy, connect } = useConnect(onDone);

  if (creating && !info) {
    return (
      <div className="reveal rounded-lg border border-line bg-paper p-3">
        <CredentialForm
          type={field.credentialType}
          onCancel={() => setCreating(false)}
          onCreated={(c) => {
            onCredentialCreated(c);
            onChange(c.id);
            setCreating(false);
          }}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Select id={field.key} value={String(value ?? "")} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">{options.length ? "Choose…" : info ? "Not connected yet" : "None saved yet"}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.account?.name ?? c.name}
              {c.account?.detail ? ` (${c.account.detail})` : c.account ? "" : ` (${c.hint})`}
              {c.check?.ok === false ? " · needs attention" : ""}
            </option>
          ))}
        </Select>
        {info?.method === "oauth" && !info.asks ? (
          <button onClick={() => void connect(info.slug)} disabled={busy !== null} className="press shrink-0 rounded-md border border-line-strong px-2.5 text-xs font-semibold hover:border-ink-3 disabled:opacity-50">
            {busy ? "Waiting…" : "Connect"}
          </button>
        ) : info ? (
          <Link href="/connections" target="_blank" className="press flex shrink-0 items-center rounded-md border border-line-strong px-2.5 text-xs font-semibold hover:border-ink-3">
            Connect
          </Link>
        ) : (
          <button onClick={() => setCreating(true)} className="press shrink-0 rounded-md border border-line-strong px-2.5 text-xs font-semibold hover:border-ink-3">
            New
          </button>
        )}
      </div>
      {note && <p className="text-xs text-danger">{note}</p>}
      {info && !options.length && <p className="text-xs text-ink-3">{info.action} to approve access. Nothing is pasted.</p>}
    </div>
  );
}

export function FieldInput(props: Props) {
  const { field, value, onChange, error } = props;
  const common = { id: field.key, "aria-invalid": Boolean(error) || undefined };
  switch (field.kind) {
    case "pairs":
      return <PairsInput {...props} field={field} />;
    case "credential":
      return <CredentialInput {...props} field={field} />;
    case "boolean":
      return (
        <button
          role="switch"
          aria-checked={Boolean(value)}
          onClick={() => onChange(!value)}
          className={`press relative h-6 w-10 rounded-full transition-colors duration-150 ${value ? "bg-action" : "bg-line-strong"}`}
        >
          <span className="absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform duration-150" style={{ transform: `translateX(${value ? 18 : 2}px)` }} />
        </button>
      );
    case "select":
      return (
        <Select {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    case "number":
      return (
        <input
          {...common}
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className={inputClass}
        />
      );
    case "json":
    case "textarea":
      return (
        <textarea
          {...common}
          rows={field.kind === "json" ? 5 : 3}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          spellCheck={field.kind !== "json"}
          className={`${inputClass} h-auto py-2 ${field.kind === "json" || isExpr(value) ? "font-mono text-xs" : ""}`}
        />
      );
    default:
      return (
        <input
          {...common}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          spellCheck={false}
          className={`${inputClass} ${isExpr(value) ? "font-mono text-xs" : ""}`}
        />
      );
  }
}
