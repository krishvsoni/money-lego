import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { getTemplate } from "@/server/templates/service";

export const GET = route<undefined, false, { slug: string }>({ auth: false, rate: RATE_RULES.read }, async (_ctx, { slug }) => ({ template: await getTemplate(slug) }));
