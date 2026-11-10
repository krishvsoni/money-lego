// Initials on a soft colour picked from the name, so the same person always gets the same
// colour across the app, and different people are easy to tell apart.
const TONES = [
  { bg: "#e8ecfc", fg: "#2c4bd6" },
  { bg: "#fbf1df", fg: "#a86400" },
  { bg: "#f3e8f6", fg: "#7a3e8f" },
  { bg: "#e3f2ea", fg: "#17784a" },
  { bg: "#e6f1f8", fg: "#2f6f96" },
  { bg: "#fbe8e5", fg: "#b93a2b" },
];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export function initials(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}

export function Avatar({ name, size = 36, className = "" }: { name: string; size?: number; className?: string }) {
  const tone = TONES[hash(name.toLowerCase()) % TONES.length];
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight ${className}`}
      style={{ width: size, height: size, background: tone.bg, color: tone.fg, fontSize: Math.round(size * 0.38), boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone.fg} 14%, transparent)` }}
    >
      {initials(name)}
    </span>
  );
}
