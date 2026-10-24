import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "quiet" | "danger" | "accent";

// Tactile pills: raised black for the main action, raised white for secondary, cobalt for
// a selected or accent action, and flat text for quiet actions.
const VARIANTS: Record<Variant, string> = {
  primary: "tactile-ink hover:bg-[#27272a]",
  secondary: "tactile text-ink hover:border-line-strong",
  accent: "tactile-accent hover:brightness-110",
  quiet: "text-ink-2 hover:text-ink hover:bg-sunken",
  danger: "tactile text-danger hover:bg-danger-wash",
};

const BASE =
  "press inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50";

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
