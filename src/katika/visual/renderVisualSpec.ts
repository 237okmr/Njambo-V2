import {
  drawCulturalPattern,
  drawPlayingCard,
  drawRotatedPlayingCard,
  getPaletteStyle,
  roundRect,
  PaletteStyle,
  ensureAntonFontLoaded,
} from '../utils/socialVisualCanvasRenderer';
import { getSocialLinks } from '../services/copilotSettingsService';
import { NJAMBO_DOMAIN, NJAMBO_SUITS_INFO, NjamboSuit } from '../types/socialVisuals';
import { FORMAT_DIMENSIONS, SAFE_ZONES, getBrandPalette } from './brandTokens';
import { computeLayout, TextMeasureFn } from './layoutEngine';
import {
  BodyBlock,
  BulletsBlock,
  CardsBlock,
  CompareBlock,
  EventBlock,
  HookBlock,
  ImageBlock,
  QuoteBlock,
  StatBlock,
  StepsBlock,
  VisualBlock,
  VisualSpec,
} from './visualSpec';

/**
 * Charge une image à partir d'une URL de données (dataUrl) de manière asynchrone.
 */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Dessine du texte avec surbrillance pour les mots contenus dans accentWords.
 */
function drawTextWithAccents(
  ctx: CanvasRenderingContext2D,
  line: string,
  startX: number,
  y: number,
  fontPx: number,
  accentWords: string[] = [],
  defaultColor: string,
  highlightColor: string,
  align: 'left' | 'center' = 'center'
) {
  const words = line.split(' ');
  const cleanAccentWords = accentWords.map((w) => w.toLowerCase().replace(/[^a-z0-9àâçéèêëîïôûùüÿñæœ]/gi, ''));

  ctx.font = `bold ${fontPx}px Anton, Impact, system-ui, sans-serif`;

  if (align === 'center') {
    let totalW = 0;
    const wordWidths = words.map((w, idx) => {
      const space = idx < words.length - 1 ? ctx.measureText(' ').width : 0;
      const wWidth = ctx.measureText(w).width;
      return wWidth + space;
    });
    totalW = wordWidths.reduce((a, b) => a + b, 0);

    let curX = startX - totalW / 2;
    ctx.textAlign = 'left';

    words.forEach((w) => {
      const cleanW = w.toLowerCase().replace(/[^a-z0-9àâçéèêëîïôûùüÿñæœ]/gi, '');
      const isAccent = cleanAccentWords.includes(cleanW);

      ctx.fillStyle = isAccent ? highlightColor : defaultColor;
      ctx.fillText(w, curX, y);
      curX += ctx.measureText(w + ' ').width;
    });
  } else {
    ctx.textAlign = 'left';
    let curX = startX;
    words.forEach((w) => {
      const cleanW = w.toLowerCase().replace(/[^a-z0-9àâçéèêëîïôûùüÿñæœ]/gi, '');
      const isAccent = cleanAccentWords.includes(cleanW);

      ctx.fillStyle = isAccent ? highlightColor : defaultColor;
      ctx.fillText(w, curX, y);
      curX += ctx.measureText(w + ' ').width;
    });
  }
}

/**
 * Dessine les 4 coins identitaires du Njambo (10♥, 10♦, 10♣, 9♠)
 */
function drawCornerBadges(
  ctx: CanvasRenderingContext2D,
  innerMargin: number,
  width: number,
  height: number
) {
  const cornerData: Array<{ x: number; y: number; suit: NjamboSuit; color: string }> = [
    { x: innerMargin + 16, y: innerMargin + 16, suit: '♥', color: '#ef4444' },
    { x: width - innerMargin - 16, y: innerMargin + 16, suit: '♦', color: '#f97316' },
    { x: innerMargin + 16, y: height - innerMargin - 16, suit: '♣', color: '#10b981' },
    { x: width - innerMargin - 16, y: height - innerMargin - 16, suit: '♠', color: '#38bdf8' },
  ];

  cornerData.forEach((c) => {
    ctx.save();
    ctx.shadowColor = c.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = c.color;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.suit, c.x, c.y);
    ctx.restore();
  });
}

