"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { CONNECT_MESSAGE } from "@/features/connections/use-connect";


const safePath = (p: string | null) => (p && /^\/(?!\/)/.test(p) ? p : "/connections");

// Where providers land after consent. In a popup it reports back to the page that opened
// it (same origin only) and closes; otherwise it shows the result and returns you.
export function View() {
  const params = useSearchParams();
  const router = useRouter();
  const ok = params.get("status") === "ok";
  const message = (params.get("message") ?? "").slice(0, 300);
  const returnTo = safePath(params.get("returnTo"));

  useEffect(() => {
    if (params.get("popup") === "1") {
      const payload = { source: CONNECT_MESSAGE, ok, type: params.get("type") ?? "", message };
      // opener can be null if the browser severed it while the popup was on the provider's site.
      window.opener?.postMessage(payload, window.location.origin);
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(CONNECT_MESSAGE);
        channel.postMessage(payload);
        channel.close();
      }
      window.close();
      return;
    }
    if (ok) {
      const t = setTimeout(() => router.replace(returnTo), 1500);
      return () => clearTimeout(t);
    }
  }, [ok, message, params, returnTo, router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      {ok ? <CheckCircleIcon size={40} weight="fill" className="text-success" aria-hidden /> : <WarningCircleIcon size={40} weight="fill" className="text-danger" aria-hidden />}
      <h1 className="font-display text-2xl font-semibold">{ok ? "Connected" : "Not connected"}</h1>
      <p className="text-ink-2" role={ok ? "status" : "alert"}>{message}</p>
      <Link href={returnTo} className="text-sm font-semibold underline underline-offset-2">
        Continue
      </Link>
    </main>
  );
}
