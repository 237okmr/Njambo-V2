import {
  SocialVisualCardData,
  sanitizeNjamboCard,
  NJAMBO_APP_URL,
  NJAMBO_DOMAIN,
  NJAMBO_WHATSAPP_GROUP_URL,
  NjamboSuit,
  NjamboRank,
} from '../types/socialVisuals';
import { VisualSpec, VisualBlock, BLOCK_LIMITS } from '../visual/visualSpec';
import { validateAndRepairSpec } from '../visual/validateSpec';

export type MemeKind = 'PUNCHLINE' | 'TWO_PANEL';
export type MemeTag =
  | 'KORA'
  | 'BLUFF'
  | 'DONNE'
  | 'RAGE_QUIT'
  | 'DEBUTANT'
  | 'TABLE'
  | 'COMMUNAUTE';

export interface MemePanel {
  beforeTitle?: string;
  beforeText?: string;
  afterTitle?: string;
  afterText?: string;
  leftTitle?: string;
  leftText?: string;
  rightTitle?: string;
  rightText?: string;
}

export interface MemeEntry {
  id: string;
  kind: MemeKind;
  tag: MemeTag;
  setup: string;
  punchline: string;
  card?: {
    rank: NjamboRank;
    suit: NjamboSuit;
  };
  heroCard?: {
    rank: string;
    suit: NjamboSuit;
    badge?: string;
    label?: string;
  };
  panels?: MemePanel;
  ctaIntent: string;
  hashtags?: string[];
  status?: 'A_RELIRE' | 'VALIDE';
}