/**
 * Dessine le décor d'arrière-plan avec cartes flottantes
 */
function drawBackgroundArtwork(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  style: PaletteStyle,
  isStory: boolean
) {
  ctx.save();
  ctx.globalAlpha = 0.12;

  const ghostW = isStory ? 140 : 120;
  const ghostH = isStory ? 200 : 170;

  // Cartes en filigrane lumineuses
  drawRotatedPlayingCard(ctx, width * 0.12, isStory ? height * 0.22 : height * 0.26, ghostW, ghostH, -22, '10', '♥', undefined, false, undefined, false, style.goldAccent);
  drawRotatedPlayingCard(ctx, width * 0.88, isStory ? height * 0.24 : height * 0.28, ghostW, ghostH, 20, '10', '♦', undefined, false, undefined, false, style.goldAccent);
  drawRotatedPlayingCard(ctx, width * 0.10, isStory ? height * 0.78 : height * 0.76, ghostW, ghostH, 18, '10', '♣', undefined, false, undefined, false, style.goldAccent);
  drawRotatedPlayingCard(ctx, width * 0.90, isStory ? height * 0.76 : height * 0.74, ghostW, ghostH, -18, '9', '♠', undefined, false, undefined, false, style.goldAccent);

  ctx.restore();
}

/**
 * Moteur de rendu principal Canvas V2
 */
