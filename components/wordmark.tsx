import Link from "next/link";

export function BrickGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 18" className={className} aria-hidden>
      <rect x="0" y="5" width="28" height="13" rx="2.5" fill="var(--brick-1)" />
      <rect x="4" y="1" width="7" height="5" rx="1.5" fill="var(--brick-1)" />
      <rect x="17" y="1" width="7" height="5" rx="1.5" fill="var(--brick-1)" />
    </svg>
  );
}

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="press inline-flex items-center gap-2 rounded font-display text-lg font-semibold tracking-[-0.025em] text-ink">
      <BrickGlyph className="h-[18px] w-7" />
      Money Lego
    </Link>
  );
}
