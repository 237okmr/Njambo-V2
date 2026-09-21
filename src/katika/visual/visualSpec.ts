import { CtaIntent } from '../data/ctaLibrary';
import { NjamboRank, NjamboSuit, SocialVisualPalette, SocialVisualPattern } from '../types/socialVisuals';
import { VisualFormat } from './brandTokens';
export type { VisualFormat };

export type VisualBlockPriority = 1 | 2 | 3;

export type VisualBlockType =
  | 'BADGE'
  | 'HOOK'
  | 'BODY'
  | 'BULLETS'
  | 'STAT'
  | 'QUOTE'
  | 'COMPARE'
  | 'CARDS'
  | 'STEPS'
  | 'EVENT'
  | 'IMAGE'
  | 'SPACER';

export interface BaseVisualBlock {
  id: string;
  type: VisualBlockType;
  priority?: VisualBlockPriority; // default 2, 1 = never removed
}

export interface BadgeBlock extends BaseVisualBlock {
  type: 'BADGE';
  text: string; // ≤ 28 chars
}

export interface HookBlock extends BaseVisualBlock {
  type: 'HOOK';
  text: string; // ≤ 8 words
  accentWords?: string[];
}

export interface BodyBlock extends BaseVisualBlock {
  type: 'BODY';
  text: string; // ≤ 22 words
}

export interface BulletsBlock extends BaseVisualBlock {
  type: 'BULLETS';
  items: string[]; // 1 to 4 items, ≤ 9 words each
  style?: 'CHECK' | 'SUIT' | 'NUMBER';
}

export interface StatBlock extends BaseVisualBlock {
  type: 'STAT';
  value: string; // ≤ 8 chars
  label: string; // ≤ 6 words
  sublabel?: string;
}

export interface QuoteBlock extends BaseVisualBlock {
  type: 'QUOTE';
  text: string; // ≤ 25 words
  author?: string;
  consent?: boolean;
}

export interface CompareBlock extends BaseVisualBlock {
  type: 'COMPARE';
  leftTitle: string;
  leftText: string; // ≤ 14 words
  rightTitle: string;
  rightText: string; // ≤ 14 words
}

export interface CardItem {
  rank: NjamboRank | string;
  suit: NjamboSuit | string;
  label?: string;
  highlight?: boolean;
}

export interface CardsBlock extends BaseVisualBlock {
  type: 'CARDS';
  cards: CardItem[]; // 1 to 5 cards
  arrangement?: 'FAN' | 'ROW' | 'DUEL';
}

export interface StepsBlock extends BaseVisualBlock {
  type: 'STEPS';
  items: string[]; // 2 to 5 items, ≤ 6 words each
}

export interface EventBlock extends BaseVisualBlock {
  type: 'EVENT';
  date?: string;
  prize?: string;
  mode?: string;
  spots?: string;
}

export interface ImageBlock extends BaseVisualBlock {
  type: 'IMAGE';
  dataUrl: string;
  frame?: 'PHONE' | 'ROUNDED' | 'NONE';
  caption?: string;
}

export interface SpacerBlock extends BaseVisualBlock {
  type: 'SPACER';
  size: 'S' | 'M' | 'L';
}

export type VisualBlock =
  | BadgeBlock
  | HookBlock
  | BodyBlock
  | BulletsBlock
  | StatBlock
  | QuoteBlock
  | CompareBlock
  | CardsBlock
  | StepsBlock
  | EventBlock
  | ImageBlock
  | SpacerBlock;

export interface VisualCta {
  text: string; // ≤ 5 words
  intent?: CtaIntent | string;
}

export interface VisualFooter {
  app?: boolean;
  whatsapp?: boolean;
  text?: string;
}

export interface VisualMeta {
  presetId?: string;
  source: 'PRESET' | 'AI' | 'MANUAL';
  needsReview?: boolean;
  warnings?: string[];
}