export async function renderVisualSpecToCanvas(
  canvas: HTMLCanvasElement,
  spec: VisualSpec
): Promise<void> {
  await ensureAntonFontLoaded();

  const format = spec.format || 'STORY';
  const dimensions = FORMAT_DIMENSIONS[format] || FORMAT_DIMENSIONS.STORY;
  const width = dimensions.width;
  const height = dimensions.height;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const style = getBrandPalette(spec.palette);
  const patternType = spec.pattern || 'NDOP_CHEVRON';
  const isStory = format === 'STORY';
  const isBanner = format === 'BANNER';

  // 1. Fond en dégradé radial
  const bgGrad = ctx.createRadialGradient(
    width / 2,
    isStory ? height * 0.35 : height * 0.45,
    80,
    width / 2,
    height / 2,
    height * 0.85
  );
  bgGrad.addColorStop(0, style.bgStart);
  bgGrad.addColorStop(0.55, style.bgMid);
  bgGrad.addColorStop(1, style.bgEnd);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  if (spec.palette === 'ROYAL_SAPPHIRE') {
    ctx.save();
    ctx.fillStyle = 'rgba(234, 88, 12, 0.05)';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Texture culturelle
  drawCulturalPattern(ctx, width, height, patternType);

  // Cartes flottantes d'arrière-plan
  drawBackgroundArtwork(ctx, width, height, style, isStory);

  // 2. Double cadre doré
  const margin = isBanner ? 60 : 45;
  const innerMargin = margin + 14;

  ctx.save();
  ctx.strokeStyle = style.goldBorder;
  ctx.lineWidth = 3;
  ctx.shadowColor = style.goldSoft;
  ctx.shadowBlur = 16;
  roundRect(ctx, margin, margin, width - margin * 2, height - margin * 2, 28, false, true);

  ctx.strokeStyle = style.goldSoft;
  ctx.lineWidth = 1;
  ctx.shadowBlur = 0;
  roundRect(ctx, innerMargin, innerMargin, width - innerMargin * 2, height - innerMargin * 2, 20, false, true);
  ctx.restore();

  // Badges des 4 coins
  drawCornerBadges(ctx, innerMargin, width, height);

  // 3. En-tête : "NJAMBO KORA • KATIKA" et les 4 enseignes
  const topY = isStory ? 180 : isBanner ? 100 : 110;
  ctx.save();
  ctx.textAlign = 'center';

  // Symboles des 4 enseignes
  const suitsList: Array<{ s: NjamboSuit; c: string }> = [
    { s: '♥', c: '#ef4444' },
    { s: '♦', c: '#f97316' },
    { s: '♣', c: '#10b981' },
    { s: '♠', c: '#38bdf8' },
  ];
  const suitSpacing = 36;
  const suitsStartX = width / 2 - suitSpacing * 1.5;
  ctx.font = 'bold 24px sans-serif';
  suitsList.forEach((item, idx) => {
    ctx.fillStyle = item.c;
    ctx.fillText(item.s, suitsStartX + idx * suitSpacing, topY);
  });

  // Titre de marque
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillStyle = style.goldAccent;
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 6;
  ctx.fillText('NJAMBO KORA • KATIKA', width / 2, topY + 36);
  ctx.restore();

  // 4. Calcul de mise en page par le moteur de layout
  const measureFn: TextMeasureFn = (text, fontPx, weight) => {
    ctx.save();
    ctx.font = `${weight === 'bold' ? 'bold ' : ''}${fontPx}px Anton, Impact, system-ui, sans-serif`;
    const w = ctx.measureText(text).width;
    ctx.restore();
    return w;
  };

  const layout = computeLayout(spec, measureFn);

  // Pré-chargement des images s'il y a des blocs IMAGE
  const imagePromises: Array<Promise<{ id: string; img: HTMLImageElement | null }>> = [];
  for (const block of layout.blocks) {
    if (block.type === 'IMAGE') {
      const imgBlock = block.blockData as ImageBlock;
      imagePromises.push(loadImage(imgBlock.dataUrl).then((img) => ({ id: block.id, img })));
    }
  }
  const loadedImagesList = await Promise.all(imagePromises);
  const loadedImagesMap = new Map<string, HTMLImageElement | null>();
  loadedImagesList.forEach((item) => loadedImagesMap.set(item.id, item.img));

  // 5. Rendu de chaque bloc à sa position exacte
  for (const item of layout.blocks) {
    const { x, y, width: bWidth, height: bHeight, fontSize, lines, blockData, extra } = item;
    const cx = x + bWidth / 2;

    ctx.save();

    switch (item.type) {
      case 'BADGE': {
        const text = lines[0] || '';
        ctx.font = 'bold 22px system-ui, sans-serif';
        const textW = ctx.measureText(text).width;
        const badgeW = Math.max(180, textW + 48);
        const badgeH = 40;
        const badgeX = cx - badgeW / 2;
        const badgeY = y + (bHeight - badgeH) / 2;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = style.goldBorder;
        ctx.lineWidth = 1.5;
        roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 20, true, true);

        ctx.fillStyle = style.goldAccent;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, cx, badgeY + badgeH / 2);
        break;
      }
      case 'HOOK': {
        const hookBlock = blockData as HookBlock;
        const lineH = fontSize * 1.15;
        let curY = y + fontSize;

        lines.forEach((line) => {
          drawTextWithAccents(
            ctx,
            line,
            cx,
            curY,
            fontSize,
            hookBlock.accentWords || [],
            '#ffffff',
            style.highlightColor,
            'center'
          );
          curY += lineH;
        });
        break;
      }
      case 'BODY': {
        const lineH = fontSize * 1.30;
        let curY = y + fontSize;
        ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'center';

        lines.forEach((line) => {
          ctx.fillText(line, cx, curY);
          curY += lineH;
        });
        break;
      }
      case 'BULLETS': {
        const bulletsBlock = blockData as BulletsBlock;
        const itemLinesList: string[][] = extra?.itemLinesList || [lines];
        const bulletStyle = bulletsBlock.style || 'CHECK';
        const suits: NjamboSuit[] = ['♥', '♦', '♣', '♠'];
        const suitColors = ['#ef4444', '#f97316', '#10b981', '#38bdf8'];

        let curY = y + fontSize;
        itemLinesList.forEach((itemLines, itemIdx) => {
          itemLines.forEach((line, lIdx) => {
            ctx.font = `${fontSize}px system-ui, sans-serif`;
            ctx.textAlign = 'left';

            if (lIdx === 0) {
              // Puce
              if (bulletStyle === 'CHECK') {
                ctx.fillStyle = '#34d399';
                ctx.fillText('✓', x + 20, curY);
              } else if (bulletStyle === 'SUIT') {
                const sIdx = itemIdx % 4;
                ctx.fillStyle = suitColors[sIdx];
                ctx.fillText(suits[sIdx], x + 20, curY);
              } else {
                ctx.fillStyle = style.goldAccent;
                ctx.fillText(`${itemIdx + 1}.`, x + 20, curY);
              }
              ctx.fillStyle = '#f8fafc';
              ctx.fillText(line, x + 64, curY);
            } else {
              ctx.fillStyle = '#f8fafc';
              ctx.fillText(line, x + 64, curY);
            }
            curY += fontSize * 1.30;
          });
          curY += 8;
        });
        break;
      }
      case 'STAT': {
        const statBlock = blockData as StatBlock;
        ctx.textAlign = 'center';

        // Valeur
        ctx.font = 'bold 88px Anton, Impact, sans-serif';
        ctx.fillStyle = style.goldAccent;
        ctx.shadowColor = style.goldSoft;
        ctx.shadowBlur = 12;
        ctx.fillText(statBlock.value || '', cx, y + 76);

        // Libellé
        ctx.shadowBlur = 0;
        ctx.font = 'bold 30px system-ui, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText((statBlock.label || '').toUpperCase(), cx, y + 118);

        if (statBlock.sublabel) {
          ctx.font = '22px system-ui, sans-serif';
          ctx.fillStyle = style.highlightColor;
          ctx.fillText(statBlock.sublabel, cx, y + 146);
        }
        break;
      }
      case 'QUOTE': {
        const quoteBlock = blockData as QuoteBlock;
        // Boîte fond léger
        ctx.fillStyle = style.cardBoxBg;
        ctx.strokeStyle = style.goldSoft;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, bWidth, bHeight, 20, true, true);

        ctx.textAlign = 'center';
        ctx.font = `italic ${fontSize}px Georgia, serif`;
        ctx.fillStyle = '#f8fafc';

        let curY = y + fontSize + 18;
        lines.forEach((line) => {
          ctx.fillText(line, cx, curY);
          curY += fontSize * 1.35;
        });

        if (quoteBlock.author) {
          ctx.font = 'bold 24px system-ui, sans-serif';
          ctx.fillStyle = style.goldAccent;
          ctx.fillText(`— ${quoteBlock.author}`, cx, curY + 6);
        }
        break;
      }
      case 'COMPARE': {
        const compareBlock = blockData as CompareBlock;
        const boxW = (bWidth - 24) / 2;

        // Colonne Gauche
        ctx.fillStyle = style.cardBoxBg;
        ctx.strokeStyle = style.goldSoft;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, boxW, bHeight, 18, true, true);

        ctx.font = 'bold 24px system-ui, sans-serif';
        ctx.fillStyle = style.goldAccent;
        ctx.textAlign = 'center';
        ctx.fillText(compareBlock.leftTitle || 'AVANT', x + boxW / 2, y + 36);

        const leftLines: string[] = extra?.leftLines || [];
        ctx.font = `${fontSize}px system-ui, sans-serif`;
        ctx.fillStyle = '#e2e8f0';
        let lY = y + 72;
        leftLines.forEach((line) => {
          ctx.fillText(line, x + boxW / 2, lY);
          lY += fontSize * 1.30;
        });

        // Colonne Droite
        const rightX = x + boxW + 24;
        ctx.fillStyle = style.cardBoxBg;
        ctx.strokeStyle = style.goldBorder;
        ctx.lineWidth = 2;
        roundRect(ctx, rightX, y, boxW, bHeight, 18, true, true);

        ctx.font = 'bold 24px system-ui, sans-serif';
        ctx.fillStyle = style.highlightColor;
        ctx.fillText(compareBlock.rightTitle || 'APRÈS', rightX + boxW / 2, y + 36);

        const rightLines: string[] = extra?.rightLines || [];
        ctx.font = `${fontSize}px system-ui, sans-serif`;
        ctx.fillStyle = '#f8fafc';
        let rY = y + 72;
        rightLines.forEach((line) => {
          ctx.fillText(line, rightX + boxW / 2, rY);
          rY += fontSize * 1.30;
        });
        break;
      }
      case 'CARDS': {
        const cardsBlock = blockData as CardsBlock;
        const cards = cardsBlock.cards || [];
        const arrangement = cardsBlock.arrangement || 'FAN';

        const cardW = 110;
        const cardH = 155;

        if (arrangement === 'FAN') {
          const angles = [-15, -5, 5, 15, 25];
          cards.forEach((c, idx) => {
            const angle = angles[idx % angles.length];
            drawRotatedPlayingCard(
              ctx,
              cx + (idx - (cards.length - 1) / 2) * 60,
              y + cardH / 2 + Math.abs(angle) * 1.2,
              cardW,
              cardH,
              angle,
              c.rank,
              c.suit,
              c.label,
              c.highlight
            );
          });
        } else if (arrangement === 'DUEL') {
          if (cards.length >= 2) {
            drawPlayingCard(ctx, cx - cardW - 30, y + 10, cardW, cardH, cards[0].rank, cards[0].suit, cards[0].label, cards[0].highlight);

            // Badge VS
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(cx, y + cardH / 2 + 10, 24, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('VS', cx, y + cardH / 2 + 10);

            drawPlayingCard(ctx, cx + 30, y + 10, cardW, cardH, cards[1].rank, cards[1].suit, cards[1].label, cards[1].highlight);
          }
        } else {
          // ROW
          const totalRowW = cards.length * cardW + (cards.length - 1) * 16;
          let startCardX = cx - totalRowW / 2;
          cards.forEach((c) => {
            drawPlayingCard(ctx, startCardX, y + 10, cardW, cardH, c.rank, c.suit, c.label, c.highlight);
            startCardX += cardW + 16;
          });
        }
        break;
      }
      case 'STEPS': {
        const stepsBlock = blockData as StepsBlock;
        const items = stepsBlock.items || [];
        let curY = y + 24;

        items.forEach((step, idx) => {
          ctx.fillStyle = style.cardBoxBg;
          ctx.strokeStyle = style.goldSoft;
          ctx.lineWidth = 1.5;
          roundRect(ctx, x + 20, curY, bWidth - 40, 44, 22, true, true);

          ctx.fillStyle = style.goldAccent;
          ctx.font = 'bold 20px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${idx + 1}`, x + 44, curY + 28);

          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 20px system-ui, sans-serif';
          ctx.fillText(step, x + 84, curY + 28);

          curY += 54;
        });
        break;
      }
      case 'EVENT': {
        const eventBlock = blockData as EventBlock;
        ctx.fillStyle = style.cardBoxBg;
        ctx.strokeStyle = style.goldBorder;
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, bWidth, bHeight - (eventBlock.prize ? 30 : 0), 20, true, true);

        const pillW = (bWidth - 60) / 2;
        const p1X = x + 20;
        const p2X = x + Math.floor(bWidth / 2) + 10;

        // Date
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        roundRect(ctx, p1X, y + 16, pillW, 38, 10, true, false);
        ctx.fillStyle = style.goldAccent;
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`📅 ${eventBlock.date || 'Tous les jours'}`, p1X + pillW / 2, y + 41);

        // Dotation / Mode
        roundRect(ctx, p2X, y + 16, pillW, 38, 10, true, false);
        ctx.fillStyle = style.highlightColor;
        ctx.fillText(`🏆 ${eventBlock.prize || 'Amusement & Honneur'}`, p2X + pillW / 2, y + 41);

        // Mention légale si dotation renseignée
        if (eventBlock.prize) {
          ctx.font = '18px system-ui, sans-serif';
          ctx.fillStyle = '#94a3b8';
          ctx.textAlign = 'center';
          ctx.fillText(
            "Jetons virtuels d'amusement — Aucune valeur monétaire réelle",
            cx,
            y + bHeight - 8
          );
        }
        break;
      }
      case 'IMAGE': {
        const imgBlock = blockData as ImageBlock;
        const loadedImg = loadedImagesMap.get(item.id);

        if (loadedImg) {
          const maxImgH = Math.min(bHeight, (height - 590) * 0.55);
          const frame = imgBlock.frame || 'ROUNDED';

          const imgW = Math.min(bWidth - 40, maxImgH * (loadedImg.width / loadedImg.height));
          const imgH = imgW * (loadedImg.height / loadedImg.width);
          const imgX = cx - imgW / 2;
          const imgY = y + (bHeight - imgH) / 2;

          ctx.save();
          if (frame === 'PHONE') {
            // Cadre Smartphone
            roundRect(ctx, imgX - 10, imgY - 14, imgW + 20, imgH + 28, 24, true, true);
            ctx.fillStyle = '#090d16';
            ctx.strokeStyle = style.goldBorder;
            ctx.lineWidth = 3;

            ctx.beginPath();
            ctx.roundRect(imgX, imgY, imgW, imgH, 16);
            ctx.clip();
            ctx.drawImage(loadedImg, imgX, imgY, imgW, imgH);
          } else if (frame === 'ROUNDED') {
            ctx.beginPath();
            ctx.roundRect(imgX, imgY, imgW, imgH, 16);
            ctx.clip();
            ctx.drawImage(loadedImg, imgX, imgY, imgW, imgH);

            ctx.restore();
            ctx.save();
            ctx.strokeStyle = style.goldBorder;
            ctx.lineWidth = 2;
            roundRect(ctx, imgX, imgY, imgW, imgH, 16, false, true);
          } else {
            ctx.drawImage(loadedImg, imgX, imgY, imgW, imgH);
          }
          ctx.restore();
        }
        break;
      }
      default:
        break;
    }

    ctx.restore();
  }

  // 6. Rendu du bouton CTA
  const cta = layout.cta;
  ctx.save();

  // Bouton doré étincelant
  const ctaGrad = ctx.createLinearGradient(cta.x, cta.y, cta.x + cta.width, cta.y + cta.height);
  ctaGrad.addColorStop(0, style.goldAccent);
  ctaGrad.addColorStop(1, style.goldBorder);

  ctx.shadowColor = style.goldSoft;
  ctx.shadowBlur = 24;
  ctx.fillStyle = ctaGrad;
  roundRect(ctx, cta.x, cta.y, cta.width, cta.height, cta.height / 2, true, false);

  ctx.shadowBlur = 0;
  ctx.font = 'bold 36px Anton, Impact, system-ui, sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cta.text.toUpperCase(), cta.x + cta.width / 2, cta.y + cta.height / 2);
  ctx.restore();

  // 7. Pied de page
  if (layout.footer) {
    const footer = layout.footer;
    ctx.save();
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillStyle = style.goldAccent;
    ctx.textAlign = 'center';

    const socialLinks = getSocialLinks ? getSocialLinks() : null;
    const domainText = footer.text || socialLinks?.appUrl || NJAMBO_DOMAIN;
    ctx.fillText(`🎮 ${domainText}`, width / 2, footer.y + 20);
    ctx.restore();
  }
}

/**
 * Génère une URL de données DataUrl (PNG) à partir d'une VisualSpec.
 */
export async function renderSpecToDataUrl(spec: VisualSpec): Promise<string> {
  const canvas = document.createElement('canvas');
  await renderVisualSpecToCanvas(canvas, spec);
  return canvas.toDataURL('image/png');
}

/**
 * Télécharge directement l'image au format PNG.
 */
export async function downloadSpecPng(
  spec: VisualSpec,
  filename?: string
): Promise<void> {
  const hook = spec.blocks?.find((b) => b.type === 'HOOK')?.text || 'visuel';
  const safeTitle = hook.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const defaultFilename = `katika_visuel_${safeTitle}_${(spec.format || 'square').toLowerCase()}.png`;

  const dataUrl = await renderSpecToDataUrl(spec);
  const link = document.createElement('a');
  link.download = filename || defaultFilename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
