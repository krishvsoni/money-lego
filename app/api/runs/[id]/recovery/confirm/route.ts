import { z } from "zod";
import { confirmRunRecovery } from "@/server/executions/recovery";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

const base58Signature = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/, "Not a transaction signature");

const body = z.object({
  kind: z.enum(["rescue", "reclaim"]),
  signatures: z.array(base58Signature).min(1).max(32),
});

export const POST = route<typeof body, true, { id: string }>({ auth: true, rate: RATE_RULES.write, body }, async ({ user, body }, { id }) => ({
  run: await confirmRunRecovery(user, id, body.kind, body.signatures),
}));
