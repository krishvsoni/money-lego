import { CONNECTIONS } from "@/lib/connections/catalog";
import { route } from "@/server/http/handler";
import { adapterFor } from "@/server/oauth/adapters";
import { telegramConfigured } from "@/server/oauth/telegram";

// Which sign-ins this server can offer. Booleans only: no client ids or secrets leave here.
export const GET = route({ auth: true }, async () => ({
  available: Object.fromEntries(CONNECTIONS.map((c) => [c.type, c.method === "telegram" ? telegramConfigured() : Boolean(adapterFor(c.type)?.configured())])),
}));
