import Link from "next/link";

// The mark: two blocks offset like a brick bond, the lower one's stud seated in the upper
// one's socket with an even gap all round. Geometry is shared with app/icon.svg.
export const MARK_TOP = "M12 7.5H24A2 2 0 0 1 26 9.5V13.5A2 2 0 0 1 24 15.5H19.977A4.25 4.25 0 0 0 12.023 15.5H12A2 2 0 0 1 10 13.5V9.5A2 2 0 0 1 12 7.5Z";
export const MARK_BASE = "M8 17H13.25A2.75 2.75 0 0 1 18.75 17H20A2 2 0 0 1 22 19V23A2 2 0 0 1 20 25H8A2 2 0 0 1 6 23V19A2 2 0 0 1 8 17Z";
export const MARK_ACCENT = "#4f6bff";

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--ink)" />
      <path d={MARK_TOP} fill="#fff" />
      <path d={MARK_BASE} fill={MARK_ACCENT} />
    </svg>
  );
}

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="press inline-flex items-center gap-2.5 rounded font-display text-lg font-semibold tracking-[-0.025em] text-ink">
      <LogoMark className="h-7 w-7" />
      Money Lego
    </Link>
  );
}
