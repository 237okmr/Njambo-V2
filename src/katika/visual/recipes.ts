import { VisualSpec } from './visualSpec';

export interface SavedRecipe {
  id: string;
  name: string;
  createdAt: string;
  spec: VisualSpec;
}

const STORAGE_KEY = 'katika_visual_recipes_v1';
const MAX_RECIPES = 20;

export function listRecipes(): SavedRecipe[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecipe(name: string, spec: VisualSpec): SavedRecipe {
  const recipes = listRecipes();

  // Exclure les blocs IMAGE de la sauvegarde (conforme spécification)
  const cleanedSpec: VisualSpec = {
    ...spec,
    blocks: spec.blocks.filter((b) => b.type !== 'IMAGE'),
  };

  const newRecipe: SavedRecipe = {
    id: `recipe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: name.trim() || 'Ma Recette Visuelle',
    createdAt: new Date().toISOString(),
    spec: cleanedSpec,
  };

  const updated = [newRecipe, ...recipes.filter((r) => r.id !== newRecipe.id)].slice(0, MAX_RECIPES);

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  } catch (err) {
    console.error('Erreur lors de la sauvegarde de la recette:', err);
  }

  return newRecipe;
}

export function deleteRecipe(id: string): void {
  const recipes = listRecipes();
  const updated = recipes.filter((r) => r.id !== id);

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  } catch (err) {
    console.error('Erreur lors de la suppression de la recette:', err);
  }
}
