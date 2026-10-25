"use client";

import { useEffect, useState } from "react";
import { TelegramLogoIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api-client";
import type { CredentialDTO } from "@/lib/workflow/dto";

// Telegram has no OAuth: the user opens our bot from a one-time link in the chat they want
// notified. We watch for the new connection and close as soon as it appears.
export function TelegramLink({ onLinked, onClose }: { onLinked: () => void; onClose: () => void }) {
  const [links, setLinks] = useState<{ chatUrl: string; groupUrl: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let known: number | null = null;
    const countTelegram = async () => {
      const { credentials } = await api<{ credentials: CredentialDTO[] }>("/api/credentials").catch(() => ({ credentials: [] as CredentialDTO[] }));
      return credentials.filter((c) => c.type === "telegram_chat").length;
    };
    void countTelegram().then((n) => (known ??= n));
    api<{ chatUrl: string; groupUrl: string; expiresAt: string }>("/api/connections/telegram", { body: {} })
      .then((l) => alive && setLinks(l))
      .catch((e) => alive && setError(errorMessage(e)));
    const poll = setInterval(async () => {
      const count = await countTelegram();
      if (known === null) known = count;
      else if (count > known && alive) {
        clearInterval(poll);
        onLinked();
      }
    }, 2500);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [onLinked]);

  return (
    <div className="tactile reveal flex flex-col gap-3 rounded-2xl p-5" role="dialog" aria-label="Link a Telegram chat">
      <p className="flex items-center gap-2 font-semibold">
        <TelegramLogoIcon size={18} weight="fill" className="text-[#229ED9]" aria-hidden /> Link a Telegram chat
      </p>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : !links ? (
        <p className="text-sm text-ink-2">Creating a one-time link…</p>
      ) : (
        <>
          <p className="text-sm text-ink-2">Open the link in Telegram and press Start. To notify a group, add the bot to it with the second link. The link works once and expires in 10 minutes.</p>
          <div className="flex flex-wrap gap-2">
            <a href={links.chatUrl} target="_blank" rel="noreferrer" className="press tactile-ink inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold">
              Open in Telegram
            </a>
            <a href={links.groupUrl} target="_blank" rel="noreferrer" className="press tactile inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-ink">
              Add to a group
            </a>
          </div>
          <p className="text-xs text-ink-3">Waiting for the bot to hear from your chat…</p>
        </>
      )}
      <Button variant="quiet" onClick={onClose} className="self-end">
        Close
      </Button>
    </div>
  );
}
