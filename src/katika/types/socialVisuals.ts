import { getSocialLinks } from '../services/copilotSettingsService';

export const NJAMBO_APP_URL = 'https://njambo-kora.ai.studio';
export const NJAMBO_DOMAIN = 'njambo-kora.ai.studio';
export const NJAMBO_WHATSAPP_GROUP_URL = 'https://chat.whatsapp.com/JmIYaCOSjy1Lycd2OANd5l?s=cl&p=a&mlu=4&ilr=4';

/**
 * Calcule l'année et le numéro de semaine ISO (1-53) pour le tracking marketing.
 */
export function getIsoWeekDetails(d: Date = new Date()): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week: weekNo };
}

/**
 * Génère le nom de campagne UTM normalisé : <thème>_<année>w<semaine ISO> (ex. meme_2026w38)
 */
export function generateUtmCampaign(theme?: SocialVisualTheme | string, date: Date = new Date()): string {
  const { year, week } = getIsoWeekDetails(date);
  const cleanTheme = theme ? String(theme).toLowerCase().replace(/^theme_/, '').replace(/_theme$/, '') : 'community';

  const themeMap: Record<string, string> = {
    leaderboard_podium: 'podium',
    tactical_puzzle: 'puzzle',
    tournament_announcement: 'tournoi',
    community_question: 'sondage',
    meme_or_punchline: 'meme',
    stat_of_the_week: 'stat',
    testimonial_quote: 'quote',
    testimonial: 'quote',
    tip_or_rule: 'tips',
    carousel_slide: 'carousel',
    join_invitation: 'invitation',
    before_after: 'beforeafter',
  };

  const themeKey = themeMap[cleanTheme] || cleanTheme;
  const weekStr = week < 10 ? `0${week}` : `${week}`;
  return `${themeKey}_${year}w${weekStr}`;
}

/**
 * Génère une URL de jeu munie de balises UTM pour un tracking marketing précis sans API tierce.
 * utm_source = facebook ou whatsapp (ou instagram, twitter, etc.)
 * utm_medium = social, group ou status (par défaut 'social')
 * utm_campaign = <thème>_<année>w<semaine ISO> (ex. meme_2026w38)
 */
export function buildTrackedAppUrl(
  platform: SocialPlatform | string,
  campaign?: string,
  medium: string = 'social',
  baseUrl?: string
): string {
  const source = platform ? String(platform).toLowerCase() : 'social';
  const targetBase = (baseUrl || getSocialLinks().appUrl).trim() || NJAMBO_APP_URL;

  let finalMedium = medium;
  let finalCampaign = campaign;

  // Handle signature flexibility if 2nd arg was passed as medium ('status', 'group', 'social')
  if (campaign === 'status' || campaign === 'group' || campaign === 'social') {
    if (medium === 'social') {
      finalMedium = campaign;
      finalCampaign = undefined;
    }
  }

  if (!finalCampaign) {
    finalCampaign = generateUtmCampaign();
  } else if (!finalCampaign.includes('w')) {
    finalCampaign = generateUtmCampaign(finalCampaign);
  }

  try {
    const urlObj = new URL(targetBase);
    urlObj.searchParams.set('utm_source', source);
    urlObj.searchParams.set('utm_medium', finalMedium);
    urlObj.searchParams.set('utm_campaign', finalCampaign);
    return urlObj.toString();
  } catch {
    const connector = targetBase.includes('?') ? '&' : '?';
    return `${targetBase}${connector}utm_source=${encodeURIComponent(source)}&utm_medium=${encodeURIComponent(finalMedium)}&utm_campaign=${encodeURIComponent(finalCampaign)}`;
  }
}

// Cartes et couleurs officielles du Njambo Kora (Paquet de 31 cartes, 0 figure, 0 As, pas de 10 de Pique)
export type NjamboSuit = '♥' | '♦' | '♠' | '♣';
export type NjamboRank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';

export const NJAMBO_SUITS_INFO: Record<NjamboSuit, { name: string; symbol: string; color: string; maxRank: string }> = {
  '♥': { name: 'Koubi', symbol: '♥', color: '#ef4444', maxRank: '10' },
  '♦': { name: 'Zing', symbol: '♦', color: '#f97316', maxRank: '10' },
  '♣': { name: 'Tchaka', symbol: '♣', color: '#10b981', maxRank: '10' },
  '♠': { name: 'Black', symbol: '♠', color: '#0f172a', maxRank: '9' }, // 7 cartes : 3..9 (Le 10 Black n'existe pas)
};

export const VALID_NJAMBO_RANKS: NjamboRank[] = ['3', '4', '5', '6', '7', '8', '9', '10'];

export function isKnownBotName(name?: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const n = name.trim().toLowerCase();
  const botKeywords = [
    'bot', 'robam', 'hokuto', 'hokito', 'wizeman', 'thom', 'malo',
    'efoulan', 'bozar', 'tchakap', 'mignon', 'vie2poulet', 'malox',
    'abandon', 'interrompue', 'forfait'
  ];
  return botKeywords.some((kw) => n.includes(kw));
}

/**
 * Nettoie et formate les pseudos de joueurs pour un affichage public impeccable.
 * Supprime impérativement tout identifiant technique (#p_xxx, #usr_xxx, UUIDs, hashes, etc.).
 */
