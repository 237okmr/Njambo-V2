import { sanitizeNjamboCard } from '../types/socialVisuals';
import { buildCaptions } from './captionEngine';
import {
  BLOCK_LIMITS,
  VisualBlock,
  VisualBlockType,
  VisualFormat,
  VisualSpec,
} from './visualSpec';
import { SocialVisualPalette, SocialVisualPattern } from '../types/socialVisuals';

export interface ValidateSpecContext {
  snapshotStats?: Record<string, any>;
  allowedPlayerNames?: string[];
  [key: string]: any;
}

export interface ValidateSpecResult {
  spec: VisualSpec | null;
  warnings: string[];
  needsReview: boolean;
}

export const FORBIDDEN_TOPICS = [
  'bamileke',
  'bassa',
  'beti',
  'ewondo',
  'fulani',
  'bafia',
  'sawa',
  'anglophone',
  'francophone',
  'noso',
  'nordiste',
  'sudiste',
  'ethnie',
  'tribu',
  'tribalisme',
  'islam',
  'musulman',
  'chretien',
  'christianisme',
  'eglise',
  'mosquee',
  'religion',
  'mrc',
  'rdpc',
  'cpdm',
  'election',
  'president',
  'ministre',
  'depute',
  'gouvernement',
  'opposant',
  'politique',
];

const VALID_FORMATS: VisualFormat[] = ['SQUARE', 'STORY', 'BANNER'];
const VALID_PALETTES: SocialVisualPalette[] = [
  'EMERALD_GOLD',
  'EBONY_GOLD',
  'SUNSET_TERRACOTTA',
  'ROYAL_SAPPHIRE',
];
const VALID_PATTERNS: SocialVisualPattern[] = [
  'NDOP_CHEVRON',
  'DIAMONDS',
  'MINIMAL',
];
const VALID_BLOCK_TYPES: VisualBlockType[] = [
  'BADGE',
  'HOOK',
  'BODY',
  'BULLETS',
  'STAT',
  'QUOTE',
  'COMPARE',
  'CARDS',
  'STEPS',
  'EVENT',
  'IMAGE',
  'SPACER',
];

/**
 * Nettoie les identifiants techniques dans un texte (#p_, #m_, #usr_, UUIDs, etc.)
 */

