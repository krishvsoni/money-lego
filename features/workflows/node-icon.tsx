import {
  Calculator, CalendarClock, FilePlus2, Filter, GitBranch, Globe, Hash, Hourglass, Mail, MessageSquare, MousePointerClick,
  PenLine, Radar, Receipt, ScrollText, Send, ShieldCheck, Shuffle, Split, UserCheck, Webhook, type LucideIcon,
} from "lucide-react";

// Explicit map so only the icons nodes use are bundled.
const ICONS: Record<string, LucideIcon> = {
  Calculator, CalendarClock, FilePlus2, Filter, GitBranch, Globe, Hash, Hourglass, Mail, MessageSquare, MousePointerClick,
  PenLine, Radar, Receipt, ScrollText, Send, ShieldCheck, Shuffle, Split, UserCheck, Webhook,
};

export function NodeIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Hash;
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}
