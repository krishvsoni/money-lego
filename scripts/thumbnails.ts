// Renders the template thumbnails to public/templates/*.svg. Each is a self-contained
// 16:9 illustration of its workflow: brick-style node cards on the brand navy, with the
// trigger, logic, MultiHopper and notification steps in that template's own arrangement.
// No fonts, images or links are fetched; text uses the system font stack.
// Usage: bun scripts/thumbnails.ts

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Kind = "trigger" | "logic" | "data" | "money" | "notify" | "stop";

interface Card {
  id: string;
  x: number;
  y: number;
  label: string;
  sub: string;
  kind: Kind;
  mono: string;
  w?: number;
}

interface Thumb {
  slug: string;
  title: string;
  category: string;
  cards: Card[];
  edges: Array<[string, string, string?]>;
  badges: Array<[string, string]>;
}

const KIND_COLOR: Record<Kind, string> = { trigger: "#e3a21a", logic: "#a066b8", data: "#3c8dbc", money: "#4a6af0", notify: "#d0563f", stop: "#8b93a7" };
const W = 200;
const H = 84;
// Cards grow to fit their label, so text never runs past the edge.
const widthOf = (c: Card) => (c.kind === "stop" ? (c.w ?? W) : Math.max(c.w ?? W, Math.ceil(76 + c.label.length * 9.4)));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function card(c: Card): string {
  const w = widthOf(c);
  const color = KIND_COLOR[c.kind];
  const trigger = c.kind === "trigger";
  const h = c.kind === "stop" ? 48 : H;
  if (c.kind === "stop") {
    return `<g transform="translate(${c.x} ${c.y})"><rect width="${w}" height="${h}" rx="24" fill="#1c2750" stroke="#3a4a80" stroke-dasharray="5 4"/><text x="${w / 2}" y="30" text-anchor="middle" font-size="17" font-weight="600" fill="#b8c2e0">${esc(c.label)}</text></g>`;
  }
  return `<g transform="translate(${c.x} ${c.y})">
  <rect x="22" y="-7" width="26" height="9" rx="3" fill="${color}"/><rect x="62" y="-7" width="26" height="9" rx="3" fill="${color}"/>
  <rect width="${w}" height="${h}" rx="14" fill="#ffffff" ${trigger ? `stroke="${color}" stroke-width="3"` : ""}/>
  <rect width="${w}" height="8" rx="4" fill="${color}"/>
  <circle cx="34" cy="48" r="17" fill="${color}" fill-opacity="0.16"/>
  <text x="34" y="54" text-anchor="middle" font-size="14" font-weight="800" fill="${color}">${esc(c.mono)}</text>
  <text x="60" y="44" font-size="17" font-weight="700" fill="#09090b">${esc(c.label)}</text>
  <text x="60" y="66" font-size="14" fill="#52525b">${esc(c.sub)}</text>
</g>`;
}

