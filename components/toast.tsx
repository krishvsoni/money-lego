"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Kind = "info" | "error" | "success";
interface Toast {
  id: number;
  kind: Kind;
  message: string;
}

const ToastContext = createContext<(message: string, kind?: Kind) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const KIND_STYLE: Record<Kind, string> = {
  info: "border-line-strong",
  error: "border-danger",
  success: "border-success",
};

// Toasts enter and leave from the same bottom edge. Timers pause while the tab is hidden,
// so a message isn't missed by someone who switched to their wallet.
function ToastItem({ toast, onDone }: { toast: Toast; onDone: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(toast.kind === "error" ? 7000 : 4000);

  useEffect(() => {
    let started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      started = Date.now();
      timer = setTimeout(() => setLeaving(true), remaining.current);
    };
    const onVisibility = () => {
      if (document.hidden) {
        clearTimeout(timer);
        remaining.current -= Date.now() - started;
      } else start();
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => onDone(toast.id), 180);
    return () => clearTimeout(t);
  }, [leaving, onDone, toast.id]);

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className={`reveal pointer-events-auto max-w-sm rounded-lg border-l-4 bg-surface px-4 py-3 text-sm text-ink shadow-[0_8px_24px_-12px_rgb(23_32_51/0.35)] ${KIND_STYLE[toast.kind]}`}
      style={{
        transition: "opacity 180ms var(--ease-out), transform 180ms var(--ease-out)",
        opacity: leaving ? 0 : 1,
        transform: leaving ? "translateY(8px)" : "none",
      }}
    >
      <div className="flex items-start gap-3">
        <p className="flex-1">{toast.message}</p>
        <button className="press -m-1 rounded p-1 text-ink-3 hover:text-ink" onClick={() => setLeaving(true)} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const push = useCallback((message: string, kind: Kind = "info") => {
    counter.current += 1;
    setToasts((list) => [...list.slice(-2), { id: counter.current, kind, message }]);
  }, []);
  const remove = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
