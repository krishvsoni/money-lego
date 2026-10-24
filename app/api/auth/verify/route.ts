import { z } from "zod";
import { verifySignIn } from "@/server/auth/service";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

const body = z.object({
  wallet: z.string().max(64),
  nonce: z.string().regex(/^[0-9a-f]{32}$/),
  signature: z.string().max(128),
});

export const POST = route({ auth: false, rate: RATE_RULES.authVerify, body }, async ({ body }) => verifySignIn(body));
