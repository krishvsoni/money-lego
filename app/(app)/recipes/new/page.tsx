import { RecipeEditor } from "@/features/recipes/recipe-editor";

export default function NewRecipePage() {
  return (
    <div>
      <h1 className="headline text-3xl">New recipe</h1>
      <p className="mt-2 max-w-[60ch] text-ink-2">Saving a recipe doesn&apos;t move any funds. You&apos;ll review a live quote and sign before anything is sent.</p>
      <div className="mt-6">
        <RecipeEditor />
      </div>
    </div>
  );
}
