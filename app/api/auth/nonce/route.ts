import { z } from "zod";
import { issueNonce, signInDomain } from "@/server/auth/service";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

export const POST = route(
  { auth: false, rate: RATE_RULES.authNonce, body: z.object({ wallet: z.string().max(64) }) },
  async ({ body, req }) => issueNonce(body.wallet, signInDomain(req.headers)),
);
