import { recipeInputSchema } from "@/lib/recipe-schema";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { createRecipe, listRecipes } from "@/server/recipes/service";

export const GET = route({ auth: true }, async ({ req, user }) => {
  const status = req.nextUrl.searchParams.get("status") === "archived" ? "archived" : "active";
  return { recipes: await listRecipes(user, status) };
});

export const POST = route({ auth: true, rate: RATE_RULES.write, body: recipeInputSchema }, async ({ user, body }) => ({
  recipe: await createRecipe(user, body),
}));
