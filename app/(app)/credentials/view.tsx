"use client";

import { useState } from "react";
import { PlusIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { api, errorMessage } from "@/lib/api-client";
import type { CredentialDTO } from "@/lib/workflow/dto";
import { useResource } from "@/lib/use-resource";
import { CredentialForm } from "@/features/credentials/credential-form";
import { CredentialList } from "@/features/credentials/credential-list";

export function View() {
  const { data, error, reload } = useResource<{ credentials: CredentialDTO[] }>("/api/credentials");
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const credentials = data?.credentials ?? [];

  const remove = async (c: CredentialDTO) => {
    try {
      await api(`/api/credentials/${c.id}`, { method: "DELETE" });
      toast(`Deleted ${c.name}. Workflows using it will stop at that step until you pick another.`, "success");
      reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <div className="mx-auto max-w-[720px]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] text-ink">Credentials</h1>
          <p className="mt-2 flex items-center gap-2 text-base text-ink-2">
            <ShieldCheckIcon size={18} weight="fill" className="shrink-0 text-success" aria-hidden />
            Encrypted on the server. Never shown again after you save.
          </p>
        </div>
        {!adding && credentials.length > 0 && (
          <Button onClick={() => setAdding(true)}>
            <PlusIcon size={16} weight="bold" aria-hidden />
            Add credential
          </Button>
        )}
      </header>

      {adding && (
        <div className="tactile reveal mt-8 rounded-2xl p-5">
          <CredentialForm
            onCancel={() => setAdding(false)}
            onCreated={(c) => {
              setAdding(false);
              reload();
              toast(`Saved ${c.name}`, "success");
            }}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-6 rounded-xl bg-danger-wash p-3 text-sm text-danger">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="mt-8 flex flex-col gap-2" aria-label="Loading credentials">
          {[0, 1].map((i) => (
            <div key={i} className="h-[66px] animate-pulse rounded-2xl bg-sunken" />
          ))}
        </div>
      )}

      {data && credentials.length > 0 && (
        <section className="mt-8" aria-label="Saved credentials">
          <p className="mb-3 text-sm text-ink-3">
            {credentials.length} saved
          </p>
          <CredentialList credentials={credentials} onDelete={remove} />
        </section>
      )}

      {data && credentials.length === 0 && !adding && (
        <div className="tactile-soft mt-8 flex flex-col items-center rounded-2xl px-6 py-12 text-center">
          <span className="tactile flex h-12 w-12 items-center justify-center rounded-2xl text-ink" aria-hidden>
            <ShieldCheckIcon size={24} weight="fill" />
          </span>
          <h2 className="mt-4 font-display text-2xl font-semibold text-ink">No credentials yet</h2>
          <p className="mt-2 max-w-[420px] text-base text-ink-2 text-pretty">Connect Discord or Slack for alerts, verify incoming webhooks, or call your own API. You add each one once and pick it in any workflow.</p>
          <Button className="mt-6" onClick={() => setAdding(true)}>
            <PlusIcon size={16} weight="bold" aria-hidden />
            Add your first credential
          </Button>
        </div>
      )}
    </div>
  );
}
