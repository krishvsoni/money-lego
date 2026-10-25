"use client";

import Link from "next/link";
import { CheckCircleIcon, WarningIcon } from "@phosphor-icons/react";
import { PROVIDERS } from "@/lib/nodes/providers";
import type { CredentialDTO, TemplateDetailDTO } from "@/lib/workflow/dto";
import { CREDENTIAL_LABEL } from "@/features/credentials/credential-types";
import { ProviderMark } from "./provider-badges";

// What this template needs from you, checked against the accounts you've connected. You
// still pick the connection on each node after importing, since templates never carry one.
export function ConnectionList({ connections, credentials }: { connections: TemplateDetailDTO["requiredConnections"]; credentials: CredentialDTO[] | null }) {
  return (
    <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
      {connections.map((c) => {
        const saved = c.credentialType ? (credentials ?? []).filter((k) => k.type === c.credentialType) : [];
        const verified = saved.some((k) => k.check?.ok);
        const state = !c.credentialType ? "none" : verified ? "verified" : saved.length ? "saved" : "missing";
        return (
          <li key={`${c.provider}:${c.credentialType}`} className="flex items-start gap-3 p-4">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sunken">
              <ProviderMark id={c.provider} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {PROVIDERS[c.provider]?.label ?? c.provider}
                {c.credentialType && <span className="font-normal text-ink-2"> · {CREDENTIAL_LABEL[c.credentialType]}</span>}
              </p>
              <p className="mt-0.5 text-sm text-ink-2">{c.why}</p>
              {c.fields.length > 0 && <p className="mt-1 text-xs text-ink-3">{c.fields.length} field{c.fields.length > 1 ? "s" : ""} to fill in after importing.</p>}
            </div>
            {state === "verified" && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-success">
                <CheckCircleIcon size={14} weight="fill" aria-hidden /> Connected
              </span>
            )}
            {state === "saved" && <span className="shrink-0 text-xs font-semibold text-attention">Connected, needs attention</span>}
            {state === "missing" && (
              <Link href="/connections" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-attention hover:underline">
                <WarningIcon size={14} weight="fill" aria-hidden /> Connect
              </Link>
            )}
            {state === "none" && <span className="shrink-0 text-xs font-semibold text-ink-3">No credential needed</span>}
          </li>
        );
      })}
    </ul>
  );
}
