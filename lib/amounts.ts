// Exact token arithmetic. Amounts live as base-unit integers (bigint) and travel as
// decimal strings; nothing here ever touches floating point.

export class AmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmountError";
  }
}

const DECIMAL_INPUT = /^\d+(\.\d+)?$/;
const RAW_INPUT = /^\d+$/;

export function isRawAmount(value: unknown): value is string {
  return typeof value === "string" && RAW_INPUT.test(value);
}

export function toRaw(input: string, decimals: number): bigint {
  const value = input.trim().replace(/,/g, "");
  if (!DECIMAL_INPUT.test(value)) {
    throw new AmountError("Enter a number like 125 or 125.50");
  }
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) {
    throw new AmountError(`This token supports at most ${decimals} decimal places`);
  }
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

export function tryToRaw(input: string, decimals: number): bigint | null {
  try {
    return toRaw(input, decimals);
  } catch {
    return null;
  }
}

export function fromRaw(raw: bigint | string, decimals: number): string {
  const value = typeof raw === "bigint" ? raw : BigInt(raw);
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function formatAmount(raw: bigint | string, decimals: number, maxFraction = decimals): string {
  const plain = fromRaw(raw, decimals);
  const [whole, fraction = ""] = plain.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

export function sumRaw(values: Array<bigint | string>): bigint {
  return values.reduce<bigint>((acc, v) => acc + (typeof v === "bigint" ? v : BigInt(v)), 0n);
}

// Splits a total into n parts that sum exactly to the total. The remainder goes to the
// first rows, one base unit each, so the caller can show precisely where it landed.
export function splitEvenly(total: bigint, parts: number): bigint[] {
  if (parts <= 0) return [];
  const base = total / BigInt(parts);
  const remainder = Number(total % BigInt(parts));
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1n : 0n));
}

// Share of a part in basis points (1/100 of a percent), for display only.
export function shareBps(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  return Number((part * 10_000n) / total);
}

// Percentages are held as hundredths of a percent, so 33.33% is exact. Each recipient gets
// the floor of their share and leftover base units go to the largest remainders, so the
// parts always sum to the total.
export function splitByPercent(total: bigint, hundredths: number[]): bigint[] {
  const parts = hundredths.map((h) => (total * BigInt(h)) / 10_000n);
  const remainders = hundredths.map((h, i) => ({ i, r: (total * BigInt(h)) % 10_000n }));
  let left = total - sumRaw(parts);
  remainders.sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i));
  for (let k = 0; left > 0n; k = (k + 1) % parts.length, left--) parts[remainders[k].i] += 1n;
  return parts;
}
