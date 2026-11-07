import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// The browser only ever talks to this origin. The one exception is the hosted checkout
// (/pay/*), which loads PayPal's JS SDK and its buyer windows, with PayPal's documented
// domains allowed on that route only.
// Clerk (sign-in) loads from its Frontend API, serves avatars from img.clerk.com and uses
// Cloudflare Turnstile for bot protection; those are allowed on every page.
// Production instances use clerk.<your-domain>: add it via CLERK_FRONTEND_API_URL.
const CLERK = ["https://*.clerk.accounts.dev", process.env.CLERK_FRONTEND_API_URL].filter(Boolean).join(" ");
const CLERK_FRAMES = "https://challenges.cloudflare.com";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${CLERK} ${CLERK_FRAMES}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://img.clerk.com",
  "font-src 'self'",
  `connect-src 'self' ${CLERK}${isDev ? " ws:" : ""}`,
  `frame-src ${CLERK_FRAMES}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const PAYPAL = "https://*.paypal.com https://*.paypalobjects.com";
const checkoutCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${PAYPAL} ${CLERK} ${CLERK_FRAMES}`,
  `style-src 'self' 'unsafe-inline' ${PAYPAL}`,
  // https: covers Channel3 product images on /shop, served from many merchant CDNs.
  `img-src 'self' data: blob: https:`,
  "font-src 'self' data:",
  `connect-src 'self' ${PAYPAL} ${CLERK}${isDev ? " ws:" : ""}`,
  `frame-src ${PAYPAL} ${CLERK_FRAMES}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  `form-action 'self' ${PAYPAL}`,
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // "same-origin" would sever window.opener the moment a connect popup visits Stripe, Google
  // or any provider, so the page could never hear that the connection finished.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PayPal's Agent Toolkit (and its SDK dependencies) load from node_modules at runtime.
  serverExternalPackages: ["@paypal/agent-toolkit"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The PayPal connection now lives on Connections; old links still land there.
  async redirects() {
    return [{ source: "/paypal", destination: "/connections#paypal", permanent: true }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Later entries override earlier ones for the same header key.
      ...["/pay/:path*", "/shop"].map((source) => ({
        source,
        headers: [
          { key: "Content-Security-Policy", value: checkoutCsp },
          { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://www.paypal.com" "https://www.sandbox.paypal.com")' },
          { key: "Cross-Origin-Opener-Policy", value: "unsafe-none" },
        ],
      })),
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }] },
      // Where a connect popup lands after consent; it must keep its link to the opener.
      { source: "/connections/done", headers: [{ key: "Cross-Origin-Opener-Policy", value: "unsafe-none" }] },
    ];
  },
};

export default nextConfig;