function edge(from: Card, to: Card, label?: string): string {
  const fw = widthOf(from);
  const tw = widthOf(to);
  const fh = from.kind === "stop" ? 48 : H;
  const th = to.kind === "stop" ? 48 : H;
  const sameRow = Math.abs(from.y - to.y) < 40;
  let d: string;
  let lx: number;
  let ly: number;
  if (sameRow) {
    const rightward = to.x > from.x;
    const x1 = rightward ? from.x + fw : from.x;
    const x2 = rightward ? to.x - 10 : to.x + tw + 10;
    const y1 = from.y + fh / 2;
    const y2 = to.y + th / 2;
    const mid = (x1 + x2) / 2;
    d = `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
    [lx, ly] = [mid, Math.min(y1, y2) - 10];
  } else if (Math.abs(from.x - to.x) < 40) {
    const x = from.x + fw / 2;
    const down = to.y > from.y;
    const y1 = down ? from.y + fh : from.y;
    const y2 = down ? to.y - 14 : to.y + th + 10;
    d = `M${x} ${y1} L${x} ${y2}`;
    [lx, ly] = [x + 12, (y1 + y2) / 2];
  } else {
    const x1 = to.x > from.x ? from.x + fw : from.x;
    const x2 = to.x > from.x ? to.x - 10 : to.x + tw + 10;
    const y1 = from.y + fh / 2;
    const y2 = to.y + th / 2;
    d = `M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`;
    [lx, ly] = [(x1 + x2) / 2 + 8, (y1 + y2) / 2];
  }
  const text = label ? `<text x="${lx}" y="${ly}" font-size="14" font-weight="700" fill="#c9d3f5" text-anchor="${sameRow ? "middle" : "start"}">${esc(label)}</text>` : "";
  return `<path d="${d}" fill="none" stroke="#8ea0d6" stroke-width="3" stroke-linecap="round" marker-end="url(#arrow)"/>${text}`;
}

function badgeRow(badges: Thumb["badges"]): string {
  let x = 60;
  return badges
    .map(([name, color]) => {
      const w = 34 + name.length * 9.2;
      const out = `<g transform="translate(${x} 640)"><rect width="${w}" height="36" rx="18" fill="#1c2750" stroke="#2f3d6e"/><circle cx="18" cy="18" r="6" fill="${color}"/><text x="31" y="23.5" font-size="15" font-weight="600" fill="#dfe5f7">${esc(name)}</text></g>`;
      x += w + 10;
      return out;
    })
    .join("");
}

function render(t: Thumb): string {
  const byId = new Map(t.cards.map((c) => [c.id, c]));
  const edges = t.edges.map(([a, b, label]) => edge(byId.get(a)!, byId.get(b)!, label)).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720" role="img" aria-label="${esc(t.title)} workflow">
<title>${esc(t.title)} workflow</title>
<defs>
  <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="#24305c"/></pattern>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#121c3d"/><stop offset="1" stop-color="#0b1229"/></linearGradient>
  <marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#8ea0d6"/></marker>
</defs>
<g font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif">
<rect width="1280" height="720" fill="url(#bg)"/>
<rect width="1280" height="720" fill="url(#dots)"/>
<rect x="60" y="48" width="${30 + t.category.length * 11}" height="30" rx="15" fill="#e3a21a" fill-opacity="0.16"/>
<text x="74" y="68" font-size="15" font-weight="700" fill="#f2c45a">${esc(t.category.toUpperCase())}</text>
<text x="60" y="124" font-size="40" font-weight="800" fill="#ffffff" letter-spacing="-0.5">${esc(t.title)}</text>
<g transform="translate(1000 54)"><rect width="220" height="32" rx="16" fill="#17784a" fill-opacity="0.22"/><path d="M18 9 l9 3.5 v6 c0 5 -4 8 -9 9.5 c-5 -1.5 -9 -4.5 -9 -9.5 v-6 z" fill="#4cc38a"/><text x="36" y="21.5" font-size="14" font-weight="700" fill="#9be3bf">Approve + sign each run</text></g>
${edges}
${t.cards.map(card).join("\n")}
${badgeRow(t.badges)}
</g>
</svg>
`;
}

const B = {
  github: ["GitHub", "#e6edf3"],
  sheets: ["Google Sheets", "#34a853"],
  mh: ["MultiHopper", "#4a6af0"],
  discord: ["Discord", "#5865F2"],
  slack: ["Slack", "#e01e5a"],
  stripe: ["Stripe", "#635BFF"],
  shopify: ["Shopify", "#95bf47"],
  telegram: ["Telegram", "#229ED9"],
  notion: ["Notion", "#ffffff"],
  airtable: ["Airtable", "#fcb400"],
  http: ["HTTP Request", "#3c8dbc"],
  schedule: ["Schedule", "#e3a21a"],
} satisfies Record<string, [string, string]>;

const THUMBS: Thumb[] = [
  {
    slug: "opensource-contributor-payout",
    title: "Open Source Contributor Payout",
    category: "Developer Tools",
    cards: [
      { id: "gh", x: 60, y: 200, label: "Release published", sub: "GitHub · signed", kind: "trigger", mono: "GH", w: 220 },
      { id: "rows", x: 360, y: 200, label: "Approved rows", sub: "Google Sheets", kind: "data", mono: "GS" },
      { id: "val", x: 650, y: 200, label: "Validate & split", sub: "1–20 wallets, exact", kind: "logic", mono: "✓" },
      { id: "quote", x: 960, y: 200, label: "Quote", sub: "MultiHopper fees", kind: "money", mono: "MH", w: 220 },
      { id: "review", x: 960, y: 420, label: "Operator review", sub: "approve payload", kind: "logic", mono: "OK", w: 220 },
      { id: "sign", x: 650, y: 420, label: "Wallet signs", sub: "keeper, then route", kind: "money", mono: "MH" },
      { id: "track", x: 360, y: 420, label: "Track delivery", sub: "webhook + polling", kind: "money", mono: "MH" },
      { id: "dc", x: 60, y: 420, label: "Post summary", sub: "Discord", kind: "notify", mono: "DC", w: 220 },
    ],
    edges: [["gh", "rows"], ["rows", "val"], ["val", "quote"], ["quote", "review"], ["review", "sign", "approved"], ["sign", "track"], ["track", "dc"]],
    badges: [B.github, B.sheets, B.mh, B.discord],
  },
  {
    slug: "shopify-approved-supplier-payout",
    title: "Shopify Supplier Payout",
    category: "Commerce",
    cards: [
      { id: "order", x: 60, y: 190, label: "Order paid", sub: "Shopify · HMAC", kind: "trigger", mono: "SH" },
      { id: "check", x: 60, y: 420, label: "Paid, not cancelled", sub: "order rules", kind: "logic", mono: "✓", w: 220 },
      { id: "supplier", x: 370, y: 420, label: "Supplier terms", sub: "Airtable · approved", kind: "data", mono: "AT" },
      { id: "once", x: 370, y: 190, label: "Once per order", sub: "no double payout", kind: "logic", mono: "1×" },
      { id: "quote", x: 680, y: 190, label: "Quote + review", sub: "MultiHopper", kind: "money", mono: "MH" },
      { id: "sign", x: 680, y: 420, label: "Wallet signs", sub: "separate funds", kind: "money", mono: "MH" },
      { id: "slack", x: 990, y: 420, label: "Notify", sub: "Slack", kind: "notify", mono: "SL" },
    ],
    edges: [["order", "check"], ["check", "supplier"], ["supplier", "once"], ["once", "quote"], ["quote", "sign", "approved"], ["sign", "slack"]],
    badges: [B.shopify, B.airtable, B.mh, B.slack],
  },
  {
    slug: "stripe-partner-revenue-allocation",
    title: "Stripe Partner Revenue Allocation",
    category: "Revenue Operations",
    cards: [
      { id: "inv", x: 60, y: 200, label: "Invoice paid", sub: "Stripe · signed", kind: "trigger", mono: "ST" },
      { id: "policy", x: 360, y: 200, label: "Payout policy", sub: "Notion page", kind: "data", mono: "NO" },
      { id: "alloc", x: 660, y: 200, label: "Allocation API", sub: "HTTP · allowlisted", kind: "data", mono: "{}" },
      { id: "split", x: 960, y: 200, label: "Validate split", sub: "sum must match", kind: "logic", mono: "✓", w: 220 },
      { id: "review", x: 960, y: 410, label: "Quote + review", sub: "MultiHopper", kind: "money", mono: "MH", w: 220 },
      { id: "sign", x: 660, y: 410, label: "Wallet signs", sub: "your funds", kind: "money", mono: "MH" },
      { id: "slack", x: 360, y: 350, label: "Notify", sub: "Slack", kind: "notify", mono: "SL" },
      { id: "record", x: 360, y: 480, label: "Record", sub: "Notion database", kind: "notify", mono: "NO" },
    ],
    edges: [["inv", "policy"], ["policy", "alloc"], ["alloc", "split"], ["split", "review"], ["review", "sign", "approved"], ["sign", "slack"], ["sign", "record"]],
    badges: [B.stripe, B.notion, B.http, B.mh, B.slack],
  },
  {
    slug: "discord-community-bounty-reward",
    title: "Community Bounty Reward",
    category: "Community",
    cards: [
      { id: "cmd", x: 40, y: 320, label: "/payout-bounty", sub: "Discord · Ed25519", kind: "trigger", mono: "DC" },
      { id: "bounty", x: 295, y: 320, label: "Approved bounty", sub: "Airtable", kind: "data", mono: "AT" },
      { id: "review", x: 560, y: 320, label: "Review + sign", sub: "MultiHopper", kind: "money", mono: "MH" },
      { id: "track", x: 810, y: 320, label: "Delivery", sub: "confirmed only", kind: "money", mono: "MH" },
      { id: "tg", x: 1040, y: 200, label: "Tell winner", sub: "Telegram", kind: "notify", mono: "TG", w: 190 },
      { id: "dc", x: 1040, y: 450, label: "Post outcome", sub: "Discord channel", kind: "notify", mono: "DC", w: 190 },
    ],
    edges: [["cmd", "bounty"], ["bounty", "review"], ["review", "track"], ["track", "tg", "paid"], ["track", "dc", "any outcome"]],
    badges: [B.discord, B.airtable, B.telegram, B.mh],
  },
  {
    slug: "weekly-grant-distribution",
    title: "Weekly Grant Distribution",
    category: "Treasury Operations",
    cards: [
      { id: "sched", x: 60, y: 200, label: "Every Friday", sub: "15:00 your timezone", kind: "trigger", mono: "⏱" },
      { id: "rows", x: 320, y: 200, label: "Approved grants", sub: "Google Sheets batch", kind: "data", mono: "GS" },
      { id: "policy", x: 590, y: 200, label: "Policy + budget", sub: "Notion · HTTP", kind: "data", mono: "NO" },
      { id: "ok", x: 860, y: 200, label: "Budget OK?", sub: "treasury answer", kind: "logic", mono: "?", w: 170 },
      { id: "stop", x: 1100, y: 218, label: "Stop + log", sub: "", kind: "stop", mono: "", w: 130 },
      { id: "review", x: 860, y: 420, label: "Quote + review", sub: "one batch", kind: "money", mono: "MH" },
      { id: "sign", x: 560, y: 420, label: "Wallet signs", sub: "every week", kind: "money", mono: "MH" },
      { id: "notify", x: 250, y: 420, label: "Slack + record", sub: "Notion run log", kind: "notify", mono: "SL" },
    ],
    edges: [["sched", "rows"], ["rows", "policy"], ["policy", "ok"], ["ok", "stop", "no"], ["ok", "review", "yes"], ["review", "sign", "approved"], ["sign", "notify"]],
    badges: [B.schedule, B.sheets, B.notion, B.http, B.mh, B.slack],
  },
];

const FALLBACK: Thumb = {
  slug: "fallback",
  title: "Workflow template",
  category: "Money Lego",
  cards: [
    { id: "t", x: 140, y: 300, label: "Trigger", sub: "an event arrives", kind: "trigger", mono: "⚡" },
    { id: "r", x: 420, y: 300, label: "Rules", sub: "validate the payout", kind: "logic", mono: "✓" },
    { id: "a", x: 700, y: 300, label: "Approve + sign", sub: "MultiHopper", kind: "money", mono: "MH" },
    { id: "n", x: 980, y: 300, label: "Notify", sub: "the team", kind: "notify", mono: "✉", w: 180 },
  ],
  edges: [["t", "r"], ["r", "a"], ["a", "n"]],
  badges: [B.mh],
};

const out = join(import.meta.dirname, "..", "public", "templates");
mkdirSync(out, { recursive: true });
for (const t of [...THUMBS, FALLBACK]) {
  const svg = render(t);
  writeFileSync(join(out, `${t.slug}.svg`), svg);
  console.log(`${t.slug}.svg ${(svg.length / 1024).toFixed(1)} KB`);
}
