import { NJAMBO_SUITS_INFO, NjamboSuit, SocialVisualPalette } from '../types/socialVisuals';
import { getPaletteStyle, PaletteStyle } from '../utils/socialVisualCanvasRenderer';

export type VisualFormat = 'SQUARE' | 'STORY' | 'BANNER';

export interface SafeZoneSpec {
  top: number;
  bottom: number;
  left: number;
  right: number;
  margin: number;
}

/**
 * Zones de sécurité officielles par format visuel.
 * STORY : haut 250 px, bas 340 px, côtés 72 px.
 * SQUARE : marges 72 px.
 * BANNER : marges 72 px, côtés 96 px.
 */
export const SAFE_ZONES: Record<VisualFormat, SafeZoneSpec> = {
  SQUARE: { top: 72, bottom: 72, left: 72, right: 72, margin: 72 },
  STORY: { top: 250, bottom: 340, left: 72, right: 72, margin: 72 },
  BANNER: { top: 72, bottom: 72, left: 96, right: 96, margin: 72 },
} as const;

export const FORMAT_DIMENSIONS = {
  SQUARE: { width: 1080, height: 1080 },
  STORY: { width: 1080, height: 1920 },
  BANNER: { width: 1920, height: 1080 },
} as const;

/**
 * Palette de marque officielle (source unique déléguée à getPaletteStyle).
 */
export function getBrandPalette(id: SocialVisualPalette = 'EMERALD_GOLD'): PaletteStyle {
  return getPaletteStyle(id);
}

/**
 * Couleurs des enseignes Njambo Kora lues depuis NJAMBO_SUITS_INFO.
 */
export const SUIT_COLORS: Record<NjamboSuit, string> = {
  '♥': NJAMBO_SUITS_INFO['♥'].color,
  '♦': NJAMBO_SUITS_INFO['♦'].color,
  '♣': NJAMBO_SUITS_INFO['♣'].color,
  '♠': NJAMBO_SUITS_INFO['♠'].color,
};

export interface FontSizeLimit {
  default: number;
  min: number;
  max: number;
}

export type TextRole =
  | 'HOOK'
  | 'BODY'
  | 'BULLETS'
  | 'BADGE'
  | 'BRAND'
  | 'CTA'
  | 'FOOTER';

/**
 * Échelle typographique officielle par format en pixels (default, min, max).
 * Accroche : 64 à 112 px (STORY 120 px, BANNER 56 à 96 px).
 * Corps : 34 à 48 px.
 * Puces : 34 à 44 px.
 * Badge, Marque, Pied de page : 28 px.
 * CTA : 44 px.
 */
export const TYPE_SCALE: Record<VisualFormat, Record<TextRole, FontSizeLimit>> = {
  SQUARE: {
    HOOK: { default: 88, min: 64, max: 112 },
    BODY: { default: 40, min: 34, max: 48 },
    BULLETS: { default: 38, min: 34, max: 44 },
    BADGE: { default: 28, min: 28, max: 28 },
    BRAND: { default: 28, min: 28, max: 28 },
    CTA: { default: 44, min: 44, max: 44 },
    FOOTER: { default: 28, min: 28, max: 28 },
  },
  STORY: {
    HOOK: { default: 96, min: 64, max: 120 },
    BODY: { default: 40, min: 34, max: 48 },
    BULLETS: { default: 38, min: 34, max: 44 },
    BADGE: { default: 28, min: 28, max: 28 },
    BRAND: { default: 28, min: 28, max: 28 },
    CTA: { default: 44, min: 44, max: 44 },
    FOOTER: { default: 28, min: 28, max: 28 },
  },
  BANNER: {
    HOOK: { default: 72, min: 56, max: 96 },
    BODY: { default: 40, min: 34, max: 48 },
    BULLETS: { default: 38, min: 34, max: 44 },
    BADGE: { default: 28, min: 28, max: 28 },
    BRAND: { default: 28, min: 28, max: 28 },
    CTA: { default: 44, min: 44, max: 44 },
    FOOTER: { default: 28, min: 28, max: 28 },
  },
};
