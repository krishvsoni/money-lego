import { formatAmount } from "./amounts";
import { findToken } from "./tokens";

export function formatToken(raw: string | bigint, mint: string, maxFraction = 6): string {
  const token = findToken(mint);
  if (!token) return `${raw} base units`;
  return `${formatAmount(raw, token.decimals, maxFraction)} ${token.symbol}`;
}

export function formatSol(lamports: number | null | undefined): string {
  if (lamports === null || lamports === undefined) return "Not returned";
  return `${formatAmount(BigInt(lamports), 9, 6)} SOL`;
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

export function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = new Date(iso).getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

export function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `${+(seconds / 3600).toFixed(1)} h`;
  return `${+(seconds / 86_400).toFixed(1)} days`;
}
