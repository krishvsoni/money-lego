"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";

export interface ConnectResult {
  ok: boolean;
  type: string;
  message: string;
}

export const CONNECT_MESSAGE = "money-lego-connection";

// Opens the provider's consent screen in a popup so the editor or page underneath keeps
// its state, and hears back from /connections/done through a same-origin postMessage.
// If the browser blocks popups, it falls back to a full-page redirect.
export function useConnect(onDone: (r: ConnectResult) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.source !== CONNECT_MESSAGE) return;
      setBusy(null);
      done.current({ ok: Boolean(e.data.ok), type: String(e.data.type ?? ""), message: String(e.data.message ?? "") });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const connect = useCallback(async (slug: string, opts: { shop?: string } = {}) => {
    // Opened synchronously inside the click so popup blockers allow it.
    const popup = window.open("", "money-lego-connect", "width=560,height=760");
    setBusy(slug);
    try {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const { url } = await api<{ url: string }>("/api/connections/start", { body: { slug, returnTo, popup: Boolean(popup), shop: opts.shop } });
      if (popup) popup.location.href = url;
      else window.location.href = url;
    } catch (e) {
      popup?.close();
      setBusy(null);
      done.current({ ok: false, type: slug, message: errorMessage(e) });
    }
  }, []);

  return { busy, connect, cancel: () => setBusy(null) };
}