export function cleanPlayerDisplayName(name?: string, fallback: string = 'Champion'): string {
  if (!name || typeof name !== 'string') return fallback;
  let clean = name.trim();
  // Retirer les balises techniques entre parenthèses ou crochets (ex: "The killer (#p_usr_xxx)")
  clean = clean.replace(/\s*\([^)]*#[a-zA-Z0-9_-]+[^)]*\)/gi, '');
  clean = clean.replace(/\s*\[[^\]]*#[a-zA-Z0-9_-]+[^\]]*\]/gi, '');
  clean = clean.replace(/#p_usr_[a-zA-Z0-9_-]+/gi, '');
  clean = clean.replace(/#p_[a-zA-Z0-9_-]+/gi, '');
  clean = clean.replace(/#usr_[a-zA-Z0-9_-]+/gi, '');
  clean = clean.replace(/#u_[a-zA-Z0-9_-]+/gi, '');
  clean = clean.replace(/#log_[a-zA-Z0-9_-]+/gi, '');
  clean = clean.replace(/#table_[a-zA-Z0-9_-]+/gi, '');
  clean = clean.replace(/#m_[a-zA-Z0-9_-]+/gi, '');
  clean = clean.replace(/#[a-zA-Z0-9_]{5,}/g, ''); // supprime les longs identifiants hex/base64
  clean = clean.replace(/^[#@]/, ''); // supprime # ou @ en début
  clean = clean.replace(/[()\[\]]/g, ''); // supprime d'éventuelles parenthèses/crochets orphelins
  clean = clean.trim();

  // Si c'est un bot ou un identifiant technique brut restant
  if (
    isKnownBotName(clean) ||
    /^bot[_-]?\d+$/i.test(clean) ||
    /^p[_-]?\d+$/i.test(clean) ||
    /^usr_[a-zA-Z0-9]+$/i.test(clean) ||
    /^[0-9a-fA-F-]{8,}$/.test(clean)
  ) {
    return fallback;
  }

  // Si après nettoyage le pseudo est vide
  if (clean.length < 2) return fallback;

  return clean;
}

/**
 * Valide et convertit n'importe quelle carte saisie en carte valide du Njambo Kora (31 cartes)
 */
export function sanitizeNjamboCard(rank: string, suit: string): { rank: NjamboRank; suit: NjamboSuit } {
  let cleanSuit: NjamboSuit = '♥';
  if (suit === '♦' || suit === 'Zing' || suit?.toLowerCase()?.includes('carreau') || suit?.toLowerCase()?.includes('zing')) {
    cleanSuit = '♦';
  } else if (suit === '♣' || suit === 'Tchaka' || suit?.toLowerCase()?.includes('trèfle') || suit?.toLowerCase()?.includes('tchaka')) {
    cleanSuit = '♣';
  } else if (suit === '♠' || suit === 'Black' || suit?.toLowerCase()?.includes('pique') || suit?.toLowerCase()?.includes('black')) {
    cleanSuit = '♠';
  } else {
    cleanSuit = '♥';
  }

  // Remplacer les cartes invalides (As, Valet, Dame, Roi, 2) par des équivalents Njambo valides
  let cleanRank: NjamboRank = '7';
  const r = (rank || '').toUpperCase().trim();
  if (r === '10' && cleanSuit !== '♠') {
    cleanRank = '10';
  } else if (r === '10' && cleanSuit === '♠') {
    cleanRank = '9'; // Le 10 Black n'existe pas, plafonné à 9
  } else if (r === 'A' || r === 'AS') {
    cleanRank = cleanSuit === '♠' ? '9' : '10'; // L'As devient la plus haute carte de la couleur
  } else if (r === 'V' || r === 'J' || r === 'VALET') {
    cleanRank = '8';
  } else if (r === 'D' || r === 'Q' || r === 'DAME') {
    cleanRank = '7';
  } else if (r === 'R' || r === 'K' || r === 'ROI') {
    cleanRank = cleanSuit === '♠' ? '9' : '10';
  } else if (r === '2') {
    cleanRank = '3';
  } else if (['3', '4', '5', '6', '7', '8', '9', '10'].includes(r)) {
    cleanRank = (cleanSuit === '♠' && r === '10') ? '9' : (r as NjamboRank);
  }

  return { rank: cleanRank, suit: cleanSuit };
}

export type SocialVisualTheme =
  | 'STAT_OF_THE_WEEK'
  | 'TESTIMONIAL'
  | 'BEFORE_AFTER'
  | 'TIP_OR_RULE'
  | 'CULTURE_NJAMBO'
  | 'HIGHLIGHT_MOMENT'
  | 'COMMUNITY_QUESTION'
  | 'JOIN_INVITATION'
  | 'TOURNAMENT_ANNOUNCEMENT'
  | 'LEADERBOARD_PODIUM'
  | 'TACTICAL_PUZZLE'
  | 'MEME_OR_PUNCHLINE'
  | 'CAROUSEL_SLIDE'
  | 'WELCOME_NEWBIE'
  | 'FIRST_WIN'
  | 'LIVE_MOMENT'
  | 'TOURNAMENT_LIVE'
  | 'PARTNERSHIP';

export type SocialVisualFormat = 'SQUARE' | 'STORY' | 'BANNER'; // 1080x1080, 1080x1920, 1920x1080

export type SocialVisualPalette =
  | 'EMERALD_GOLD'     // Tapis de jeu noble vert émeraude & or
  | 'EBONY_GOLD'       // Nuit d'ébène & or impérial (Tournoi & Prestige)
  | 'SUNSET_TERRACOTTA'// Coucher de soleil équatorial (Culture & Communauté)
  | 'ROYAL_SAPPHIRE';  // Bleu saphir & argent (Tactique & Réflexion)

export type SocialVisualPattern = 'NDOP_CHEVRON' | 'DIAMONDS' | 'MINIMAL';

export type TacticalLayout =
  | 'DUEL_1V1'          // Duel 1vs1 épuré : Carte adverse posée au centre vs tes options en main (Défaut recommandé)
  | 'TABLE_3P'          // Table à 3 joueurs : 2 cartes adverses jouées au centre vs tes options en main
  | 'DILEMMA_3'         // 3 cartes côte à côte (Choix A, B, C)
  | 'TABLE_FELT_LIVE'   // Tapis de jeu avec les cartes de la table
  | 'PLAYER_HAND_5';    // Main complète de 5 cartes d'un joueur

export interface TableScenarioInfo {
  mode?: '1VS1' | '3_PLAYERS';
  trickNumber?: number; // Tour 3, 4 ou 5
  playerTricksWon?: number; // Tours remportés par le joueur (ex: 2)
  opponentTricksWon?: number; // Tours remportés par l'adversaire (ex: 2 ou 4)
  riskTitle?: string; // ex: "ALERTE KORA (4-0)", "CLASH FINAL (2-2)", "PIÈGE DE SURCOUPE"
  opponentPlayed?: Array<{
    rank: string;
    suit: '♥' | '♦' | '♠' | '♣';
    playerName?: string;
  }>;
  cardsAlreadyFallen?: Array<{
    rank: string;
    suit: '♥' | '♦' | '♠' | '♣';
  }>;
  question?: string;
}

export interface PodiumWinnerItem {
  rank: 1 | 2 | 3;
  name: string; // Pseudo propre uniquement (ex: "The killer", "Hokuto", "Laflamme")
  scoreOrTitle?: string; // ex: "15 Victoires", "Maître de Position", "48% Ratio", "5 Koras"
  koraCount?: number;
  chipsWon?: string;
  badge?: string;
  avatarUrl?: string; // Optionnel : URL de l'avatar du joueur pour affichage
}

export interface SocialVisualCardData {
  theme: SocialVisualTheme;
  format?: SocialVisualFormat;
  palette?: SocialVisualPalette;
  pattern?: SocialVisualPattern;
  tacticalLayout?: TacticalLayout;
  tableScenario?: TableScenarioInfo;
  badge?: string; // e.g. "GRAND TOURNOI DU WEEK-END 🏆", "CASSE-TÊTE TACTIQUE 🧩", "PODIUM DES CHAMPIONS 🥇"
  headline: string; // Grand titre ou chiffre fort
  mainText: string; // Corps du message ou citation
  podiumWinners?: PodiumWinnerItem[]; // Pour LEADERBOARD_PODIUM ou TOURNAMENT_ANNOUNCEMENT
  highlightMetric?: {
    value: string;
    label: string;
    sublabel?: string;
  };
  author?: {
    name: string;
    role?: string;
  };
  comparison?: {
    beforeTitle?: string;
    beforeText: string;
    afterTitle?: string;
    afterText: string;
  };
  eventDetails?: {
    date?: string;
    prizePool?: string;
    mode?: string;
    spotsRemaining?: string;
  };
  puzzleCards?: Array<{
    rank: string;
    suit: '♥' | '♦' | '♠' | '♣';
    label?: string;
    isBestMove?: boolean;
    player?: string;
  }>;
  heroCard?: {
    rank: string;
    suit: '♥' | '♦' | '♠' | '♣';
    label?: string;
    badge?: string;
  };
  decorativeCards?: Array<{
    rank: string;
    suit: '♥' | '♦' | '♠' | '♣';
    label?: string;
  }>;
  carouselStep?: {
    current: number;
    total: number;
    stepTitle?: string;
  };
  options?: string[]; // Pour sondage ou question A vs B
  ctaText?: string; // Ex: "Inscris-toi • Lien en bio"
  linkUrl?: string; // Ex: "njambo-kora.ai.studio"
  includeAppUrl?: boolean; // Toggled link for Web App
  includeWhatsAppUrl?: boolean; // Toggled link for WhatsApp group
  customAppUrl?: string;
  customWhatsAppUrl?: string;
  postCaption: string; // Texte complet du post pour réseaux sociaux avec emojis & hashtags
  whatsAppMessage?: string; // Message formaté prêt à copier pour les groupes WhatsApp
  whatsAppStatus?: string; // Version condensée pour le statut WhatsApp (3 lignes max, 1 lien)
  platformCaptions?: Partial<Record<SocialPlatform, string>>; // Textes sur-mesure pour chaque réseau social
  aiImagePrompt?: string; // Prompt artistique optimisé (Midjourney/Imagen) pour l'illustration de fond
  hashtags?: string[];
}

export type SocialPlatform = 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'TWITTER' | 'TIKTOK';

export interface SocialPlatformConfig {
  id: SocialPlatform;
  label: string;
  shortLabel: string;
  badge: string;
  icon: string;
  color: string;
  charLimit?: number;
  description: string;
  instructions: string;
}

export const SOCIAL_PLATFORMS_CONFIG: Record<SocialPlatform, SocialPlatformConfig> = {
  WHATSAPP: {
    id: 'WHATSAPP',
    label: 'WhatsApp',
    shortLabel: 'WhatsApp',
    badge: '💬 Groupes & Statuts',
    icon: 'MessageSquare',
    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30',
    description: 'Formaté avec *gras*, puces émojis, lien direct et appel à transférer dans les groupes.',
    instructions: 'Idéal pour diffusion dans les groupes de joueurs et statuts WhatsApp.',
  },
  INSTAGRAM: {
    id: 'INSTAGRAM',
    label: 'Instagram',
    shortLabel: 'Instagram',
    badge: '📸 Feed, Carrousel & Story',
    icon: 'Camera',
    color: 'bg-pink-500/20 text-pink-300 border-pink-500/40 hover:bg-pink-500/30',
    description: 'Accroche percutante, interlignes aérés, mention « Lien en bio », appel à enregistrer et pavé de 12+ hashtags ciblés.',
    instructions: 'Optimisé pour le feed Instagram et l’engagement visuel.',
  },
  FACEBOOK: {
    id: 'FACEBOOK',
    label: 'Facebook',
    shortLabel: 'Facebook',
    badge: '📘 Pages & Groupes',
    icon: 'Facebook',
    color: 'bg-blue-600/20 text-blue-300 border-blue-500/40 hover:bg-blue-600/30',
    description: 'Storytelling immersif, liens cliquables directs, question de débat pour générer des commentaires.',
    instructions: 'Idéal pour les publications de pages officielles et les groupes communautaires.',
  },
  TWITTER: {
    id: 'TWITTER',
    label: 'X (Twitter)',
    shortLabel: 'X / Twitter',
    badge: '🐦 Fil X / 280 Car.',
    icon: 'Twitter',
    charLimit: 280,
    color: 'bg-slate-800 text-cyan-300 border-cyan-500/40 hover:bg-slate-700',
    description: 'Format condensé sous les 280 caractères avec punchline, lien court et 2-3 hashtags clés.',
    instructions: 'Garanti sous la limite stricte de 280 caractères pour publication instantanée.',
  },
  TIKTOK: {
    id: 'TIKTOK',
    label: 'TikTok & Reels',
    shortLabel: 'TikTok',
    badge: '🎵 Légende Courte & Virale',
    icon: 'Video',
    color: 'bg-purple-500/20 text-purple-300 border-purple-500/40 hover:bg-purple-500/30',
    description: 'Légende ultra-dynamique (1-2 phrases), question pour booster les commentaires et hashtags tendances (#fyp #gaming).',
    instructions: 'Parfait pour la description d’un clip vidéo ou d’une story TikTok/Reels/Shorts.',
  },
};

export interface CrossPromoRule {
  primaryLinkType: 'WHATSAPP' | 'APP';
  secondaryLinkType?: 'APP' | 'FACEBOOK' | 'WHATSAPP' | 'NONE';
  primaryLabel: string;
  secondaryLabel?: string;
}

/**
 * Règles de pont (Cross-Promotion) par réseau social
 */
export const CROSS_PROMO_RULES: Record<SocialPlatform, CrossPromoRule> = {
  FACEBOOK: {
    primaryLinkType: 'WHATSAPP',
    secondaryLinkType: 'APP',
    primaryLabel: '💬 Rejoins notre groupe WhatsApp officiel :',
    secondaryLabel: '🎮 Teste la version bêta en ligne :',
  },
  WHATSAPP: {
    primaryLinkType: 'APP',
    secondaryLinkType: 'FACEBOOK',
    primaryLabel: '👉 Teste la bêta en ligne :',
    secondaryLabel: '📘 Suis notre page Facebook officielle :',
  },
  INSTAGRAM: {
    primaryLinkType: 'APP',
    secondaryLinkType: 'WHATSAPP',
    primaryLabel: '🎮 Lien pour tester la bêta en bio (@njambokora) ou via :',
    secondaryLabel: '💬 Communauté WhatsApp officielle :',
  },
  TWITTER: {
    primaryLinkType: 'APP',
    secondaryLinkType: 'NONE',
    primaryLabel: '🎮 Joue en bêta :',
  },
  TIKTOK: {
    primaryLinkType: 'APP',
    secondaryLinkType: 'NONE',
    primaryLabel: 'Joue en bêta sur le lien en bio ! 🎮',
  },
};

/**
 * Génère une légende condensée pour Statut WhatsApp (3 lignes max, 1 seul lien : l'app)
 */
export function getWhatsAppStatusCaption(
  data: SocialVisualCardData,
  links?: { appUrl?: string; whatsappUrl?: string; facebookUrl?: string }
): string {
  if (data.whatsAppStatus && data.whatsAppStatus.trim().length > 0) {
    return data.whatsAppStatus.replace(/gratuitement|100% gratuit/gi, 'en bêta');
  }
  const resolvedLinks = links || getSocialLinks();
  const theme = data.theme || 'COMMUNITY_QUESTION';
  const campaign = generateUtmCampaign(theme);
  const trackedAppUrl = buildTrackedAppUrl('WHATSAPP', campaign, 'status', resolvedLinks.appUrl);

  const isTournament = theme === 'TOURNAMENT_ANNOUNCEMENT';
  const rawHeadline = data.headline || 'Njambo Kora';
  const headline = rawHeadline.length > 50 ? rawHeadline.substring(0, 47) + '...' : rawHeadline;
  const cta = data.ctaText || 'Viens tester la bêta';

  const line1 = `🃏 *${headline}*`;
  const line2 = isTournament
    ? `🏆 Tournoi Njambo Kora (Jetons virtuels d'amusement)`
    : `👉 ${cta}`;
  const line3 = `🎮 Teste la bêta en ligne : ${trackedAppUrl}`;

  return `${line1}\n${line2}\n${line3}`;
}

/**
 * Génère ou adapte intelligemment le texte du post pour la plateforme sociale sélectionnée
 * en respectant scrupuleusement la cohérence du thème et les règles de promotion croisée.
 */
export function getFormattedCaptionForPlatform(
  data: SocialVisualCardData,
  platform: SocialPlatform,
  links?: { appUrl?: string; whatsappUrl?: string; facebookUrl?: string }
): string {
  // 1. Si un texte spécifique pour cette plateforme est déjà défini, on le retourne directement après nettoyage
  if (data.platformCaptions && data.platformCaptions[platform]) {
    return data.platformCaptions[platform]!.replace(/gratuitement|100% gratuit/gi, 'en bêta');
  }

  const resolvedLinks = links || getSocialLinks();
  const appUrlBase = resolvedLinks.appUrl || NJAMBO_APP_URL;
  const rawWaUrl = resolvedLinks.whatsappUrl || NJAMBO_WHATSAPP_GROUP_URL;
  const rawFbUrl = (resolvedLinks.facebookUrl || '').trim();

  const headline = data.headline || '';
  const mainText = data.mainText || '';
  const isPodium = data.theme === 'LEADERBOARD_PODIUM' || (data.podiumWinners && data.podiumWinners.length > 0);
  const isPuzzle = data.theme === 'TACTICAL_PUZZLE';
  const isTournament = data.theme === 'TOURNAMENT_ANNOUNCEMENT';

  const winners = data.podiumWinners || [];
  const w1 = winners.find(w => w.rank === 1);
  const w2 = winners.find(w => w.rank === 2);
  const w3 = winners.find(w => w.rank === 3);

  const cleanW1Name = w1 ? cleanPlayerDisplayName(w1.name, 'Champion') : '';
  const cleanW2Name = w2 ? cleanPlayerDisplayName(w2.name, 'Vice-Champion') : '';
  const cleanW3Name = w3 ? cleanPlayerDisplayName(w3.name, '3e Place') : '';

  const customHashtags = (data.hashtags && data.hashtags.length > 0)
    ? data.hashtags
    : isPodium
    ? ['#NjamboKora', '#Podium', '#Champions', '#DoubleKora', '#GamingAfrica']
    : isTournament
    ? ['#TournoiNjambo', '#MaitresDuKora', '#EsportCameroun', '#NjamboKora']
    : ['#NjamboKora', '#JeuxDeCartes', '#CamerounGaming', '#DoubleKora', '#MaitresDuKora'];

  const campaign = generateUtmCampaign(data.theme);

  switch (platform) {
    case 'WHATSAPP': {
      if (data.whatsAppMessage && data.whatsAppMessage.trim().length > 0) {
        return data.whatsAppMessage.replace(/gratuitement|100% gratuit/gi, 'en bêta ouverte');
      }
      const trackedAppUrl = buildTrackedAppUrl('WHATSAPP', campaign, 'group', appUrlBase);

      let msg = `🃏 *NJAMBO KORA — ${headline.toUpperCase()}* 🇨🇲\n\n`;
      msg += `${mainText}\n\n`;

      if (isPodium && (cleanW1Name || cleanW2Name || cleanW3Name)) {
        msg += `🏆 *LE PODIUM DES MAÎTRES :*\n`;
        if (cleanW1Name) msg += `🥇 *1ère Place (Champion) :* ${cleanW1Name}${w1?.scoreOrTitle ? ` — ${w1.scoreOrTitle}` : ''}\n`;
        if (cleanW2Name) msg += `🥈 *2ème Place :* ${cleanW2Name}${w2?.scoreOrTitle ? ` — ${w2.scoreOrTitle}` : ''}\n`;
        if (cleanW3Name) msg += `🥉 *3ème Place :* ${cleanW3Name}${w3?.scoreOrTitle ? ` — ${w3.scoreOrTitle}` : ''}\n`;
        msg += `\n*Félicitations aux champions ! Prêts à défendre vos titres ?*\n\n`;
      } else if (isTournament && data.eventDetails) {
        msg += `🏆 *DÉTAILS DU TOURNOI :*\n`;
        if (data.eventDetails.prizePool) msg += `💰 *Dotation :* ${data.eventDetails.prizePool}\n`;
        if (data.eventDetails.date) msg += `📅 *Date & Heure :* ${data.eventDetails.date}\n`;
        if (data.eventDetails.mode) msg += `⚔️ *Format :* ${data.eventDetails.mode}\n`;
        if (data.eventDetails.spotsRemaining) msg += `🔥 *Places :* ${data.eventDetails.spotsRemaining}\n`;
        msg += `\n`;
      } else if (isPuzzle && data.puzzleCards && data.puzzleCards.length > 0) {
        msg += `*Quel coup joues-tu ?*\n`;
        data.puzzleCards.forEach((c, idx) => {
          const letter = String.fromCharCode(65 + idx);
          msg += `👉 *Option ${letter}* : ${c.rank}${c.suit} ${c.label ? `(${c.label})` : ''}\n`;
        });
        msg += `\n`;
      }

      msg += `👉 *Teste la bêta en ligne :* ${trackedAppUrl}\n`;
      if (rawFbUrl) {
        msg += `📘 *Suis notre page Facebook officielle :* ${rawFbUrl}\n`;
      }
      msg += `💬 *Rejoins notre groupe WhatsApp officiel :* ${rawWaUrl}\n\n`;

      if (isTournament) {
        msg += `⚖️ _Jetons virtuels d'amusement — Aucune valeur monétaire réelle._\n\n`;
      }
      msg += isPodium
        ? `_Défie les maîtres dès maintenant sur le tapis vert !_ 🃏`
        : `_Transférez ce message à vos amis joueurs de cartes !_ 🃏`;
      return msg;
    }

    case 'INSTAGRAM': {
      const trackedAppUrl = buildTrackedAppUrl('INSTAGRAM', campaign, 'social', appUrlBase);
      let insta = `🃏 ${headline}\n\n`;
      insta += `${mainText}\n\n`;

      if (isPodium && (cleanW1Name || cleanW2Name || cleanW3Name)) {
        insta += `🏆 LE CLASSEMENT OFFICIEL\n`;
        if (cleanW1Name) insta += `🥇 1er : ${cleanW1Name}${w1?.scoreOrTitle ? ` (${w1.scoreOrTitle})` : ''}\n`;
        if (cleanW2Name) insta += `🥈 2e : ${cleanW2Name}${w2?.scoreOrTitle ? ` (${w2.scoreOrTitle})` : ''}\n`;
        if (cleanW3Name) insta += `🥉 3e : ${cleanW3Name}${w3?.scoreOrTitle ? ` (${w3.scoreOrTitle})` : ''}\n`;
        insta += `\nBravo aux rois du tapis vert ! Qui osera venir bousculer le classement cette semaine ?\n\n`;
        insta += `👇 Félicite les vainqueurs en commentaire !\n`;
      } else if (isTournament && data.eventDetails) {
        insta += `📅 Date : ${data.eventDetails.date || 'Ce week-end'}\n`;
        insta += `🏆 Récompense : ${data.eventDetails.prizePool || 'Dotation à annoncer'}\n`;
        insta += `⚔️ Format : ${data.eventDetails.mode || 'Élimination directe'}\n`;
        insta += `⚖️ Jetons virtuels d'amusement — Aucune valeur monétaire réelle\n\n`;
        insta += `👇 Tag ton coéquipier ou ton rival en commentaire !\n`;
      } else if (isPuzzle && data.puzzleCards && data.puzzleCards.length > 0) {
        insta += `Quelle est ta décision à la table ? 🧠\n`;
        data.puzzleCards.forEach((c, idx) => {
          const letter = String.fromCharCode(65 + idx);
          insta += `▫️ Option ${letter} : ${c.rank}${c.suit} ${c.label ? `(${c.label})` : ''}\n`;
        });
        insta += `\n👇 Donne ton choix en commentaire et justifie ta tactique !\n`;
      } else {
        insta += `👇 Donne ton avis en commentaire !\n`;
      }

      insta += `📌 Enregistre ce post pour ne rien manquer.\n\n`;
      insta += `🎮 Lien pour tester la bêta en bio (@njambokora) ou via : ${trackedAppUrl}\n`;
      insta += `💬 Communauté WhatsApp disponible via le lien en bio.\n\n`;
      insta += `.\n.\n.\n`;
      const fullTags = Array.from(new Set([
        ...customHashtags,
        '#JeuxAfricains',
        '#Cameroun',
        '#GamingAfrica',
        '#KoraHunter',
        '#CartesTraditionnelles',
        '#BoardGamesAfrica',
      ]));
      insta += fullTags.join(' ');
      return insta;
    }

    case 'FACEBOOK': {
      if (data.postCaption && data.postCaption.trim().length > 0) {
        return data.postCaption.replace(/gratuitement|100% gratuit/gi, 'en bêta ouverte');
      }
      const trackedAppUrl = buildTrackedAppUrl('FACEBOOK', campaign, 'social', appUrlBase);
      const rawHook = `🃏 NJAMBO KORA | ${headline}`;
      const hook = rawHook.length > 90 ? rawHook.substring(0, 87) + '...' : rawHook;

      let fb = `${hook}\n\n`;
      fb += `${mainText}\n\n`;

      if (isPodium && (cleanW1Name || cleanW2Name || cleanW3Name)) {
        fb += `1ère Place : ${cleanW1Name}\n`;
        if (cleanW2Name) fb += `2ème Place : ${cleanW2Name}\n`;
        if (cleanW3Name) fb += `3ème Place : ${cleanW3Name}\n`;
        fb += `\nFélicitations aux champions ! Qui relèvera le défi cette semaine ?\n\n`;
      } else if (isTournament && data.eventDetails) {
        fb += `Dotation : ${data.eventDetails.prizePool || 'Dotation à annoncer'}\n`;
        fb += `Date : ${data.eventDetails.date || 'Ce week-end'}\n`;
        fb += `Format : ${data.eventDetails.mode || 'Table 4 joueurs'}\n`;
        fb += `⚖️ Jetons virtuels d'amusement — Aucune valeur monétaire réelle\n\n`;
      } else if (isPuzzle && data.puzzleCards && data.puzzleCards.length > 0) {
        fb += `À votre avis, quel est le meilleur coup à jouer ?\n`;
        data.puzzleCards.forEach((c, idx) => {
          const letter = String.fromCharCode(65 + idx);
          fb += `Option ${letter} : ${c.rank}${c.suit} ${c.label ? `(${c.label})` : ''}\n`;
        });
        fb += `\n`;
      }

      fb += `👉 ${data.ctaText || 'Laisse ton avis en commentaire !'}\n\n`;
      // Primary link for Facebook = WhatsApp Group
      fb += `💬 Rejoins notre groupe WhatsApp officiel : ${rawWaUrl}\n`;
      // Secondary link for Facebook = App
      fb += `🎮 Teste la version bêta en ligne : ${trackedAppUrl}\n\n`;
      fb += customHashtags.slice(0, 4).join(' ');
      return fb;
    }

    case 'TWITTER': {
      let shortHeadline = headline.length > 70 ? headline.substring(0, 67) + '...' : headline;
      const trackedTwitterUrl = buildTrackedAppUrl('TWITTER', campaign, 'social', appUrlBase);
      if (isPodium && cleanW1Name) {
        let xText = `🏆 ${shortHeadline}\n\n🥇 ${cleanW1Name}\n${cleanW2Name ? `🥈 ${cleanW2Name}\n` : ''}${cleanW3Name ? `🥉 ${cleanW3Name}\n` : ''}\n🎮 Défie les champions en bêta : ${trackedTwitterUrl}\n${customHashtags.slice(0, 2).join(' ')}`;
        return xText.length > 280 ? xText.substring(0, 275) + '...' : xText;
      }
      let shortText = mainText.length > 100 ? mainText.substring(0, 97) + '...' : mainText;
      let xText = `🃏 ${shortHeadline}\n\n${shortText}\n\n🎮 Joue en bêta : ${trackedTwitterUrl}\n${customHashtags.slice(0, 3).join(' ')}`;
      if (xText.length > 280) {
        xText = `🃏 ${shortHeadline}\n\n🎮 Joue au Njambo Kora en bêta : ${trackedTwitterUrl}\n${customHashtags.slice(0, 2).join(' ')}`;
      }
      return xText;
    }

    case 'TIKTOK': {
      if (isPodium && cleanW1Name) {
        let tiktok = `🏆 Le podium des champions de Njambo Kora ! 👑\n\n`;
        tiktok += `🥇 ${cleanW1Name}\n`;
        if (cleanW2Name) tiktok += `🥈 ${cleanW2Name}\n`;
        if (cleanW3Name) tiktok += `🥉 ${cleanW3Name}\n\n`;
        tiktok += `Tu penses pouvoir les détrôner ? Dis-le en commentaire ! 👇💬\n`;
        tiktok += `Joue en bêta sur le lien en bio ! 🎮\n\n`;
        tiktok += `#fyp #njambokora #gaming #champions #cameroun #jeuxdecartes`;
        return tiktok;
      } else if (isPuzzle) {
        let tiktok = `🃏 ${headline} 💥\n\n`;
        tiktok += `Tu aurais joué quelle carte toi ? Dis-le moi en com 👇💬\n\n`;
        tiktok += `Joue en bêta sur le lien en bio ! 🎮\n\n`;
        tiktok += `#fyp #foryou #njambokora #gaming #jeuxdecartes #camerountiktok #237 #doublekora #gamingafrica`;
        return tiktok;
      } else if (isTournament) {
        let tiktok = `🏆 Grand Tournoi Njambo Kora annoncé ! 💥\n\n`;
        tiktok += `${headline}\n`;
        tiktok += `Inscriptions ouvertes en bêta sur le lien en bio ! 🎮\n\n`;
        tiktok += `#fyp #tournoi #njambokora #esport #cameroun #gaming`;
        return tiktok;
      } else {
        let tiktok = `🃏 ${headline} 💥\n\n`;
        tiktok += `${mainText.slice(0, 100)}\n\n`;
        tiktok += `Rejoins la table en bêta sur le lien en bio ! 🎮\n\n`;
        tiktok += `#fyp #njambokora #gaming #cameroun #jeuxdecartes`;
        return tiktok;
      }
    }
    default:
      return data.postCaption || '';
  }
}

export interface ThemeConfig {
  id: SocialVisualTheme;
  label: string;
  shortLabel: string;
  icon: string;
  badge: string;
  defaultHeadline: string;
  promptExample: string;
  suggestedHashtags: string[];
}

export interface VisualCategoryFilter {
  id: string;
  label: string;
  shortLabel: string;
  icon: string;
  theme: SocialVisualTheme;
  description: string;
  badge: string;
  color: string;
}

export const STAR_VISUAL_CATEGORIES: VisualCategoryFilter[] = [
  {
    id: 'PODIUM',
    label: '🥇 Palmarès & Podium',
    shortLabel: 'Podium',
    icon: 'Trophy',
    theme: 'LEADERBOARD_PODIUM',
    description: 'Podium des champions réels, top victoires & couronnement (Pseudos humains uniquement)',
    badge: 'PODIUM DES CHAMPIONS 🥇',
    color: 'from-amber-500/25 to-yellow-500/25 text-amber-300 border-amber-500/40',
  },
  {
    id: 'TACTICAL',
    label: '🧩 Casse-tête Tactique',
    shortLabel: 'Tactique',
    icon: 'HelpCircle',
    theme: 'TACTICAL_PUZZLE',
    description: 'Dilemmes au 4e/5e tour, choix A/B/C & débats passionnés',
    badge: 'DÉFI DU JOUR 🧩',
    color: 'from-cyan-500/20 to-blue-500/20 text-cyan-300 border-cyan-500/40',
  },
  {
    id: 'STATS',
    label: '📊 Chiffre de la Semaine',
    shortLabel: 'Stat Hebdo',
    icon: 'BarChart3',
    theme: 'STAT_OF_THE_WEEK',
    description: 'Bilan de l’arène, nombre de donnes & Koras validés',
    badge: 'CHIFFRE DE LA SEMAINE 🃏',
    color: 'from-emerald-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/40',
  },
  {
    id: 'TESTIMONIAL',
    label: '🎙️ Parole de Maître',
    shortLabel: 'Témoignage',
    icon: 'Quote',
    theme: 'TESTIMONIAL',
    description: 'Avis authentiques de joueurs, émotions & comeback au 5e tour',
    badge: 'PAROLE DE MAÎTRE 🎙️',
    color: 'from-amber-500/20 to-yellow-500/20 text-amber-300 border-amber-500/40',
  },
  {
    id: 'RULES',
    label: '💡 Règle & Astuce',
    shortLabel: 'Règles & Astuces',
    icon: 'HelpCircle',
    theme: 'TIP_OR_RULE',
    description: 'Pédagogie, spécificité des 31 cartes & secrets du Kora Hunter',
    badge: 'SECRET DE STRATÉGIE 💡',
    color: 'from-blue-500/20 to-indigo-500/20 text-blue-300 border-blue-500/40',
  },
  {
    id: 'MEME',
    label: '😂 Mème & Humour',
    shortLabel: 'Humour & Mème',
    icon: 'Sparkles',
    theme: 'MEME_OR_PUNCHLINE',
    description: 'Punchlines du Mboa, chambrage bon enfant & situations réelles',
    badge: 'HUMOUR NJAMBO 😂',
    color: 'from-orange-500/20 to-rose-500/20 text-orange-300 border-orange-500/40',
  },
  {
    id: 'TOURNAMENT',
    label: '🏆 Tournoi & Clash',
    shortLabel: 'Tournoi',
    icon: 'Award',
    theme: 'TOURNAMENT_ANNOUNCEMENT',
    description: 'Affiches d’événements du week-end, cagnottes et défis',
    badge: 'GRAND TOURNOI NJAMBO 🏆',
    color: 'from-amber-500/20 to-amber-600/20 text-amber-200 border-amber-500/40',
  },
  {
    id: 'CAROUSEL',
    label: '📚 Guide Carrousel',
    shortLabel: 'Carrousel',
    icon: 'BookOpen',
    theme: 'CAROUSEL_SLIDE',
    description: 'Séries éducatives en 3 étapes pour Instagram & WhatsApp',
    badge: 'GUIDE DU MAÎTRE 📚',
    color: 'from-purple-500/20 to-pink-500/20 text-purple-300 border-purple-500/40',
  },
];

/**
 * Génère des ensembles de cartes aléatoires authentiques strictement conformes au jeu Njambo (31 cartes)
 */
export function generateRandomNjamboCards(count: number = 3): Array<{ rank: NjamboRank; suit: NjamboSuit; label?: string; isBestMove?: boolean }> {
  const suits: NjamboSuit[] = ['♥', '♦', '♣', '♠'];
  const results: Array<{ rank: NjamboRank; suit: NjamboSuit; label?: string; isBestMove?: boolean }> = [];
  const labels = ['OPTION A', 'OPTION B', 'OPTION C', 'OPTION D', 'OPTION E'];

  const used = new Set<string>();

  while (results.length < count) {
    const suit = suits[Math.floor(Math.random() * suits.length)];
    const availableRanks = suit === '♠' ? ['3', '4', '5', '6', '7', '8', '9'] : ['3', '4', '5', '6', '7', '8', '9', '10'];
    const rank = availableRanks[Math.floor(Math.random() * availableRanks.length)] as NjamboRank;
    const key = `${rank}${suit}`;

    if (!used.has(key)) {
      used.add(key);
      results.push({
        rank,
        suit,
        label: labels[results.length] || `CARTE ${results.length + 1}`,
        isBestMove: results.length === 1, // Marque l'option B par défaut comme coup clé
      });
    }
  }

  return results;
}

export const SOCIAL_THEMES_CONFIG: Record<SocialVisualTheme, ThemeConfig> = {
  LEADERBOARD_PODIUM: {
    id: 'LEADERBOARD_PODIUM',
    label: 'Palmarès & Podium des Vainqueurs',
    shortLabel: 'Podium',
    icon: 'Trophy',
    badge: 'PODIUM DES CHAMPIONS 🥇',
    defaultHeadline: 'Les Rois de la Table',
    promptExample: 'Crée un podium officiel des 3 meilleurs joueurs humains avec leurs pseudos propres (ex: The killer, Hokuto, Laflamme) et leurs victoires.',
    suggestedHashtags: ['#NjamboKora', '#Podium', '#Champions', '#DoubleKora', '#EsportCameroun'],
  },
  STAT_OF_THE_WEEK: {
    id: 'STAT_OF_THE_WEEK',
    label: 'Chiffre de la semaine',
    shortLabel: 'Stat Hebdo',
    icon: 'BarChart3',
    badge: 'CHIFFRE DE LA SEMAINE 🃏',
    defaultHeadline: 'Parties jouées cette semaine',
    promptExample: 'Génère un visuel "Chiffre de la semaine" basé sur les statistiques réelles des parties jouées et des Kora.',
    suggestedHashtags: ['#NjamboKora', '#StatsDuJeu', '#MaitresDuKora', '#CamerounGaming'],
  },
  TESTIMONIAL: {
    id: 'TESTIMONIAL',
    label: 'Témoignage de testeur',
    shortLabel: 'Témoignage',
    icon: 'Quote',
    badge: 'PAROLE DE MAÎTRE 🎙️',
    defaultHeadline: 'Un Maître du Kora témoigne',
    promptExample: 'Crée un visuel de témoignage d’un joueur passionné qui raconte son premier Double Kora.',
    suggestedHashtags: ['#Temoignage', '#AvisJoueur', '#NjamboKora', '#CommunauteNjambo'],
  },
  BEFORE_AFTER: {
    id: 'BEFORE_AFTER',
    label: 'Coulisses / Avant-après',
    shortLabel: 'Avant / Après',
    icon: 'Layers',
    badge: 'ÉVOLUTION DU JEU ⚡',
    defaultHeadline: 'Amélioration récente de Katika',
    promptExample: 'Crée un visuel avant/après montrant la fluidité des donnes et l’animation du Kora Hunter.',
    suggestedHashtags: ['#Coulisses', '#MiseAJour', '#GameDesign', '#NjamboKora'],
  },
  TIP_OR_RULE: {
    id: 'TIP_OR_RULE',
    label: 'Astuce ou règle du jeu',
    shortLabel: 'Astuce & Règle',
    icon: 'HelpCircle',
    badge: 'SECRET DE STRATÉGIE 💡',
    defaultHeadline: 'La règle d’or du Kora Hunter',
    promptExample: 'Génère une astuce tactique sur l’entame et la gestion des 5 tours pour sécuriser un Kora sans se faire contrer.',
    suggestedHashtags: ['#AstuceJeu', '#ReglesDuJeu', '#StrategieNjambo', '#DoubleKora'],
  },
  CULTURE_NJAMBO: {
    id: 'CULTURE_NJAMBO',
    label: 'Culture Njambo',
    shortLabel: 'Culture',
    icon: 'Sparkles',
    badge: 'CULTURE & PASSION 🇨🇲',
    defaultHeadline: 'Plus qu’un jeu, un esprit',
    promptExample: 'Rédige et compose un visuel sur la tradition du Njambo dans les soirées et quartiers camerounais.',
    suggestedHashtags: ['#CultureNjambo', '#Cameroun', '#JeuxAfricains', '#SoireeCartes'],
  },
  HIGHLIGHT_MOMENT: {
    id: 'HIGHLIGHT_MOMENT',
    label: 'Moment fort / Victoire marquante',
    shortLabel: 'Moment Fort',
    icon: 'Trophy',
    badge: 'ACTION DE LÉGENDE 🏆',
    defaultHeadline: 'Un Double Kora d’anthologie !',
    promptExample: 'Génère un visuel célébrant un grand coup de maître avec le 3 Koubi (♥) remportant le 5e pli pour claquer un Kora décisif.',
    suggestedHashtags: ['#GrandCoup', '#DoubleKora', '#Victoire', '#NjamboChampion'],
  },
  COMMUNITY_QUESTION: {
    id: 'COMMUNITY_QUESTION',
    label: 'Question à la communauté',
    shortLabel: 'Question',
    icon: 'MessageSquare',
    badge: 'À VOUS LA PAROLE 🗣️',
    defaultHeadline: 'Duel 1 vs 1 ou Table à 4 ?',
    promptExample: 'Génère une question pour la communauté demandant si les joueurs préfèrent le duel ou la table à 4.',
    suggestedHashtags: ['#DebatNjambo', '#Communaute', '#VotreAvis', '#JeuxDeCartes'],
  },
  JOIN_INVITATION: {
    id: 'JOIN_INVITATION',
    label: 'Appel à rejoindre / inviter',
    shortLabel: 'Invitation',
    icon: 'UserPlus',
    badge: 'REJOINS LA TABLE 🃏',
    defaultHeadline: 'Prêt à défier les Maîtres ?',
    promptExample: 'Génère un visuel invitant les nouveaux joueurs à tester le jeu en ligne et à rejoindre la commu WhatsApp.',
    suggestedHashtags: ['#RejoinsNous', '#NjamboEnLigne', '#JeuxMobile', '#KoraChallenge'],
  },
  TOURNAMENT_ANNOUNCEMENT: {
    id: 'TOURNAMENT_ANNOUNCEMENT',
    label: 'Affiche de Tournoi & Défi',
    shortLabel: 'Tournoi',
    icon: 'Award',
    badge: 'GRAND TOURNOI NJAMBO 🏆',
    defaultHeadline: 'Le Clash des Maîtres du Kora',
    promptExample: 'Crée une affiche de tournoi pour ce samedi à 21h avec inscriptions ouvertes et dotation en jetons virtuels.',
    suggestedHashtags: ['#TournoiNjambo', '#DefiKora', '#MaitresDuKora', '#EsportCameroun'],
  },
  TACTICAL_PUZZLE: {
    id: 'TACTICAL_PUZZLE',
    label: 'Casse-tête Tactique du Jour',
    shortLabel: 'Casse-Tête',
    icon: 'HelpCircle',
    badge: 'DÉFI TACTIQUE 🧩',
    defaultHeadline: 'Tour 5 Décisif : Sauve la donne !',
    promptExample: 'Génère un casse-tête duel 1v1 au 5e tour : l’adversaire mène 4-0 et pose le 7 Tchaka (♣). Tu as en main le 9 Tchaka (♣) et le 10 Koubi (♥). Quelle carte brise le Kora ?',
    suggestedHashtags: ['#CasseTeteNjambo', '#TactiqueDuJour', '#MaitreDuKora', '#QuizCartes'],
  },
  MEME_OR_PUNCHLINE: {
    id: 'MEME_OR_PUNCHLINE',
    label: 'Humour & Mème de Quartier',
    shortLabel: 'Humour & Mème',
    icon: 'Smile',
    badge: 'HUMOUR NJAMBO 😂',
    defaultHeadline: 'La vérité sur les tables de Njambo',
    promptExample: 'Génère un visuel humoristique sur le joueur qui prétend n’avoir aucune carte maîtresse mais sort le 3 au 5e tour pour valider son Kora.',
    suggestedHashtags: ['#HumourCameroun', '#NjamboMeme', '#LaLoiDuKora', '#AmbianceQuartier'],
  },
  CAROUSEL_SLIDE: {
    id: 'CAROUSEL_SLIDE',
    label: 'Carrousel Pédagogique (1/3, 2/3)',
    shortLabel: 'Carrousel',
    icon: 'BookOpen',
    badge: 'GUIDE DU MAÎTRE 📚',
    defaultHeadline: '3 Secrets pour Ne Jamais Subir un Kora',
    promptExample: 'Crée le slide 1 d’un carrousel Instagram expliquant comment compter les cartes maîtresses (10 et 9) déjà tombées.',
    suggestedHashtags: ['#CarrouselNjambo', '#ApprendreNjambo', '#StrategieGagnante', '#GuideCartes'],
  },
  WELCOME_NEWBIE: {
    id: 'WELCOME_NEWBIE',
    label: 'Bienvenue nouveau joueur',
    shortLabel: 'Bienvenue',
    icon: 'Sparkles',
    badge: 'NOUVEAU MAÎTRE 🃏',
    defaultHeadline: 'Bienvenue au Njambo Kora !',
    promptExample: 'Crée un visuel de bienvenue pour les nouveaux joueurs.',
    suggestedHashtags: ['#Bienvenue', '#NjamboKora', '#CamerounGaming'],
  },
  FIRST_WIN: {
    id: 'FIRST_WIN',
    label: 'Première victoire',
    shortLabel: 'Première Victoire',
    icon: 'Trophy',
    badge: 'VICTOIRE 🥇',
    defaultHeadline: 'Première victoire !',
    promptExample: 'Crée un visuel de première victoire pour encourager un joueur.',
    suggestedHashtags: ['#Victoire', '#DoubleKora', '#NjamboKora'],
  },
  LIVE_MOMENT: {
    id: 'LIVE_MOMENT',
    label: 'Moment en direct',
    shortLabel: 'En direct',
    icon: 'Video',
    badge: 'KORA EN DIRECT 🔴',
    defaultHeadline: 'Kora en direct !',
    promptExample: 'Crée un visuel signalant un match de haut niveau en direct.',
    suggestedHashtags: ['#EnDirect', '#NjamboLive', '#Kora'],
  },
  TOURNAMENT_LIVE: {
    id: 'TOURNAMENT_LIVE',
    label: 'Tournoi en direct',
    shortLabel: 'Tournoi Live',
    icon: 'Swords',
    badge: 'TOURNOI EN DIRECT 🔴',
    defaultHeadline: 'Tournoi en direct',
    promptExample: 'Crée un visuel signalant un tournoi de Njambo en cours.',
    suggestedHashtags: ['#TournoiLive', '#NjamboKora', '#Esport'],
  },
  PARTNERSHIP: {
    id: 'PARTNERSHIP',
    label: 'Partenariat',
    shortLabel: 'Partenariat',
    icon: 'Handshake',
    badge: 'PARTENARIAT 🤝',
    defaultHeadline: 'Njambo Kora x Partenaire',
    promptExample: 'Crée un visuel annonçant un partenariat officiel avec Njambo Kora.',
    suggestedHashtags: ['#Partenariat', '#NjamboKora', '#Collaboration'],
  },
};

export type RealisticRiskScenarioType =
  | 'ANTI_KORA_ESCAPE'      // Score 4-0 au 5e tour : Briser le Kora adverse
  | 'CLASH_FINAL_2_2'       // Score 2-2 au 5e tour : Le tour décisif de la manche
  | 'OVERTRUMP_TRAP'        // Tour 4 : L'adversaire entame fort, poser le 10 ou temporiser ?
  | 'DISCARD_DILEMMA'       // Tour 4 : Chicane (pas la couleur demandée), quelle défausse ?
  | 'THREE_PLAYERS_SANDWICH';// Table 3 joueurs : 2 cartes posées, tu es le dernier à jouer

/**
 * Générateur de scénarios de casse-têtes réalistes et authentiques du Njambo (31 cartes, 1v1 ou 3 joueurs)
 */
export function createRealisticNjamboPuzzleScenario(
  type: RealisticRiskScenarioType = 'ANTI_KORA_ESCAPE'
): SocialVisualCardData {
  switch (type) {
    case 'ANTI_KORA_ESCAPE':
      return {
        theme: 'TACTICAL_PUZZLE',
        badge: 'DUEL 1 VS 1 • RISQUE DE KORA ⚡',
        headline: 'Tour 5 : Brise le Kora adverse !',
        mainText: 'L’adversaire mène 4 tours à 0 et fonce vers le Kora. Il entame au 7 Tchaka (♣). Tu as 2 cartes en main. Laquelle joues-tu ?',
        palette: 'EBONY_GOLD',
        tacticalLayout: 'DUEL_1V1',
        tableScenario: {
          mode: '1VS1',
          trickNumber: 5,
          playerTricksWon: 0,
          opponentTricksWon: 4,
          riskTitle: 'ALERTE KORA : ADVERSAIRE À 4-0',
          opponentPlayed: [{ rank: '7', suit: '♣', playerName: 'Adversaire' }],
          cardsAlreadyFallen: [
            { rank: '10', suit: '♥' },
            { rank: '9', suit: '♠' },
            { rank: '10', suit: '♦' },
            { rank: '8', suit: '♣' },
          ],
          question: 'Quel coup brise le Kora ?',
        },
        puzzleCards: [
          { rank: '9', suit: '♣', label: 'OPTION A : 9 TCHAKA', isBestMove: true },
          { rank: '10', suit: '♥', label: 'OPTION B : 10 KOUBI', isBestMove: false },
        ],
        ctaText: 'Donne ton choix en commentaire 👇',
        linkUrl: `${NJAMBO_DOMAIN}`,
        postCaption: `⚡ DUEL 1 VS 1 — ALERTE KORA AU 5e TOUR ! 🇨🇲\n\nSituation de tension extrême :\nL'adversaire a raflé les 4 premiers tours (score 4-0) et entame le 5e tour avec le 7 Tchaka (♣).\n\nTu n'as plus que 2 cartes en main :\n🅰️ Option A : Le 9 Tchaka ♣ (Fournir et battre son 7)\n🅱️ Option B : Le 10 Koubi ♥ (Défausse du 10)\n\nRappel de règle : Tu dois obligatoirement fournir à la couleur demandée si tu en possèdes !\n\nQuel coup joues-tu pour sauver l'honneur et briser son Kora ? Dites votre réponse en commentaire ! 💬👇\n\n🎮 Joue au Njambo Kora : ${NJAMBO_APP_URL}\n💬 Rejoins la commu WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
        whatsAppMessage: `⚡ *DUEL 1 VS 1 — ALERTE KORA AU 5e TOUR !* 🇨🇲\n\nScore : Adversaire 4 tours - Toi 0 tour.\nL'adversaire entame au *7 Tchaka (♣)*.\n\nQuelle carte joues-tu ?\n🅰️ *9 Tchaka ♣*\n🅱️ *10 Koubi ♥*\n\n👉 *Teste la situation sur Katika :* ${NJAMBO_APP_URL}\n💬 *Débats la règle sur WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
        hashtags: ['#CasseTeteNjambo', '#AntiKora', '#DuelCartes', '#MaitreDuKora', '#StrategieNjambo'],
      };

    case 'CLASH_FINAL_2_2':
      return {
        theme: 'TACTICAL_PUZZLE',
        badge: 'DUEL 1 VS 1 • LE CLASH DU 5E TOUR 🔥',
        headline: 'Score 2-2 : Le tour pour la gagne !',
        mainText: 'Égalité parfaite 2-2. L’adversaire ouvre au 8 Koubi (♥). Le 10 Koubi n’est pas encore tombé. Quelle carte abats-tu ?',
        palette: 'EMERALD_GOLD',
        tacticalLayout: 'DUEL_1V1',
        tableScenario: {
          mode: '1VS1',
          trickNumber: 5,
          playerTricksWon: 2,
          opponentTricksWon: 2,
          riskTitle: 'TOUR DÉCISIF : ÉGALITÉ 2-2',
          opponentPlayed: [{ rank: '8', suit: '♥', playerName: 'Adversaire' }],
          cardsAlreadyFallen: [
            { rank: '9', suit: '♠' },
            { rank: '9', suit: '♥' },
            { rank: '10', suit: '♦' },
            { rank: '10', suit: '♣' },
          ],
          question: 'Quel coup assure la victoire ?',
        },
        puzzleCards: [
          { rank: '10', suit: '♥', label: 'OPTION A : 10 KOUBI', isBestMove: true },
          { rank: '4', suit: '♥', label: 'OPTION B : 4 KOUBI', isBestMove: false },
        ],
        ctaText: 'Commente A ou B 👇',
        linkUrl: `${NJAMBO_DOMAIN}`,
        postCaption: `🔥 DUEL 1 VS 1 — LE CLASH DU 5e TOUR (SCORE 2-2) ! 🇨🇲\n\nChaque joueur a remporté 2 tours. Tout se joue sur cette ultime carte !\nL'adversaire abat le 8 Koubi (♥).\n\nTu as en main :\n🅰️ Option A : Le 10 Koubi ♥ (Abattre le maître suprême)\n🅱️ Option B : Le 4 Koubi ♥ (Sous-jouer)\n\nPrends-tu le risque d'abattre le 10 tout de suite ? Votez en commentaire ! 💬👇\n\n🎮 Joue gratuitement : ${NJAMBO_APP_URL}\n💬 Groupe officiel WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
        whatsAppMessage: `🔥 *DUEL 1 VS 1 — CLASH DU 5e TOUR (2-2) !* 🇨🇲\n\nL'adversaire pose le *8 Koubi (♥)*.\nQuelle carte lances-tu pour empocher la donne ?\n🅰️ *10 Koubi ♥*\n🅱️ *4 Koubi ♥*\n\n👉 *Joue au Njambo Kora :* ${NJAMBO_APP_URL}`,
        hashtags: ['#ClashFinal', '#DuelNjambo', '#NjamboKora', '#JeuxDeCartes'],
      };

    case 'OVERTRUMP_TRAP':
      return {
        theme: 'TACTICAL_PUZZLE',
        badge: 'DUEL 1 VS 1 • PIÈGE DU 4E TOUR 🧠',
        headline: 'Tour 4 : Prendre la main ou temporiser ?',
        mainText: 'Score 1-2. L’adversaire entame au 9 Zing (♦). Tu as le 10 Zing (♦), le 6 Zing (♦) et le 9 Black (♠). Quel est le meilleur coup ?',
        palette: 'ROYAL_SAPPHIRE',
        tacticalLayout: 'DUEL_1V1',
        tableScenario: {
          mode: '1VS1',
          trickNumber: 4,
          playerTricksWon: 1,
          opponentTricksWon: 2,
          riskTitle: 'SCORE 1-2 : EMBUSCADE AU 4E TOUR',
          opponentPlayed: [{ rank: '9', suit: '♦', playerName: 'Adversaire' }],
          cardsAlreadyFallen: [
            { rank: '10', suit: '♥' },
            { rank: '8', suit: '♠' },
            { rank: '10', suit: '♣' },
          ],
          question: 'Prends-tu la main ou sous-joues-tu ?',
        },
        puzzleCards: [
          { rank: '10', suit: '♦', label: 'OPTION A : 10 ZING', isBestMove: false },
          { rank: '6', suit: '♦', label: 'OPTION B : 6 ZING', isBestMove: true },
          { rank: '9', suit: '♠', label: 'OPTION C : 9 BLACK', isBestMove: false },
        ],
        ctaText: 'Donne ton choix A, B ou C 👇',
        linkUrl: `${NJAMBO_DOMAIN}`,
        postCaption: `🧠 CASSE-TÊTE TACTIQUE — LE DILEMME DU 4e TOUR 🃏\n\nL'adversaire mène 2 tours à 1 et pose le 9 Zing (♦).\nIl te reste 3 cartes en main :\n🅰️ Option A : Le 10 Zing ♦ (Prendre la main tout de suite)\n🅱️ Option B : Le 6 Zing ♦ (Fournir bas et garder la surprise au 5e)\n🅲️ Option C : Le 9 Black ♠ (Défausse interdite si tu as du Carreau !)\n\nQuel est le vrai coup de Maître ? Dis ton choix en commentaire ! 💬👇\n\n🎮 Lien du jeu : ${NJAMBO_APP_URL}\n💬 Rejoins le groupe WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
        whatsAppMessage: `🧠 *CASSE-TÊTE DU 4e TOUR NJAMBO !* 🇨🇲\n\nL'adversaire attaque au *9 Zing (♦)*.\nTes options :\n🅰️ *10 Zing ♦*\n🅱️ *6 Zing ♦*\n🅲️ *9 Black ♠*\n\n👉 *Joue en direct :* ${NJAMBO_APP_URL}`,
        hashtags: ['#TactiqueCartes', '#DilemmeNjambo', '#KoraHunter', '#Strategie'],
      };

    case 'DISCARD_DILEMMA':
      return {
        theme: 'TACTICAL_PUZZLE',
        badge: 'DUEL 1 VS 1 • LA DÉFAUSSE PIÉGÉE ⚠️',
        headline: 'Tour 4 : Pas de Koubi (♥), que défausses-tu ?',
        mainText: 'L’adversaire attaque au 9 Koubi (♥). Tu n’as aucun Cœur en main. Quelle carte sacrifies-tu sans hypothéquer ton 5e tour ?',
        palette: 'SUNSET_TERRACOTTA',
        tacticalLayout: 'DUEL_1V1',
        tableScenario: {
          mode: '1VS1',
          trickNumber: 4,
          playerTricksWon: 2,
          opponentTricksWon: 1,
          riskTitle: 'CHICANE KOUBI : DÉFAUSSE CRITIQUE',
          opponentPlayed: [{ rank: '9', suit: '♥', playerName: 'Adversaire' }],
          cardsAlreadyFallen: [
            { rank: '10', suit: '♥' },
            { rank: '8', suit: '♥' },
            { rank: '10', suit: '♣' },
          ],
          question: 'Quelle défausse sauvera ton 5e tour ?',
        },
        puzzleCards: [
          { rank: '4', suit: '♦', label: 'OPTION A : 4 ZING', isBestMove: true },
          { rank: '9', suit: '♠', label: 'OPTION B : 9 BLACK', isBestMove: false },
          { rank: '10', suit: '♦', label: 'OPTION C : 10 ZING', isBestMove: false },
        ],
        ctaText: 'Vote A, B ou C en commentaire 👇',
        linkUrl: `${NJAMBO_DOMAIN}`,
        postCaption: `⚠️ DUEL 1 VS 1 — LE PIÈGE DE LA DÉFAUSSE ! 🇨🇲\n\nL'adversaire entame au 9 Koubi (♥). Tu es « chicane » (zéro carte Cœur dans ton jeu).\n\nTu dois défausser l'une de tes 3 cartes restantes :\n🅰️ Option A : Le 4 Zing ♦ (Jeter une petite carte morte)\n🅱️ Option B : Le 9 Black ♠ (Sacrifier un maître Black)\n🅲️ Option C : Le 10 Zing ♦ (Sacrifier le 10 Zing)\n\nQue lâches-tu pour garder l'avantage au 5e tour ? Votez en commentaire ! 💬👇\n\n🎮 Lien du jeu : ${NJAMBO_APP_URL}\n💬 Rejoins la communauté : ${NJAMBO_WHATSAPP_GROUP_URL}`,
        whatsAppMessage: `⚠️ *LE PIÈGE DE LA DÉFAUSSE NJAMBO !* 🇨🇲\n\nAttaque adverse : *9 Koubi (♥)* (Tu n'as pas de Koubi).\nQuelle carte défausses-tu ?\n🅰️ *4 Zing ♦*\n🅱️ *9 Black ♠*\n🅲️ *10 Zing ♦*\n\n👉 *Joue gratuitement :* ${NJAMBO_APP_URL}`,
        hashtags: ['#DefausseNjambo', '#CasseTeteCartes', '#KoraMaster'],
      };

    case 'THREE_PLAYERS_SANDWICH':
      return {
        theme: 'TACTICAL_PUZZLE',
        badge: 'TABLE 3 JOUEURS • LE DERNIER MOT ⚔️',
        headline: 'Tour 4 : Tu es le 3e à parler !',
        mainText: 'Joueur 1 pose le 7 Tchaka (♣). Joueur 2 monte au 9 Tchaka (♣). Tu as le 10 Tchaka (♣) et le 8 Tchaka (♣). Quel choix fais-tu ?',
        palette: 'EBONY_GOLD',
        tacticalLayout: 'TABLE_3P',
        tableScenario: {
          mode: '3_PLAYERS',
          trickNumber: 4,
          playerTricksWon: 1,
          opponentTricksWon: 2,
          riskTitle: 'TABLE 3 JOUEURS : 3E EN POSITION',
          opponentPlayed: [
            { rank: '7', suit: '♣', playerName: 'Joueur 1' },
            { rank: '9', suit: '♣', playerName: 'Joueur 2' },
          ],
          cardsAlreadyFallen: [
            { rank: '10', suit: '♥' },
            { rank: '9', suit: '♠' },
            { rank: '10', suit: '♦' },
          ],
          question: 'Couvres-tu avec le 10 ou gardes-tu pour la fin ?',
        },
        puzzleCards: [
          { rank: '10', suit: '♣', label: 'OPTION A : 10 TCHAKA', isBestMove: true },
          { rank: '8', suit: '♣', label: 'OPTION B : 8 TCHAKA', isBestMove: false },
          { rank: '6', suit: '♦', label: 'OPTION C : 6 ZING', isBestMove: false },
        ],
        ctaText: 'Donne ton avis en commentaire 👇',
        linkUrl: `${NJAMBO_DOMAIN}`,
        postCaption: `⚔️ TABLE À 3 JOUEURS — LE DERNIER MOT AU 4e TOUR ! 🇨🇲\n\nJoueur 1 ouvre au 7 Tchaka (♣).\nJoueur 2 monte avec le 9 Tchaka (♣).\n\nTu es le 3e joueur à abattre ta carte :\n🅰️ Option A : Le 10 Tchaka ♣ (Prendre le tour avec le maître suprême)\n🅱️ Option B : Le 8 Tchaka ♣ (Fournir sous le 9 et concéder le tour)\n🅲️ Option C : Le 6 Zing ♦ (Défausse interdite si tu as du Tchaka !)\n\nPrends-tu le contrôle de la donne maintenant ? Dites votre avis en commentaire ! 💬👇\n\n🎮 Lien du jeu : ${NJAMBO_APP_URL}\n💬 Rejoins la commu WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
        whatsAppMessage: `⚔️ *TABLE À 3 JOUEURS — LE 4e TOUR !* 🇨🇲\n\nJoueur 1 : *7 Tchaka ♣*\nJoueur 2 : *9 Tchaka ♣*\n\nToi :\n🅰️ *10 Tchaka ♣*\n🅱️ *8 Tchaka ♣*\n🅲️ *6 Zing ♦*\n\n👉 *Joue au Njambo Kora :* ${NJAMBO_APP_URL}`,
        hashtags: ['#Table3Joueurs', '#TactiqueNjambo', '#JeuxAfricains', '#Kora'],
      };

    default:
      return createRealisticNjamboPuzzleScenario('ANTI_KORA_ESCAPE');
  }
}

/**
 * Générateur de scénario de podium officiel avec de vrais pseudos humains (zéro ID technique, zéro bot)
 */
export function createRealisticPodiumScenario(
  customWinners?: PodiumWinnerItem[]
): SocialVisualCardData {
  const defaultWinners: PodiumWinnerItem[] = [
    {
      rank: 1,
      name: 'The killer',
      scoreOrTitle: '18 Victoires • 52% Ratio',
      koraCount: 6,
      badge: '👑 GRAND CHAMPION',
    },
    {
      rank: 2,
      name: 'Maître Kora',
      scoreOrTitle: '14 Victoires • 48% Ratio',
      koraCount: 4,
      badge: '🥈 VICE-CHAMPION',
    },
    {
      rank: 3,
      name: 'Lion du Tapis',
      scoreOrTitle: '11 Victoires • 45% Ratio',
      koraCount: 3,
      badge: '🥉 3E DU PODIUM',
    },
  ];

  let winners: PodiumWinnerItem[] = [];

  if (customWinners && customWinners.length > 0) {
    const validCustom = customWinners
      .filter((w) => !isKnownBotName(w.name))
      .map((w, idx) => ({
        ...w,
        rank: (w.rank || idx + 1) as 1 | 2 | 3,
        name: cleanPlayerDisplayName(w.name, defaultWinners[idx]?.name || `Champion ${idx + 1}`),
      }));

    for (let r = 1; r <= 3; r++) {
      const found = validCustom.find((w) => w.rank === r) || validCustom[r - 1];
      if (found) {
        winners.push({
          ...found,
          rank: r as 1 | 2 | 3,
        });
      } else {
        winners.push(defaultWinners[r - 1]);
      }
    }
  } else {
    winners = defaultWinners;
  }

  const w1 = winners[0]?.name || 'The killer';
  const w2 = winners[1]?.name || 'Maître Kora';
  const w3 = winners[2]?.name || 'Lion du Tapis';

  return {
    theme: 'LEADERBOARD_PODIUM',
    palette: 'EBONY_GOLD',
    pattern: 'NDOP_CHEVRON',
    badge: 'PALMARÈS OFFICIEL • LES ROIS DU KORA 🏆',
    headline: 'Le Podium des Maîtres du Njambo',
    mainText: 'Honneur aux champions du tapis vert ! Leurs victoires décisives et leurs Koras impitoyables les placent au sommet de l’arène.',
    podiumWinners: winners,
    ctaText: 'Défie les champions • Gratuit',
    linkUrl: `${NJAMBO_DOMAIN}`,
    includeAppUrl: true,
    includeWhatsAppUrl: true,
    postCaption: `🏆 LE PODIUM OFFICIEL DU NJAMBO KORA ! 🇨🇲\n\nNos 3 grands maîtres de la table sont couronnés :\n🥇 1ère Place : ${w1} (${winners[0]?.scoreOrTitle})\n🥈 2ème Place : ${w2} (${winners[1]?.scoreOrTitle})\n🥉 3ème Place : ${w3} (${winners[2]?.scoreOrTitle})\n\nFélicitations pour leur maîtrise parfaite des 5 tours et leurs Koras légendaires ! 🃏\n\nPrêt à tenter ta chance et à grimper sur le podium ?\n🎮 Rejoins les tables : ${NJAMBO_APP_URL}\n💬 Rejoins la communauté officielle : ${NJAMBO_WHATSAPP_GROUP_URL}`,
    whatsAppMessage: `🏆 *NJAMBO KORA — LE PODIUM DES CHAMPIONS !* 🇨🇲\n\n🥇 *1er :* ${w1} — ${winners[0]?.scoreOrTitle}\n🥈 *2e :* ${w2} — ${winners[1]?.scoreOrTitle}\n🥉 *3e :* ${w3} — ${winners[2]?.scoreOrTitle}\n\n👑 *Félicitations aux rois du tapis vert !*\n👉 *Viens les défier sur le jeu :* ${NJAMBO_APP_URL}\n💬 *Groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
    hashtags: ['#NjamboKora', '#PodiumChampions', '#DoubleKora', '#EsportCameroun', '#JeuxDeCartes'],
  };
}

