import { SocialVisualTheme } from '../types/socialVisuals';

export type CtaIntent =
  | 'JOIN_GROUP'
  | 'PLAY'
  | 'COMMENT'
  | 'SHARE'
  | 'FOLLOW_PAGE'
  | 'CHALLENGE';

export interface CtaConfig {
  intent: CtaIntent;
  label: string;
  visualVariants: [string, string, string];
  captionFormulas: [string, string];
}

export const CTA_LIBRARY: Record<CtaIntent, CtaConfig> = {
  JOIN_GROUP: {
    intent: 'JOIN_GROUP',
    label: 'Rejoins le groupe',
    visualVariants: [
      'Rejoins le groupe WhatsApp',
      'Rentre dans la communauté',
      'Rejoins les joueurs en groupe',
    ],
    captionFormulas: [
      '💬 Rejoins le groupe WhatsApp officiel pour échanger avec la communauté :',
      '💬 Intègre le groupe des passionnés de Njambo Kora sur WhatsApp :',
    ],
  },
  PLAY: {
    intent: 'PLAY',
    label: 'Viens tester la bêta',
    visualVariants: [
      'Viens tester la bêta',
      'Accède à la bêta ouverte',
      'Joue en bêta maintenant',
    ],
    captionFormulas: [
      '🎮 Teste la version bêta en ligne sur PC et mobile :',
      '🎮 Rejoins la table en bêta ouverte :',
    ],
  },
  COMMENT: {
    intent: 'COMMENT',
    label: 'Dis-le en commentaire',
    visualVariants: [
      'Donne ton avis en commentaire',
      'Partage ta réponse ci-dessous',
      'Dis ton coup en commentaire',
    ],
    captionFormulas: [
      '💬 Dis-nous ton avis ou ta stratégie en commentaire !',
      '💬 Quelle est ta décision ? Laisse un commentaire ci-dessous !',
    ],
  },
  SHARE: {
    intent: 'SHARE',
    label: 'Transfère à un pote',
    visualVariants: [
      'Transfère l’image à un pote',
      'Partage le visuel aux amis',
      'Envoie à tes partenaires',
    ],
    captionFormulas: [
      '📲 Partage cette astuce avec tes potes de jeu !',
      '📲 Transfère ce visuel à tes partenaires de table !',
    ],
  },
  FOLLOW_PAGE: {
    intent: 'FOLLOW_PAGE',
    label: 'Suis la page',
    visualVariants: [
      'Suis la page Katika',
      'Abonne-toi pour ne rien rater',
      'Suis l’actualité du jeu',
    ],
    captionFormulas: [
      '🔔 Abonne-toi à la page pour suivre les évolutions de la bêta !',
      '🔔 Suis la page officielle pour ne manquer aucun événement !',
    ],
  },
  CHALLENGE: {
    intent: 'CHALLENGE',
    label: 'Relève le défi',
    visualVariants: [
      'Relève le défi du Kora',
      'Viens défier les joueurs',
      'Tente le coup parfait',
    ],
    captionFormulas: [
      '⚔️ Penses-tu pouvoir relever le défi sur la table ?',
      '⚔️ Tente ta chance et montre ta maîtrise du Njambo Kora !',
    ],
  },
};

const HISTORY_KEY = 'katika_cta_history';

export function getIntentionForTheme(theme: SocialVisualTheme): CtaIntent {
  if (
    theme === 'MEME_OR_PUNCHLINE' ||
    theme === 'BEFORE_AFTER' ||
    theme === 'COMMUNITY_QUESTION'
  ) {
    return 'COMMENT';
  }
  if (
    theme === 'STAT_OF_THE_WEEK' ||
    theme === 'JOIN_INVITATION' ||
    theme === 'TOURNAMENT_ANNOUNCEMENT'
  ) {
    return 'JOIN_GROUP';
  }
  if (theme === 'TIP_OR_RULE') {
    return 'PLAY';
  }
  if (theme === 'CULTURE_NJAMBO') {
    return 'SHARE';
  }
  return 'PLAY';
}

function getCtaHistory(): string[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pushCtaHistory(ctaText: string) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const history = getCtaHistory();
    const updated = [ctaText, ...history.filter((x) => x !== ctaText)].slice(0, 5);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage issues
  }
}

export function getCtaForTheme(
  theme: SocialVisualTheme,
  customCtaText?: string
): { visualCta: string; captionFormula: string; intent: CtaIntent } {
  const intent = getIntentionForTheme(theme);
  const config = CTA_LIBRARY[intent];

  if (customCtaText && customCtaText.trim().length > 0) {
    const formulaIndex = Math.floor(Math.random() * config.captionFormulas.length);
    return {
      visualCta: customCtaText.trim(),
      captionFormula: config.captionFormulas[formulaIndex],
      intent,
    };
  }

  const history = getCtaHistory();
  const lastUsed = history[0];

  const availableVariants = config.visualVariants.filter((v) => v !== lastUsed);
  const selectedVariants =
    availableVariants.length > 0 ? availableVariants : config.visualVariants;

  const chosenVisual =
    selectedVariants[Math.floor(Math.random() * selectedVariants.length)];
  pushCtaHistory(chosenVisual);

  const chosenFormula =
    config.captionFormulas[Math.floor(Math.random() * config.captionFormulas.length)];

  return {
    visualCta: chosenVisual,
    captionFormula: chosenFormula,
    intent,
  };
}
