"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import type { CredentialType } from "@/lib/nodes/types";
import type { CredentialDTO } from "@/lib/workflow/dto";
import { CredentialIcon } from "./credential-icon";
import { CredentialTypePicker } from "./credential-type-picker";
import { CREDENTIAL_META, URL_HELP } from "./credential-types";
import { SecretReveal } from "./secret-reveal";

export { CREDENTIAL_LABEL } from "./credential-types";

type Errors = Partial<Record<"name" | "url" | "value", string>>;

// Client checks mirror the server's rules so mistakes show up inline before a round
// trip. The server still validates everything; these only save the person a wait.
function check(kind: CredentialType, name: string, url: string, value: string): Errors {
  const errors: Errors = {};
  if (!name.trim()) errors.name = "Give it a name you'll recognise later.";
  if (kind === "discord_webhook" || kind === "slack_webhook") {
    if (!url.trim()) errors.url = "Paste the webhook URL.";
    else if (!/^https:\/\//.test(url.trim())) errors.url = "Webhook URLs start with https://";
  }
  if (kind === "http_header" && !value.trim()) errors.value = "Add the header value, for example a bearer token.";
  return errors;
}

// Creates one credential. Pick what you're connecting, then fill in only the fields that
// kind needs. Secrets go straight to the server and are never shown again, except a
// generated signing secret, which is revealed exactly once.
export function CredentialForm({ type, onCreated, onCancel }: { type?: CredentialType; onCreated: (c: CredentialDTO) => void; onCancel?: () => void }) {
  const [kind, setKind] = useState<CredentialType | null>(type ?? null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [header, setHeader] = useState("Authorization");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ credential: CredentialDTO; secret: string } | null>(null);

  const errors = kind && touched ? check(kind, name, url, value) : {};

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!kind) return;
    setTouched(true);
    if (Object.keys(check(kind, name, url, value)).length) return;
    setBusy(true);
    setError(null);
    const body =
      kind === "webhook_secret" ? { type: kind, name: name.trim() } : kind === "http_header" ? { type: kind, name: name.trim(), header, value } : { type: kind, name: name.trim(), url: url.trim() };
    try {
      const res = await api<{ credential: CredentialDTO; revealOnce?: string }>("/api/credentials", { body });
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
          {(kind === "discord_webhook" || kind === "slack_webhook") && (
            <Field label="Webhook URL" htmlFor="cred-url" hint={URL_HELP[kind]} error={errors.url}>
              <TextInput id="cred-url" value={url} invalid={!!errors.url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoComplete="off" spellCheck={false} />
            </Field>
          )}
          {kind === "http_header" && (
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <Field label="Header" htmlFor="cred-header">
                <TextInput id="cred-header" value={header} onChange={(e) => setHeader(e.target.value)} spellCheck={false} />
              </Field>
              <Field label="Value" htmlFor="cred-value" hint="Stored encrypted. Never sent back to the browser." error={errors.value}>
                <TextInput id="cred-value" type="password" value={value} invalid={!!errors.value} onChange={(e) => setValue(e.target.value)} placeholder="Bearer …" autoComplete="off" />
              </Field>
            </div>
          )}
          {kind === "webhook_secret" && <p className="rounded-xl bg-sunken p-3 text-sm text-ink-2">We generate a strong secret when you save and show it to you once.</p>}
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
          {kind === "webhook_secret" ? "Generate secret" : "Save credential"}
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
