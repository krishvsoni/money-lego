import { CheckIcon, WarningIcon } from "@phosphor-icons/react";
import { connectionInfo } from "@/lib/connections/catalog";

// The permissions a connection asked for, ticked when the provider actually granted them.
// A required one that's missing (Google lets people untick boxes) is shown as a warning.
export function PermissionList({ type, granted }: { type: string; granted: string[] | null }) {
  const info = connectionInfo(type);
  if (!info) return null;
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {info.permissions.map((p) => {
        const has = granted === null || granted.includes(p.scope) || info.method === "telegram" || p.scope === "pages";
        const required = info.required.includes(p.scope);
        return (
          <li key={p.scope} className="flex items-start gap-2">
            {has ? <CheckIcon size={15} weight="bold" className="mt-0.5 shrink-0 text-success" aria-label="Granted" /> : <WarningIcon size={15} weight="fill" className="mt-0.5 shrink-0 text-attention" aria-label="Not granted" />}
            <span className={has ? "text-ink-2" : "text-attention"}>
              {p.label}
              {!has && (required ? " — not granted, reconnect and allow it" : " — not granted")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
