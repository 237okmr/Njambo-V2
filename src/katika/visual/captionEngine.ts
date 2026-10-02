import { CTA_LIBRARY, CtaIntent } from '../data/ctaLibrary';
import { getSocialLinks } from '../services/copilotSettingsService';
import { buildTrackedAppUrl, generateUtmCampaign } from '../types/socialVisuals';
import { hashString, pickLocalPost, QuestionType } from './hokutoBank';
import { VisualSpec } from './visualSpec';

export interface CaptionLinks {
  appUrl?: string;
  whatsappGroupUrl?: string;
  facebookUrl?: string;
}

export interface CaptionOptions {
  links?: CaptionLinks;
  campaign?: string;
  /** Types de question utilisés récemment : la banque locale les évite quand elle choisit une question. */
  avoidQuestionTypes?: QuestionType[];
}

export interface BuiltCaptions {
  facebook: string;
  whatsappGroup: string;
  whatsappStatus: string;
}

const DEFAULT_FACEBOOK_HASHTAGS = '#NjamboKora #JeuDeCartes #Katika';

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

/**
 * Les légendes COMPLÈTENT le visuel : mini-histoire, question qui fait réagir, appel à l'action, liens suivis.
 * Elles ne recopient plus le texte du visuel (corps, puces, chiffres...), seulement les infos pratiques d'un événement.
 * Histoire et question viennent de spec.post (IA) ou, à défaut, de la banque locale d'Hokuto.
 */
export function buildCaptions(spec: VisualSpec, options: CaptionOptions = {}): BuiltCaptions {
  // Liens réels (réglages du copilote, avec secours vers les constantes officielles) et liens de jeu suivis (UTM)
  const storedLinks = getSocialLinks();
  const baseAppUrl = options.links?.appUrl || storedLinks.appUrl;
  const whatsappGroupUrl = options.links?.whatsappGroupUrl || storedLinks.whatsappUrl;
  const facebookUrl = options.links?.facebookUrl || storedLinks.facebookUrl;
  const campaign = options.campaign || generateUtmCampaign();
  const appUrlFacebook = buildTrackedAppUrl('facebook', campaign, 'social', baseAppUrl);
  const appUrlGroup = buildTrackedAppUrl('whatsapp', campaign, 'group', baseAppUrl);
  const appUrlStatus = buildTrackedAppUrl('whatsapp', campaign, 'status', baseAppUrl);

  let hookText = '';
  let badgeText = '';
  const visualWords: string[] = [];
  let eventLine = '';

  for (const block of spec.blocks) {
    if (block.type === 'HOOK') {
      hookText = sanitizeGratuit(block.text || '');
      visualWords.push(hookText);
    } else if (block.type === 'BADGE') {
      badgeText = sanitizeGratuit(block.text || '');
      visualWords.push(badgeText);
    } else if (block.type === 'BODY' || block.type === 'QUOTE') {
      visualWords.push(block.text || '');
    } else if (block.type === 'BULLETS' || block.type === 'STEPS') {
      visualWords.push(...(block.items || []));
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
  const seed = `${hookText}|${badgeText}`;

  // Formule d'appel à l'action : elle varie d'un post à l'autre (choix stable pour un même visuel)
  const formulas = ctaConfig.captionFormulas;
  const ctaFormula = sanitizeGratuit(formulas[hashString(seed) % formulas.length] || '🎮 Viens jouer à la bêta :');

  // Histoire et question : IA d'abord, banque locale d'Hokuto sinon
  const hasAiPost = Boolean(spec.post && (spec.post.story || spec.post.question));
  const local = pickLocalPost(visualWords.join(' '), seed, options.avoidQuestionTypes || []);
  const story = sanitizeGratuit((spec.post?.story || '').trim() || local.story);
  const question = sanitizeGratuit((spec.post?.question || '').trim() || local.question);

  const aiHashtags = (spec.post?.hashtags || []).join(' ').trim();
  const facebookHashtags = aiHashtags || DEFAULT_FACEBOOK_HASHTAGS;

  // --- 1. CAPTION FACEBOOK ---
  // Sans post de l'IA, une accroche courte (≤ 90 caractères, visible avant « voir plus ») ouvre le texte.
  const fbParts: string[] = [];
  if (!hasAiPost) {
    fbParts.push(truncateChars(hookText || badgeText || 'Njambo Kora', 90));
  }
  fbParts.push(story);
  fbParts.push(question);
  if (eventLine) fbParts.push(eventLine);
  fbParts.push(ctaFormula);
  if (whatsappGroupUrl) {
    fbParts.push(`💬 Groupe WhatsApp : ${whatsappGroupUrl}`);
  }
  fbParts.push(`🎮 Joue en bêta : ${appUrlFacebook}`);
  fbParts.push(facebookHashtags);
  const facebook = limitEmojis(fbParts.join('\n\n'), 3);

  // --- 2. CAPTION GROUPE WHATSAPP ---
  const waGroupParts: string[] = [story, question];
  if (eventLine) waGroupParts.push(eventLine);
  waGroupParts.push(ctaFormula);
  waGroupParts.push(`🎮 Tester la bêta : ${appUrlGroup}`);
  if (facebookUrl && facebookUrl.trim().length > 0) {
    waGroupParts.push(`👍 Page Facebook : ${facebookUrl.trim()}`);
  }
  // Aucun hashtag sur WhatsApp
  const whatsappGroup = waGroupParts.join('\n\n').replace(/#\w+/g, '').trim();

  // --- 3. CAPTION STATUT WHATSAPP ---
  // 3 lignes, 1 seul lien : la question (et non l'accroche du visuel), l'appel à l'action, le lien suivi
  const statusLine1 = truncateChars(question, 70);
  const statusLine2 = spec.cta?.text || ctaConfig.label || 'Viens tester la bêta !';
  const whatsappStatus = `${statusLine1}\n${statusLine2}\n${appUrlStatus}`.replace(/#\w+/g, '').trim();

  return {
    facebook,
    whatsappGroup,
    whatsappStatus,
  };
}
