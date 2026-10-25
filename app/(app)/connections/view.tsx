"use client";

import { useCallback, useState } from "react";
import { LockKeyIcon, PlusIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { api, errorMessage } from "@/lib/api-client";
import { connectionInfo, type ConnectionInfo } from "@/lib/connections/catalog";
import type { ConnectionType } from "@/lib/nodes/types";
import type { CredentialDTO } from "@/lib/workflow/dto";
import { useResource } from "@/lib/use-resource";
import { ConnectGrid } from "@/features/connections/connect-grid";
import { ConnectionCard } from "@/features/connections/connection-card";
import { TelegramLink } from "@/features/connections/telegram-link";
import { useConnect, type ConnectResult } from "@/features/connections/use-connect";
import { CredentialForm } from "@/features/credentials/credential-form";
import { CredentialList } from "@/features/credentials/credential-list";
import { isManual } from "@/features/credentials/credential-types";

// Settings for everything Money Lego acts through. Services are connected by signing in
// with your own account and approving specific permissions; each card shows what was
// granted and can be tested, reconnected or disconnected (which revokes access).
export function View() {
  const creds = useResource<{ credentials: CredentialDTO[] }>("/api/credentials");
  const avail = useResource<{ available: Partial<Record<ConnectionType, boolean>> }>("/api/connections");
  const toast = useToast();
  const [telegram, setTelegram] = useState(false);
  const [adding, setAdding] = useState(false);
  const reload = creds.reload;

  const onDone = useCallback(
    (r: ConnectResult) => {
      toast(r.message, r.ok ? "success" : "error");
      reload();
    },
    [toast, reload],
  );
  const { busy, connect } = useConnect(onDone);
  const start = (info: ConnectionInfo, shop?: string) => void connect(info.slug, { shop });

  const all = creds.data?.credentials ?? [];
  const connections = all.filter((c) => !isManual(c.type));
  const manual = all.filter((c) => isManual(c.type));

  const removeManual = async (c: CredentialDTO) => {
    try {
      await api(`/api/credentials/${c.id}`, { method: "DELETE" });
      toast(`Deleted ${c.name}.`, "success");
      reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-12">
      <header>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] text-ink">Connections</h1>
        <p className="mt-2 flex items-start gap-2 text-ink-2">
          <ShieldCheckIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-success" aria-hidden />
          Sign in with your own accounts and approve exactly what Money Lego may do. Access is encrypted on the server, never shown back, and you can revoke it here at any time.
        </p>
      </header>

      {creds.error && <p role="alert" className="rounded-xl bg-danger-wash p-3 text-sm text-danger">{creds.error}</p>}

      <section aria-labelledby="own">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="own" className="flex items-center gap-2 font-display text-xl font-semibold">
              <LockKeyIcon size={18} aria-hidden /> Your own secrets
            </h2>
            <p className="mt-1 text-sm text-ink-2">For your own systems only: a signing secret for events your app sends, or an auth header for your own API.</p>
          </div>
          {!adding && (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <PlusIcon size={16} weight="bold" aria-hidden /> Add
            </Button>
          )}
        </div>
        {adding && (
          <div className="tactile reveal mt-4 rounded-2xl p-5">
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
        {manual.length > 0 && (
          <div className="mt-4">
            <CredentialList credentials={manual} onDelete={removeManual} onTested={reload} />
          </div>
        )}
      </section>

      {connections.length > 0 && (
        <section aria-labelledby="connected">
          <h2 id="connected" className="font-display text-xl font-semibold">Connected</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {connections.map((c) => (
              <ConnectionCard
                key={c.id}
                connection={c}
                onChanged={reload}
                reconnecting={busy === connectionInfo(c.type)?.slug}
                onReconnect={() => {
                  const info = connectionInfo(c.type);
                  if (!info) return;
                  if (info.method === "telegram") setTelegram(true);
                  else start(info, info.asks === "shop" ? c.account?.id : undefined);
                }}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="add">
        <h2 id="add" className="font-display text-xl font-semibold">{connections.length ? "Connect another" : "Connect your services"}</h2>
        <p className="mt-1 text-sm text-ink-2">Each opens the service&apos;s own sign-in. Templates tell you which ones they need.</p>
        {telegram && (
          <div className="mt-4">
            <TelegramLink
              onClose={() => setTelegram(false)}
              onLinked={() => {
                setTelegram(false);
                toast("Telegram chat linked.", "success");
                reload();
              }}
            />
          </div>
        )}
        <div className="mt-4">
          <ConnectGrid available={avail.data?.available ?? null} busy={busy} onConnect={start} onTelegram={() => setTelegram(true)} />
        </div>
      </section>

    </div>
  );
}
