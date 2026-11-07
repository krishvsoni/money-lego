import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { paypalStatus } from "@/server/paypal/status";

export const GET = route({ auth: true, rate: RATE_RULES.read }, async ({ user }) => paypalStatus(user));
