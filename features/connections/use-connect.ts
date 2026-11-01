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

  // The popup reports through postMessage and, because browsers can sever window.opener
  // after a visit to another site, also through a same-origin BroadcastChannel. Whichever
  // arrives first wins; a flow is only reported once.
  const waiting = useRef(false);
  useEffect(() => {
    const report = (d: { ok?: unknown; type?: unknown; message?: unknown }) => {
      if (!waiting.current) return;
      waiting.current = false;
      setBusy(null);
      done.current({ ok: Boolean(d.ok), type: String(d.type ?? ""), message: String(d.message ?? "") });
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.source !== CONNECT_MESSAGE) return;
      report(e.data);
    };
    window.addEventListener("message", onMessage);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CONNECT_MESSAGE) : null;
    if (channel) channel.onmessage = (e) => e.data?.source === CONNECT_MESSAGE && report(e.data);
    return () => {
      window.removeEventListener("message", onMessage);
      channel?.close();
    };
  }, []);

  const connect = useCallback(async (slug: string, opts: { shop?: string } = {}) => {
    // Opened synchronously inside the click so popup blockers allow it.
    const popup = window.open("", "money-lego-connect", "width=560,height=760");
    setBusy(slug);
    waiting.current = true;
    try {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const { url } = await api<{ url: string }>("/api/connections/start", { body: { slug, returnTo, popup: Boolean(popup), shop: opts.shop } });
      if (popup) popup.location.href = url;
      else window.location.href = url;
    } catch (e) {
      popup?.close();
      waiting.current = false;
      setBusy(null);
      done.current({ ok: false, type: slug, message: errorMessage(e) });
    }
  }, []);

  return {
    busy,
    connect,
    cancel: () => {
      waiting.current = false;
      setBusy(null);
    },
  };
}
