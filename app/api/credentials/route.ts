import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { createCredential, credentialInputSchema, listCredentials } from "@/server/workflows/credentials";

export const GET = route({ auth: true }, async ({ user }) => ({ credentials: await listCredentials(user) }));

export const POST = route({ auth: true, rate: RATE_RULES.write, body: credentialInputSchema }, async ({ user, body }) => createCredential(user, body));
