import { FORMAT_DIMENSIONS, SAFE_ZONES, TYPE_SCALE, VisualFormat } from './brandTokens';
import {
  BodyBlock,
  BulletsBlock,
  HookBlock,
  VisualBlock,
  VisualBlockType,
  VisualSpec,
} from './visualSpec';

export type TextMeasureFn = (text: string, fontPx: number, weight?: string) => number;

export const defaultMeasure: TextMeasureFn = (text: string, fontPx: number) => {
  if (!text) return 0;
  return text.length * 0.55 * fontPx;
};

export interface BlockLayoutResult {
  id: string;
  type: VisualBlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  lines: string[];
  blockData: VisualBlock;
  extra?: Record<string, any>;
}

export interface CtaLayoutResult {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
}

export interface FooterLayoutResult {
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  app?: boolean;
  whatsapp?: boolean;
}

export interface LayoutEngineResult {
  specVersion: 2;
  format: VisualFormat;
  canvasWidth: number;
  canvasHeight: number;
  safeZone: { top: number; bottom: number; left: number; right: number };
  contentArea: { x: number; y: number; width: number; height: number };
  blocks: BlockLayoutResult[];
  cta: CtaLayoutResult;
  footer?: FooterLayoutResult;
  removedBlocks: VisualBlock[];
  fontScales: Record<string, number>;
  warnings: string[];
}

