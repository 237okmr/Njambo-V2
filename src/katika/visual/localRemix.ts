import { MEME_BANK, MemeEntry, convertMemeToVisualSpec } from '../data/memeBank';
import { VISUAL_PALETTES, VISUAL_PATTERNS, VisualSpec } from './visualSpec';

/**
 * Remix local SANS IA : quand le quota Gemini est épuisé, le copilote propose quand même des visuels
 * à partir de la banque de mèmes. Coût zéro token, aucun appel réseau.
 */

/** Faut-il basculer sur le remix local ? Oui pour un quota ou un plafond horaire, non pour une requête déjà en cours. */
export function shouldFallbackToLocalRemix(status: number, data: { quotaExceeded?: boolean; error?: string } | null | undefined): boolean {
  if (data?.quotaExceeded === true) return true;
  if (status !== 429) return false;
  const message = String(data?.error || '').toLowerCase();
  return !message.includes('déjà en cours');
}

function pickDistinctMemes(count: number, avoidIds: string[], rand: () => number): MemeEntry[] {
  const fresh = MEME_BANK.filter((m) => !avoidIds.includes(m.id));
  const pool = fresh.length >= count ? fresh : MEME_BANK;
  const shuffled = [...pool].sort(() => rand() - 0.5);

  // On préfère des thèmes (tags) différents pour que les propositions ne se ressemblent pas.
  const picked: MemeEntry[] = [];
  const usedTags = new Set<string>();
  for (const meme of shuffled) {
    if (picked.length >= count) break;
    if (!usedTags.has(meme.tag)) {
      picked.push(meme);
      usedTags.add(meme.tag);
    }
  }
  for (const meme of shuffled) {
    if (picked.length >= count) break;
    if (!picked.includes(meme)) picked.push(meme);
  }
  return picked;
}

/** Jusqu'à `count` visuels distincts (mèmes différents, palettes et motifs différents). */
export function buildLocalRemixVariants(
  count: number = 3,
  options: { avoidIds?: string[]; rand?: () => number } = {}
): { specs: VisualSpec[]; memeIds: string[] } {
  const rand = options.rand ?? Math.random;
  const memes = pickDistinctMemes(count, options.avoidIds ?? [], rand);
  const paletteStart = Math.floor(rand() * VISUAL_PALETTES.length);

  const specs = memes.map((meme, index) => {
    const spec = convertMemeToVisualSpec(meme);
    spec.palette = VISUAL_PALETTES[(paletteStart + index) % VISUAL_PALETTES.length];
    spec.pattern = VISUAL_PATTERNS[index % VISUAL_PATTERNS.length];
    return spec;
  });

  return { specs, memeIds: memes.map((m) => m.id) };
}