export interface VisualCaptions {
  facebook?: string;
  whatsappGroup?: string;
  whatsappStatus?: string;
  instagram?: string;
  tiktok?: string;
  x?: string;
}

export interface VisualSpec {
  version: 2;
  format: VisualFormat;
  palette: SocialVisualPalette;
  pattern: SocialVisualPattern;
  blocks: VisualBlock[]; // 2 to 7 blocks
  cta: VisualCta;
  footer?: VisualFooter;
  meta?: VisualMeta;
  captions?: VisualCaptions;
}

export const BLOCK_LIMITS = {
  MIN_BLOCKS: 2,
  MAX_BLOCKS: 7,
  BADGE_MAX_CHARS: 28,
  HOOK_MAX_WORDS: 8,
  BODY_MAX_WORDS: 22,
  BULLETS_MIN_ITEMS: 1,
  BULLETS_MAX_ITEMS: 4,
  BULLETS_ITEM_MAX_WORDS: 9,
  STAT_VALUE_MAX_CHARS: 8,
  STAT_LABEL_MAX_WORDS: 6,
  QUOTE_MAX_WORDS: 25,
  COMPARE_TEXT_MAX_WORDS: 14,
  CARDS_MIN_ITEMS: 1,
  CARDS_MAX_ITEMS: 5,
  STEPS_MIN_ITEMS: 2,
  STEPS_MAX_ITEMS: 5,
  STEPS_ITEM_MAX_WORDS: 6,
  CTA_TEXT_MAX_WORDS: 5,
} as const;

export interface BlockFieldDef {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'enum' | 'object';
  required?: boolean;
  maxChars?: number;
  maxWords?: number;
  minItems?: number;
  maxItems?: number;
  options?: string[];
  description?: string;
}

export interface BlockTypeDef {
  type: VisualBlockType;
  label: string;
  description: string;
  fields: BlockFieldDef[];
}

