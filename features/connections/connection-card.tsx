"use client";

import { useEffect, useState } from "react";
import { TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { api, errorMessage } from "@/lib/api-client";
import { connectionInfo } from "@/lib/connections/catalog";
import { relativeTime } from "@/lib/format";
import type { CredentialDTO } from "@/lib/workflow/dto";
import { CredentialIcon } from "@/features/credentials/credential-icon";
import { PermissionList } from "./permissions";

const CONFIRM_MS = 4000;

// One connected account: who it's signed in as, what it may do, whether it still works.
// Disconnect takes two clicks and gives the access back to the provider before deleting.
export function ConnectionCard({ connection: c, onChanged, onReconnect, reconnecting }: { connection: CredentialDTO; onChanged: () => void; onReconnect: () => void; reconnecting: boolean }) {
  const info = connectionInfo(c.type);
  const toast = useToast();
  const [testing, setTesting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [confirming]);

  const test = async () => {
    setTesting(true);
    try {
      const res = await api<{ tested: boolean; message: string; credential: CredentialDTO }>(`/api/credentials/${c.id}/test`, { body: {} });
      toast(res.message, !res.tested ? "info" : res.credential.check?.ok ? "success" : "error");
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setTesting(false);
    }
  };

  const disconnect = async () => {
    if (!confirming) return setConfirming(true);
    setRemoving(true);
    try {
      await api(`/api/credentials/${c.id}`, { method: "DELETE" });
      toast(`Disconnected ${c.name}. Access was handed back to ${info?.label ?? "the provider"}.`, "success");
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
      setRemoving(false);
    }
  };

  const healthy = c.check?.ok !== false && c.missingScopes.length === 0;
  return (
    <li className="tactile reveal flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <CredentialIcon type={c.type} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{c.account?.name ?? c.name}</p>
          <p className="text-sm text-ink-2">
            {info?.label ?? c.type}
            {c.account?.detail ? ` · ${c.account.detail}` : ""} · connected {relativeTime(c.connectedAt ?? c.createdAt)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${healthy ? "bg-success-wash text-success" : "bg-attention-wash text-attention"}`} title={c.check?.message}>
          {healthy ? "Working" : "Needs attention"}
        </span>
      </div>
      {c.check && !c.check.ok && <p className="rounded-lg bg-attention-wash px-3 py-2 text-xs text-attention">{c.check.message}</p>}
      <div className="rounded-xl bg-sunken p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">What Money Lego can do</p>
        <PermissionList type={c.type} granted={c.scopes} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" busy={testing} onClick={test} className="h-9">
          Test
        </Button>
        <Button variant="quiet" busy={reconnecting} onClick={onReconnect} className="h-9">
          Reconnect
        </Button>
        <Button variant={confirming ? "danger" : "quiet"} busy={removing} onClick={disconnect} onBlur={() => !removing && setConfirming(false)} className="ml-auto h-9">
          <TrashIcon size={15} aria-hidden />
          {confirming ? "Disconnect and revoke?" : "Disconnect"}
        </Button>
      </div>
    </li>
  );
}
