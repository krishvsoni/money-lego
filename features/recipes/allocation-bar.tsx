import { shareBps } from "@/lib/amounts";

export interface Segment {
  key: string;
  amount: bigint;
  title: string;
}

export function brickColor(index: number): string {
  return `var(--brick-${(index % 6) + 1})`;
}

// The allocation bar: every recipient is a brick whose width is its share of the total.
// Widths ease when amounts change so the person sees where value moved. An optional fee
// brick shows the part of the gross amount that doesn't reach recipients.
export function AllocationBar({
  segments,
  feeRaw,
  size = "md",
  assemble = false,
  label,
}: {
  segments: Segment[];
  feeRaw?: bigint;
  size?: "md" | "lg";
  assemble?: boolean;
  label: string;
}) {
  const fee = feeRaw && feeRaw > 0n ? feeRaw : 0n;
  const total = segments.reduce((acc, s) => acc + (s.amount > 0n ? s.amount : 0n), 0n) + fee;
  const height = size === "lg" ? "h-16 sm:h-20" : "h-11";

  if (total === 0n) {
    return (
      <div className={`${height} flex items-center justify-center rounded-md border border-dashed border-line-strong text-xs text-ink-3`} aria-label={label}>
        Amounts appear here as you add them
      </div>
    );
  }

  return (
    <div className="flex w-full gap-[3px]" role="img" aria-label={label}>
      {segments.map((s, i) => {
        const bps = s.amount > 0n ? shareBps(s.amount, total) : 0;
        return (
          <div
            key={s.key}
            title={`${s.title}: ${(bps / 100).toFixed(2)}%`}
            className={`${height} relative min-w-[6px] rounded-[5px] ${assemble ? "brick-snap" : ""}`}
            style={{
              flexGrow: Math.max(bps, 1),
              flexBasis: 0,
              background: brickColor(i),
              transition: "flex-grow 260ms var(--ease-out)",
              ["--i" as string]: i,
            }}
          >
            {size === "lg" && (
              <span className="absolute -top-[7px] left-1/2 flex -translate-x-1/2 gap-[18%]" aria-hidden style={{ width: "60%" }}>
                <span className="h-[7px] flex-1 rounded-t-[3px]" style={{ background: brickColor(i) }} />
                <span className="h-[7px] flex-1 rounded-t-[3px]" style={{ background: brickColor(i) }} />
              </span>
            )}
          </div>
        );
      })}
      {fee > 0n && (
        <div
          title={`Fees: ${(shareBps(fee, total) / 100).toFixed(2)}%`}
          className={`${height} min-w-[6px] rounded-[5px] border border-line-strong`}
          style={{
            flexGrow: Math.max(shareBps(fee, total), 1),
            flexBasis: 0,
            background: "repeating-linear-gradient(135deg, var(--sunken) 0 5px, transparent 5px 9px)",
          }}
        />
      )}
    </div>
  );
}
