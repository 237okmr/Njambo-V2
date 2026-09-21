/**
 * Schéma JSON de la spécification visuelle (VisualSpec V2)
 * Au format responseSchema pour le SDK Gemini (@google/genai).
 * Structure à plat (sans oneOf / anyOf) pour une compatibilité parfaite avec Gemini.
 * TypeScript pur, sans import externe.
 */

export const VISUAL_SPEC_JSON_SCHEMA = {
  type: 'OBJECT' as const,
  properties: {
    version: {
      type: 'INTEGER' as const,
      description: 'Version du format de spécification visuelle (toujours 2)',
    },
    format: {
      type: 'STRING' as const,
      enum: ['SQUARE', 'STORY', 'BANNER'],
      description: 'Format du visuel : SQUARE (1080x1080), STORY (1080x1920) ou BANNER (1920x1080)',
    },
    palette: {
      type: 'STRING' as const,
      enum: ['EMERALD_GOLD', 'EBONY_GOLD', 'SUNSET_TERRACOTTA', 'ROYAL_SAPPHIRE'],
      description: 'Palette de couleurs officielle Katika',
    },
    pattern: {
      type: 'STRING' as const,
      enum: ['NDOP_CHEVRON', 'DIAMONDS', 'MINIMAL'],
      description: 'Motif culturel d\'arrière-plan',
    },
    blocks: {
      type: 'ARRAY' as const,
      description: 'Liste de 2 à 7 blocs visuels ordonnés. Doit contenir au moins un bloc HOOK.',
      items: {
        type: 'OBJECT' as const,
        properties: {
          id: { type: 'STRING' as const, description: 'Identifiant unique du bloc (ex: b_1)' },
          type: {
            type: 'STRING' as const,
            enum: [
              'BADGE',
              'HOOK',
              'BODY',
              'BULLETS',
              'STAT',
              'QUOTE',
              'COMPARE',
              'CARDS',
              'STEPS',
              'EVENT',
              'IMAGE',
              'SPACER',
            ],
            description: 'Type de bloc visuel',
          },
          priority: { type: 'INTEGER' as const, description: 'Priorité de rendu (1 = ne pas supprimer, 2 = normal, 3 = optionnel)' },
          
          // Champs pour BADGE, HOOK, BODY, QUOTE
          text: { type: 'STRING' as const, description: 'Texte principal du bloc' },
          
          // Champs spécifiques HOOK
          accentWords: {
            type: 'ARRAY' as const,
            items: { type: 'STRING' as const },
            description: 'Mots à mettre en valeur avec la couleur d\'accentuation',
          },
          
          // Champs spécifiques BULLETS & STEPS
          items: {
            type: 'ARRAY' as const,
            items: { type: 'STRING' as const },
            description: 'Liste d\'éléments pour puces (1-4) ou étapes (2-5)',
          },
          style: {
            type: 'STRING' as const,
            enum: ['CHECK', 'SUIT', 'NUMBER'],
            description: 'Style des puces (CHECK, SUIT, NUMBER)',
          },
          
          // Champs spécifiques STAT
          value: { type: 'STRING' as const, description: 'Chiffre ou valeur clé (ex: 88%, 1500, 24h)' },
          label: { type: 'STRING' as const, description: 'Libellé sous la valeur statistique' },
          sublabel: { type: 'STRING' as const, description: 'Sous-titre optionnel sous le libellé stat' },
          
          // Champs spécifiques QUOTE
          author: { type: 'STRING' as const, description: 'Auteur de la citation ou du témoignage' },
          consent: { type: 'BOOLEAN' as const, description: 'Consentement confirmé du joueur pour le témoignage' },
          
          // Champs spécifiques COMPARE
          leftTitle: { type: 'STRING' as const, description: 'Titre de la colonne gauche (ex: AVANT)' },
          leftText: { type: 'STRING' as const, description: 'Texte de la colonne gauche' },
          rightTitle: { type: 'STRING' as const, description: 'Titre de la colonne droite (ex: APRÈS)' },
          rightText: { type: 'STRING' as const, description: 'Texte de la colonne droite' },
          
          // Champs spécifiques CARDS
          cards: {
            type: 'ARRAY' as const,
            description: '1 à 5 cartes de la table ou de la main du joueur',
            items: {
              type: 'OBJECT' as const,
              properties: {
                rank: { type: 'STRING' as const, description: 'Rang de la carte (3, 4, 5, 6, 7, 8, 9, 10)' },
                suit: { type: 'STRING' as const, description: 'Enseigne de la carte (♥, ♦, ♣, ♠)' },
                label: { type: 'STRING' as const, description: 'Libellé sur la carte (ex: KORA uniquement sur un 3)' },
                highlight: { type: 'BOOLEAN' as const, description: 'Mise en valeur visuelle de la carte' },
              },
              required: ['rank', 'suit'],
            },
          },
          arrangement: {
            type: 'STRING' as const,
            enum: ['FAN', 'ROW', 'DUEL'],
            description: 'Disposition des cartes (FAN, ROW, DUEL)',
          },
          
          // Champs spécifiques EVENT
          date: { type: 'STRING' as const, description: 'Date de l\'événement ou du tournoi' },
          prize: { type: 'STRING' as const, description: 'Dotation ou lot (toujours en jetons virtuels)' },
          mode: { type: 'STRING' as const, description: 'Format ou mode de jeu du tournoi' },
          spots: { type: 'STRING' as const, description: 'Places disponibles' },
          
          // Champs spécifiques IMAGE
          dataUrl: { type: 'STRING' as const, description: 'URL ou DataURL de l\'image' },
          frame: {
            type: 'STRING' as const,
            enum: ['PHONE', 'ROUNDED', 'NONE'],
            description: 'Encadrement de l\'image',
          },
          caption: { type: 'STRING' as const, description: 'Légende sous l\'image' },
          
          // Champs spécifiques SPACER
          size: {
            type: 'STRING' as const,
            enum: ['S', 'M', 'L'],
            description: 'Taille de l\'espacement vertical (S, M, L)',
          },
        },
        required: ['type'],
      },
    },
    cta: {
      type: 'OBJECT' as const,
      description: 'Call-to-Action principal du visuel',
      properties: {
        text: { type: 'STRING' as const, description: 'Texte d\'appel à l\'action (≤ 5 mots)' },
        intent: {
          type: 'STRING' as const,
          description: 'Intention de CTA (JOIN_GROUP, PLAY, COMMENT, SHARE, FOLLOW_PAGE, CHALLENGE)',
        },
      },
      required: ['text'],
    },
    footer: {
      type: 'OBJECT' as const,
      description: 'Pied de page optionnel avec bascule d\'URLs',
      properties: {
        app: { type: 'BOOLEAN' as const },
        whatsapp: { type: 'BOOLEAN' as const },
        text: { type: 'STRING' as const },
      },
    },
  },
  required: ['version', 'format', 'palette', 'pattern', 'blocks', 'cta'],
};
