import {
  Calculator, CalendarClock, Database, FilePlus2, Filter, GitBranch, Globe, Hash, Hourglass, Mail, MessageSquare, MousePointerClick,
  Package, PenLine, Plug, Radar, Receipt, ScrollText, Send, ShieldCheck, Shuffle, Split, UserCheck, Wallet, Webhook, Workflow, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import {
  DiscordLogoIcon, FingerprintIcon, GithubLogoIcon, ListChecksIcon, NotionLogoIcon, StorefrontIcon, StripeLogoIcon, TableIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Category } from "@/lib/nodes/types";

// Explicit map so only the icons nodes use are bundled.
const ICONS: Record<string, LucideIcon> = {
  Calculator, CalendarClock, Database, FilePlus2, Filter, GitBranch, Globe, Hash, Hourglass, Mail, MessageSquare, MousePointerClick,
  Package, PenLine, Plug, Radar, Receipt, ScrollText, Send, ShieldCheck, Shuffle, Split, UserCheck, Wallet, Webhook, Workflow, Wrench, Zap,
};

// Provider marks lucide doesn't ship. Phosphor draws them at the same optical size; the
// ssr entry has no React context, so this file still renders inside server components.
const MARKS: Record<string, Icon> = {
  DiscordLogo: DiscordLogoIcon, Fingerprint: FingerprintIcon, GithubLogo: GithubLogoIcon, ListChecks: ListChecksIcon,
  NotionLogo: NotionLogoIcon, Storefront: StorefrontIcon, StripeLogo: StripeLogoIcon, Table: TableIcon,
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
