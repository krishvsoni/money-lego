"use client";

import { useRef, type KeyboardEvent } from "react";
import type { CredentialType } from "@/lib/nodes/types";
import { CredentialIcon } from "./credential-icon";
import { CREDENTIAL_META, MANUAL_TYPES as CREDENTIAL_TYPES } from "./credential-types";

// Step one of adding a credential: pick what you're connecting. A real radio group (one
// tab stop, arrows move between options). Only your own secrets are typed in; services
// are connected by signing in on the Connections page.
export function CredentialTypePicker({ value, onChange }: { value: CredentialType | null; onChange: (t: CredentialType) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = value ? CREDENTIAL_TYPES.findIndex((t) => t === value) : -1;

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + CREDENTIAL_TYPES.length) % CREDENTIAL_TYPES.length;
    onChange(CREDENTIAL_TYPES[next]);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="What are you connecting?" className="grid gap-2 sm:grid-cols-2">
      {CREDENTIAL_TYPES.map((t, i) => {
        const selected = t === value;
        return (
          <button
            key={t}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (current === -1 && i === 0) ? 0 : -1}
            onClick={() => onChange(t)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`press flex items-center gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color,box-shadow] duration-150 ${
              selected ? "border-ink bg-white shadow-[0_0_0_1px_var(--ink)]" : "tactile border-line hover:border-line-strong"
            }`}
          >
            <CredentialIcon type={t} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{CREDENTIAL_META[t].label}</span>
              <span className="block truncate text-sm text-ink-2">{CREDENTIAL_META[t].blurb}</span>
            </span>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${selected ? "border-ink bg-ink" : "border-line-strong"}`} aria-hidden>
              {selected && <span className="h-2 w-2 rounded-full bg-white" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