export const MEME_BANK: MemeEntry[] = [
  // 1. PUNCHLINE / KORA (Exemple du cahier des charges)
  {
    id: 'meme_01_kora_jure',
    kind: 'PUNCHLINE',
    tag: 'KORA',
    setup: "Il jure n'avoir rien en main.",
    punchline: "5e pli. Un 3. Kora. Il sourit déjà.",
    heroCard: { rank: '3', suit: '♥', badge: 'LE KORA !', label: '3 KOUBI' },
    ctaIntent: 'Deviens Maître du Kora en bêta',
    hashtags: ['#NjamboKora', '#MemeKora', '#Kora au 5e', '#CamerounGaming'],
  },
  // 2. TWO_PANEL / DONNE (Exemple du cahier des charges)
  {
    id: 'meme_02_donne_gatee',
    kind: 'TWO_PANEL',
    tag: 'DONNE',
    setup: 'La stratégie du bluff masqué au 5e pli',
    punchline: 'Le vrai visage du joueur au Katika',
    panels: {
      beforeTitle: "Ce qu'il dit",
      beforeText: 'Ma donne est gâtée, je jette n’importe quoi.',
      afterTitle: "Ce qu'il joue",
      afterText: 'Le 3 gardé au chaud pour le 5e pli.',
    },
    ctaIntent: 'Mets le bluff à l’épreuve en bêta',
    hashtags: ['#NjamboKora', '#BluffKora', '#DonneGâtée', '#JeuxAfricains'],
  },
  // 3. PUNCHLINE / RAGE_QUIT (Exemple du cahier des charges)
  {
    id: 'meme_03_rage_quit_relais',
    kind: 'PUNCHLINE',
    tag: 'RAGE_QUIT',
    setup: "Il perd un Kora et ferme l'appli.",
    punchline: 'Le relais finit la partie. Sans rancune.',
    heroCard: { rank: '3', suit: '♠', badge: 'LE RELAIS', label: '3 BLACK' },
    ctaIntent: 'Joue sans interruption en bêta',
    hashtags: ['#NjamboKora', '#RelaisAutomatique', '#MaitresDuKora'],
  },
  // 4. TWO_PANEL / KORA
  {
    id: 'meme_04_double_kora_choc',
    kind: 'TWO_PANEL',
    tag: 'KORA',
    setup: 'Quand la table croit la partie déjà pliée',
    punchline: 'Le Double Kora qui fait taire la salle',
    panels: {
      beforeTitle: 'Tour 4 : Confiance absolue',
      beforeText: 'L’adversaire compte déjà ses jetons avec fierté.',
      afterTitle: 'Tour 5 : Le choc ultime',
      afterText: 'Double Kora validé avec le 3. Silence radio.',
    },
    ctaIntent: 'Tente le Double Kora en bêta',
    hashtags: ['#NjamboKora', '#DoubleKora', '#TournantDuJeu'],
  },
  // 5. PUNCHLINE / DEBUTANT
  {
    id: 'meme_05_debutant_10_koubi',
    kind: 'PUNCHLINE',
    tag: 'DEBUTANT',
    setup: 'Débutant jouant son 10 Koubi au premier pli.',
    punchline: 'Toute la table le regarde en silence.',
    heroCard: { rank: '10', suit: '♥', badge: '10 KOUBI', label: 'PREMIER PLI' },
    ctaIntent: 'Apprends les règles du Njambo en bêta',
    hashtags: ['#NjamboKora', '#10Koubi', '#ConseilDuMaître'],
  },
  // 6. PUNCHLINE / BLUFF
  {
    id: 'meme_06_bluff_zing',
    kind: 'PUNCHLINE',
    tag: 'BLUFF',
    setup: 'Poser le 10 Zing d’un air très serein.',
    punchline: 'Alors qu’il a 3 cartes faibles derrière.',
    heroCard: { rank: '10', suit: '♦', badge: '10 ZING', label: 'BLUFF TOTAL' },
    ctaIntent: 'Viens tester tes bluffs en bêta',
    hashtags: ['#NjamboKora', '#Zing', '#ArtDuBluff'],
  },
  // 7. TWO_PANEL / TABLE
  {
    id: 'meme_07_table_ambiance',
    kind: 'TWO_PANEL',
    tag: 'TABLE',
    setup: 'L’ambiance sur la table de Katika à 22h',
    punchline: 'De la rigolade jusqu’au coup de grâce',
    panels: {
      beforeTitle: 'Du Tour 1 au Tour 4',
      beforeText: 'On blague, on rigole et on s’envoie des émojis.',
      afterTitle: 'Au 5e Tour',
      afterText: 'Concentration maximale. Personne ne respire avant la carte.',
    },
    ctaIntent: 'Rejoins les tables en bêta',
    hashtags: ['#NjamboKora', '#AmbianceDeJeu', '#KatikaOnline'],
  },
  // 8. PUNCHLINE / COMMUNAUTE
  {
    id: 'meme_08_groupe_whatsapp',
    kind: 'PUNCHLINE',
    tag: 'COMMUNAUTE',
    setup: 'Poster la capture d’un Kora sur le groupe.',
    punchline: 'Tout le monde demande le replay du 5e pli.',
    heroCard: { rank: '3', suit: '♣', badge: 'REPLAY', label: '3 TCHAKA' },
    ctaIntent: 'Rejoins la communauté WhatsApp',
    hashtags: ['#NjamboKora', '#CommunautéKatika', '#ReplayKora'],
  },
  // 9. TWO_PANEL / DEBUTANT
  {
    id: 'meme_09_comprendre_le_kora',
    kind: 'TWO_PANEL',
    tag: 'DEBUTANT',
    setup: 'L’évolution d’un nouveau joueur de Njambo',
    punchline: 'Du doute au titre de Maître du Kora',
    panels: {
      beforeTitle: 'Sa première partie',
      beforeText: 'Pourquoi tout le monde parle du chiffre 3 au 5e pli ?',
      afterTitle: 'Après 10 parties',
      afterText: 'Cacher le 3 jusqu’au bout est devenu un art de vivre.',
    },
    ctaIntent: 'Fais tes débuts sur Katika en bêta',
    hashtags: ['#NjamboKora', '#NouveauJoueur', '#Progression'],
  },
  // 10. PUNCHLINE / DONNE
  {
    id: 'meme_10_donne_sans_trois',
    kind: 'PUNCHLINE',
    tag: 'DONNE',
    setup: 'Quand tu reçois une donne sans aucun 3.',
    punchline: 'Mode défense activé : bloquer les Kora adverses !',
    heroCard: { rank: '9', suit: '♠', badge: 'DÉFENSE', label: '9 BLACK' },
    ctaIntent: 'Perfectionne ta stratégie en bêta',
    hashtags: ['#NjamboKora', '#StrategieTactique', '#DefenseKora'],
  },
  // 11. TWO_PANEL / RAGE_QUIT
  {
    id: 'meme_11_deconnexion_relais',
    kind: 'TWO_PANEL',
    tag: 'RAGE_QUIT',
    setup: 'Gestion des coupures réseau sur Katika',
    punchline: 'La partie continue proprement grâce au relais',
    panels: {
      beforeTitle: 'Pourtant hors-ligne...',
      beforeText: 'Le joueur perd sa connexion au 3e tour.',
      afterTitle: 'Grâce au relais neutre',
      afterText: 'Ses partenaires finissent la manche sans être bloqués.',
    },
    ctaIntent: 'Découvre le jeu fluide en bêta',
    hashtags: ['#NjamboKora', '#RelaisFairPlay', '#JeuContinu'],
  },
  // 12. PUNCHLINE / KORA
  {
    id: 'meme_12_3_black_sauveur',
    kind: 'PUNCHLINE',
    tag: 'KORA',
    setup: 'Le 3 Black que personne n’avait vu venir.',
    punchline: 'Kora validé au 5e pli sous les applaudissements.',
    heroCard: { rank: '3', suit: '♠', badge: 'SURPRISE', label: '3 BLACK' },
    ctaIntent: 'Joue ta plus belle carte en bêta',
    hashtags: ['#NjamboKora', '#3Black', '#KoraInextremis'],
  },
  // 13. TWO_PANEL / BLUFF
  {
    id: 'meme_13_bluff_annonce',
    kind: 'TWO_PANEL',
    tag: 'BLUFF',
    setup: 'Quand l’adversaire fait une grande déclaration',
    punchline: 'La réalité révélée au décompte des plis',
    panels: {
      beforeTitle: 'Ce qu’il annonce',
      beforeText: 'Je tiens le jeu, personne ne prendra ce pli !',
      afterTitle: 'Ce qu’il pose',
      afterText: 'Une carte moyenne au 4e pli, dépassée instantanément.',
    },
    ctaIntent: 'Défie les maîtres du bluff en bêta',
    hashtags: ['#NjamboKora', '#PliDecisif', '#BluffRevele'],
  },
  // 14. PUNCHLINE / TABLE
  {
    id: 'meme_14_invite_ami',
    kind: 'PUNCHLINE',
    tag: 'TABLE',
    setup: 'Inviter un ami pour « juste une partie ».',
    punchline: '2 heures plus tard, vous êtes encore en train de placer des Kora.',
    heroCard: { rank: '10', suit: '♣', badge: 'ADDICTION', label: '10 TCHAKA' },
    ctaIntent: 'Invite un ami à jouer en bêta',
    hashtags: ['#NjamboKora', '#PartieEntreAmis', '#KatikaSocial'],
  },
  // 15. TWO_PANEL / KORA
  {
    id: 'meme_15_calcul_du_5e_pli',
    kind: 'TWO_PANEL',
    tag: 'KORA',
    setup: 'Calcul mental du joueur au 4e pli',
    punchline: 'L’analyse tactique digne d’un grand maître',
    panels: {
      beforeTitle: 'Dans sa tête',
      beforeText: 'Deux 3 restent en jeu. S’il pose le sien, je gagne le Kora.',
      afterTitle: 'Sur la table',
      afterText: 'Pose le 3 au moment exact. Kora chirurgical !',
    },
    ctaIntent: 'Exerce ton sens tactique en bêta',
    hashtags: ['#NjamboKora', '#MasterMind', '#KoraChirurgical'],
  },
  // 16. PUNCHLINE / COMMUNAUTE
  {
    id: 'meme_16_tournoi_hebdo',
    kind: 'PUNCHLINE',
    tag: 'COMMUNAUTE',
    setup: 'Le tournoi du week-end s’annonce sur Katika.',
    punchline: 'Tous les Maîtres du Kora préparent leurs meilleures tactiques.',
    heroCard: { rank: '10', suit: '♥', badge: 'TOURNOI', label: '10 KOUBI' },
    ctaIntent: 'Inscris-toi au tournoi en bêta',
    hashtags: ['#NjamboKora', '#TournoiKatika', '#EportAfricain'],
  },
  // 17. TWO_PANEL / DONNE
  {
    id: 'meme_17_distribution_parfaite',
    kind: 'TWO_PANEL',
    tag: 'DONNE',
    setup: 'La donne rêvée face à la réalité',
    punchline: 'Savoir transformer chaque main en victoire',
    panels: {
      beforeTitle: 'La main rêvée',
      beforeText: 'Deux 10 fortis et deux 3 pour assurer le Kora.',
      afterTitle: 'La main reçue',
      afterText: 'Des cartes moyennes, mais une stratégie de pli sans faute.',
    },
    ctaIntent: 'Apprends à rentabiliser tes donnes en bêta',
    hashtags: ['#NjamboKora', '#ArtDeLaDonne', '#TactiquePli'],
  },
  // 18. PUNCHLINE / BLUFF
  {
    id: 'meme_18_regard_du_voisin',
    kind: 'PUNCHLINE',
    tag: 'BLUFF',
    setup: 'Ton voisin de table fixe tes cartes.',
    punchline: 'Tu changes ton plan et tu ramasses quand même le 5e pli.',
    heroCard: { rank: '8', suit: '♦', badge: 'STRATÈGE', label: '8 ZING' },
    ctaIntent: 'Surprends tes adversaires en bêta',
    hashtags: ['#NjamboKora', '#EspritTactique', '#JeuDeCartes'],
  },
  // 19. TWO_PANEL / TABLE
  {
    id: 'meme_19_decouverte_appli',
    kind: 'TWO_PANEL',
    tag: 'TABLE',
    setup: 'Jouer au quartier vs Jouer sur Katika',
    punchline: 'Même adrénaline, disponible partout à tout moment',
    panels: {
      beforeTitle: 'Au quartier',
      beforeText: 'Chercher des partenaires disponibles sous l’arbre du carrefour.',
      afterTitle: 'Sur Katika',
      afterText: 'Ouvrir l’application et trouver une table en 3 secondes.',
    },
    ctaIntent: 'Rejoins une table instantanée en bêta',
    hashtags: ['#NjamboKora', '#KatikaMobile', '#JeuPartout'],
  },
  // 20. PUNCHLINE / KORA
  {
    id: 'meme_20_kora_au_4e_et_5e',
    kind: 'PUNCHLINE',
    tag: 'KORA',
    setup: '4e et 5e plis gagnés avec un 3.',
    punchline: 'Double Kora légendaire. La partie rentre dans l’histoire.',
    heroCard: { rank: '3', suit: '♦', badge: 'LÉGENDE', label: '3 ZING' },
    ctaIntent: 'Tente d’entrer dans la légende en bêta',
    hashtags: ['#NjamboKora', '#DoubleKoraLégendaire', '#ExploitKatika'],
  },
  // 21. TWO_PANEL / DEBUTANT
  {
    id: 'meme_21_erreur_classique',
    kind: 'TWO_PANEL',
    tag: 'DEBUTANT',
    setup: 'L’erreur classique au Njambo Kora',
    punchline: 'Ce que chaque joueur apprend à ses dépens',
    panels: {
      beforeTitle: 'L’erreur',
      beforeText: 'Oublier de compter les 3 déjà tombés pendant les 4 premiers plis.',
      afterTitle: 'La leçon',
      afterText: 'Désormais, chaque 3 posé est noté mentalement avec précision.',
    },
    ctaIntent: 'Deviens un joueur aguerri en bêta',
    hashtags: ['#NjamboKora', '#ComptageDesCartes', '#Apprentissage'],
  },
  // 22. PUNCHLINE / DONNE
  {
    id: 'meme_22_3_de_coeur_maitre',
    kind: 'PUNCHLINE',
    tag: 'DONNE',
    setup: 'Un 3 de Cœur servi au premier tirage.',
    punchline: 'C’est comme avoir le sourire de la victoire dès le départ.',
    heroCard: { rank: '3', suit: '♥', badge: '3 KOUBI', label: 'CARTE MAGIQUE' },
    ctaIntent: 'Reçois tes meilleures cartes en bêta',
    hashtags: ['#NjamboKora', '#3Koubi', '#ChanceEtTalent'],
  },
  // 23. TWO_PANEL / COMMUNAUTE
  {
    id: 'meme_23_challenge_du_soir',
    kind: 'TWO_PANEL',
    tag: 'COMMUNAUTE',
    setup: 'Le challenge de la soirée entre amis',
    punchline: 'Qui sera le Maître du Kora ce soir ?',
    panels: {
      beforeTitle: 'Défi lancé',
      beforeText: '« Celui qui prend un Kora ce soir paie la boisson ! »',
      afterTitle: 'Fin de soirée',
      afterText: 'Tout le monde a placé un Kora, égalité parfaite !',
    },
    ctaIntent: 'Lance le défi à tes amis en bêta',
    hashtags: ['#NjamboKora', '#DefiEntreAmis', '#Convivialite'],
  },
  // 24. PUNCHLINE / RAGE_QUIT
  {
    id: 'meme_24_fair_play_absolu',
    kind: 'PUNCHLINE',
    tag: 'RAGE_QUIT',
    setup: 'Même quand la donne est difficile...',
    punchline: 'Un vrai joueur de Njambo se bat jusqu’au 5e pli.',
    heroCard: { rank: '7', suit: '♣', badge: 'FAIR PLAY', label: '7 TCHAKA' },
    ctaIntent: 'Rejoins les joueurs passionnés en bêta',
    hashtags: ['#NjamboKora', '#FairPlay', '#EspritDeJeu'],
  },
];

