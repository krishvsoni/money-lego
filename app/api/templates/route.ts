import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { listTemplates } from "@/server/templates/service";

// Templates are shared, published content with no secrets in them, so browsing needs no
// session. Importing one (POST /api/workflows) does.
export const GET = route({ auth: false, rate: RATE_RULES.read }, async () => ({ templates: await listTemplates() }));
