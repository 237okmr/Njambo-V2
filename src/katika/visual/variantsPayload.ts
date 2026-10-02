import { VisualSpec } from './visualSpec';

/**
 * Format d'échange « plusieurs variantes de visuel » entre le client (génération) et le rendu du chat.
 * Les variantes voyagent dans un bloc json du message, ce qui garde l'historique des discussions inchangé.
 */
export interface VisualVariantItem {
  spec: VisualSpec;
  angle?: string;
  needsReview?: boolean;
}

export const VARIANTS_PAYLOAD_KEY = 'katikaVariants';

export function encodeVariantsReply(variants: VisualVariantItem[], note?: string): string {
  const payload = {
    [VARIANTS_PAYLOAD_KEY]: variants.map((v) => ({ spec: v.spec, angle: v.angle, needsReview: v.needsReview })),
  };
  const intro = note && note.trim() ? `${note.trim()}\n\n` : '';
  return `${intro}\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``;
}

/** Renvoie les variantes et le texte qui les précède, ou null si le message n'en contient pas. */
export function decodeVariantsReply(content: string): { variants: VisualVariantItem[]; text: string } | null {
  if (!content || !content.includes(VARIANTS_PAYLOAD_KEY)) return null;
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;

  try {
    const parsed = JSON.parse(content.substring(start, end + 1));
    const list = parsed?.[VARIANTS_PAYLOAD_KEY];
    if (!Array.isArray(list)) return null;

    const variants: VisualVariantItem[] = list.filter(
      (item: any) => item && typeof item === 'object' && item.spec && Array.isArray(item.spec.blocks)
    );
    if (variants.length === 0) return null;

    const before = content.substring(0, start).replace(/```json/g, '').replace(/```/g, '').trim();
    return { variants, text: before };
  } catch {
    return null;
  }
}