export function wrapTextWithMeasure(
  text: string,
  fontPx: number,
  maxWidth: number,
  measureFn: TextMeasureFn,
  weight?: string
): string[] {
  if (!text) return [];
  const words = text.trim().split(/\s+/);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = measureFn(testLine, fontPx, weight);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function truncateWords(text: string, maxWords: number): string {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '...';
}

interface CalculatedBlockHeight {
  block: VisualBlock;
  height: number;
  fontSize: number;
  lines: string[];
  extra?: Record<string, any>;
}

function computeSingleBlockHeight(
  block: VisualBlock,
  format: VisualFormat,
  contentWidth: number,
  fontSizes: { hook: number; body: number; bullets: number },
  measure: TextMeasureFn,
  truncatedTexts?: Map<string, string>,
  imageHeight?: number
): CalculatedBlockHeight {
  const type = block.type;
  const scale = TYPE_SCALE[format];

  switch (type) {
    case 'BADGE': {
      const fontSize = scale.BADGE.default;
      const text = truncatedTexts?.get(block.id) ?? block.text ?? '';
      return { block, height: 44, fontSize, lines: [text] };
    }
    case 'HOOK': {
      const fontSize = fontSizes.hook;
      const text = truncatedTexts?.get(block.id) ?? block.text ?? '';
      const lines = wrapTextWithMeasure(text, fontSize, contentWidth, measure, 'bold');
      const lineHeight = fontSize * 1.15;
      const height = Math.max(50, lines.length * lineHeight + 12);
      return { block, height, fontSize, lines };
    }
    case 'BODY': {
      const fontSize = fontSizes.body;
      const text = truncatedTexts?.get(block.id) ?? block.text ?? '';
      const lines = wrapTextWithMeasure(text, fontSize, contentWidth, measure);
      const lineHeight = fontSize * 1.30;
      const height = Math.max(44, lines.length * lineHeight + 12);
      return { block, height, fontSize, lines };
    }
    case 'BULLETS': {
      const fontSize = fontSizes.bullets;
      const items = block.items || [];
      const itemLinesList: string[][] = [];
      let totalH = 12;
      for (let i = 0; i < items.length; i++) {
        const itemKey = `${block.id}_item_${i}`;
        const itemText = truncatedTexts?.get(itemKey) ?? items[i] ?? '';
        const lines = wrapTextWithMeasure(itemText, fontSize, contentWidth - 48, measure);
        itemLinesList.push(lines);
        totalH += lines.length * (fontSize * 1.30) + 8;
      }
      return {
        block,
        height: Math.max(48, totalH),
        fontSize,
        lines: itemLinesList.flat(),
        extra: { itemLinesList },
      };
    }
    case 'STAT': {
      const fontSize = 80;
      const lines = [block.value || '', block.label || '', block.sublabel || ''].filter(Boolean);
      return { block, height: 140, fontSize, lines };
    }
    case 'QUOTE': {
      const fontSize = fontSizes.body;
      const text = truncatedTexts?.get(block.id) ?? block.text ?? '';
      const formatted = `« ${text} »${block.author ? ` — ${block.author}` : ''}`;
      const lines = wrapTextWithMeasure(formatted, fontSize, contentWidth - 60, measure);
      const height = Math.max(60, lines.length * (fontSize * 1.35) + 36);
      return { block, height, fontSize, lines };
    }
    case 'COMPARE': {
      const fontSize = Math.round(fontSizes.body * 0.85);
      const halfWidth = Math.max(200, (contentWidth - 24) / 2);
      const leftText = truncatedTexts?.get(`${block.id}_left`) ?? block.leftText ?? '';
      const rightText = truncatedTexts?.get(`${block.id}_right`) ?? block.rightText ?? '';

      const leftLines = wrapTextWithMeasure(leftText, fontSize, halfWidth - 24, measure);
      const rightLines = wrapTextWithMeasure(rightText, fontSize, halfWidth - 24, measure);

      const maxLines = Math.max(leftLines.length, rightLines.length);
      const height = Math.max(80, maxLines * (fontSize * 1.30) + 64);
      return {
        block,
        height,
        fontSize,
        lines: [...leftLines, ...rightLines],
        extra: { leftLines, rightLines },
      };
    }
    case 'CARDS': {
      const count = block.cards?.length || 1;
      const height = count > 3 ? 200 : 160;
      const lines = (block.cards || []).map((c) => `${c.rank}${c.suit}`);
      return { block, height, fontSize: 32, lines };
    }
    case 'STEPS': {
      const fontSize = 32;
      const items = block.items || [];
      const height = items.length * 44 + 16;
      return { block, height, fontSize, lines: items };
    }
    case 'EVENT': {
      const fontSize = 32;
      const lines = [block.date, block.prize, block.mode, block.spots].filter(Boolean) as string[];
      return { block, height: 130, fontSize, lines };
    }
    case 'IMAGE': {
      const height = imageHeight ?? (format === 'STORY' ? 260 : 200);
      return { block, height, fontSize: 28, lines: [block.caption || ''] };
    }
    case 'SPACER': {
      const height = block.size === 'S' ? 20 : block.size === 'L' ? 60 : 40;
      return { block, height, fontSize: 0, lines: [] };
    }
    default: {
      return { block, height: 40, fontSize: 28, lines: [] };
    }
  }
}

/**
 * Calculateur pur de mise en page par blocs (v2) pour Njambo Kora Social Studio.
 */
export function computeLayout(
  spec: VisualSpec,
  measure: TextMeasureFn = defaultMeasure
): LayoutEngineResult {
  const format = spec.format || 'STORY';
  const dimensions = FORMAT_DIMENSIONS[format] || FORMAT_DIMENSIONS.STORY;
  const safeZone = SAFE_ZONES[format] || SAFE_ZONES.STORY;

  const canvasWidth = dimensions.width;
  const canvasHeight = dimensions.height;

  // Header and Footer/CTA heights
  const ctaHeight = 54;
  const footerHeight = spec.footer ? 40 : 0;
  const ctaFooterGap = 16;

  // Zone de contenu calculée entre le haut sûr et le bas sûr − CTA − pied
  const contentTop = safeZone.top;
  const contentBottom = canvasHeight - safeZone.bottom - ctaHeight - footerHeight - ctaFooterGap;
  const contentLeft = safeZone.left;
  const contentRight = canvasWidth - safeZone.right;
  const contentWidth = contentRight - contentLeft;
  const contentHeight = Math.max(100, contentBottom - contentTop);

  const scale = TYPE_SCALE[format];

  // Image flexible height initialization (between 35% and 55% of content zone height)
  let imageHeight = Math.round(contentHeight * 0.55);
  const minImageHeight = Math.round(contentHeight * 0.35);

  // Font sizes mutable during overflow reduction
  const fontSizes = {
    hook: scale.HOOK.default,
    body: scale.BODY.default,
    bullets: scale.BULLETS.default,
  };

  const warnings: string[] = [];
  let activeBlocks: VisualBlock[] = [...spec.blocks];
  const removedBlocks: VisualBlock[] = [];
  const truncatedTexts = new Map<string, string>();

  const blockGap = format === 'BANNER' ? 16 : 24;

  let computedList: CalculatedBlockHeight[] = [];
  let totalBlocksH = 0;

  function calculateAllHeights(): number {
    computedList = activeBlocks.map((b) =>
      computeSingleBlockHeight(b, format, contentWidth, fontSizes, measure, truncatedTexts, imageHeight)
    );
    const sumH = computedList.reduce((acc, item) => acc + item.height, 0);
    const gaps = Math.max(0, activeBlocks.length - 1) * blockGap;
    totalBlocksH = sumH + gaps;
    return totalBlocksH;
  }

  calculateAllHeights();

  // OVERFLOW REDUCTION ALGORITHM
  // (a) Reduce image height first if an IMAGE block is present (down to minimum of 35% of content zone)
  const hasImage = activeBlocks.some((b) => b.type === 'IMAGE');
  if (totalBlocksH > contentHeight && hasImage) {
    while (totalBlocksH > contentHeight && imageHeight > minImageHeight) {
      imageHeight = Math.max(minImageHeight, imageHeight - 5);
      calculateAllHeights();
    }
  }

  // (b) Reduce fonts down to TYPE_SCALE minimums
  while (totalBlocksH > contentHeight) {
    let decreased = false;

    if (fontSizes.hook > scale.HOOK.min) {
      fontSizes.hook = Math.max(scale.HOOK.min, fontSizes.hook - 4);
      decreased = true;
    }
    if (fontSizes.body > scale.BODY.min) {
      fontSizes.body = Math.max(scale.BODY.min, fontSizes.body - 2);
      decreased = true;
    }
    if (fontSizes.bullets > scale.BULLETS.min) {
      fontSizes.bullets = Math.max(scale.BULLETS.min, fontSizes.bullets - 2);
      decreased = true;
    }

    if (!decreased) break;
    calculateAllHeights();
  }

  // (b) Truncate body and bullets if still overflowing
  if (totalBlocksH > contentHeight) {
    let truncated = false;
    for (const b of activeBlocks) {
      if (b.type === 'BODY') {
        const bodyBlock = b as BodyBlock;
        const currentWords = bodyBlock.text.trim().split(/\s+/).length;
        if (currentWords > 12) {
          truncatedTexts.set(b.id, truncateWords(bodyBlock.text, 12));
          truncated = true;
        }
      } else if (b.type === 'BULLETS') {
        const bulletsBlock = b as BulletsBlock;
        bulletsBlock.items.forEach((item, idx) => {
          const itemKey = `${b.id}_item_${idx}`;
          if (item.trim().split(/\s+/).length > 6) {
            truncatedTexts.set(itemKey, truncateWords(item, 6));
            truncated = true;
          }
        });
      }
    }

    if (truncated) {
      warnings.push('Corps de texte ou puces tronqués pour respecter la zone de sécurité.');
      calculateAllHeights();
    }
  }

  // (c) Remove blocks by priority (3 first, then 2 starting from the end, NEVER priority 1)
  // Quand un bloc IMAGE est présent, il n'est jamais supprimé.
  while (totalBlocksH > contentHeight && activeBlocks.length > 0) {
    // Look for priority 3 from the end (excluding IMAGE)
    let removeIndex = -1;
    for (let i = activeBlocks.length - 1; i >= 0; i--) {
      if (activeBlocks[i].type !== 'IMAGE' && (activeBlocks[i].priority ?? 2) === 3) {
        removeIndex = i;
        break;
      }
    }

    // If no priority 3 found, look for priority 2 from the end (excluding IMAGE)
    if (removeIndex === -1) {
      for (let i = activeBlocks.length - 1; i >= 0; i--) {
        if (activeBlocks[i].type !== 'IMAGE' && (activeBlocks[i].priority ?? 2) === 2) {
          removeIndex = i;
          break;
        }
      }
    }

    // Priority 1 blocks are NEVER removed
    if (removeIndex === -1) {
      warnings.push("Zone de contenu saturée : certains blocs de priorité 1 restent affichés.");
      break;
    }

    const removed = activeBlocks.splice(removeIndex, 1)[0];
    removedBlocks.push(removed);
    warnings.push(`Bloc "${removed.id || removed.type}" de priorité ${removed.priority ?? 2} supprimé pour éviter le chevauchement.`);

    calculateAllHeights();
  }

  // Position the active blocks centered vertically inside contentArea
  let currentY = contentTop;
  if (totalBlocksH < contentHeight) {
    const verticalOffset = (contentHeight - totalBlocksH) / 2;
    currentY += verticalOffset;
  }

  const placedBlocks: BlockLayoutResult[] = computedList.map((calcItem) => {
    const block = calcItem.block;
    const itemY = currentY;
    currentY += calcItem.height + blockGap;

    return {
      id: block.id,
      type: block.type,
      x: contentLeft,
      y: itemY,
      width: contentWidth,
      height: calcItem.height,
      fontSize: calcItem.fontSize,
      lines: calcItem.lines,
      blockData: block,
      extra: calcItem.extra,
    };
  });

  // Position CTA
  const ctaWidth = Math.min(560, contentWidth);
  const ctaX = contentLeft + (contentWidth - ctaWidth) / 2;
  const ctaY = canvasHeight - safeZone.bottom - footerHeight - ctaHeight;

  const ctaResult: CtaLayoutResult = {
    x: ctaX,
    y: ctaY,
    width: ctaWidth,
    height: ctaHeight,
    text: spec.cta?.text || 'REJOINDRE LE CLUB',
    fontSize: scale.CTA.default,
  };

  // Position Footer
  let footerResult: FooterLayoutResult | undefined;
  if (spec.footer) {
    const footerY = canvasHeight - safeZone.bottom - footerHeight + 8;
    footerResult = {
      x: contentLeft,
      y: footerY,
      width: contentWidth,
      height: footerHeight,
      text: spec.footer.text,
      app: spec.footer.app,
      whatsapp: spec.footer.whatsapp,
    };
  }

  return {
    specVersion: 2,
    format,
    canvasWidth,
    canvasHeight,
    safeZone: {
      top: safeZone.top,
      bottom: safeZone.bottom,
      left: safeZone.left,
      right: safeZone.right,
    },
    contentArea: {
      x: contentLeft,
      y: contentTop,
      width: contentWidth,
      height: contentHeight,
    },
    blocks: placedBlocks,
    cta: ctaResult,
    footer: footerResult,
    removedBlocks,
    fontScales: fontSizes,
    warnings,
  };
}
