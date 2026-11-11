// Kernel proof of concept: the read-only "browser check" a workflow step would do.
//
//   npm run kernel:poc -- https://www.example-store.com/some-product [allowed-host]
//
// Opens one fresh headless Kernel browser, loads the page, reads the title and any
// schema.org Product price/availability, and always deletes the browser. The Playwright code
// runs inside Kernel's VM (Playwright Execution), so this app ships no browser or Playwright.
// Needs KERNEL_API_KEY.
//
// The URL and redirect rules live in lib/browser, shared with the eventual executor: a
// non-https URL, a host other than the allowed one, or a redirect to another host exits
// non-zero and prints no page data.

import { checkPage, kernelRestClient } from "../lib/browser/kernel-check";
import { parseTarget } from "../lib/browser/url-policy";

async function main() {
  const [rawUrl, allowedHost] = process.argv.slice(2);
  if (!rawUrl) throw new Error("Pass an https:// URL, e.g. npm run kernel:poc -- https://example.com");
  parseTarget(rawUrl, allowedHost); // fail on a bad URL before asking for a key
  const apiKey = process.env.KERNEL_API_KEY;
  if (!apiKey) throw new Error("KERNEL_API_KEY is not set. Create a project-scoped key in the Kernel dashboard (browsers: create, use, delete) and add it to .env.");

  const result = await checkPage({
    url: rawUrl,
    allowedHost,
    client: kernelRestClient({ apiKey, baseUrl: process.env.KERNEL_BASE_URL }),
    onCleanupError: (session, e) => {
      console.error(`Could not delete browser ${session}: ${e instanceof Error ? e.message : e}`);
      process.exitCode = 1;
    },
  });
  console.log(JSON.stringify({ ...result, hostCheck: "ok" }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
