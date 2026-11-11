import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// The browser only ever talks to this origin. The one exception is the hosted checkout
// (/pay/*), which loads PayPal's JS SDK and its buyer windows, with PayPal's documented
// domains allowed on that route only.
// Sign-in (Kinde) needs nothing here: it is a full-page redirect to Kinde's hosted pages and
// back, and no Kinde script runs in the browser.

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // https: covers Channel3 product photos (run panel), served from many merchant CDNs.
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const PAYPAL = "https://*.paypal.com https://*.paypalobjects.com";
const checkoutCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${PAYPAL}`,
  `style-src 'self' 'unsafe-inline' ${PAYPAL}`,
  // https: covers Channel3 product images, served from many merchant CDNs.
  `img-src 'self' data: blob: https:`,
  "font-src 'self' data:",
  `connect-src 'self' ${PAYPAL}${isDev ? " ws:" : ""}`,
  `frame-src ${PAYPAL}`,
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
      ...["/pay/:path*"].map((source) => ({
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