// LocalStorage Keys
const HISTORY_STORAGE_KEY = 'katika_meme_history';
const STATUS_STORAGE_KEY = 'katika_meme_status';

/**
 * Récupère l'historique des IDs de mèmes déjà tirés depuis localStorage
 */
export function getMemeHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Enregistre un ID de mème tiré dans l'historique (conserve les 10 derniers tirages)
 */
export function recordMemeHistory(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const history = getMemeHistory();
    const updated = [id, ...history.filter((item) => item !== id)].slice(0, 10);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('[MemeBank] Failed to save history:', e);
  }
}

/**
 * Récupère la carte des statuts personnalisés ('A_RELIRE' | 'VALIDE') depuis localStorage
 */
export function getMemeStatuses(): Record<string, 'A_RELIRE' | 'VALIDE'> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STATUS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

/**
 * Met à jour le statut d'un mème dans localStorage
 */
export function saveMemeStatus(id: string, status: 'A_RELIRE' | 'VALIDE'): void {
  if (typeof window === 'undefined') return;
  try {
    const statuses = getMemeStatuses();
    statuses[id] = status;
    localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(statuses));
  } catch (e) {
    console.warn('[MemeBank] Failed to save meme status:', e);
  }
}

/**
 * Tire une entrée non utilisée parmi les 10 dernières, en privilégiant les mèmes VALIDES.
 * Ne fait aucun appel réseau ni API (coût zéro token).
 */
