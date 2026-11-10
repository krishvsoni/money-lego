"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CrownSimpleIcon, EyeIcon, UsersIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/toast";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { useResource } from "@/lib/use-resource";
import type { ShareDTO, SharingDTO } from "@/lib/workflow/sharing";

type Role = "viewer" | "owner";
type Loaded = { sharing: SharingDTO };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Share by email as view-only, or hand ownership over. Uses the native <dialog>, so focus is
// trapped, Escape closes it and the page behind is inert without any extra code.
export function ShareDialog({
  workflowId,
  workflowName,
  open,
  onClose,
  onTransferred,
}: {
  workflowId: string;
  workflowName: string;
  open: boolean;
  onClose: () => void;
  onTransferred: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const resource = useResource<Loaded>(open ? `/api/workflows/${workflowId}/shares` : null);
  const sharing = resource.data?.sharing ?? null;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const reset = (next: Partial<{ email: string; role: Role }>) => {
    if (next.email !== undefined) setEmail(next.email);
    if (next.role !== undefined) setRole(next.role);
    setArmed(false);
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL.test(value)) return setError("Enter a valid email address.");
    // Handing over ownership takes a second, deliberate click.
    if (role === "owner" && !armed) return setArmed(true);
    setBusy("submit");
    setError(null);
    try {
      if (role === "viewer") {
        const r = await api<Loaded & { created: boolean }>(`/api/workflows/${workflowId}/shares`, { body: { email: value } });
        resource.setData({ sharing: r.sharing });
        setEmail("");
        toast(r.created ? `Shared with ${value}` : `${value} already has access`, "success");
        input.current?.focus();
      } else {
        await api(`/api/workflows/${workflowId}/transfer`, { body: { email: value } });
        toast(`${value} now owns this workflow. You can still view it.`, "success");
        onTransferred();
      }
    } catch (err) {
      setError(err instanceof ApiError && err.issues[0] ? err.issues[0].message : errorMessage(err));
    } finally {
      setBusy(null);
      setArmed(false);
    }
  };

  const remove = async (share: ShareDTO) => {
    setBusy(share.id);
    try {
      const r = await api<Loaded>(`/api/workflows/${workflowId}/shares/${share.id}`, { method: "DELETE" });
      resource.setData({ sharing: r.sharing });
      toast(`Removed ${share.email}`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const onRowAction = (share: ShareDTO, action: string) => {
    if (action === "remove") void remove(share);
    if (action === "owner") {
      reset({ email: share.email, role: "owner" });
      setArmed(true);
    }
  };

  const full = sharing ? sharing.shares.length >= sharing.limit : false;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      aria-labelledby="share-title"
      className="m-auto w-[min(540px,calc(100vw-32px))] rounded-2xl border-0 bg-paper p-0 text-ink shadow-[0_0_0_1px_var(--line),0_24px_64px_-16px_rgb(9_9_11/0.35)] backdrop:bg-ink/30 backdrop:backdrop-blur-[2px]"
    >
      {open && (
        <div className="reveal flex max-h-[min(720px,calc(100dvh-48px))] flex-col">
          <header className="flex items-start gap-3 px-6 pt-6">
            <div className="min-w-0 flex-1">
              <h2 id="share-title" className="headline truncate text-xl">
                Share &ldquo;{workflowName}&rdquo;
              </h2>
              <p className="mt-1 text-sm text-ink-2">Invite people by email. They see it the next time they sign in with that address.</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="press -mr-2 -mt-1 rounded-full p-2 text-ink-3 hover:bg-sunken hover:text-ink">
              <XIcon size={18} aria-hidden />
            </button>
          </header>

          <form onSubmit={submit} className="px-6 pt-5" noValidate>
            <div className="flex flex-col gap-2 sm:flex-row">
              <TextInput
                ref={input}
                id="share-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                placeholder="name@company.com"
                aria-label="Email address"
                value={email}
                invalid={Boolean(error)}
                onChange={(e) => reset({ email: e.target.value })}
                className="flex-1"
              />
              <div className="flex gap-2">
                <Select aria-label="Access" value={role} onChange={(e) => reset({ role: e.target.value as Role })} wrapperClassName="sm:w-[148px]">
                  <option value="viewer">Can view</option>
                  <option value="owner">Make owner</option>
                </Select>
                <Button
                  type="submit"
                  variant={armed ? "danger" : "primary"}
                  busy={busy === "submit"}
                  disabled={busy !== null || !email.trim() || (role === "viewer" && full)}
                  className="h-10 shrink-0"
                >
                  {role === "viewer" ? "Share" : armed ? "Confirm" : "Transfer"}
                </Button>
              </div>
            </div>
            {error && (
              <p id="share-email-error" role="alert" className="mt-2 text-xs text-danger">
                {error}
              </p>
            )}
            {role === "owner" && (
              <div className={`reveal mt-3 flex gap-2.5 rounded-xl px-3.5 py-3 text-xs leading-relaxed ${armed ? "bg-danger-wash text-danger" : "bg-attention-wash text-attention"}`}>
                <WarningIcon size={16} weight="fill" className="mt-px shrink-0" aria-hidden />
                <p>
                  <span className="font-semibold">{armed ? "Press Confirm to hand it over." : "This hands the workflow over."}</span> They become the only owner and you keep view access. It is switched off,
                  its connections are cleared so they connect their own, and its checkout and webhook links change. Past runs and PayPal records stay with you.
                </p>
              </div>
            )}
          </form>

          <section className="mt-6 min-h-0 flex-1 overflow-y-auto border-t border-line px-6 py-4" aria-labelledby="share-people">
            <div className="flex items-baseline justify-between">
              <h3 id="share-people" className="text-sm font-semibold">
                People with access
              </h3>
              {sharing && (
                <span className="num text-xs text-ink-3">
                  {sharing.shares.length} of {sharing.limit} invited
                </span>
              )}
            </div>

            {resource.error ? (
              <p role="alert" className="mt-3 text-sm text-danger">
                {resource.error}
              </p>
            ) : !sharing ? (
              <div className="mt-3 flex flex-col gap-2" aria-busy>
                {[0, 1].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-sunken" />
                ))}
              </div>
            ) : (
              <ul className="mt-2 flex flex-col">
                <Person
                  label={sharing.owner.name}
                  detail={sharing.owner.email ? `${sharing.owner.email} · you` : "You"}
                  trailing={
                    <span className="inline-flex items-center gap-1 rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold text-ink-2">
                      <CrownSimpleIcon size={12} weight="fill" aria-hidden /> Owner
                    </span>
                  }
                />
                {sharing.shares.map((s) => (
                  <Person
                    key={s.id}
                    label={s.email}
                    detail={s.status === "pending" ? "Invited · hasn't signed in yet" : "Can view and make a copy"}
                    pending={s.status === "pending"}
                    trailing={
                      <Select size="sm" aria-label={`Access for ${s.email}`} value="viewer" disabled={busy !== null} onChange={(e) => onRowAction(s, e.target.value)} wrapperClassName="w-[132px]">
                        <option value="viewer">Can view</option>
                        <option value="owner" disabled={s.status === "pending"}>
                          Make owner
                        </option>
                        <option value="remove">Remove access</option>
                      </Select>
                    }
                  />
                ))}
                {sharing.shares.length === 0 && (
                  <li className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-4 text-sm text-ink-2">
                    <UsersIcon size={16} className="shrink-0 text-ink-3" aria-hidden />
                    Only you can see this workflow.
                  </li>
                )}
              </ul>
            )}
          </section>

          <footer className="flex items-center gap-2 rounded-b-2xl border-t border-line bg-surface px-6 py-3.5 text-xs text-ink-2">
            <EyeIcon size={14} className="shrink-0 text-ink-3" aria-hidden />
            Viewers can open the workflow and copy it, but can&apos;t edit it, run it or use your connections.
          </footer>
        </div>
      )}
    </dialog>
  );
}

function Person({ label, detail, trailing, pending }: { label: string; detail: string; trailing: React.ReactNode; pending?: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold uppercase ${pending ? "border border-dashed border-line-strong text-ink-3" : "tactile-soft text-ink-2"}`}
      >
        {label.charAt(0)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-ink-3">{detail}</span>
      </span>
      {trailing}
    </li>
  );
}
