import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { duplicateRecipe } from "@/server/recipes/service";

export const POST = route<undefined, true, { id: string }>({ auth: true, rate: RATE_RULES.write }, async ({ user }, { id }) => ({
  recipe: await duplicateRecipe(user, id),
}));
