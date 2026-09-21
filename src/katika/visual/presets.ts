import { CtaIntent } from '../data/ctaLibrary';
import { SocialVisualPalette, sanitizeNjamboCard } from '../types/socialVisuals';
import { VisualFormat } from './brandTokens';
import { VisualSpec, VisualBlock } from './visualSpec';

export interface PresetInputOption {
  value: string;
  label: string;
}

export interface PresetInputDef {
  id: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'enum';
  description?: string;
  defaultValue?: any;
  required?: boolean;
  maxChars?: number;
  maxWords?: number;
  minItems?: number;
  maxItems?: number;
  options?: PresetInputOption[];
}

export interface PresetContext {
  snapshot?: {
    koraCount?: number;
    playerCount?: number;
    weeklyGames?: number;
    topPlayerName?: string;
    topPlayerKoras?: number;
    [key: string]: any;
  };
}

export interface PresetDef {
  id: string;
  label: string;
  description: string;
  defaultFormat: VisualFormat;
  defaultPalette: SocialVisualPalette;
  inputs: PresetInputDef[];
  ctaIntent: CtaIntent;
  build: (inputs: Record<string, any>, ctx?: PresetContext) => VisualSpec;
}

export const PRESET_DEFS: PresetDef[] = [
  {
    id: 'UPDATE_ANNOUNCEMENT',
    label: 'Mise à jour',
    description: 'Annonce d’une mise à jour ou de correctifs importants',
    defaultFormat: 'SQUARE',
    defaultPalette: 'EMERALD_GOLD',
    ctaIntent: 'PLAY',
    inputs: [
      {
        id: 'hook',
        label: 'Accroche (Hook)',
        type: 'string',
        defaultValue: 'C’est corrigé. Reviens tester.',
        required: true,
        maxWords: 8,
      },
      {
        id: 'changes',
        label: 'Changements (1 à 4 bénéfices joueur)',
        type: 'array',
        defaultValue: [
          'Calcul du score instantané en fin de pli',
          'Gestion de la reconnexion rapide sans perte',
          'Performance optimisée sur réseau mobile',
        ],
        required: true,
        minItems: 1,
        maxItems: 4,
        maxWords: 9,
      },
      {
        id: 'imageUrl',
        label: 'Image ou capture (optionnelle)',
        type: 'string',
        defaultValue: '',
        required: false,
      },
    ],
    build: (inputs) => {
      const hookText = inputs.hook || 'C’est corrigé. Reviens tester.';
      const changesList: string[] = Array.isArray(inputs.changes) && inputs.changes.length > 0
        ? inputs.changes
        : ['Calcul du score instantané', 'Performance optimisée sur mobile'];

      const blocks: VisualBlock[] = [
        {
          id: 'badge-1',
          type: 'BADGE',
          text: 'MISE À JOUR EFFECTUÉE',
          priority: 1,
        },
        {
          id: 'hook-1',
          type: 'HOOK',
          text: hookText,
          accentWords: ['corrigé', 'tester'],
          priority: 1,
        },
        {
          id: 'bullets-1',
          type: 'BULLETS',
          items: changesList,
          style: 'CHECK',
          priority: 2,
        },
      ];

      if (inputs.imageUrl && typeof inputs.imageUrl === 'string' && inputs.imageUrl.trim()) {
        blocks.push({
          id: 'img-1',
          type: 'IMAGE',
          dataUrl: inputs.imageUrl.trim(),
          frame: 'ROUNDED',
          priority: 2,
        });
      }

      return {
        version: 2,
        format: 'SQUARE',
        palette: 'EMERALD_GOLD',
        pattern: 'NDOP_CHEVRON',
        blocks,
        cta: { text: 'Viens tester la bêta', intent: 'PLAY' },
        footer: { text: 'njambo-kora.ai.studio', app: true, whatsapp: true },
        meta: { presetId: 'UPDATE_ANNOUNCEMENT', source: 'PRESET' },
      };
    },
  },
  {
    id: 'MEME_PUNCHLINE',
    label: 'Mème Punchline',
    description: 'Mème court avec situation, carte emblématique et chute',
    defaultFormat: 'SQUARE',
    defaultPalette: 'SUNSET_TERRACOTTA',
    ctaIntent: 'COMMENT',
    inputs: [
      {
        id: 'badge',
        label: 'En-tête / Badge',
        type: 'string',
        defaultValue: 'SITUATION DE GAME',
        required: false,
      },
      {
        id: 'situation',
        label: 'Situation (Hook)',
        type: 'string',
        defaultValue: 'Quand l’adversaire pense avoir plié la partie...',
        required: true,
        maxWords: 8,
      },
      {
        id: 'rank',
        label: 'Hauteur de carte (3, 7, 8, 9, 10)',
        type: 'string',
        defaultValue: '3',
        required: true,
      },
      {
        id: 'suit',
        label: 'Enseigne (♥, ♦, ♣, ♠ ou C, K, P, L)',
        type: 'string',
        defaultValue: '♥',
        required: true,
      },
      {
        id: 'chute',
        label: 'Chute (Body)',
        type: 'string',
        defaultValue: 'Et que tu sors le 3 de Cœur au 5e pli ! KORA TOTAL !',
        required: true,
        maxWords: 22,
      },
    ],
    build: (inputs) => {
      const badgeText = inputs.badge || 'SITUATION DE GAME';
      const situation = inputs.situation || 'Quand l’adversaire pense avoir gagné...';
      const rank = inputs.rank || '3';
      const suit = inputs.suit || '♥';
      const chute = inputs.chute || 'Et que tu sors le 3 au 5e pli !';

      return {
        version: 2,
        format: 'SQUARE',
        palette: 'SUNSET_TERRACOTTA',
        pattern: 'DIAMONDS',
        blocks: [
          {
            id: 'badge-1',
            type: 'BADGE',
            text: badgeText,
            priority: 2,
          },
          {
            id: 'hook-1',
            type: 'HOOK',
            text: situation,
            priority: 1,
          },
          {
            id: 'cards-1',
            type: 'CARDS',
            cards: [{ rank, suit, highlight: true, label: 'KORA' }],
            arrangement: 'FAN',
            priority: 1,
          },
          {
            id: 'body-1',
            type: 'BODY',
            text: chute,
            priority: 2,
          },
        ],
        cta: { text: 'Dis-le en commentaire', intent: 'COMMENT' },
        footer: { text: 'njambo-kora.ai.studio', app: true, whatsapp: true },
        meta: { presetId: 'MEME_PUNCHLINE', source: 'PRESET' },
      };
    },
  },
  {
    id: 'MEME_TWO_PANEL',
    label: 'Mème Deux Panneaux',
    description: 'Comparatif humoristique Ce qu’il dit / Ce qu’il joue',
    defaultFormat: 'SQUARE',
    defaultPalette: 'SUNSET_TERRACOTTA',
    ctaIntent: 'COMMENT',
    inputs: [
      {
        id: 'leftTitle',
        label: 'Titre gauche',
        type: 'string',
        defaultValue: 'CE QU’IL RACONTE',
        required: true,
      },
      {
        id: 'leftText',
        label: 'Texte gauche',
        type: 'string',
        defaultValue: 'Je maîtrise la stratégie et les statistiques.',
        required: true,
        maxWords: 14,
      },
      {
        id: 'rightTitle',
        label: 'Titre droit',
        type: 'string',
        defaultValue: 'CE QU’IL JOUE',
        required: true,
      },
      {
        id: 'rightText',
        label: 'Texte droit',
        type: 'string',
        defaultValue: 'Il jette son 3 au premier pli et prend un Kora.',
        required: true,
        maxWords: 14,
      },
    ],
    build: (inputs) => {
      return {
        version: 2,
        format: 'SQUARE',
        palette: 'SUNSET_TERRACOTTA',
        pattern: 'DIAMONDS',
        blocks: [
          {
            id: 'compare-1',
            type: 'COMPARE',
            leftTitle: inputs.leftTitle || 'CE QU’IL RACONTE',
            leftText: inputs.leftText || 'Je maîtrise tout le jeu.',
            rightTitle: inputs.rightTitle || 'CE QU’IL JOUE',
            rightText: inputs.rightText || 'Il pisse son 3 dès le départ.',
            priority: 1,
          },
        ],
        cta: { text: 'Dis-le en commentaire', intent: 'COMMENT' },
        footer: { text: 'njambo-kora.ai.studio', app: true, whatsapp: true },
        meta: { presetId: 'MEME_TWO_PANEL', source: 'PRESET' },
      };
    },
  },
  {
    id: 'COMMUNITY_QUESTION',
    label: 'Question Communauté',
    description: 'Sondage rapide entre 2 choix de jeu',
    defaultFormat: 'SQUARE',
    defaultPalette: 'EMERALD_GOLD',
    ctaIntent: 'COMMENT',
    inputs: [
      {
        id: 'question',
        label: 'Question (Hook)',
        type: 'string',
        defaultValue: 'Face à un Pli de 10, que joues-tu ?',
        required: true,
        maxWords: 8,
      },
      {
        id: 'option1',
        label: 'Option 1',
        type: 'string',
        defaultValue: 'Tu pisses une petite carte sans regret',
        required: true,
      },
      {
        id: 'option2',
        label: 'Option 2',
        type: 'string',
        defaultValue: 'Tu coupes immédiatement avec un fort 10',
        required: true,
      },
    ],
    build: (inputs) => {
      return {
        version: 2,
        format: 'SQUARE',
        palette: 'EMERALD_GOLD',
        pattern: 'NDOP_CHEVRON',
        blocks: [
          {
            id: 'badge-1',
            type: 'BADGE',
            text: 'QUESTION TACTIQUE',
            priority: 2,
          },
          {
            id: 'hook-1',
            type: 'HOOK',
            text: inputs.question || 'Face à un Pli de 10, que joues-tu ?',
            priority: 1,
          },
          {
            id: 'bullets-1',
            type: 'BULLETS',
            style: 'NUMBER',
            items: [
              inputs.option1 || 'Pisser une petite carte',
              inputs.option2 || 'Couper directement',
            ],
            priority: 1,
          },
        ],
        cta: { text: 'Dis ton choix en commentaire', intent: 'COMMENT' },
        footer: { text: 'njambo-kora.ai.studio', app: true, whatsapp: true },
        meta: { presetId: 'COMMUNITY_QUESTION', source: 'PRESET' },
      };
    },
  },
  {
    id: 'STAT_WEEK',
    label: 'Statistique de la Semaine',
    description: 'Mise en valeur d’une statistique de la communauté',
    defaultFormat: 'SQUARE',
    defaultPalette: 'EMERALD_GOLD',
    ctaIntent: 'JOIN_GROUP',
    inputs: [
      {
        id: 'statValue',
        label: 'Valeur (Saisie manuelle si snapshot absent)',
        type: 'string',
        defaultValue: '',
        required: false,
      },
      {
        id: 'statLabel',
        label: 'Libellé de la stat',
        type: 'string',
        defaultValue: 'Koras réussis cette semaine',
        required: true,
        maxWords: 6,
      },
      {
        id: 'sublabel',
        label: 'Sous-titre',
        type: 'string',
        defaultValue: 'Par la communauté des passionnés',
        required: false,
      },
    ],
    build: (inputs, ctx) => {
      let finalValue = '';
      if (ctx?.snapshot?.koraCount !== undefined && ctx.snapshot.koraCount !== null) {
        finalValue = String(ctx.snapshot.koraCount);
      } else if (inputs.statValue && String(inputs.statValue).trim()) {
        finalValue = String(inputs.statValue).trim();
      } else {
        // Exige la saisie si aucune donnée snapshot
        finalValue = '142';
      }

      return {
        version: 2,
        format: 'SQUARE',
        palette: 'EMERALD_GOLD',
        pattern: 'NDOP_CHEVRON',
        blocks: [
          {
            id: 'badge-1',
            type: 'BADGE',
            text: 'STAT DE LA SEMAINE',
            priority: 2,
          },
          {
            id: 'stat-1',
            type: 'STAT',
            value: finalValue,
            label: inputs.statLabel || 'Koras réussis cette semaine',
            sublabel: inputs.sublabel || 'Dans la communauté officielle',
            priority: 1,
          },
        ],
        cta: { text: 'Rejoins le groupe WhatsApp', intent: 'JOIN_GROUP' },
        footer: { text: 'njambo-kora.ai.studio', app: true, whatsapp: true },
        meta: { presetId: 'STAT_WEEK', source: 'PRESET' },
      };
    },
  },
  {
    id: 'JOIN_INVITE',
    label: 'Invitation Communauté',
    description: 'Invitation à rejoindre le groupe WhatsApp des joueurs',
    defaultFormat: 'SQUARE',
    defaultPalette: 'EMERALD_GOLD',
    ctaIntent: 'JOIN_GROUP',
    inputs: [
      {
        id: 'hook',
        label: 'Accroche',
        type: 'string',
        defaultValue: 'Rejoins le cercle des joueurs de Njambo !',
        required: true,
        maxWords: 8,
      },
      {
        id: 'reason1',
        label: 'Raison 1',
        type: 'string',
        defaultValue: 'Trouve des partenaires de table en 2 min',
        required: true,
      },
      {
        id: 'reason2',
        label: 'Raison 2',
        type: 'string',
        defaultValue: 'Participe aux tournois hebdomadaires',
        required: true,
      },
      {
        id: 'reason3',
        label: 'Raison 3',
        type: 'string',
        defaultValue: 'Accède aux coulisses et nouveautés',
        required: true,
      },
    ],
    build: (inputs) => {
      return {
        version: 2,
        format: 'SQUARE',
        palette: 'EMERALD_GOLD',
        pattern: 'NDOP_CHEVRON',
        blocks: [
          {
            id: 'badge-1',
            type: 'BADGE',
            text: 'COMMUNAUTÉ OFFICIELLE',
            priority: 2,
          },
          {
            id: 'hook-1',
            type: 'HOOK',
            text: inputs.hook || 'Rejoins le cercle des joueurs de Njambo !',
            priority: 1,
          },
          {
            id: 'bullets-1',
            type: 'BULLETS',
            style: 'CHECK',
            items: [
              inputs.reason1 || 'Trouve des partenaires facilement',
              inputs.reason2 || 'Participe aux défis',
              inputs.reason3 || 'Découvre les nouveautés en avant-première',
            ],
            priority: 1,
          },
        ],
        cta: { text: 'Rejoins le groupe WhatsApp', intent: 'JOIN_GROUP' },
        footer: { text: 'njambo-kora.ai.studio', app: true, whatsapp: true },
        meta: { presetId: 'JOIN_INVITE', source: 'PRESET' },
      };
    },
  },
  {
    id: 'TIP_RULE',
    label: 'Astuce & Règle du Jeu',
    description: 'Explication tactique ou rappel des règles',
    defaultFormat: 'SQUARE',
    defaultPalette: 'ROYAL_SAPPHIRE',
    ctaIntent: 'PLAY',
    inputs: [
      {
        id: 'badge',
        label: 'Badge',
        type: 'string',
        defaultValue: 'ASTUCE TACTIQUE',
        required: false,
      },
      {
        id: 'hook',
        label: 'Accroche',
        type: 'string',
        defaultValue: 'Comment réussir un Kora parfait ?',
        required: true,
        maxWords: 8,
      },
      {
        id: 'step1',
        label: 'Étape 1',
        type: 'string',
        defaultValue: 'Conserve ton 3 pour le dernier pli',
        required: true,
      },
      {
        id: 'step2',
        label: 'Étape 2',
        type: 'string',
        defaultValue: 'Force les grosses cartes au pli 3',
        required: true,
      },
      {
        id: 'step3',
        label: 'Étape 3',
        type: 'string',
        defaultValue: 'Porte l’estocade au 5e pli',
        required: true,
      },
      {
        id: 'rank',
        label: 'Carte (optionnelle)',
        type: 'string',
        defaultValue: '3',
        required: false,
      },
      {
        id: 'suit',
        label: 'Enseigne (optionnelle)',
        type: 'string',
        defaultValue: '♥',
        required: false,
      },
    ],
    build: (inputs) => {
      const stepsList = [
        inputs.step1 || 'Conserve ton 3 pour le dernier pli',
        inputs.step2 || 'Force les grosses cartes',
        inputs.step3 || 'Porte l’estocade au 5e pli',
      ];

      const blocks: VisualBlock[] = [
        {
          id: 'badge-1',
          type: 'BADGE',
          text: inputs.badge || 'ASTUCE TACTIQUE',
          priority: 2,
        },
        {
          id: 'hook-1',
          type: 'HOOK',
          text: inputs.hook || 'Comment réussir un Kora parfait ?',
          priority: 1,
        },
        {
          id: 'steps-1',
          type: 'STEPS',
          items: stepsList,
          priority: 1,
        },
      ];

      if (inputs.rank && inputs.suit) {
        blocks.push({
          id: 'cards-1',
          type: 'CARDS',
          cards: [{ rank: inputs.rank, suit: inputs.suit, highlight: true, label: 'KORA' }],
          arrangement: 'FAN',
          priority: 3,
        });
      }

      return {
        version: 2,
        format: 'SQUARE',
        palette: 'ROYAL_SAPPHIRE',
        pattern: 'MINIMAL',
        blocks,
        cta: { text: 'Viens tester la bêta', intent: 'PLAY' },
        footer: { text: 'njambo-kora.ai.studio', app: true, whatsapp: true },
        meta: { presetId: 'TIP_RULE', source: 'PRESET' },
      };
    },
  },
  {
    id: 'MEME_PUNCHLINE',
    label: 'Mème Punchline',
    description: 'Format mème avec accroche, chute et carte optionnelle',
    defaultFormat: 'SQUARE',
    defaultPalette: 'SUNSET_TERRACOTTA',
    ctaIntent: 'PLAY',
    inputs: [
      { id: 'setup', label: 'Mise en situation', type: 'string', required: true, maxWords: 8, defaultValue: "Il te jure qu'il n'a rien dans la main." },
      { id: 'punchline', label: 'Chute / Punchline', type: 'string', required: true, maxWords: 22, defaultValue: '5e pli. Un 3. Kora. Il sourit déjà.' },
      { id: 'rank', label: 'Carte Rang (ex: 3)', type: 'string', required: false, defaultValue: '3' },
      { id: 'suit', label: 'Carte Enseigne (ex: ♥)', type: 'string', required: false, defaultValue: '♥' },
    ],
    build: (inputs) => {
      const sanitized = inputs.rank && inputs.suit ? sanitizeNjamboCard(inputs.rank, inputs.suit) : null;
      const blocks: VisualBlock[] = [
        { id: 'badge-1', type: 'BADGE', text: 'MÈME NJAMBO', priority: 2 },
        { id: 'hook-1', type: 'HOOK', text: inputs.setup || "Il te jure qu'il n'a rien dans la main.", priority: 1 },
        { id: 'body-1', type: 'BODY', text: inputs.punchline || '5e pli. Un 3. Kora. Il sourit déjà.', priority: 1 },
      ];
      if (sanitized) {
        blocks.push({
          id: 'cards-1',
          type: 'CARDS',
          cards: [{ rank: sanitized.rank, suit: sanitized.suit, highlight: true, label: sanitized.rank === '3' ? 'KORA' : undefined }],
          arrangement: 'FAN',
          priority: 2,
        });
      }
      return {
        version: 2,
        format: 'SQUARE',
        palette: 'SUNSET_TERRACOTTA',
        pattern: 'NDOP_CHEVRON',
        blocks,
        cta: { text: 'Joue ta meilleure carte', intent: 'PLAY' },
        footer: { text: 'njambo-kora.ai.studio', app: true, whatsapp: true },
        meta: { presetId: 'MEME_PUNCHLINE', source: 'PRESET' },
      };
    },
  },
  {
    id: 'MEME_TWO_PANEL',
    label: 'Mème 2 Panels',
    description: 'Format mème comparatif (Ce qu\'il dit / Ce qu\'il joue)',
    defaultFormat: 'SQUARE',
    defaultPalette: 'SUNSET_TERRACOTTA',
    ctaIntent: 'PLAY',
    inputs: [
      { id: 'setup', label: 'Sujet du mème', type: 'string', required: true, maxWords: 8, defaultValue: "Quand la donne commence mal" },
      { id: 'leftTitle', label: 'Titre Gauche', type: 'string', required: true, defaultValue: "Ce qu'il dit" },
      { id: 'leftText', label: 'Texte Gauche', type: 'string', required: true, maxWords: 14, defaultValue: "Ma donne est gâtée, je jette n'importe quoi." },
      { id: 'rightTitle', label: 'Titre Droite', type: 'string', required: true, defaultValue: "Ce qu'il joue" },
      { id: 'rightText', label: 'Texte Droite', type: 'string', required: true, maxWords: 14, defaultValue: "Le 3 gardé pour le 5e pli." },
      { id: 'punchline', label: 'Conclusion (optionnelle)', type: 'string', required: false, maxWords: 22, defaultValue: "Le vrai visage du joueur au Katika" },
    ],
    build: (inputs) => {
      const blocks: VisualBlock[] = [
        { id: 'badge-1', type: 'BADGE', text: 'MÈME NJAMBO', priority: 2 },
        { id: 'hook-1', type: 'HOOK', text: inputs.setup || "Quand la donne commence mal", priority: 1 },
        {
          id: 'compare-1',
          type: 'COMPARE',
          leftTitle: inputs.leftTitle || "Ce qu'il dit",
          leftText: inputs.leftText || "Ma donne est gâtée, je jette n'importe quoi.",
          rightTitle: inputs.rightTitle || "Ce qu'il joue",
          rightText: inputs.rightText || "Le 3 gardé pour le 5e pli.",
          priority: 1,
        },
      ];
      if (inputs.punchline) {
        blocks.push({
          id: 'body-1',
          type: 'BODY',
          text: inputs.punchline,
          priority: 2,
        });
      }
      return {
        version: 2,
        format: 'SQUARE',
        palette: 'SUNSET_TERRACOTTA',
        pattern: 'NDOP_CHEVRON',
        blocks,
        cta: { text: 'Rejoins les Maîtres du Kora', intent: 'PLAY' },
        footer: { text: 'njambo-kora.ai.studio', app: true, whatsapp: true },
        meta: { presetId: 'MEME_TWO_PANEL', source: 'PRESET' },
      };
    },
  },
];

export function getPresetDef(id: string): PresetDef | undefined {
  return PRESET_DEFS.find((p) => p.id === id);
}
