import { buildCaptions } from './captionEngine';
import { VisualSpec } from './visualSpec';

/** Part maximale des mots du post déjà présents dans le visuel (au-delà, le post « répète » le visuel). */
export const POST_OVERLAP_MAX_RATIO = 0.5;

/** Les mots plus courts sont ignorés (articles, « pour », « dans », « kora »...). */
const MIN_SIGNIFICANT_WORD_LENGTH = 5;

function significantWords(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= MIN_SIGNIFICANT_WORD_LENGTH);
}

/** Rassemble tous les textes visibles d'un visuel (accroche, corps, puces, stat, citation, comparatif, étapes, CTA). */
export function collectVisualText(spec: VisualSpec): string {
  const parts: string[] = [];
  for (const block of spec.blocks) {
    switch (block.type) {
      case 'BADGE':
      case 'HOOK':
      case 'BODY':
      case 'QUOTE':
        parts.push(block.text || '');
        break;
      case 'BULLETS':
      case 'STEPS':
        parts.push(...(block.items || []));
        break;
      case 'STAT':
        parts.push(block.label || '', block.sublabel || '');
        break;
      case 'COMPARE':
        parts.push(block.leftTitle || '', block.leftText || '', block.rightTitle || '', block.rightText || '');
        break;
      default:
        break;
    }
  }
  parts.push(spec.cta?.text || '');
  return parts.join(' ');
}

/** Part (0 à 1) des mots significatifs du post qui figurent déjà dans le visuel. */
export function overlapRatio(postText: string, visualText: string): number {
  const postWords = Array.from(new Set(significantWords(postText)));
  if (postWords.length === 0) return 0;
  const visualWords = new Set(significantWords(visualText));
  const shared = postWords.filter((w) => visualWords.has(w)).length;
  return shared / postWords.length;
}

export function postOverlapsVisual(spec: VisualSpec): boolean {
  if (!spec.post) return false;
  const postText = `${spec.post.story} ${spec.post.question}`;
  return overlapRatio(postText, collectVisualText(spec)) > POST_OVERLAP_MAX_RATIO;
}

function hookKey(spec: VisualSpec): string {
  const hook = spec.blocks.find((b) => b.type === 'HOOK');
  return hook && hook.type === 'HOOK' ? significantWords(hook.text).join(' ') : '';
}

interface VariantLike {
  spec: VisualSpec | null;
  warnings: string[];
}

/**
 * Contrôle les variantes d'un même appel, sans aucun appel IA supplémentaire :
 * - une variante dont l'accroche est identique à une précédente est retirée ;
 * - un post qui répète le visuel est retiré (une histoire locale le remplacera) et les légendes sont recalculées.
 */
export function applyVariantChecks<T extends VariantLike>(variants: T[]): T[] {
  const kept: T[] = [];
  const seenHooks = new Set<string>();

  for (const variant of variants) {
    const spec = variant.spec;
    if (!spec) continue;

    const key = hookKey(spec);
    if (key && seenHooks.has(key)) continue;
    if (key) seenHooks.add(key);

    if (spec.post && postOverlapsVisual(spec)) {
      variant.warnings.push('Le post répétait le visuel : il sera remplacé par une histoire locale.');
      delete spec.post;
      spec.captions = buildCaptions(spec);
    }

    kept.push(variant);
  }

  return kept;
}
