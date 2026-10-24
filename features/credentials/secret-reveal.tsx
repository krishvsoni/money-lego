"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, WarningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

// A generated signing secret is shown exactly once. Copy is one click, and the person has
// to confirm they stored it before the screen lets them move on.
export function SecretReveal({ secret, onDone }: { secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [stored, setStored] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-xl bg-attention-wash p-3 text-sm text-attention">
        <WarningIcon size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
        <p>Copy this secret now. It won&apos;t be shown again, not even to you.</p>
      </div>
      <div className="tactile flex items-center gap-2 rounded-xl p-1.5 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{secret}</code>
        <Button variant={copied ? "secondary" : "primary"} className="h-9" onClick={copy}>
          {copied ? <CheckIcon size={16} weight="bold" aria-hidden /> : <CopyIcon size={16} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-sm text-ink-2">
        Give it to the system that sends events. It signs each body with HMAC SHA256 and sends <code className="font-mono text-xs">x-money-lego-signature: sha256=&lt;hex&gt;</code>.
      </p>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={stored} onChange={(e) => setStored(e.target.checked)} className="h-4 w-4 accent-[var(--ink)]" />
        I&apos;ve stored it somewhere safe
      </label>
      <div className="flex justify-end">
        <Button onClick={onDone} disabled={!stored}>
          Done
        </Button>
      </div>
    </div>
  );
}
