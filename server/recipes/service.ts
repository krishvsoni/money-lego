import "server-only";
import { ObjectId } from "mongodb";
import type { RecipeDTO } from "@/lib/dto";
import { totalRaw, type RecipeInput } from "@/lib/recipe-schema";
import type { SessionUser } from "../auth/session";
import { collections } from "../db/collections";
import { inTransaction } from "../db/transaction";
import type { RecipeDoc } from "../db/types";
import { errors } from "../errors";

// Recipes are mutable pointers to immutable versions. Every save writes a new
// recipe_versions document inside the same transaction that moves the pointer, so an
// execution can always cite the exact configuration it ran with.

export function parseId(id: string, what = "Recipe"): ObjectId {
  if (!ObjectId.isValid(id) || id.length !== 24) throw errors.notFound(what);
  return new ObjectId(id);
}

export function toRecipeDTO(doc: RecipeDoc): RecipeDTO {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    description: doc.description,
    status: doc.status,
    version: doc.currentVersion,
    config: doc.config,
    totalRaw: totalRaw(doc.config).toString(),
    runCount: doc.runCount,
    lastRunAt: doc.lastRunAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function listRecipes(user: SessionUser, status: "active" | "archived" = "active"): Promise<RecipeDTO[]> {
  const { recipes } = await collections();
  const docs = await recipes.find({ ownerId: user.userId, status }).sort({ updatedAt: -1 }).limit(200).toArray();
  return docs.map(toRecipeDTO);
}

// Ownership is part of every query filter, so another user's id behaves exactly like a
// missing one: same 404, nothing revealed.
export async function getRecipeDoc(user: SessionUser, id: string): Promise<RecipeDoc> {
  const { recipes } = await collections();
  const doc = await recipes.findOne({ _id: parseId(id), ownerId: user.userId });
  if (!doc) throw errors.notFound("Recipe");
  return doc;
}

export async function createRecipe(user: SessionUser, input: RecipeInput): Promise<RecipeDTO> {
  const { recipes, recipeVersions } = await collections();
  const now = new Date();
  const doc: RecipeDoc = {
    _id: new ObjectId(),
    ownerId: user.userId,
    name: input.name,
    description: input.description,
    status: "active",
    currentVersion: 1,
    config: input.config,
    runCount: 0,
    lastRunAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await inTransaction(async (session) => {
    await recipes.insertOne(doc, { session });
    await recipeVersions.insertOne(
      { _id: new ObjectId(), recipeId: doc._id, ownerId: user.userId, version: 1, name: doc.name, config: doc.config, createdAt: now },
      { session },
    );
  });
  return toRecipeDTO(doc);
}

export async function updateRecipe(
  user: SessionUser,
  id: string,
  input: RecipeInput,
  expectedVersion: number,
): Promise<RecipeDTO> {
  const { recipes, recipeVersions } = await collections();
  const recipeId = parseId(id);
  const now = new Date();

  const updated = await inTransaction(async (session) => {
    // Optimistic concurrency: the write only lands if nobody saved since this editor
    // loaded version `expectedVersion`.
    const next = await recipes.findOneAndUpdate(
      { _id: recipeId, ownerId: user.userId, status: "active", currentVersion: expectedVersion },
      {
        $set: { name: input.name, description: input.description, config: input.config, updatedAt: now },
        $inc: { currentVersion: 1 },
      },
      { returnDocument: "after", session },
    );
    if (!next) return null;
    await recipeVersions.insertOne(
      {
        _id: new ObjectId(),
        recipeId,
        ownerId: user.userId,
        version: next.currentVersion,
        name: next.name,
        config: next.config,
        createdAt: now,
      },
      { session },
    );
    return next;
  });

  if (updated) return toRecipeDTO(updated);
  const existing = await recipes.findOne({ _id: recipeId, ownerId: user.userId });
  if (!existing) throw errors.notFound("Recipe");
  if (existing.status === "archived") throw errors.invalidState("Restore this recipe before editing it.");
  throw errors.staleWrite();
}

export async function duplicateRecipe(user: SessionUser, id: string): Promise<RecipeDTO> {
  const source = await getRecipeDoc(user, id);
  return createRecipe(user, {
    name: `${source.name} (copy)`.slice(0, 80),
    description: source.description,
    config: source.config,
  });
}

export async function setRecipeStatus(user: SessionUser, id: string, status: "active" | "archived"): Promise<RecipeDTO> {
  const { recipes } = await collections();
  const doc = await recipes.findOneAndUpdate(
    { _id: parseId(id), ownerId: user.userId },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!doc) throw errors.notFound("Recipe");
  return toRecipeDTO(doc);
}
