// The public address of this deployment, for links that leave the app (PayPal return pages,
// OAuth callbacks, provider webhooks). A configured APP_URL wins when it's a real public
// address. On Vercel, a missing or localhost APP_URL (often copied from a local .env) is
// replaced with the address Vercel gives every deployment, so production links never point
// at localhost and nothing has to be configured for it.

const LOCAL = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i;

export interface SiteUrlSource {
  APP_URL?: string;
  VERCEL_ENV?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
  PORT?: string;
}

export function resolveSiteUrl(e: SiteUrlSource | NodeJS.ProcessEnv): string {
  const configured = e.APP_URL?.trim().replace(/\/+$/, "") ?? "";
  if (configured && !LOCAL.test(configured)) return configured;
  // Production uses the project's own domain; previews use their deployment address.
  const vercel = (e.VERCEL_ENV === "production" ? e.VERCEL_PROJECT_PRODUCTION_URL : e.VERCEL_URL) ?? e.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return configured || `http://localhost:${e.PORT || 3000}`;
}

export const isLocalUrl = (url: string): boolean => LOCAL.test(url);
