export type AiTemperatureMode = 'analytical' | 'balanced' | 'creative';
export type LinkInclusionStrategy = 'AUTO' | 'APP_ONLY' | 'WHATSAPP_ONLY' | 'BOTH';

export interface KatikaSocialLinksConfig {
  appUrl: string;
  whatsappUrl: string;
  facebookUrl?: string;
  tiktokUrl?: string;
  instagramUrl?: string;
}

export interface KatikaCopilotSettings {
  id?: string;
  // Gemini API configuration
  geminiModel: string; // e.g. 'gemini-3.8-flash', 'gemini-2.5-pro', 'gemini-3.1-flash-lite'
  aiTemperatureMode: AiTemperatureMode;
  
  // Social media and link settings
  socialLinks: KatikaSocialLinksConfig;
  defaultLinkStrategy: LinkInclusionStrategy;
  customHashtags: string[];

  // Metadata
  updatedAt: number;
  updatedBy?: string;
}

export const DEFAULT_COPILOT_SETTINGS: KatikaCopilotSettings = {
  geminiModel: 'gemini-3.8-flash',
  aiTemperatureMode: 'balanced',
  socialLinks: {
    appUrl: 'https://njambo-kora.ai.studio',
    whatsappUrl: 'https://chat.whatsapp.com/JmIYaCOSjy1Lycd2OANd5l?s=cl&p=a&mlu=4&ilr=4',
    facebookUrl: '',
    tiktokUrl: '',
    instagramUrl: '',
  },
  defaultLinkStrategy: 'AUTO',
  customHashtags: [
    '#NjamboKora',
    '#MaitresDuKora',
    '#CamerounGaming',
    '#JeuxAfricains',
    '#Gaming237',
  ],
  updatedAt: Date.now(),
};

export const AVAILABLE_GEMINI_MODELS = [
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash (Recommandé)',
    badge: 'Ultra-rapide',
    description: 'Vitesse de réponse optimale, idéal pour la conversation continue et la génération de posts.',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro (Haute Réflexion)',
    badge: 'Raisonnement avancé',
    description: 'Capacité de raisonnement accrue pour les audits complexes de télémétrie et détection fine.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite (Économique)',
    badge: 'Haute fréquence',
    description: 'Modèle léger ultra-économique pour les requêtes répétitives.',
  },
];
