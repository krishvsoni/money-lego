import {
  Banknote, Calculator, CalendarClock, ChartColumn, Database, FilePlus2, FileSearch, FileText, Filter, GitBranch, Globe, Hash, Hourglass, Mail, MessageSquare, MousePointerClick,
  Package, PenLine, Plug, Radar, Radio, Receipt, Repeat, ScanSearch, ScrollText, Send, ShieldAlert, ShieldCheck, ShoppingCart, Shuffle, Sparkles, Split, Undo2, UserCheck, Wallet, Webhook, Workflow, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { FingerprintIcon, ListChecksIcon } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { BrandLogo, isBrand } from "@/components/ui/brand-logo";
import type { Category } from "@/lib/nodes/types";

// Explicit map so only the icons nodes use are bundled.
const ICONS: Record<string, LucideIcon> = {
  Banknote, Calculator, CalendarClock, ChartColumn, Database, FilePlus2, FileSearch, FileText, Filter, GitBranch, Globe, Hash, Hourglass, Mail, MessageSquare, MousePointerClick,
  Package, PenLine, Plug, Radar, Radio, Receipt, Repeat, ScanSearch, ScrollText, Send, ShieldAlert, ShieldCheck, ShoppingCart, Shuffle, Sparkles, Split, Undo2, UserCheck, Wallet, Webhook, Workflow, Wrench, Zap,
};

// Glyphs lucide doesn't ship. Phosphor's ssr entry has no React context, so this file still
// renders inside server components.
const MARKS: Record<string, Icon> = { Fingerprint: FingerprintIcon, ListChecks: ListChecksIcon };

export const CATEGORY_ICON: Record<Category, string> = {
  triggers: "Zap",
  logic: "Workflow",
  data: "Database",
  paypal: "Wallet",
  ai: "Sparkles",
  integrations: "Plug",
  utilities: "Wrench",
};

// "logo:<brand>" icons are the service's real mark; sized by the caller's h-/w- classes.
export function NodeIcon({ name, className }: { name: string; className?: string }) {
  const brand = name.startsWith("logo:") ? name.slice(5) : "";
  if (isBrand(brand)) return <BrandLogo brand={brand} size={16} className={className} />;
  const Mark = MARKS[name];
  if (Mark) return <Mark className={className} weight="bold" aria-hidden />;
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