export function drawRandomMeme(): MemeEntry {
  const history = getMemeHistory();
  const statuses = getMemeStatuses();

  // Associer le statut courant (persistant ou par défaut 'A_RELIRE') à chaque mème
  const bankWithStatus: MemeEntry[] = MEME_BANK.map((m) => ({
    ...m,
    status: statuses[m.id] || m.status || 'A_RELIRE',
  }));

  // Filtrer les mèmes non présents dans l'historique récent (les 10 derniers)
  const unusedMemes = bankWithStatus.filter((m) => !history.includes(m.id));

  // Si tous les mèmes ont été utilisés récemment, on réutilise toute la banque
  const pool = unusedMemes.length > 0 ? unusedMemes : bankWithStatus;

  // Privilégier les mèmes avec le statut VALIDE
  const validatedMemes = pool.filter((m) => m.status === 'VALIDE');
  const candidatePool = validatedMemes.length > 0 ? validatedMemes : pool;

  // Tirage aléatoire
  const selected = candidatePool[Math.floor(Math.random() * candidatePool.length)];

  // Enregistrer ce tirage dans l'historique
  recordMemeHistory(selected.id);

  return selected;
}

/**
 * Convertit une entrée MemeEntry en SocialVisualCardData valide pour le moteur Canvas
 */
