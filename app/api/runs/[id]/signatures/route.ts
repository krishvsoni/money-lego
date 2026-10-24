import { z } from "zod";
import { recordSignatures } from "@/server/executions/service";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

const base58Signature = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/, "Not a transaction signature");

const body = z.object({
  kind: z.enum(["keeper_funding", "route_init", "orchestrator_init", "session_init", "dispersion_init"]),
  items: z.array(z.object({ signature: base58Signature, index: z.number().int().min(0).max(31) })).min(1).max(32),
});

export const POST = route<typeof body, true, { id: string }>(
  { auth: true, rate: RATE_RULES.write, body },
  async ({ user, body }, { id }) => ({ run: await recordSignatures(user, id, body.kind, body.items) }),
);
