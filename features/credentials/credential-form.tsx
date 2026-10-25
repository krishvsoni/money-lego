"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, TextInput } from "@/components/ui/field";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import type { CredentialType } from "@/lib/nodes/types";
import type { CredentialDTO } from "@/lib/workflow/dto";
import { CredentialIcon } from "./credential-icon";
import { CredentialTypePicker } from "./credential-type-picker";
import { CREDENTIAL_META } from "./credential-types";
import { SecretReveal } from "./secret-reveal";

export { CREDENTIAL_LABEL } from "./credential-types";

type Values = Record<string, string>;

// Client checks mirror the server's rules so mistakes show up inline before a round
// trip. The server still validates everything; these only save the person a wait.
function check(kind: CredentialType, name: string, values: Values): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = "Give it a name you'll recognise later.";
  for (const input of CREDENTIAL_META[kind].inputs) {
    const value = (values[input.key] ?? "").trim();
    if (!value) {
      if (!input.optional) errors[input.key] = `Add the ${input.label.toLowerCase()}.`;
    } else if (input.pattern && !input.pattern.test(value)) errors[input.key] = input.patternMessage ?? `${input.label} looks wrong.`;
  }
  return errors;
}

const initialValues = (kind: CredentialType | null): Values => (kind === "http_header" ? { header: "Authorization" } : {});

// Creates one credential. Pick what you're connecting, then fill in only the fields that
// kind needs. Secrets go straight to the server and are never shown again, except a
// secret we generate, which is revealed exactly once.
export function CredentialForm({ type, onCreated, onCancel }: { type?: CredentialType; onCreated: (c: CredentialDTO) => void; onCancel?: () => void }) {
  const [kind, setKindState] = useState<CredentialType | null>(type ?? null);
  const [name, setName] = useState("");
  const [values, setValues] = useState<Values>(() => initialValues(type ?? null));
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ credential: CredentialDTO; secret: string } | null>(null);

  const setKind = (k: CredentialType) => {
    setKindState(k);
    setValues(initialValues(k));
    setTouched(false);
  };
  const errors = kind && touched ? check(kind, name, values) : {};
  const meta = kind ? CREDENTIAL_META[kind] : null;
  const generating = Boolean(meta?.generates && !meta.inputs.some((i) => (values[i.key] ?? "").trim()));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!kind || !meta) return;
    setTouched(true);
    if (Object.keys(check(kind, name, values)).length) return;
    setBusy(true);
    setError(null);
    const fields = Object.fromEntries(meta.inputs.map((i) => [i.key, (values[i.key] ?? "").trim()]).filter(([, v]) => v));
    try {
      const res = await api<{ credential: CredentialDTO; revealOnce?: string }>("/api/credentials", { body: { type: kind, name: name.trim(), ...fields } });
      if (res.revealOnce) setRevealed({ credential: res.credential, secret: res.revealOnce });
      else onCreated(res.credential);
    } catch (err) {
      setError(err instanceof ApiError && err.issues.length ? err.issues.map((i) => i.message).join(" ") : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (revealed) return <SecretReveal secret={revealed.secret} onDone={() => onCreated(revealed.credential)} />;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {type ? (
        <div className="flex items-center gap-3">
          <CredentialIcon type={type} size="sm" />
          <div>
            <p className="text-sm font-semibold text-ink">New {CREDENTIAL_META[type].label.toLowerCase()}</p>
            <p className="text-xs text-ink-2">{CREDENTIAL_META[type].blurb}</p>
          </div>
        </div>
      ) : (
        <section aria-labelledby="cred-step-type">
          <StepLabel id="cred-step-type" n={1} done={kind !== null}>
            What are you connecting?
          </StepLabel>
          <div className="mt-3">
            <CredentialTypePicker value={kind} onChange={setKind} />
          </div>
        </section>
      )}

      {kind && (
        <section aria-labelledby="cred-step-details" className="reveal flex flex-col gap-4">
          {!type && (
            <StepLabel id="cred-step-details" n={2} done={false}>
              Details
            </StepLabel>
          )}
          <Field label="Name" htmlFor="cred-name" hint="Only you see this. It's how you'll pick it in a workflow." error={errors.name}>
            <TextInput id="cred-name" value={name} invalid={!!errors.name} onChange={(e) => setName(e.target.value)} placeholder={`${CREDENTIAL_META[kind].label} for payouts`} maxLength={60} autoFocus={!type} />
          </Field>
          {meta?.inputs.map((input) => (
            <Field key={input.key} label={input.optional ? `${input.label} (optional)` : input.label} htmlFor={`cred-${input.key}`} hint={input.hint} error={errors[input.key]}>
              {input.kind === "textarea" ? (
                <textarea
                  id={`cred-${input.key}`}
                  value={values[input.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [input.key]: e.target.value }))}
                  placeholder={input.placeholder}
                  rows={5}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={Boolean(errors[input.key]) || undefined}
                  className={`${inputClass} h-auto py-2 font-mono text-xs`}
                />
              ) : (
                <TextInput
                  id={`cred-${input.key}`}
                  type={input.kind === "secret" ? "password" : "text"}
                  value={values[input.key] ?? ""}
                  invalid={!!errors[input.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [input.key]: e.target.value }))}
                  placeholder={input.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </Field>
          ))}
          {generating && <p className="rounded-xl bg-sunken p-3 text-sm text-ink-2">We generate a strong secret when you save and show it to you once.</p>}
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-danger-wash p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        {onCancel && (
          <Button type="button" variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" busy={busy} disabled={!kind}>
          {generating ? "Generate secret" : "Save credential"}
        </Button>
      </div>
    </form>
  );
}

function StepLabel({ id, n, done, children }: { id: string; n: number; done: boolean; children: string }) {
  return (
    <h3 id={id} className="flex items-center gap-2 text-sm font-semibold text-ink">
      <span className={`num flex h-5 w-5 items-center justify-center rounded-full text-xs transition-colors ${done ? "bg-ink text-white" : "bg-sunken text-ink-2"}`} aria-hidden>
        {n}
      </span>
      {children}
    </h3>
  );
}
