import {
  Calculator, CalendarClock, Database, FilePlus2, Filter, GitBranch, Globe, Hash, Hourglass, Mail, MessageSquare, MousePointerClick,
  Package, PenLine, Plug, Radar, Receipt, ScrollText, Send, ShieldCheck, Shuffle, Split, UserCheck, Wallet, Webhook, Workflow, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import type { Category } from "@/lib/nodes/types";

// Explicit map so only the icons nodes use are bundled.
const ICONS: Record<string, LucideIcon> = {
  Calculator, CalendarClock, Database, FilePlus2, Filter, GitBranch, Globe, Hash, Hourglass, Mail, MessageSquare, MousePointerClick,
  Package, PenLine, Plug, Radar, Receipt, ScrollText, Send, ShieldCheck, Shuffle, Split, UserCheck, Wallet, Webhook, Workflow, Wrench, Zap,
};

export const CATEGORY_ICON: Record<Category, string> = {
  triggers: "Zap",
  logic: "Workflow",
  data: "Database",
  money: "Wallet",
  integrations: "Plug",
  utilities: "Wrench",
};

export function NodeIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Package;
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}

const TILE_SIZE = {
  xs: { box: "h-5 w-5 rounded-[5px]", icon: "h-3 w-3" },
  sm: { box: "h-6 w-6 rounded-md", icon: "h-3.5 w-3.5" },
  md: { box: "h-8 w-8 rounded-md", icon: "h-4 w-4" },
};

// A node's icon on a soft tile of its category colour; replaces bare colour swatches.
export function BrickGlyph({ name, color, size = "sm" }: { name: string; color: string; size?: keyof typeof TILE_SIZE }) {
  const s = TILE_SIZE[size];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${s.box}`}
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
      aria-hidden
    >
      <NodeIcon name={name} className={s.icon} />
    </span>
  );
}
