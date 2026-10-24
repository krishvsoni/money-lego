import { route } from "@/server/http/handler";
import { env } from "@/server/config/env";
import { currentNetwork, supportedTokens } from "@/lib/tokens";

export const GET = route({ auth: false }, async () => {
  const e = env();
  return {
    network: currentNetwork(),
    tokens: supportedTokens(),
    providerReady: Boolean(e.MULTIHOPPER_API_KEY) && (e.MULTIHOPPER_ENV === "devnet" || e.MULTIHOPPER_ALLOW_PRODUCTION === "true"),
  };
});
