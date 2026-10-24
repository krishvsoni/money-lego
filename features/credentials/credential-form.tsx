"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, TextInput } from "@/components/ui/field";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import type { CredentialType } from "@/lib/nodes/types";
import type { CredentialDTO } from "@/lib/workflow/dto";

export const CREDENTIAL_LABEL: Record<CredentialType, string> = {
  webhook_secret: "Webhook signing secret",
  discord_webhook: "Discord webhook",
  slack_webhook: "Slack webhook",
  http_header: "HTTP auth header",
};

// Creates one credential. Secrets go straight to the server and are never shown again,
// except a generated webhook signing secret, which is revealed exactly once.
export function CredentialForm({ type, onCreated, onCancel }: { type?: CredentialType; onCreated: (c: CredentialDTO) => void; onCancel?: () => void }) {
  const [kind, setKind] = useState<CredentialType>(type ?? "discord_webhook");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [header, setHeader] = useState("Authorization");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ credential: CredentialDTO; secret: string } | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const body =
      kind === "webhook_secret" ? { type: kind, name } : kind === "http_header" ? { type: kind, name, header, value } : { type: kind, name, url };
    try {
      const res = await api<{ credential: CredentialDTO; revealOnce?: string }>("/api/credentials", { body });
      if (res.revealOnce) setRevealed({ credential: res.credential, secret: res.revealOnce });
      else onCreated(res.credential);
    } catch (e) {
      setError(e instanceof ApiError && e.issues.length ? e.issues.map((i) => i.message).join(" ") : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (revealed) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold">Copy this secret now. It won&apos;t be shown again.</p>
        <code className="block break-all rounded-md bg-sunken p-3 font-mono text-xs">{revealed.secret}</code>
        <p className="text-xs text-ink-2">Give it to the system that sends events. It signs each body with HMAC-SHA256 and sends x-money-lego-signature: sha256=&lt;hex&gt;.</p>
        <Button onClick={() => onCreated(revealed.credential)}>I&apos;ve stored it</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!type && (
        <Field label="Type" htmlFor="cred-type">
          <select id="cred-type" value={kind} onChange={(e) => setKind(e.target.value as CredentialType)} className={inputClass}>
            {Object.entries(CREDENTIAL_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Name" htmlFor="cred-name" hint="Only you see this.">
        <TextInput id="cred-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${CREDENTIAL_LABEL[kind]} for payouts`} maxLength={60} />
      </Field>
      {(kind === "discord_webhook" || kind === "slack_webhook") && (
        <Field label="Webhook URL" htmlFor="cred-url" hint={kind === "discord_webhook" ? "Channel settings, Integrations, Webhooks, Copy URL." : "Slack app, Incoming Webhooks, Copy URL."}>
          <TextInput id="cred-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoComplete="off" spellCheck={false} />
        </Field>
      )}
      {kind === "http_header" && (
        <div className="grid grid-cols-[120px_1fr] gap-2">
          <Field label="Header" htmlFor="cred-header">
            <TextInput id="cred-header" value={header} onChange={(e) => setHeader(e.target.value)} />
          </Field>
          <Field label="Value" htmlFor="cred-value">
            <TextInput id="cred-value" type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Bearer …" autoComplete="off" />
          </Field>
        </div>
      )}
      {kind === "webhook_secret" && <p className="text-xs text-ink-2">We generate a strong secret for you and show it once.</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={submit} busy={busy} disabled={!name.trim()}>
          Save credential
        </Button>
      </div>
    </div>
  );
}
