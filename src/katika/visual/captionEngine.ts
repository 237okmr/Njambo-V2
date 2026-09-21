import { CTA_LIBRARY, CtaIntent } from '../data/ctaLibrary';
import { VisualSpec } from './visualSpec';

export interface CaptionLinks {
  appUrl?: string;
  whatsappGroupUrl?: string;
  facebookUrl?: string;
}

export interface CaptionOptions {
  links?: CaptionLinks;
  campaign?: string;
}

export interface BuiltCaptions {
  facebook: string;
  whatsappGroup: string;
  whatsappStatus: string;
}

function sanitizeGratuit(text: string): string {
  if (!text) return '';
  // Remplace "gratuit" isolé sans "bêta" à côté par "bêta gratuite"
  return text.replace(/\bgratuit\b(?!\s+(?:en\s+)?bêta)/gi, 'bêta gratuite');
}

function truncateChars(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3).trim() + '...';
}

function limitEmojis(text: string, maxEmojis: number): string {
  let count = 0;
  return text.replace(
    /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu,
    (match) => {
      count++;
      return count <= maxEmojis ? match : '';
    }
  );
}

export function buildCaptions(spec: VisualSpec, options: CaptionOptions = {}): BuiltCaptions {
  const appUrl = options.links?.appUrl || 'https://njambo-kora.ai.studio';
  const whatsappGroupUrl = options.links?.whatsappGroupUrl || 'https://chat.whatsapp.com/njambokora';
  const facebookUrl = options.links?.facebookUrl || '';

  let hookText = '';
  let badgeText = '';
  let bodyText = '';
  const bulletLines: string[] = [];
  let statLine = '';
  let quoteLine = '';
  let compareLine = '';
  let stepsLine = '';
  let eventLine = '';

  for (const block of spec.blocks) {
    if (block.type === 'HOOK') {
      hookText = sanitizeGratuit(block.text || '');
    } else if (block.type === 'BADGE') {
      badgeText = sanitizeGratuit(block.text || '');
    } else if (block.type === 'BODY') {
      bodyText = sanitizeGratuit(block.text || '');
    } else if (block.type === 'BULLETS') {
      (block.items || []).forEach((it) => {
        bulletLines.push(`✅ ${sanitizeGratuit(it)}`);
      });
    } else if (block.type === 'STAT') {
      statLine = `📊 ${block.value || ''} — ${sanitizeGratuit(block.label || '')}${
        block.sublabel ? ` (${sanitizeGratuit(block.sublabel)})` : ''
      }`;
    } else if (block.type === 'QUOTE') {
      quoteLine = `💬 « ${sanitizeGratuit(block.text || '')} »${
        block.author ? ` — ${block.author}` : ''
      }`;
    } else if (block.type === 'COMPARE') {
      compareLine = `⚡ ${sanitizeGratuit(block.leftTitle || '')} (${sanitizeGratuit(
        block.leftText || ''
      )}) VS ${sanitizeGratuit(block.rightTitle || '')} (${sanitizeGratuit(
        block.rightText || ''
      )})`;
    } else if (block.type === 'STEPS') {
      const stepsFormatted = (block.items || [])
        .map((st, i) => `${i + 1}. ${sanitizeGratuit(st)}`)
        .join(' ➔ ');
      stepsLine = `🎯 Étapes : ${stepsFormatted}`;
    } else if (block.type === 'EVENT') {
      const parts: string[] = [];
      if (block.date) parts.push(`Date: ${block.date}`);
      if (block.prize) parts.push(`Prix: ${block.prize} (jetons virtuels)`);
      if (block.mode) parts.push(`Mode: ${block.mode}`);
      if (block.spots) parts.push(`Places: ${block.spots}`);
      eventLine = `🏆 ${parts.join(' | ')}`;
      if (block.prize && !eventLine.includes('jetons virtuels')) {
        eventLine += ' (jetons virtuels)';
      }
    }
  }

  const intent = (spec.cta?.intent as CtaIntent) || 'PLAY';
  const ctaConfig = CTA_LIBRARY[intent] || CTA_LIBRARY.PLAY;
  const ctaFormula = sanitizeGratuit(ctaConfig.captionFormulas[0] || '🎮 Viens jouer à la bêta :');

  // --- 1. CAPTION FACEBOOK ---
  // Accroche limitée à 90 caractères (respecte la consigne ≤ 90-100 car.)
  const fbHook = truncateChars(hookText || badgeText || 'Njambo Kora', 90);
  const fbParts: string[] = [];

  if (fbHook) fbParts.push(fbHook);
  if (badgeText && badgeText !== fbHook) fbParts.push(`[${badgeText}]`);
  if (bodyText) fbParts.push(bodyText);
  if (bulletLines.length > 0) fbParts.push(bulletLines.join('\n'));
  if (statLine) fbParts.push(statLine);
  if (quoteLine) fbParts.push(quoteLine);
  if (compareLine) fbParts.push(compareLine);
  if (stepsLine) fbParts.push(stepsLine);
  if (eventLine) fbParts.push(eventLine);

  fbParts.push(ctaFormula);

  if (whatsappGroupUrl) {
    fbParts.push(`💬 Groupe WhatsApp : ${whatsappGroupUrl}`);
  }
  fbParts.push(`🎮 Joue en bêta : ${appUrl}`);

  const fbHashtags = '#NjamboKora #JeuDeCartes #Katika #Afrique #BêtaTest';
  fbParts.push(fbHashtags);

  const rawFb = fbParts.join('\n\n');
  const facebook = limitEmojis(rawFb, 3);

  // --- 2. CAPTION GROUPE WHATSAPP ---
  const waGroupParts: string[] = [];
  if (hookText) waGroupParts.push(hookText);
  if (badgeText && badgeText !== hookText) waGroupParts.push(`[${badgeText}]`);
  if (bodyText) waGroupParts.push(bodyText);
  if (bulletLines.length > 0) waGroupParts.push(bulletLines.join('\n'));
  if (statLine) waGroupParts.push(statLine);
  if (quoteLine) waGroupParts.push(quoteLine);
  if (compareLine) waGroupParts.push(compareLine);
  if (stepsLine) waGroupParts.push(stepsLine);
  if (eventLine) waGroupParts.push(eventLine);

  waGroupParts.push(ctaFormula);
  waGroupParts.push(`🎮 Tester la bêta : ${appUrl}`);

  if (facebookUrl && facebookUrl.trim().length > 0) {
    waGroupParts.push(`👍 Page Facebook : ${facebookUrl.trim()}`);
  }

  // Aucun hashtag sur WhatsApp
  const whatsappGroup = waGroupParts.join('\n\n').replace(/#\w+/g, '').trim();

  // --- 3. CAPTION STATUT WHATSAPP ---
  // Max 3 lignes, 1 seul lien
  const statusLine1 = truncateChars(hookText || badgeText || 'Njambo Kora Bêta', 70);
  const statusLine2 = spec.cta?.text || ctaConfig.label || 'Viens tester la bêta !';
  const statusLine3 = appUrl;

  const whatsappStatus = `${statusLine1}\n${statusLine2}\n${statusLine3}`.replace(/#\w+/g, '').trim();

  return {
    facebook,
    whatsappGroup,
    whatsappStatus,
  };
}
