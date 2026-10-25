import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { testCredential } from "@/server/integrations/credential-check";

export const POST = route<undefined, true, { id: string }>({ auth: true, rate: RATE_RULES.quote }, async ({ user }, { id }) => testCredential(user, id));
