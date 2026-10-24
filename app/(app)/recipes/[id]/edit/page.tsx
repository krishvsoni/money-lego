"use client";

import { useParams } from "next/navigation";
import type { RecipeDTO } from "@/lib/dto";
import { useResource } from "@/lib/use-resource";
import { RecipeEditor } from "@/features/recipes/recipe-editor";

export default function EditRecipePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useResource<{ recipe: RecipeDTO }>(`/api/recipes/${id}`);

  if (error) return <p role="alert" className="text-danger">{error}</p>;
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-sunken" />;
  return (
    <div>
      <h1 className="headline text-3xl">Edit {data.recipe.name}</h1>
      <p className="mt-2 max-w-[60ch] text-ink-2">
        Saving creates version {data.recipe.version + 1}. Past runs keep the exact version they ran with.
      </p>
      <div className="mt-6">
        <RecipeEditor recipe={data.recipe} />
      </div>
    </div>
  );
}
