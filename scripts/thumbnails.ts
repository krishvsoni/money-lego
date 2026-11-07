// Renders the template thumbnails to public/templates/*.svg. Each is a self-contained
// 16:9 illustration of its workflow: brick-style node cards on the brand navy, with the
// trigger, logic, PayPal, AI and notification steps in that template's own arrangement.
// No fonts, images or links are fetched; text uses the system font stack.
// Usage: npm run thumbnails

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Kind = "trigger" | "logic" | "data" | "money" | "ai" | "notify" | "stop";

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

const KIND_COLOR: Record<Kind, string> = { trigger: "#e3a21a", logic: "#a066b8", data: "#3c8dbc", money: "#0070e0", ai: "#7c5cff", notify: "#d0563f", stop: "#8b93a7" };
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
<g transform="translate(1000 54)"><rect width="220" height="32" rx="16" fill="#17784a" fill-opacity="0.22"/><path d="M18 9 l9 3.5 v6 c0 5 -4 8 -9 9.5 c-5 -1.5 -9 -4.5 -9 -9.5 v-6 z" fill="#4cc38a"/><text x="36" y="21.5" font-size="14" font-weight="700" fill="#9be3bf">You approve every action</text></g>
${edges}
${t.cards.map(card).join("\n")}
${badgeRow(t.badges)}
</g>
</svg>
`;
}

const B = {
  paypal: ["PayPal", "#0070e0"],
  ai: ["AI", "#7c5cff"],
  slack: ["Slack", "#e01e5a"],
  schedule: ["Schedule", "#e3a21a"],
} satisfies Record<string, [string, string]>;

const THUMBS: Thumb[] = [
  {
    slug: "paypal-sale-revenue-split",
    title: "PayPal Sale → Revenue Split Payout",
    category: "Revenue Operations",
    cards: [
      { id: "pay", x: 60, y: 200, label: "Checkout paid", sub: "PayPal capture", kind: "trigger", mono: "PP" },
      { id: "once", x: 360, y: 200, label: "Once per capture", sub: "no double splits", kind: "logic", mono: "1×" },
      { id: "split", x: 700, y: 200, label: "Split 70/20/10", sub: "exact cents", kind: "data", mono: "%" },
      { id: "ai", x: 1000, y: 200, label: "AI review", sub: "risk + checks", kind: "ai", mono: "AI", w: 220 },
      { id: "ok", x: 1000, y: 420, label: "You approve", sub: "fingerprinted", kind: "logic", mono: "✓", w: 220 },
      { id: "payout", x: 660, y: 420, label: "PayPal payout", sub: "one batch", kind: "money", mono: "PP" },
      { id: "status", x: 360, y: 420, label: "Wait until paid", sub: "item by item", kind: "money", mono: "◷" },
      { id: "slack", x: 60, y: 420, label: "Slack", sub: "team update", kind: "notify", mono: "#", w: 200 },
    ],
    edges: [["pay", "once"], ["once", "split"], ["split", "ai"], ["ai", "ok"], ["ok", "payout", "approved"], ["payout", "status"], ["status", "slack"]],
    badges: [B.paypal, B.ai, B.slack],
  },
  {
    slug: "paypal-invoice-reminders",
    title: "AI Invoice Reminder Assistant",
    category: "Accounts Receivable",
    cards: [
      { id: "s", x: 60, y: 220, label: "Every Monday", sub: "09:00", kind: "trigger", mono: "◷" },
      { id: "find", x: 360, y: 220, label: "Overdue invoices", sub: "PayPal Invoicing", kind: "money", mono: "PP" },
      { id: "ai", x: 720, y: 220, label: "AI drafts reminders", sub: "one per invoice", kind: "ai", mono: "AI" },
      { id: "ok", x: 720, y: 430, label: "You review", sub: "edit or approve", kind: "logic", mono: "✓" },
      { id: "send", x: 360, y: 430, label: "Send reminders", sub: "via PayPal", kind: "money", mono: "PP" },
      { id: "slack", x: 60, y: 430, label: "Slack", sub: "summary", kind: "notify", mono: "#", w: 200 },
    ],
    edges: [["s", "find"], ["find", "ai"], ["ai", "ok"], ["ok", "send", "approved"], ["send", "slack"]],
    badges: [B.schedule, B.paypal, B.ai, B.slack],
  },
  {
    slug: "paypal-subscription-recovery",
    title: "Failed Subscription Recovery",
    category: "Subscriptions",
    cards: [
      { id: "ev", x: 60, y: 210, label: "Payment failed", sub: "verified webhook", kind: "trigger", mono: "PP" },
      { id: "sub", x: 380, y: 210, label: "Load subscription", sub: "PayPal billing", kind: "money", mono: "PP" },
      { id: "ai", x: 720, y: 210, label: "AI explains why", sub: "reason + balance", kind: "ai", mono: "AI" },
      { id: "inv", x: 720, y: 430, label: "Draft invoice", sub: "outstanding only", kind: "money", mono: "PP" },
      { id: "ok", x: 400, y: 430, label: "You approve", sub: "then PayPal sends", kind: "logic", mono: "✓" },
      { id: "slack", x: 60, y: 430, label: "Slack", sub: "alert", kind: "notify", mono: "#", w: 200 },
    ],
    edges: [["ev", "sub"], ["sub", "ai"], ["ai", "inv", "owed"], ["inv", "ok"], ["ok", "slack"]],
    badges: [B.paypal, B.ai, B.slack],
  },
  {
    slug: "paypal-refund-desk",
    title: "Approved Refund Desk",
    category: "Customer Support",
    cards: [
      { id: "r", x: 70, y: 300, label: "Refund request", sub: "capture + reason", kind: "trigger", mono: "↩" },
      { id: "ai", x: 400, y: 300, label: "AI check", sub: "amount + reason", kind: "ai", mono: "AI" },
      { id: "ok", x: 700, y: 300, label: "You approve", sub: "exact amount", kind: "logic", mono: "✓" },
      { id: "ref", x: 980, y: 300, label: "PayPal refund", sub: "once", kind: "money", mono: "PP", w: 220 },
    ],
    edges: [["r", "ai"], ["ai", "ok"], ["ok", "ref", "approved"]],
    badges: [B.paypal, B.ai],
  },
  {
    slug: "paypal-weekly-ops-report",
    title: "Weekly PayPal Ops Digest",
    category: "Reporting",
    cards: [
      { id: "s", x: 70, y: 300, label: "Fridays", sub: "17:00", kind: "trigger", mono: "◷", w: 200 },
      { id: "tx", x: 340, y: 300, label: "Transactions", sub: "last 7 days", kind: "money", mono: "PP" },
      { id: "ai", x: 660, y: 300, label: "AI digest", sub: "five lines", kind: "ai", mono: "AI" },
      { id: "slack", x: 960, y: 300, label: "Slack", sub: "the team", kind: "notify", mono: "#", w: 220 },
    ],
    edges: [["s", "tx"], ["tx", "ai"], ["ai", "slack"]],
    badges: [B.schedule, B.paypal, B.ai, B.slack],
  },
];

const FALLBACK: Thumb = {
  slug: "fallback",
  title: "Workflow template",
  category: "Money Lego",
  cards: [
    { id: "t", x: 140, y: 300, label: "Trigger", sub: "an event arrives", kind: "trigger", mono: "⚡" },
    { id: "r", x: 420, y: 300, label: "AI + rules", sub: "check it", kind: "ai", mono: "AI" },
    { id: "a", x: 700, y: 300, label: "Approve", sub: "then PayPal", kind: "money", mono: "PP" },
    { id: "n", x: 980, y: 300, label: "Notify", sub: "the team", kind: "notify", mono: "✉", w: 180 },
  ],
  edges: [["t", "r"], ["r", "a"], ["a", "n"]],
  badges: [B.paypal],
};

const out = join(import.meta.dirname, "..", "public", "templates");
mkdirSync(out, { recursive: true });
for (const t of [...THUMBS, FALLBACK]) {
  const svg = render(t);
  writeFileSync(join(out, `${t.slug}.svg`), svg);
  console.log(`${t.slug}.svg ${(svg.length / 1024).toFixed(1)} KB`);
}
