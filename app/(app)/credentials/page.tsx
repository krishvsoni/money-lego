"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { api, errorMessage } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";
import type { CredentialDTO } from "@/lib/workflow/dto";
import { useResource } from "@/lib/use-resource";
import { CREDENTIAL_LABEL, CredentialForm } from "@/features/credentials/credential-form";

export default function CredentialsPage() {
  const { data, error, reload } = useResource<{ credentials: CredentialDTO[] }>("/api/credentials");
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  const remove = async (c: CredentialDTO) => {
    if (!window.confirm(`Delete “${c.name}”? Workflows using it will stop at that node until you pick another.`)) return;
    try {
      await api(`/api/credentials/${c.id}`, { method: "DELETE" });
      toast("Credential deleted", "success");
      reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <div className="max-w-[720px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="headline text-3xl">Credentials</h1>
          <p className="mt-2 text-ink-2">Secrets for connectors. Encrypted on the server and never shown again after you save them.</p>
        </div>
        {!adding && <Button onClick={() => setAdding(true)}>Add credential</Button>}
      </div>
      {adding && (
        <div className="reveal mt-6 rounded-xl border border-line bg-surface p-5">
          <CredentialForm
            onCancel={() => setAdding(false)}
            onCreated={() => {
              setAdding(false);
              reload();
              toast("Credential saved", "success");
            }}
          />
        </div>
      )}
      {error && <p role="alert" className="mt-6 text-danger">{error}</p>}
      <ul className="mt-6 divide-y divide-line">
        {data?.credentials.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-4 py-3">
            <span>
              <span className="block font-semibold">{c.name}</span>
              <span className="block text-sm text-ink-2">
                {CREDENTIAL_LABEL[c.type]}, <span className="font-mono text-xs">{c.hint}</span>, added {relativeTime(c.createdAt)}
              </span>
            </span>
            <Button variant="danger" className="h-8" onClick={() => remove(c)}>
              Delete
            </Button>
          </li>
        ))}
        {data && data.credentials.length === 0 && !adding && <li className="py-6 text-sm text-ink-2">No credentials yet. Add a Discord or Slack webhook, an HTTP header, or a webhook signing secret.</li>}
      </ul>
    </div>
  );
}