export const BLOCK_DEFS: Record<VisualBlockType, BlockTypeDef> = {
  BADGE: {
    type: 'BADGE',
    label: 'Badge',
    description: 'Étagère ou badge supérieur (≤ 28 caractères)',
    fields: [
      { name: 'text', label: 'Texte', type: 'string', required: true, maxChars: BLOCK_LIMITS.BADGE_MAX_CHARS },
    ],
  },
  HOOK: {
    type: 'HOOK',
    label: 'Accroche',
    description: 'Titre ou accroche visuelle principale (≤ 8 mots)',
    fields: [
      { name: 'text', label: 'Texte', type: 'string', required: true, maxWords: BLOCK_LIMITS.HOOK_MAX_WORDS },
      { name: 'accentWords', label: 'Mots mis en valeur', type: 'array' },
    ],
  },
  BODY: {
    type: 'BODY',
    label: 'Corps de texte',
    description: 'Paragraphe explicatif principal (≤ 22 mots)',
    fields: [
      { name: 'text', label: 'Texte', type: 'string', required: true, maxWords: BLOCK_LIMITS.BODY_MAX_WORDS },
    ],
  },
  BULLETS: {
    type: 'BULLETS',
    label: 'Puces / Liste',
    description: 'Liste de 1 à 4 éléments (≤ 9 mots par élément)',
    fields: [
      {
        name: 'items',
        label: 'Éléments',
        type: 'array',
        required: true,
        minItems: BLOCK_LIMITS.BULLETS_MIN_ITEMS,
        maxItems: BLOCK_LIMITS.BULLETS_MAX_ITEMS,
        maxWords: BLOCK_LIMITS.BULLETS_ITEM_MAX_WORDS,
      },
      { name: 'style', label: 'Style de puce', type: 'enum', options: ['CHECK', 'SUIT', 'NUMBER'] },
    ],
  },
  STAT: {
    type: 'STAT',
    label: 'Chiffre clé',
    description: 'Statistique mise en avant avec libellé',
    fields: [
      { name: 'value', label: 'Valeur (≤ 8 car.)', type: 'string', required: true, maxChars: BLOCK_LIMITS.STAT_VALUE_MAX_CHARS },
      { name: 'label', label: 'Libellé (≤ 6 mots)', type: 'string', required: true, maxWords: BLOCK_LIMITS.STAT_LABEL_MAX_WORDS },
      { name: 'sublabel', label: 'Sous-titre', type: 'string' },
    ],
  },
  QUOTE: {
    type: 'QUOTE',
    label: 'Citation / Témoignage',
    description: 'Citation percutante ou avis (≤ 25 mots)',
    fields: [
      { name: 'text', label: 'Citation', type: 'string', required: true, maxWords: BLOCK_LIMITS.QUOTE_MAX_WORDS },
      { name: 'author', label: 'Auteur', type: 'string' },
      { name: 'consent', label: 'Accord confirmé', type: 'boolean' },
    ],
  },
  COMPARE: {
    type: 'COMPARE',
    label: 'Comparatif / Mème',
    description: 'Avant / Après ou option A / B (≤ 14 mots par côté)',
    fields: [
      { name: 'leftTitle', label: 'Titre gauche', type: 'string', required: true },
      { name: 'leftText', label: 'Texte gauche', type: 'string', required: true, maxWords: BLOCK_LIMITS.COMPARE_TEXT_MAX_WORDS },
      { name: 'rightTitle', label: 'Titre droit', type: 'string', required: true },
      { name: 'rightText', label: 'Texte droit', type: 'string', required: true, maxWords: BLOCK_LIMITS.COMPARE_TEXT_MAX_WORDS },
    ],
  },
  CARDS: {
    type: 'CARDS',
    label: 'Cartes du Njambo',
    description: '1 à 5 cartes du jeu affichées en éventail, ligne ou duel',
    fields: [
      {
        name: 'cards',
        label: 'Cartes',
        type: 'array',
        required: true,
        minItems: BLOCK_LIMITS.CARDS_MIN_ITEMS,
        maxItems: BLOCK_LIMITS.CARDS_MAX_ITEMS,
      },
      { name: 'arrangement', label: 'Disposition', type: 'enum', options: ['FAN', 'ROW', 'DUEL'] },
    ],
  },
  STEPS: {
    type: 'STEPS',
    label: 'Séquence d’étapes',
    description: '2 à 5 étapes séquentielles (≤ 6 mots par étape)',
    fields: [
      {
        name: 'items',
        label: 'Étapes',
        type: 'array',
        required: true,
        minItems: BLOCK_LIMITS.STEPS_MIN_ITEMS,
        maxItems: BLOCK_LIMITS.STEPS_MAX_ITEMS,
        maxWords: BLOCK_LIMITS.STEPS_ITEM_MAX_WORDS,
      },
    ],
  },
  EVENT: {
    type: 'EVENT',
    label: 'Événement / Tournoi',
    description: 'Infos de tournoi ou d’événement',
    fields: [
      { name: 'date', label: 'Date', type: 'string' },
      { name: 'prize', label: 'Prix / Lot', type: 'string' },
      { name: 'mode', label: 'Mode', type: 'string' },
      { name: 'spots', label: 'Places', type: 'string' },
    ],
  },
  IMAGE: {
    type: 'IMAGE',
    label: 'Image / Capture',
    description: 'Illustration ou mockup smartphone',
    fields: [
      { name: 'dataUrl', label: 'URL Image', type: 'string', required: true },
      { name: 'frame', label: 'Cadre', type: 'enum', options: ['PHONE', 'ROUNDED', 'NONE'] },
      { name: 'caption', label: 'Légende', type: 'string' },
    ],
  },
  SPACER: {
    type: 'SPACER',
    label: 'Espacement',
    description: 'Espacement vertical (S, M ou L)',
    fields: [
      { name: 'size', label: 'Taille', type: 'enum', required: true, options: ['S', 'M', 'L'] },
    ],
  },
};
