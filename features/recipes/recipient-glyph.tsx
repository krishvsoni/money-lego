import { Briefcase, Building2, HandCoins, Landmark, PiggyBank, Store, type LucideIcon } from "lucide-react";
import { brickColor } from "./allocation-bar";

// One distinct icon per recipient slot, tinted to match that slot's segment in the allocation bar.
const RECIPIENT_ICONS: LucideIcon[] = [Building2, Landmark, PiggyBank, Briefcase, HandCoins, Store];

export function RecipientGlyph({ index }: { index: number }) {
  const Icon = RECIPIENT_ICONS[index % RECIPIENT_ICONS.length];
  const color = brickColor(index);
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
      aria-hidden
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
    </span>
  );
}
