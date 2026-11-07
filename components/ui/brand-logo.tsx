// Official brand marks, served from /public/logos (downloaded once from each brand's own
// site or svgl.app, never hotlinked).
// Plain <img> keeps them out of the JS bundle and lets the browser cache them.

const LOGOS = {
  paypal: "PayPal",
  openrouter: "OpenRouter",
  channel3: "Channel3",
  elastic: "Elastic",
  zapier: "Zapier",
  "ag-grid": "AG Grid",
  slack: "Slack",
  github: "GitHub",
  "google-sheets": "Google Sheets",
  discord: "Discord",
  stripe: "Stripe",
  shopify: "Shopify",
  telegram: "Telegram",
  notion: "Notion",
  airtable: "Airtable",
} as const;

export type Brand = keyof typeof LOGOS;

const FILE: Partial<Record<Brand, string>> = {};

export const isBrand = (value: string | undefined): value is Brand => Boolean(value && value in LOGOS);

export function BrandLogo({ brand, size = 20, className = "", label = false }: { brand: Brand; size?: number; className?: string; label?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny local SVGs; next/image adds nothing here
    <img
      src={`/logos/${FILE[brand] ?? `${brand}.svg`}`}
      width={size}
      height={size}
      alt={label ? LOGOS[brand] : ""}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={`shrink-0 object-contain ${className}`}
      // Callers that size with classes (h-4 w-4) win; otherwise the size prop applies.
      style={/\b(h|w|size)-/.test(className) ? undefined : { width: size, height: size }}
    />
  );
}