export function convertMemeToSocialCardData(meme: MemeEntry): SocialVisualCardData {
  const isPunchline = meme.kind === 'PUNCHLINE';

  let heroCardClean = undefined;
  if (meme.heroCard) {
    const sanitized = sanitizeNjamboCard(meme.heroCard.rank, meme.heroCard.suit);
    heroCardClean = {
      rank: sanitized.rank as NjamboRank,
      suit: sanitized.suit as NjamboSuit,
      badge: meme.heroCard.badge || 'KORA !',
      label: meme.heroCard.label || 'LE 3',
    };
  } else if (isPunchline) {
    // Carte par défaut pour le thème PUNCHLINE
    const sanitized = sanitizeNjamboCard('3', '♥');
    heroCardClean = {
      rank: sanitized.rank as NjamboRank,
      suit: sanitized.suit as NjamboSuit,
      badge: 'LE KORA !',
      label: '3 KOUBI',
    };
  }

  const defaultHashtags = meme.hashtags || [
    '#NjamboKora',
    '#MemeKora',
    '#JeuxAfricains',
    '#CamerounGaming',
    '#MaitresDuKora',
  ];

  if (isPunchline) {
    return {
      theme: 'MEME_OR_PUNCHLINE',
      palette: 'SUNSET_TERRACOTTA',
      badge: 'MÈME NJAMBO KORA 🃏',
      headline: meme.setup,
      mainText: meme.punchline,
      heroCard: heroCardClean,
      ctaText: meme.ctaIntent || 'Joue au Njambo Kora en bêta',
      linkUrl: NJAMBO_DOMAIN,
      postCaption: `🃏 MÈME NJAMBO KORA 🔥\n\n« ${meme.setup} »\n👉 ${meme.punchline}\n\n🎮 Joue au Njambo Kora en bêta (PC & Mobile) : ${NJAMBO_APP_URL}\n💬 Rejoins la communauté WhatsApp officielle : ${NJAMBO_WHATSAPP_GROUP_URL}`,
      whatsAppMessage: `🃏 *MÈME NJAMBO KORA* 🔥\n\n« *${meme.setup}* »\n👉 *${meme.punchline}*\n\n🎮 *Joue en bêta ouverte :* ${NJAMBO_APP_URL}\n💬 *Rejoins le groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
      hashtags: defaultHashtags,
    };
  } else {
    // TWO_PANEL -> BEFORE_AFTER
    return {
      theme: 'BEFORE_AFTER',
      palette: 'SUNSET_TERRACOTTA',
      badge: 'DEUX FACES DU NJAMBO 🃏',
      headline: meme.setup,
      mainText: meme.punchline,
      comparison: {
        beforeTitle: meme.panels?.beforeTitle || 'Avant',
        beforeText: meme.panels?.beforeText || meme.setup,
        afterTitle: meme.panels?.afterTitle || 'Après',
        afterText: meme.panels?.afterText || meme.punchline,
      },
      heroCard: heroCardClean,
      ctaText: meme.ctaIntent || 'Viens vivre l’adrénaline du Njambo en bêta',
      linkUrl: NJAMBO_DOMAIN,
      postCaption: `🃏 DEUX FACES DU NJAMBO KORA 🇨🇲\n\n🔹 ${meme.panels?.beforeTitle || 'Ce qu’il dit'} : ${meme.panels?.beforeText || meme.setup}\n🔸 ${meme.panels?.afterTitle || 'Ce qu’il fait'} : ${meme.panels?.afterText || meme.punchline}\n\n🎮 Rejoins les Maîtres du Kora en bêta : ${NJAMBO_APP_URL}\n💬 Rejoins le groupe WhatsApp officiel : ${NJAMBO_WHATSAPP_GROUP_URL}`,
      whatsAppMessage: `🃏 *DEUX FACES DU NJAMBO KORA* 🇨🇲\n\n🔹 *${meme.panels?.beforeTitle || 'Ce qu’il dit'} :* ${meme.panels?.beforeText || meme.setup}\n🔸 *${meme.panels?.afterTitle || 'Ce qu’il fait'} :* ${meme.panels?.afterText || meme.punchline}\n\n🎮 *Joue maintenant :* ${NJAMBO_APP_URL}\n💬 *Rejoins la communauté :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
      hashtags: defaultHashtags,
    };
  }
}

