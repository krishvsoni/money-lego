"use client";

import { useEffect, useState } from "react";
import { TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { api, errorMessage } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";
import type { CredentialDTO } from "@/lib/workflow/dto";
import { CredentialIcon } from "./credential-icon";
import { CREDENTIAL_META } from "./credential-types";

const CONFIRM_MS = 4000;

// Saved credentials. Only the name, kind and a short hint are ever sent to the browser;
// the secret itself stays encrypted on the server. Delete takes two clicks on the same
// spot, so a stray click can't break a running workflow.
export function CredentialList({ credentials, onDelete, onTested }: { credentials: CredentialDTO[]; onDelete: (c: CredentialDTO) => Promise<void>; onTested: () => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {credentials.map((c) => (
        <CredentialRow key={c.id} credential={c} onDelete={onDelete} onTested={onTested} />
      ))}
    </ul>
  );
}

// Green only after the provider itself accepted the credential, never because a field is filled.
function CheckBadge({ check }: { check: CredentialDTO["check"] }) {
  if (!check) return <span className="rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-ink-2">Not verified yet</span>;
  return (
    <span title={check.message} className={`rounded-full px-2 py-0.5 text-xs font-medium ${check.ok ? "bg-success-wash text-success" : "bg-danger-wash text-danger"}`}>
      {check.ok ? "Verified" : "Check failed"} {relativeTime(check.at)}
    </span>
  );
}

function CredentialRow({ credential: c, onDelete, onTested }: { credential: CredentialDTO; onDelete: (c: CredentialDTO) => Promise<void>; onTested: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const toast = useToast();

  const test = async () => {
    setTesting(true);
    try {
      const res = await api<{ credential: CredentialDTO; tested: boolean; message: string }>(`/api/credentials/${c.id}/test`, { body: {} });
      toast(res.message, !res.tested ? "info" : res.credential.check?.ok ? "success" : "error");
      onTested();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [confirming]);

  const click = async () => {
    if (!confirming) return setConfirming(true);
    setBusy(true);
    try {
      await onDelete(c);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <li className="tactile reveal flex items-center gap-3 rounded-2xl p-3">
      <CredentialIcon type={c.type} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">{c.name}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
          <span>{CREDENTIAL_META[c.type].label}</span>
          <span className="rounded-md bg-sunken px-1.5 font-mono text-xs text-ink-2">{c.hint}</span>
          <span className="text-ink-3">added {relativeTime(c.createdAt)}</span>
          <CheckBadge check={c.check} />
        </p>
        {c.check && !c.check.ok && <p className="mt-1 text-xs text-danger">{c.check.message}</p>}
      </div>
      <Button variant="quiet" busy={testing} onClick={test} className="h-9">
        Test
      </Button>
      <Button
        variant={confirming ? "danger" : "quiet"}
        busy={busy}
        onClick={click}
        onBlur={() => !busy && setConfirming(false)}
        aria-label={confirming ? `Confirm delete ${c.name}` : `Delete ${c.name}`}
        className={`h-9 ${confirming ? "" : "w-9 px-0"}`}
      >
        <TrashIcon size={16} aria-hidden />
        {confirming && "Delete?"}
      </Button>
    </li>
  );
}