export function cleanTechnicalIdentifiers(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let clean = text;
  clean = clean.replace(/#p_usr_[a-zA-Z0-9_-]+/gi, '');
  clean = clean.replace(/#p_[a-zA-Z0-9_-]+/gi, '');
  clean = clean.replace(/#m_[a-zA-Z0-9_-]+/gi, '');
  clean = clean.replace(/#usr_[a-zA-Z0-9_-]+/gi, '');
  clean = clean.replace(/#table_[a-zA-Z0-9_-]+/gi, '');
  clean = clean.replace(/#log_[a-zA-Z0-9_-]+/gi, '');
  clean = clean.replace(/#u_[a-zA-Z0-9_-]+/gi, '');
  clean = clean.replace(/#note_[a-zA-Z0-9_-]+/gi, '');
  clean = clean.replace(/#[a-zA-Z0-9_]{5,}/g, '');
  return clean.trim();
}

/**
 * Remplace "gratuit" sans "bêta" par une formulation bêta
 */
export function sanitizeGratuitText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let clean = text;
  // 100% gratuit -> bêta ouverte
  clean = clean.replace(/\b100%\s*gratuit\b/gi, 'bêta ouverte');
  // gratuitement -> en bêta
  clean = clean.replace(/\bgratuitement\b/gi, 'en bêta');
  // gratuit isolé sans bêta
  clean = clean.replace(/\bgratuit\b(?!\s*(?:en\s+)?bêta)/gi, 'en bêta');
  return clean;
}

function truncateWords(text: string, maxWords: number): { text: string; truncated: boolean } {
  if (!text) return { text: '', truncated: false };
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return { text, truncated: false };
  return { text: words.slice(0, maxWords).join(' '), truncated: true };
}

function truncateChars(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (!text) return { text: '', truncated: false };
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.substring(0, maxChars).trim(), truncated: true };
}

/**
 * Valide et répare une spécification visuelle brute reçue de l'IA ou du client.
 */
export function validateAndRepairSpec(
  raw: any,
  ctx?: ValidateSpecContext
): ValidateSpecResult {
  const warnings: string[] = [];
  let needsReview = false;

  if (!raw || typeof raw !== 'object') {
    return {
      spec: null,
      warnings: ['Spécification invalide (doit être un objet).'],
      needsReview: true,
    };
  }

  // 1. Vérification globale des sujets interdits (ethnie, région, religion, politique)
  const rawString = JSON.stringify(raw).toLowerCase();
  for (const topic of FORBIDDEN_TOPICS) {
    // Mot-clé isolé ou partiel significatif
    const regex = new RegExp(`\\b${topic}\\b`, 'i');
    if (regex.test(rawString)) {
      warnings.push(`Sujet interdit ("${topic}") détecté. Spécification refusée.`);
      return {
        spec: null,
        warnings,
        needsReview: true,
      };
    }
  }

  // 2. Format, Palette, Pattern
  let format: VisualFormat = 'SQUARE';
  if (VALID_FORMATS.includes(raw.format)) {
    format = raw.format;
  } else {
    warnings.push(`Format "${raw.format}" non valide, ramené à SQUARE.`);
  }

  let palette: SocialVisualPalette = 'EMERALD_GOLD';
  if (VALID_PALETTES.includes(raw.palette)) {
    palette = raw.palette;
  } else {
    warnings.push(`Palette "${raw.palette}" non valide, ramenée à EMERALD_GOLD.`);
  }

  let pattern: SocialVisualPattern = 'NDOP_CHEVRON';
  if (VALID_PATTERNS.includes(raw.pattern)) {
    pattern = raw.pattern;
  } else {
    warnings.push(`Motif "${raw.pattern}" non valide, ramené à NDOP_CHEVRON.`);
  }

  // Helper pour traiter et vérifier tout texte
  const processText = (textStr: string): string => {
    let t = cleanTechnicalIdentifiers(textStr || '');
    const beforeGratuit = t;
    t = sanitizeGratuitText(t);
    if (t !== beforeGratuit) {
      if (!warnings.includes('Ajustement automatique de la mention "gratuit" vers la bêta.')) {
        warnings.push('Ajustement automatique de la mention "gratuit" vers la bêta.');
      }
      needsReview = true;
    }

    // Contrôles de sensibilité (trigger needsReview)
    const lower = t.toLowerCase();

    // Recompense/Gains réels
    if (
      /argent r[eé]el|gain financier|cashout|retrait mobile money|francs cfa r[eé]els|mises r[eé]elles/i.test(
        lower
      )
    ) {
      needsReview = true;
      warnings.push('Mention de gains ou d\'argent réel détectée (nécessite révision).');
    }

    // Cartes invalides / termes interdits
    if (
      /\b(?:as|ace|roi|dame|valet|atout)\b/i.test(lower) &&
      !/pas d'as|ni as|ni roi/i.test(lower)
    ) {
      needsReview = true;
      warnings.push('Terme de carte non Njambo (As, Roi, Dame, Valet, Atout) détecté.');
    }

    // "cagnotte" sans "jetons virtuels"
    if (lower.includes('cagnotte') && !lower.includes('jetons virtuels')) {
      needsReview = true;
      warnings.push('Cagnotte mentionnée sans la précision "jetons virtuels".');
    }

    return t;
  };

  // 3. Validation et réparation des blocs
  const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  const validBlocks: VisualBlock[] = [];

  rawBlocks.forEach((b: any, idx: number) => {
    if (!b || typeof b !== 'object' || !VALID_BLOCK_TYPES.includes(b.type)) {
      warnings.push(`Bloc n°${idx + 1} de type inconnu "${b?.type}" supprimé.`);
      return;
    }

    const blockId = b.id && typeof b.id === 'string' ? b.id : `b_${idx + 1}`;
    const blockType: VisualBlockType = b.type;

    switch (blockType) {
      case 'BADGE': {
        const text = processText(b.text || '');
        const { text: cleanText, truncated } = truncateChars(
          text,
          BLOCK_LIMITS.BADGE_MAX_CHARS
        );
        if (truncated) {
          warnings.push(`Badge tronqué à ${BLOCK_LIMITS.BADGE_MAX_CHARS} caractères.`);
        }
        validBlocks.push({
          id: blockId,
          type: 'BADGE',
          text: cleanText || 'NJAMBO KORA',
          priority: b.priority || 2,
        });
        break;
      }
      case 'HOOK': {
        const text = processText(b.text || '');
        const { text: cleanText, truncated } = truncateWords(
          text,
          BLOCK_LIMITS.HOOK_MAX_WORDS
        );
        if (truncated) {
          warnings.push(`Accroche (HOOK) tronquée à ${BLOCK_LIMITS.HOOK_MAX_WORDS} mots.`);
        }
        const accentWords = Array.isArray(b.accentWords)
          ? b.accentWords.map((w: any) => processText(String(w)))
          : undefined;
        validBlocks.push({
          id: blockId,
          type: 'HOOK',
          text: cleanText || 'Joue au Njambo Kora',
          accentWords,
          priority: 1, // HOOK est prioritaire
        });
        break;
      }
      case 'BODY': {
        const text = processText(b.text || '');
        const { text: cleanText, truncated } = truncateWords(
          text,
          BLOCK_LIMITS.BODY_MAX_WORDS
        );
        if (truncated) {
          warnings.push(`Texte (BODY) tronqué à ${BLOCK_LIMITS.BODY_MAX_WORDS} mots.`);
        }
        validBlocks.push({
          id: blockId,
          type: 'BODY',
          text: cleanText,
          priority: b.priority || 2,
        });
        break;
      }
      case 'BULLETS': {
        const rawItems = Array.isArray(b.items) ? b.items : [];
        const cleanItems: string[] = [];
        rawItems.slice(0, BLOCK_LIMITS.BULLETS_MAX_ITEMS).forEach((item: any) => {
          const itemText = processText(String(item));
          const { text: cleanItemText, truncated } = truncateWords(
            itemText,
            BLOCK_LIMITS.BULLETS_ITEM_MAX_WORDS
          );
          if (truncated) {
            warnings.push(`Puce tronquée à ${BLOCK_LIMITS.BULLETS_ITEM_MAX_WORDS} mots.`);
          }
          if (cleanItemText) cleanItems.push(cleanItemText);
        });

        if (cleanItems.length === 0) {
          cleanItems.push('Rejoins la table');
        }

        const style = ['CHECK', 'SUIT', 'NUMBER'].includes(b.style) ? b.style : 'CHECK';

        validBlocks.push({
          id: blockId,
          type: 'BULLETS',
          items: cleanItems,
          style,
          priority: b.priority || 2,
        });
        break;
      }
      case 'STAT': {
        const valText = processText(String(b.value || ''));
        const { text: cleanValue, truncated: valTrunc } = truncateChars(
          valText,
          BLOCK_LIMITS.STAT_VALUE_MAX_CHARS
        );
        if (valTrunc) {
          warnings.push(`Valeur de stat tronquée à ${BLOCK_LIMITS.STAT_VALUE_MAX_CHARS} caractères.`);
        }

        const labelText = processText(b.label || '');
        const { text: cleanLabel, truncated: labelTrunc } = truncateWords(
          labelText,
          BLOCK_LIMITS.STAT_LABEL_MAX_WORDS
        );
        if (labelTrunc) {
          warnings.push(`Libellé de stat tronqué à ${BLOCK_LIMITS.STAT_LABEL_MAX_WORDS} mots.`);
        }

        const sublabel = b.sublabel ? processText(String(b.sublabel)) : undefined;

        // Vérification de la statistique dans snapshotStats
        if (ctx?.snapshotStats && typeof ctx.snapshotStats === 'object') {
          const statsStr = JSON.stringify(ctx.snapshotStats);
          // Extrait les chiffres de cleanValue pour vérifier leur présence
          const digitsMatch = cleanValue.match(/\d+/g);
          const valToCheck = digitsMatch ? digitsMatch.join('') : cleanValue;

          if (valToCheck && !statsStr.includes(valToCheck)) {
            needsReview = true;
            warnings.push(
              `Statistique "${cleanValue}" non trouvée dans les données de télémétrie fournies.`
            );
          }
        }

        // Si le libellé mentionne le score de maîtrise ou les victoires sans joueur autorisé
        if (/score de ma[iî]trise|parties jou[eé]es/i.test(cleanLabel) && ctx?.allowedPlayerNames && ctx.allowedPlayerNames.length === 0) {
          needsReview = true;
          warnings.push(
            `Statistique de joueur individuel ("${cleanLabel}") détectée alors qu'aucun joueur officiel n'est enregistré dans les données.`
          );
        }

        validBlocks.push({
          id: blockId,
          type: 'STAT',
          value: cleanValue || '100%',
          label: cleanLabel || 'Parties jouées',
          sublabel,
          priority: b.priority || 2,
        });
        break;
      }
      case 'QUOTE': {
        const text = processText(b.text || '');
        const { text: cleanText, truncated } = truncateWords(
          text,
          BLOCK_LIMITS.QUOTE_MAX_WORDS
        );
        if (truncated) {
          warnings.push(`Citation (QUOTE) tronquée à ${BLOCK_LIMITS.QUOTE_MAX_WORDS} mots.`);
        }

        const author = b.author ? processText(String(b.author)) : undefined;
        const consent = Boolean(b.consent);

        // QUOTE avec auteur sans consentement
        if (author && consent !== true) {
          needsReview = true;
          warnings.push(
            `Témoignage attribué à "${author}" sans consentement explicite (needsReview=true).`
          );
        }

        validBlocks.push({
          id: blockId,
          type: 'QUOTE',
          text: cleanText,
          author,
          consent,
          priority: b.priority || 2,
        });
        break;
      }
      case 'COMPARE': {
        const leftTitle = processText(b.leftTitle || 'AVANT');
        const leftText = processText(b.leftText || '');
        const { text: cleanLeftText } = truncateWords(
          leftText,
          BLOCK_LIMITS.COMPARE_TEXT_MAX_WORDS
        );

        const rightTitle = processText(b.rightTitle || 'APRÈS');
        const rightText = processText(b.rightText || '');
        const { text: cleanRightText } = truncateWords(
          rightText,
          BLOCK_LIMITS.COMPARE_TEXT_MAX_WORDS
        );

        validBlocks.push({
          id: blockId,
          type: 'COMPARE',
          leftTitle,
          leftText: cleanLeftText,
          rightTitle,
          rightText: cleanRightText,
          priority: b.priority || 2,
        });
        break;
      }
      case 'CARDS': {
        const rawCards = Array.isArray(b.cards) ? b.cards : [];
        const sanitizedCards: Array<{
          rank: string;
          suit: string;
          label?: string;
          highlight?: boolean;
        }> = [];

        rawCards.slice(0, BLOCK_LIMITS.CARDS_MAX_ITEMS).forEach((c: any) => {
          if (!c || typeof c !== 'object') return;
          const { rank: cleanRank, suit: cleanSuit } = sanitizeNjamboCard(
            String(c.rank || '7'),
            String(c.suit || '♥')
          );

          let label = c.label ? processText(String(c.label)) : undefined;

          // RÈGLE : Un libellé « KORA » n'est conservé QUE sur une carte de rang '3'
          if (label && /kora/i.test(label)) {
            if (cleanRank !== '3') {
              warnings.push(
                `Libellé KORA retiré de la carte ${cleanRank}${cleanSuit} (le Kora n'est valide que sur un 3).`
              );
              // Supprimer "KORA" du label ou le réinitialiser si le label était seulement "KORA"
              if (label.trim().toUpperCase() === 'KORA') {
                label = undefined;
              } else {
                label = label.replace(/kora/gi, '').trim() || undefined;
              }
            }
          }

          sanitizedCards.push({
            rank: cleanRank,
            suit: cleanSuit,
            label,
            highlight: Boolean(c.highlight),
          });
        });

        if (sanitizedCards.length === 0) {
          sanitizedCards.push({ rank: '3', suit: '♥', label: 'KORA' });
        }

        const arrangement = ['FAN', 'ROW', 'DUEL'].includes(b.arrangement)
          ? b.arrangement
          : 'FAN';

        validBlocks.push({
          id: blockId,
          type: 'CARDS',
          cards: sanitizedCards,
          arrangement,
          priority: b.priority || 2,
        });
        break;
      }
      case 'STEPS': {
        const rawItems = Array.isArray(b.items) ? b.items : [];
        const cleanItems: string[] = [];

        rawItems.slice(0, BLOCK_LIMITS.STEPS_MAX_ITEMS).forEach((st: any) => {
          const stepText = processText(String(st));
          const { text: cleanStepText } = truncateWords(
            stepText,
            BLOCK_LIMITS.STEPS_ITEM_MAX_WORDS
          );
          if (cleanStepText) cleanItems.push(cleanStepText);
        });

        while (cleanItems.length < BLOCK_LIMITS.STEPS_MIN_ITEMS) {
          cleanItems.push(`Étape ${cleanItems.length + 1}`);
        }

        validBlocks.push({
          id: blockId,
          type: 'STEPS',
          items: cleanItems,
          priority: b.priority || 2,
        });
        break;
      }
      case 'EVENT': {
        const date = b.date ? processText(String(b.date)) : undefined;
        let prize = b.prize ? processText(String(b.prize)) : undefined;
        const mode = b.mode ? processText(String(b.mode)) : undefined;
        const spots = b.spots ? processText(String(b.spots)) : undefined;

        validBlocks.push({
          id: blockId,
          type: 'EVENT',
          date,
          prize,
          mode,
          spots,
          priority: b.priority || 2,
        });
        break;
      }
      case 'IMAGE': {
        const dataUrl = b.dataUrl && typeof b.dataUrl === 'string' ? b.dataUrl : '';
        const frame = ['PHONE', 'ROUNDED', 'NONE'].includes(b.frame) ? b.frame : 'ROUNDED';
        const caption = b.caption ? processText(String(b.caption)) : undefined;

        validBlocks.push({
          id: blockId,
          type: 'IMAGE',
          dataUrl,
          frame,
          caption,
          priority: b.priority || 2,
        });
        break;
      }
      case 'SPACER': {
        const size = ['S', 'M', 'L'].includes(b.size) ? b.size : 'M';
        validBlocks.push({
          id: blockId,
          type: 'SPACER',
          size,
          priority: b.priority || 3,
        });
        break;
      }
    }
  });

  // 4. Garantie de présence d'un bloc HOOK
  const hasHook = validBlocks.some((b) => b.type === 'HOOK');
  if (!hasHook) {
    warnings.push('Aucun bloc HOOK trouvé. Insertion automatique d\'un bloc HOOK.');
    const newHook: VisualBlock = {
      id: 'b_hook_auto',
      type: 'HOOK',
      text: 'Njambo Kora en Bêta',
      priority: 1,
    };
    // Insère le HOOK juste après un BADGE s'il y en a un, sinon en position 0
    const badgeIdx = validBlocks.findIndex((b) => b.type === 'BADGE');
    if (badgeIdx !== -1) {
      validBlocks.splice(badgeIdx + 1, 0, newHook);
    } else {
      validBlocks.unshift(newHook);
    }
  }

  // 5. Ajustement du nombre total de blocs (2 à 7)
  if (validBlocks.length > BLOCK_LIMITS.MAX_BLOCKS) {
    warnings.push(
      `Nombre de blocs (${validBlocks.length}) supérieur au maximum (${BLOCK_LIMITS.MAX_BLOCKS}). Seuls les 7 premiers blocs sont conservés.`
    );
    validBlocks.splice(BLOCK_LIMITS.MAX_BLOCKS);
  }

  if (validBlocks.length < BLOCK_LIMITS.MIN_BLOCKS) {
    warnings.push('Moins de 2 blocs valides. Ajout d\'un bloc BODY complémentaire.');
    validBlocks.push({
      id: 'b_body_auto',
      type: 'BODY',
      text: 'Rejoins les maîtres du tapis vert.',
      priority: 2,
    });
  }

  // 6. Validation du CTA
  const rawCtaText = processText(raw.cta?.text || 'Joue en bêta');
  const { text: cleanCtaText, truncated: ctaTruncated } = truncateWords(
    rawCtaText,
    BLOCK_LIMITS.CTA_TEXT_MAX_WORDS
  );
  if (ctaTruncated) {
    warnings.push(`CTA tronqué à ${BLOCK_LIMITS.CTA_TEXT_MAX_WORDS} mots.`);
  }

  const cta = {
    text: cleanCtaText || 'Joue en bêta',
    intent: raw.cta?.intent || 'PLAY',
  };

  const footer = raw.footer
    ? {
        app: raw.footer.app !== false,
        whatsapp: raw.footer.whatsapp !== false,
        text: raw.footer.text ? processText(String(raw.footer.text)) : undefined,
      }
    : { app: true, whatsapp: true };

  const spec: VisualSpec = {
    version: 2,
    format,
    palette,
    pattern,
    blocks: validBlocks,
    cta,
    footer,
    meta: {
      source: 'AI',
      needsReview,
      warnings,
    },
  };

  // Génère ou met à jour les légendes réseaux
  spec.captions = buildCaptions(spec);

  return {
    spec,
    warnings,
    needsReview,
  };
}
