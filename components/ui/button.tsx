import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "quiet" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-action text-action-ink hover:bg-action-hover",
  secondary: "border border-line-strong bg-surface text-ink hover:border-ink-3",
  quiet: "text-ink-2 hover:text-ink hover:bg-sunken",
  danger: "border border-danger/40 bg-surface text-danger hover:bg-danger-wash",
};

const BASE =
  "press inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
  variant = "primary",
  busy,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button {...props} disabled={props.disabled || busy} aria-busy={busy || undefined} className={`${BASE} ${VARIANTS[variant]} ${className}`}>
      {busy && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "primary", className = "", children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${BASE} ${VARIANTS[variant]} ${className}`}>
      {children}
    </Link>
  );
}
