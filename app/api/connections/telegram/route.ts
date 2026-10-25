import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { startTelegramLink } from "@/server/oauth/telegram";

export const POST = route({ auth: true, rate: RATE_RULES.write }, async ({ user }) => startTelegramLink(user));