/**
 * Convertit une entrée MemeEntry en VisualSpec V2 complète et validée
 */
export function convertMemeToVisualSpec(meme: MemeEntry): VisualSpec {
  const isPunchline = meme.kind === 'PUNCHLINE';

  const rawCard = meme.card || (meme.heroCard ? { rank: meme.heroCard.rank as NjamboRank, suit: meme.heroCard.suit } : undefined);
  const sanitizedCard = rawCard ? sanitizeNjamboCard(rawCard.rank, rawCard.suit) : null;

  const badgeText = `MÈME • ${meme.tag}`;

  const blocks: VisualBlock[] = [
    {
      id: `block-badge-${meme.id}`,
      type: 'BADGE',
      text: badgeText.substring(0, BLOCK_LIMITS.BADGE_MAX_CHARS),
      priority: 1,
    },
    {
      id: `block-hook-${meme.id}`,
      type: 'HOOK',
      text: meme.setup,
      priority: 1,
    },
  ];

  if (isPunchline) {
    blocks.push({
      id: `block-body-${meme.id}`,
      type: 'BODY',
      text: meme.punchline,
      priority: 1,
    });
  } else {
    const leftTitle = meme.panels?.leftTitle || meme.panels?.beforeTitle || "Ce qu'il dit";
    const leftText = meme.panels?.leftText || meme.panels?.beforeText || meme.setup;
    const rightTitle = meme.panels?.rightTitle || meme.panels?.afterTitle || "Ce qu'il joue";
    const rightText = meme.panels?.rightText || meme.panels?.afterText || meme.punchline;

    blocks.push({
      id: `block-compare-${meme.id}`,
      type: 'COMPARE',
      leftTitle,
      leftText,
      rightTitle,
      rightText,
      priority: 1,
    });

    if (meme.punchline) {
      blocks.push({
        id: `block-body-${meme.id}`,
        type: 'BODY',
        text: meme.punchline,
        priority: 2,
      });
    }
  }

  if (sanitizedCard) {
    blocks.push({
      id: `block-cards-${meme.id}`,
      type: 'CARDS',
      cards: [
        {
          rank: sanitizedCard.rank,
          suit: sanitizedCard.suit,
          highlight: true,
          label: sanitizedCard.rank === '3' ? 'KORA' : undefined,
        },
      ],
      arrangement: 'FAN',
      priority: 2,
    });
  }

  const baseSpec: VisualSpec = {
    version: 2,
    format: 'SQUARE',
    palette: 'SUNSET_TERRACOTTA',
    pattern: 'NDOP_CHEVRON',
    blocks,
    cta: {
      text: 'Rejoins les Maîtres du Kora',
      intent: 'PLAY',
    },
    footer: {
      text: 'njambo-kora.ai.studio',
      app: true,
      whatsapp: true,
    },
    meta: {
      presetId: isPunchline ? 'MEME_PUNCHLINE' : 'MEME_TWO_PANEL',
      source: 'PRESET',
    },
  };

  const validationResult = validateAndRepairSpec(baseSpec);
  return validationResult.spec || baseSpec;
}
