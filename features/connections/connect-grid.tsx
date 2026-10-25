"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { CONNECTIONS, type ConnectionInfo } from "@/lib/connections/catalog";
import type { ConnectionType } from "@/lib/nodes/types";
import { CredentialIcon } from "@/features/credentials/credential-icon";

// Every service Money Lego can connect to. Each tile signs in with the provider; services
// whose app isn't registered on this server say so instead of pretending to work.
export function ConnectGrid({
  available,
  busy,
  onConnect,
  onTelegram,
  only,
}: {
  available: Partial<Record<ConnectionType, boolean>> | null;
  busy: string | null;
  onConnect: (info: ConnectionInfo, shop?: string) => void;
  onTelegram: () => void;
  only?: ConnectionType[];
}) {
  const list = only ? CONNECTIONS.filter((c) => only.includes(c.type)) : CONNECTIONS;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {list.map((c) => (
        <Tile key={c.type} info={c} available={available?.[c.type] ?? null} busy={busy === c.slug} onConnect={onConnect} onTelegram={onTelegram} />
      ))}
    </ul>
  );
}

function Tile({ info, available, busy, onConnect, onTelegram }: { info: ConnectionInfo; available: boolean | null; busy: boolean; onConnect: (info: ConnectionInfo, shop?: string) => void; onTelegram: () => void }) {
  const [shop, setShop] = useState("");
  const [asking, setAsking] = useState(false);
  const submitShop = (e: FormEvent) => {
    e.preventDefault();
    onConnect(info, shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
  };
  const click = () => (info.method === "telegram" ? onTelegram() : info.asks === "shop" ? setAsking(true) : onConnect(info));
  return (
    <li className="tactile flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <CredentialIcon type={info.type} size="sm" />
        <div className="min-w-0">
          <p className="font-semibold text-ink">{info.label}</p>
          <p className="text-sm text-ink-2">{info.blurb}</p>
        </div>
      </div>
      {asking ? (
        <form onSubmit={submitShop} className="flex gap-2">
          <input autoFocus value={shop} onChange={(e) => setShop(e.target.value)} placeholder="your-store.myshopify.com" aria-label="Store domain" className={`${inputClass} h-9 text-sm`} />
          <Button type="submit" busy={busy} className="h-9">
            Continue
          </Button>
        </form>
      ) : (
        <Button variant="secondary" onClick={click} busy={busy} disabled={available === false} className="h-9 self-start" title={available === false ? "This server has no app registered for this service yet." : undefined}>
          {available === false ? "Not set up on this server" : info.action}
        </Button>
      )}
    </li>
  );
}
