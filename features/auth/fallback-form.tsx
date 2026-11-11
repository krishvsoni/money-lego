"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "sign-in" | "sign-up";

export function FallbackAuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/auth/fallback/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "sign-up" ? { name, email, password } : { email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Could not sign in.");
      router.push("/workflows");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 w-full max-w-[420px] rounded-2xl border border-line bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-ink">Email {mode === "sign-up" ? "account" : "sign-in"}</p>
      <p className="mt-1 text-xs text-ink-2">Use this if the hosted sign-in is temporarily unavailable.</p>
      {mode === "sign-up" && (
        <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" autoComplete="name" className="mt-4 h-10 w-full rounded-lg border border-line px-3 text-sm" />
      )}
      <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" autoComplete="email" className="mt-3 h-10 w-full rounded-lg border border-line px-3 text-sm" />
      <input required minLength={mode === "sign-up" ? 12 : 1} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} className="mt-3 h-10 w-full rounded-lg border border-line px-3 text-sm" />
      {message && <p role="alert" className="mt-3 text-sm text-red-700">{message}</p>}
      <button disabled={busy} type="submit" className="press mt-4 h-10 w-full rounded-full bg-ink px-4 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Working…" : "Continue"}
      </button>
    </form>
  );
}
