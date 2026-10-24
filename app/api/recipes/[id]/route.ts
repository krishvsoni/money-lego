import { z } from "zod";
import { recipeInputSchema } from "@/lib/recipe-schema";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { getRecipeDoc, toRecipeDTO, updateRecipe } from "@/server/recipes/service";

type Params = { id: string };

export const GET = route<undefined, true, Params>({ auth: true }, async ({ user }, { id }) => ({
  recipe: toRecipeDTO(await getRecipeDoc(user, id)),
}));

const body = recipeInputSchema.extend({ expectedVersion: z.number().int().min(1) });

export const PUT = route<typeof body, true, Params>({ auth: true, rate: RATE_RULES.write, body }, async ({ user, body }, { id }) => ({
  recipe: await updateRecipe(user, id, body, body.expectedVersion),
}));
