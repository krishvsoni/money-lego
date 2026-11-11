"use client";

import type { ReactNode } from "react";
import { AuthSessionProvider } from "@/features/auth/session-context";
import { ToastProvider } from "./toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthSessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthSessionProvider>
  );
}
