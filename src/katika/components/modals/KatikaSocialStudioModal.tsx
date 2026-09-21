import React, { useState } from 'react';
import {
  X,
  Sparkles,
  BarChart3,
  Quote,
  Layers,
  HelpCircle,
  Trophy,
  MessageSquare,
  UserPlus,
  Send,
  Download,
  Copy,
  Check,
  Smartphone,
  Square,
  Flame,
  Award,
  BookOpen,
  ArrowRight,
  Filter,
  CheckCircle2,
  Package,
  Calendar,
  Share2,
  RefreshCw,
} from 'lucide-react';
import {
  SocialVisualTheme,
  SocialVisualFormat,
  SocialVisualCardData,
  SOCIAL_THEMES_CONFIG,
  STAR_VISUAL_CATEGORIES,
  NJAMBO_APP_URL,
  NJAMBO_DOMAIN,
  NJAMBO_WHATSAPP_GROUP_URL,
  createRealisticNjamboPuzzleScenario,
  createRealisticPodiumScenario,
  RealisticRiskScenarioType,
  isKnownBotName,
  getFormattedCaptionForPlatform,
  getWhatsAppStatusCaption,
} from '../../types/socialVisuals';
import {
  drawRandomMeme,
  convertMemeToSocialCardData,
  saveMemeStatus,
  MemeEntry,
} from '../../data/memeBank';
import { KatikaSocialCardPreview } from '../social/KatikaSocialCardPreview';
import { KatikaVisualComposer } from '../social/KatikaVisualComposer';
import { downloadSocialVisualPng } from '../../utils/socialVisualCanvasRenderer';

export interface WeeklyKitItem {
  id: string;
  day: 'LUNDI' | 'MERCREDI' | 'VENDREDI';
  dayBadge: string;
  dayTitle: string;
  cardData: SocialVisualCardData;
  status: 'A_RELIRE' | 'PRET';
  memeEntry?: MemeEntry | null;
}

interface KatikaSocialStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendToAi: (prompt: string) => void;
  metricsSnapshot?: any;
  initialTheme?: SocialVisualTheme;
}

export const KatikaSocialStudioModal: React.FC<KatikaSocialStudioModalProps> = ({
  isOpen,
  onClose,
  onSendToAi,
  metricsSnapshot,
  initialTheme = 'TACTICAL_PUZZLE',
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedTheme, setSelectedTheme] = useState<SocialVisualTheme>(initialTheme);
  const [previewCard, setPreviewCard] = useState<SocialVisualCardData | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<RealisticRiskScenarioType>('ANTI_KORA_ESCAPE');
  const [currentMeme, setCurrentMeme] = useState<MemeEntry | null>(null);
  const [studioMode, setStudioMode] = useState<'CLASSIC' | 'COMPOSER'>('CLASSIC');

  const [weeklyKitMode, setWeeklyKitMode] = useState<boolean>(false);
  const [weeklyKitItems, setWeeklyKitItems] = useState<WeeklyKitItem[]>([]);
  const [copiedItemAction, setCopiedItemAction] = useState<{ id: string; action: string } | null>(null);

  if (!isOpen) return null;

  const totalManches = metricsSnapshot?.summary?.totalManches ?? null;
  const koraCount = metricsSnapshot?.kpis?.allTime?.koraCount ?? null;
  const connectedPlayers = metricsSnapshot?.summary?.connectedPlayers ?? null;

  // Generates instant template data for a given theme with real metrics and authentic Njambo cards
  const getInstantTemplate = (theme: SocialVisualTheme, scenarioType: RealisticRiskScenarioType = selectedScenario): SocialVisualCardData => {
    switch (theme) {
      case 'TACTICAL_PUZZLE':
        return createRealisticNjamboPuzzleScenario(scenarioType);

      case 'LEADERBOARD_PODIUM': {
        const topPlayers = (metricsSnapshot?.playersOverview?.topPlayers || [])
          .filter((p: any) => p.isHuman !== false && !isKnownBotName(p.name))
          .slice(0, 3)
          .map((p: any, idx: number) => {
            const winCount = p.victories ?? 0;
            const kCount = (p.koraCount ?? 0) + (p.doubleKoraCount ?? 0);
            const totalG = p.totalGames ?? 0;
            const winRate = totalG > 0 ? Math.round((winCount / totalG) * 100) : 0;
            return {
              rank: (idx + 1) as 1 | 2 | 3,
              name: p.name,
              scoreOrTitle: `${p.masteryScore || 0} pts • ${winCount} Victoires`,
              koraCount: kCount,
              badge: idx === 0 ? '👑 GRAND CHAMPION' : idx === 1 ? '🥈 VICE-CHAMPION' : '🥉 3E DU PODIUM',
            };
          });

        return createRealisticPodiumScenario(topPlayers.length > 0 ? topPlayers : undefined);
      }

      case 'STAT_OF_THE_WEEK':
        return {
          theme: 'STAT_OF_THE_WEEK',
          badge: 'CHIFFRE DE LA SEMAINE 🃏',
          headline: totalManches != null ? `${totalManches} manches disputées cette semaine !` : 'Bilan hebdomadaire de l’arène',
          mainText: totalManches != null
            ? `Les Maîtres du Kora ont fait trembler l'arène avec ${koraCount ?? 0} Kora spectaculaires validés sur Katika.`
            : 'Les statistiques hebdomadaires sont en cours de synchronisation avec l’arène.',
          highlightMetric: {
            value: totalManches != null ? String(totalManches) : '—',
            label: 'Parties disputées',
            sublabel: totalManches != null ? `avec ${koraCount ?? 0} Kora décisifs enregistrés` : 'Données indisponibles',
          },
          heroCard: {
            rank: '3',
            suit: '♥',
            label: '3 KOUBI',
            badge: 'LE KORA AU 5e TOUR',
          },
          ctaText: 'Rejoins les Maîtres du Kora • En bêta',
          linkUrl: `${NJAMBO_DOMAIN} • WhatsApp officiel`,
          postCaption: totalManches != null
            ? `🃏 CHIFFRE DE LA SEMAINE NJAMBO KORA 🔥\n\nC'est le grand bilan de l'arène : cette semaine, pas moins de ${totalManches} manches ont été disputées par nos joueurs !\n\nAu total, ${koraCount ?? 0} Kora ont retourné des donnes in extremis au 5e tour avec un 3 posé au moment décisif !\n\n👉 Vous étiez de la partie ? Combien de Kora avez-vous validés cette semaine ? Dites-le-nous en commentaire !\n\n🎮 Lien pour tester la bêta (PC & Mobile) : ${NJAMBO_APP_URL}\n💬 Rejoins notre groupe WhatsApp officiel : ${NJAMBO_WHATSAPP_GROUP_URL}`
            : `🃏 CHIFFRE DE LA SEMAINE NJAMBO KORA 🔥\n\nLes statistiques de la semaine sont en cours de synchronisation dans l'arène Katika.\n\n🎮 Lien pour tester la bêta (PC & Mobile) : ${NJAMBO_APP_URL}\n💬 Rejoins notre groupe WhatsApp officiel : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: totalManches != null
            ? `🃏 *CHIFFRE DE LA SEMAINE NJAMBO KORA* 🔥\n\n*${totalManches} manches* jouées et *${koraCount ?? 0} Kora* spectaculaires validés cette semaine !\n\n👉 *Joue en bêta en ligne :* ${NJAMBO_APP_URL}\n💬 *Rejoins le groupe officiel des joueurs :* ${NJAMBO_WHATSAPP_GROUP_URL}`
            : `🃏 *CHIFFRE DE LA SEMAINE NJAMBO KORA* 🔥\n\nStatistiques en cours de calcul.\n\n👉 *Joue en bêta en ligne :* ${NJAMBO_APP_URL}\n💬 *Rejoins le groupe officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#NjamboKora', '#ChiffreDeLaSemaine', '#MaitresDuKora', '#CamerounGaming', '#JeuxAfricains'],
        };

      case 'TESTIMONIAL':
        return {
          theme: 'TESTIMONIAL',
          badge: 'PAROLE DE MAÎTRE 🎙️',
          headline: '« Quand tu places le Double Kora, la table se tait. »',
          mainText: 'Quand tu places le Double Kora au 5e tour alors que ton adversaire croyait avoir la main... la table entière se tait. Katika restitue exactement cette adrénaline des soirées au quartier !',
          author: {
            name: 'Joueur de la communauté',
            role: 'Joueur régulier Katika',
          },
          heroCard: {
            rank: '3',
            suit: '♥',
            label: 'DOUBLE KORA',
          },
          ctaText: 'Viens tester ton niveau • En bêta',
          linkUrl: `${NJAMBO_DOMAIN} • Communauté WhatsApp`,
          postCaption: `🎙️ PAROLE DE JOUEUR — LA PASSION DU NJAMBO !\n\n« Quand tu places le Double Kora au 5e tour alors que ton adversaire croyait avoir la main... la table entière se tait. Katika restitue exactement cette adrénaline des soirées au quartier ! » — Témoignage joueur.\n\nMerci à tous nos joueurs pour leurs retours passionnés. Le Njambo en ligne continue de grandir avec vous !\n\nToi aussi, rejoins l'aventure et fais-nous part de tes impressions 👇\n🎮 Version bêta : ${NJAMBO_APP_URL}\n💬 Groupe WhatsApp officiel : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🎙️ *PAROLE DE JOUEUR NJAMBO !* 🇨🇲\n\n« Quand tu places le Double Kora au 5e tour... la table entière se tait ! »\n\nViens défier les maîtres en direct :\n👉 ${NJAMBO_APP_URL}\n💬 *Groupe WhatsApp de la communauté :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#Temoignage', '#NjamboKora', '#CommunauteNjambo', '#Cameroun', '#KoraHunter'],
        };

      case 'TIP_OR_RULE':
        return {
          theme: 'TIP_OR_RULE',
          badge: 'ASTUCE STRATÉGIQUE 💡',
          headline: 'La règle d’or : surveillez la défausse !',
          mainText: 'Ne jetez jamais votre carte maîtresse au premier tour si vous visez le Kora. Observez la défausse adverse et conservez votre 3 pour le 5e tour décisif.',
          palette: 'ROYAL_SAPPHIRE',
          decorativeCards: [
            { rank: '9', suit: '♠', label: 'BLACK' },
            { rank: '3', suit: '♥', label: '3 KOUBI' },
          ],
          ctaText: 'Mets la stratégie en pratique • En bêta',
          linkUrl: `${NJAMBO_DOMAIN} • Rejoins le groupe`,
          postCaption: `💡 L'ASTUCE DU MAÎTRE : RÉUSSIR SON KORA 🃏\n\nBeaucoup de joueurs débutants se précipitent pour remporter les premiers tours avec leurs plus fortes cartes. Erreur fatale !\n\n👉 La clé du Njambo Kora réside dans la patience : gardez le contrôle, observez les cartes maîtresses déjà défaussées et frappez avec votre 3 au 5e tour lorsque l'adversaire n'a plus de réponse.\n\nQuelle est votre tactique préférée ? Attaque directe ou embuscade au dernier tour ? 💬 Répondez ci-dessous !\n\n🎮 Joue en bêta : ${NJAMBO_APP_URL}\n💬 Débats et conseils sur WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `💡 *L'ASTUCE DU MAÎTRE : RÉUSSIR SON KORA !* 🇨🇲\n\nCompte toujours les cartes défaussées et prépare ton 3 pour le 5e tour !\n\n👉 *Pratique tes coups en bêta :* ${NJAMBO_APP_URL}\n💬 *Rejoins le groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#AstuceDuJour', '#StrategieNjambo', '#ReglesDuJeu', '#DoubleKora', '#NjamboMaster'],
        };

      case 'MEME_OR_PUNCHLINE':
        return {
          theme: 'MEME_OR_PUNCHLINE',
          badge: 'HUMOUR NJAMBO 😂',
          headline: '« J’ai une main pourrie, je joue au hasard... »',
          mainText: 'Le gars qui te jure qu’il n’a rien reçu dans sa main, mais qui te sort un 3 au 5e tour pour claquer son Kora avec un grand sourire.',
          palette: 'SUNSET_TERRACOTTA',
          heroCard: {
            rank: '3',
            suit: '♥',
            label: 'LE KORA ! 💥',
          },
          ctaText: 'Identifie ce menteur en commentaire 🤣',
          linkUrl: `${NJAMBO_DOMAIN} • Groupe WhatsApp`,
          postCaption: `😂 LA VÉRITÉ SUR LES JOUEURS DE NJAMBO AU QUARTIER !\n\nOn a tous cet ami à la table qui répète à chaque tour :\n« Hé gars, ma donne est gâtée, je n'ai rien reçu, je jette n'importe quoi... »\n\nEt dès que tu t'avances confiant au 5e tour... BAM ! Kora sec avec un 3, il rafle la mise et commence à danser !\n\nTague cet ami en commentaire sans rien dire 🤣👇\n\n🎮 Joue au Njambo en bêta ouverte : ${NJAMBO_APP_URL}\n💬 Ambiance garantie sur notre groupe WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `😂 *LA LOI DU NJAMBO AU MBOA !* 🇨🇲\n\n« J'ai une main pourrie, je jette n'importe quoi... »\nEt au 5e tour : BAM ! Kora avec le 3 ! 🃏🤣\n\nQui est ce joueur dans le groupe ? Démasquez-vous sur la table :\n👉 ${NJAMBO_APP_URL}\n💬 *Rejoins notre groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#HumourCameroun', '#NjamboMeme', '#LaLoiDuKora', '#AmbianceQuartier', '#DoubleKora'],
        };

      case 'TOURNAMENT_ANNOUNCEMENT':
        return {
          theme: 'TOURNAMENT_ANNOUNCEMENT',
          badge: 'GRAND TOURNOI NJAMBO 🏆',
          headline: 'Le Grand Clash du Samedi Soir',
          mainText: 'Affrontez les meilleurs maîtres de la région dans une arène sans pitié ! Inscriptions ouvertes pour la bêta et retransmission en direct.',
          palette: 'EBONY_GOLD',
          eventDetails: {
            date: 'Ce Samedi • 21h00 UTC+1',
            prizePool: 'Dotation à annoncer',
            mode: 'Table à 4 • Élimination directe',
            spotsRemaining: '32 Places • Inscriptions Ouvertes',
          },
          ctaText: 'Inscris-toi au Tournoi • En bêta',
          linkUrl: `${NJAMBO_DOMAIN} • WhatsApp officiel`,
          postCaption: `🏆 GRAND TOURNOI NJAMBO DU WEEK-END ! 🇨🇲\n\nPréparez vos cartes et affûtez vos tactiques : ce samedi à 21h00, l'arène Katika ouvre ses portes pour le Clash des Maîtres !\n\n💰 Dotation : À annoncer (Jetons virtuels d'amusement)\n⚔️ Format : Table à 4 joueurs, élimination directe\n🎟️ Inscription : Ouverte en bêta, 32 places max !\n\n🎮 Lien du jeu : ${NJAMBO_APP_URL}\n💬 Inscription & canal officiel WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🏆 *GRAND TOURNOI NJAMBO CE SAMEDI 21H !* 🇨🇲\n\nDotation : *À annoncer (Jetons virtuels d'amusement)* + Titre officiel de Maître du Kora !\nFormat : Tables à 4 joueurs • Élimination directe\nPlaces : 32 joueurs max.\n\n👉 *Rejoins la table et joue en bêta :* ${NJAMBO_APP_URL}\n💬 *Inscris-toi sur le groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}\n\nTransférez ce message à vos adversaires préférés ! 🃏`,
          hashtags: ['#TournoiNjambo', '#MaitresDuKora', '#EsportCameroun', '#DoubleKora', '#GamingAfrica'],
        };

      case 'CAROUSEL_SLIDE':
        return {
          theme: 'CAROUSEL_SLIDE',
          badge: 'GUIDE TACTIQUE 📚 (1/3)',
          headline: 'Ne Subis Plus Jamais de Kora',
          mainText: 'Règle #1 : La mémorisation des 5 tours. Au Njambo, chaque tour compte. Ne regarde pas seulement ta main, observe les cartes maîtresses (10 et 9) et défausses tombées pour placer ton 3 au 5e tour.',
          palette: 'EMERALD_GOLD',
          carouselStep: {
            current: 1,
            total: 3,
            stepTitle: 'La Mémorisation',
          },
          ctaText: 'Fais glisser pour l’astuce 2 ➔',
          linkUrl: `${NJAMBO_DOMAIN} • Groupe WhatsApp`,
          postCaption: `📚 MINI-GUIDE : 3 RÈGLES D'OR POUR DEVENIR IMBATTABLE AU NJAMBO (Partie 1/3) !\n\nTu perds souvent au 5e tour ? C'est parce que tu te concentres uniquement sur tes propres cartes.\n\nDans ce carrousel, nous te dévoilons les 3 secrets des grands Maîtres du Kora pour anticiper les coups adverses.\n\n👉 Fais glisser pour découvrir la règle #2 et enregistre ce post pour tes prochaines parties !\n\n🎮 Entraîne-toi dès maintenant : ${NJAMBO_APP_URL}\n💬 Rejoins la communauté WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `📚 *ASTUCE DU JOUR : COMMENT ÉVITER LE KORA !* 🇨🇲\n\nSecret #1 : Observe toujours les cartes maîtresses tombées aux premiers tours avant de lancer ton 3 au dernier tour.\n\n👉 *Viens t'entraîner en bêta :* ${NJAMBO_APP_URL}\n💬 *Groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#GuideNjambo', '#ApprendreLesCartes', '#StrategieKora', '#CamerounGaming'],
        };

      case 'COMMUNITY_QUESTION':
        return {
          theme: 'COMMUNITY_QUESTION',
          badge: 'À VOUS LA PAROLE 🗣️',
          headline: 'Vous jouez plutôt en duel ou à 4 joueurs ?',
          mainText: 'Le tête-à-tête ultra tactique ou la grande table animée entre amis ? Dites-nous votre format préféré !',
          options: ['Option A : Le Duel intense (1 vs 1)', 'Option B : La Table à 4 conviviale'],
          ctaText: 'Donne ton avis en commentaire 👇',
          linkUrl: `${NJAMBO_DOMAIN} • Rejoins le débat`,
          postCaption: `🗣️ QUESTION À LA COMMUNAUTÉ NJAMBO !\n\nDans Katika, chaque format a son ambiance :\n\n⚔️ Option A : Le duel 1 vs 1 (rapide, sans pitié, ultra stratégique)\n👥 Option B : La table à 4 (bluffs croisés, convivialité et rebondissements)\n\nVous êtes plutôt team Duel ou team Table à 4 ? Votez en commentaire avec un A ou un B ! 🃏👇\n\n🎮 Lance ta table : ${NJAMBO_APP_URL}\n💬 Participe au débat sur WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🗣️ *DEBAT NJAMBO DU JOUR !* 🇨🇲\n\nDuel 1 vs 1 ultra tactique ⚔️ ou Table à 4 conviviale 👥 ?\n\n👉 *Viens jouer ton format préféré :* ${NJAMBO_APP_URL}\n💬 *Vote sur le groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#Sondage', '#DebatNjambo', '#Communaute', '#VotreAvis', '#JeuxDeCartes'],
        };

      case 'JOIN_INVITATION':
        return {
          theme: 'JOIN_INVITATION',
          badge: 'REJOINS LA COMMUNAUTÉ 💬',
          headline: 'Rejoins le groupe WhatsApp officiel Njambo Kora !',
          mainText: 'Organise tes parties, défie les meilleurs joueurs du Mboa, participe aux tournois exclusifs et reçois les codes de table en avant-première.',
          palette: 'EMERALD_GOLD',
          heroCard: {
            rank: '3',
            suit: '♥',
            label: 'GROUPE OFFICIEL 💬',
            badge: 'COMMUNAUTÉ NJAMBO',
          },
          ctaText: 'Rejoins le groupe WhatsApp • 100% Passion',
          linkUrl: `${NJAMBO_DOMAIN} • Groupe WhatsApp`,
          postCaption: `💬 REJOINS LA COMMUNAUTÉ OFFICIELLE NJAMBO KORA ! 🇨🇲\n\nTu aimes le Njambo ? Tu cherches des adversaires à la hauteur pour tes soirées cartes ?\n\nRejoins notre groupe WhatsApp officiel pour :\n⚡ Trouver des joueurs en direct 24/7\n🏆 Participer aux tournois exclusifs du week-end\n💡 Débattre des meilleures stratégies de jeu\n\n👉 Clique sur le lien pour nous rejoindre dès maintenant !\n💬 Groupe WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}\n🎮 Teste la bêta en ligne : ${NJAMBO_APP_URL}`,
          whatsAppMessage: `💬 *REJOINS LE GROUPE OFFICIEL NJAMBO KORA !* 🇨🇲\n\nRejoins les passionnés du jeu de cartes du Mboa :\n⚡ Organise tes duels\n🏆 Tournois exclusifs\n\n👉 *Rejoins le groupe :* ${NJAMBO_WHATSAPP_GROUP_URL}\n🎮 *Joue en bêta :* ${NJAMBO_APP_URL}`,
          hashtags: ['#CommunauteNjambo', '#NjamboKora', '#JeuxDeCartes', '#WhatsAppGaming', '#Cameroun'],
        };

      default:
        return {
          theme,
          badge: SOCIAL_THEMES_CONFIG[theme]?.badge || 'NJAMBO KORA 🃏',
          headline: SOCIAL_THEMES_CONFIG[theme]?.defaultHeadline || 'Prêt pour le Kora ?',
          mainText: 'Rejoignez la table de cartes la plus palpitante du Cameroun en ligne.',
          ctaText: 'Joue en bêta • Lien en bio',
          linkUrl: `${NJAMBO_DOMAIN} • WhatsApp officiel`,
          postCaption: `🃏 NJAMBO KORA — Le jeu de cartes du Mboa !\n\nVenez tester vos réflexes et vos tactiques en direct sur PC et mobile.\n\n🎮 ${NJAMBO_APP_URL}\n💬 ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🃏 *NJAMBO KORA EN LIGNE !* 🇨🇲\n\n👉 ${NJAMBO_APP_URL}`,
          hashtags: ['#NjamboKora', '#CamerounGaming'],
        };
    }
  };

  const getThemeIcon = (theme: SocialVisualTheme) => {
    switch (theme) {
      case 'STAT_OF_THE_WEEK':
        return <BarChart3 className="w-4 h-4 text-emerald-400" />;
      case 'TESTIMONIAL':
        return <Quote className="w-4 h-4 text-amber-400" />;
      case 'TIP_OR_RULE':
        return <HelpCircle className="w-4 h-4 text-cyan-400" />;
      case 'MEME_OR_PUNCHLINE':
        return <Sparkles className="w-4 h-4 text-orange-400" />;
      case 'TOURNAMENT_ANNOUNCEMENT':
        return <Trophy className="w-4 h-4 text-amber-400" />;
      case 'LEADERBOARD_PODIUM':
        return <Trophy className="w-4 h-4 text-yellow-400" />;
      case 'TACTICAL_PUZZLE':
        return <HelpCircle className="w-4 h-4 text-blue-400" />;
      case 'CAROUSEL_SLIDE':
        return <Layers className="w-4 h-4 text-purple-400" />;
      case 'COMMUNITY_QUESTION':
        return <MessageSquare className="w-4 h-4 text-pink-400" />;
      case 'BEFORE_AFTER':
        return <Layers className="w-4 h-4 text-indigo-400" />;
      case 'JOIN_INVITATION':
        return <UserPlus className="w-4 h-4 text-blue-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-amber-400" />;
    }
  };

  const handleDrawMemeDay = () => {
    setWeeklyKitMode(false);
    const meme = drawRandomMeme();
    setCurrentMeme(meme);
    const cardData = convertMemeToSocialCardData(meme);
    setPreviewCard(cardData);
    setSelectedTheme(cardData.theme);
  };

  const initWeeklyKit = () => {
    // 1. Lundi = mème (M1)
    const meme = drawRandomMeme();
    const mondayData = convertMemeToSocialCardData(meme);

    // 2. Mercredi = "Chiffre de la semaine" si les vraies données existent, sinon question communauté
    const totalM = metricsSnapshot?.summary?.totalManches;
    const hasRealMetrics = totalM != null && Number(totalM) > 0;
    const wednesdayData = getInstantTemplate(hasRealMetrics ? 'STAT_OF_THE_WEEK' : 'COMMUNITY_QUESTION');

    // 3. Vendredi = invitation à rejoindre le groupe
    const fridayData = getInstantTemplate('JOIN_INVITATION');

    const kit: WeeklyKitItem[] = [
      {
        id: 'lundi',
        day: 'LUNDI',
        dayBadge: '📅 LUNDI',
        dayTitle: 'Lundi • Mème Njambo (Humour M1)',
        cardData: mondayData,
        status: 'A_RELIRE',
        memeEntry: meme,
      },
      {
        id: 'mercredi',
        day: 'MERCREDI',
        dayBadge: '📅 MERCREDI',
        dayTitle: hasRealMetrics ? 'Mercredi • Chiffre de la semaine' : 'Mercredi • Question Communauté',
        cardData: wednesdayData,
        status: 'A_RELIRE',
      },
      {
        id: 'vendredi',
        day: 'VENDREDI',
        dayBadge: '📅 VENDREDI',
        dayTitle: 'Vendredi • Invitation Groupe WhatsApp',
        cardData: fridayData,
        status: 'A_RELIRE',
      },
    ];

    setWeeklyKitItems(kit);
  };

  const handleOpenWeeklyKit = () => {
    if (weeklyKitItems.length === 0) {
      initWeeklyKit();
    }
    setWeeklyKitMode(true);
  };

  const handleDownloadItemPng = async (itemId: string) => {
    const item = weeklyKitItems.find((i) => i.id === itemId);
    if (!item) return;
    await downloadSocialVisualPng(item.cardData, 'SQUARE', `katika_kit_${item.day.toLowerCase()}_njambo.png`);
    setWeeklyKitItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status: 'PRET' } : i))
    );
    setCopiedItemAction({ id: itemId, action: 'PNG téléchargé avec succès !' });
    setTimeout(() => setCopiedItemAction(null), 2500);
  };

  const handleCopyItemFacebook = (itemId: string) => {
    const item = weeklyKitItems.find((i) => i.id === itemId);
    if (!item) return;
    const text = getFormattedCaptionForPlatform(item.cardData, 'FACEBOOK');
    navigator.clipboard.writeText(text.trim()).catch(() => {});
    setWeeklyKitItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status: 'PRET' } : i))
    );
    setCopiedItemAction({ id: itemId, action: 'Texte Facebook copié avec liens et UTM !' });
    setTimeout(() => setCopiedItemAction(null), 2500);
  };

  const handleCopyItemWhatsAppGroup = (itemId: string) => {
    const item = weeklyKitItems.find((i) => i.id === itemId);
    if (!item) return;
    const text = getFormattedCaptionForPlatform(item.cardData, 'WHATSAPP');
    navigator.clipboard.writeText(text.trim()).catch(() => {});
    setWeeklyKitItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status: 'PRET' } : i))
    );
    setCopiedItemAction({ id: itemId, action: 'Message Groupe WhatsApp copié avec liens et UTM !' });
    setTimeout(() => setCopiedItemAction(null), 2500);
  };

  const handleCopyItemWhatsAppStatus = (itemId: string) => {
    const item = weeklyKitItems.find((i) => i.id === itemId);
    if (!item) return;
    const text = getWhatsAppStatusCaption(item.cardData);
    navigator.clipboard.writeText(text.trim()).catch(() => {});
    setWeeklyKitItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status: 'PRET' } : i))
    );
    setCopiedItemAction({ id: itemId, action: 'Statut WhatsApp copié avec lien et UTM !' });
    setTimeout(() => setCopiedItemAction(null), 2500);
  };

  const handleRewriteItemWithAi = (itemId: string) => {
    const item = weeklyKitItems.find((i) => i.id === itemId);
    if (!item) return;
    let prompt = `📱 **RÉÉCRITURE AVEC GEMINI — KIT DE LA SEMAINE (${item.dayBadge})** :\n`;
    prompt += `Thème : ${item.cardData.theme}\n`;
    prompt += `Titre : "${item.cardData.headline}"\n`;
    prompt += `Texte : "${item.cardData.mainText}"\n\n`;
    prompt += `CONSIGNES :\n`;
    prompt += `1. Rédige une version plus engageante pour la communauté Njambo Kora.\n`;
    prompt += `2. Respecte les règles du Njambo et renvoie le JSON structuré du visuel.`;

    onSendToAi(prompt);
    onClose();
  };

  const handleDownloadAllKit = async () => {
    for (const item of weeklyKitItems) {
      await downloadSocialVisualPng(item.cardData, 'SQUARE', `katika_kit_${item.day.toLowerCase()}_njambo.png`);
    }
    setWeeklyKitItems((prev) => prev.map((i) => ({ ...i, status: 'PRET' })));
    setCopiedItemAction({ id: 'all', action: 'Les 3 visuels du kit ont été téléchargés !' });
    setTimeout(() => setCopiedItemAction(null), 2500);
  };

  const handleToggleValidateCurrentMeme = () => {
    if (!currentMeme) return;
    const newStatus = currentMeme.status === 'VALIDE' ? 'A_RELIRE' : 'VALIDE';
    saveMemeStatus(currentMeme.id, newStatus);
    setCurrentMeme({ ...currentMeme, status: newStatus });
  };

  const handleRewriteMemeWithAi = () => {
    if (!currentMeme) return;
    let prompt = `📱 **RÉÉCRITURE DE MÈME NJAMBO KORA AVEC GEMINI** :\n`;
    prompt += `Setup actuel : "${currentMeme.setup}"\n`;
    prompt += `Punchline actuelle : "${currentMeme.punchline}"\n`;
    prompt += `Tag : ${currentMeme.tag}\n`;
    prompt += `Kind : ${currentMeme.kind}\n\n`;
    prompt += `CONSIGNES STRICTES :\n`;
    prompt += `1. Rédige une version encore plus percutante, drôle et authentique centrée uniquement sur les situations de jeu du Njambo Kora.\n`;
    prompt += `2. Respecte scrupuleusement les règles du jeu Njambo Kora (31 cartes, 3-10 pour ♥♦♣, 3-9 pour ♠, Kora au 5e pli avec un 3).\n`;
    prompt += `3. Renvoie le JSON complet du visuel pour le thème "${currentMeme.kind === 'PUNCHLINE' ? 'MEME_OR_PUNCHLINE' : 'BEFORE_AFTER'}".`;

    onSendToAi(prompt);
    onClose();
  };

  const handleSelectTheme = (t: SocialVisualTheme) => {
    setSelectedTheme(t);
    if (t === 'MEME_OR_PUNCHLINE' || t === 'BEFORE_AFTER') {
      if (!currentMeme) {
        const meme = drawRandomMeme();
        setCurrentMeme(meme);
        setPreviewCard(convertMemeToSocialCardData(meme));
        return;
      }
    }
    setPreviewCard(getInstantTemplate(t));
  };

  const handleAskAiForTheme = (t: SocialVisualTheme) => {
    const cfg = SOCIAL_THEMES_CONFIG[t] || SOCIAL_THEMES_CONFIG.STAT_OF_THE_WEEK;
    let prompt = `📱 **GÉNÉRATION VISUEL RÉSEAUX SOCIAUX — ${cfg.label.toUpperCase()}** :\n`;
    prompt += `${cfg.promptExample}\n\n`;
    prompt += `Consignes :\n`;
    prompt += `1. Rédige une courte accroche d'introduction.\n`;
    prompt += `2. Inclus le bloc JSON complet dans un bloc \`\`\`json { ... } \`\`\` avec le thème "${t}", le badge, le headline, mainText, le texte du post (postCaption) avec émojis et hashtags pertinents.`;

    if (t === 'STAT_OF_THE_WEEK' && metricsSnapshot) {
      prompt += `\n3. Appuie-toi sur les chiffres réels de l'instantané (Total manches : ${totalManches}, Kora : ${koraCount}, Joueurs : ${connectedPlayers}).`;
    }

    onSendToAi(prompt);
    onClose();
  };

  const activeCardData = previewCard || getInstantTemplate(selectedTheme);

  // Filter themes based on active category filter
  const allThemesList = Object.keys(SOCIAL_THEMES_CONFIG) as SocialVisualTheme[];
  const displayedThemes = selectedCategory === 'ALL'
    ? allThemesList
    : selectedCategory === 'STARS'
    ? STAR_VISUAL_CATEGORIES.map((c) => c.theme)
    : allThemesList.filter((t) => {
        const star = STAR_VISUAL_CATEGORIES.find((c) => c.id === selectedCategory);
        return star ? star.theme === t : true;
      });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-6xl max-h-[94vh] flex flex-col bg-slate-900 border border-amber-500/40 rounded-3xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white">Studio de Visuels Réseaux Sociaux</h3>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Génération Instantanée 1-Clic
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Créez, personnalisez et téléchargez vos affiches HD 1080p prêtes à publier pour WhatsApp, Instagram et Facebook
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setStudioMode('CLASSIC')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  studioMode === 'CLASSIC'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Classique
              </button>
              <button
                type="button"
                onClick={() => setStudioMode('COMPOSER')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  studioMode === 'COMPOSER'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Composer V2
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
              title="Fermer le studio"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {studioMode === 'COMPOSER' ? (
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <KatikaVisualComposer onClose={onClose} />
          </div>
        ) : (
        <>
        {/* Top Segmented Category Control (Frictionless 1-Click Filter) */}
        <div className="px-5 py-2.5 bg-slate-950/70 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            onClick={handleOpenWeeklyKit}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shrink-0 ${
              weeklyKitMode
                ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 text-slate-950 shadow-lg ring-2 ring-amber-400'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
            }`}
            title="Générer le Kit de Promotion Hebdomadaire (3 publications localement)"
          >
            <Package className="w-4 h-4 text-amber-400 fill-amber-400/20" />
            <span>📦 Kit de la semaine</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950 text-amber-300 font-mono">
              3 posts
            </span>
          </button>

          <button
            type="button"
            onClick={handleDrawMemeDay}
            className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-400 hover:to-yellow-400 text-slate-950 shadow-md flex items-center gap-1.5 transition cursor-pointer active:scale-95 shrink-0"
            title="Tirer un mème prêt à l'emploi (0 coût en tokens)"
          >
            <Sparkles className="w-4 h-4 text-slate-950 fill-slate-950" />
            <span>🃏 Mème du jour</span>
          </button>

          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1 ml-1 mr-1">
            <Filter className="w-3.5 h-3.5 text-amber-400" />
            <span>Types :</span>
          </span>

          {STAR_VISUAL_CATEGORIES.map((cat) => {
            const isActive = selectedTheme === cat.theme;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectTheme(cat.theme)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold ring-2 ring-amber-400/40'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                <span>{cat.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${
              selectedCategory === 'ALL' && !STAR_VISUAL_CATEGORIES.some((c) => c.theme === selectedTheme)
                ? 'bg-slate-800 text-white border border-amber-500/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>+ Autres ({allThemesList.length - STAR_VISUAL_CATEGORIES.length})</span>
          </button>
        </div>

        {/* Modal Content: Left Theme Cards Picker + Right Live Studio */}
        {weeklyKitMode ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col space-y-5 min-h-0">
            {/* Top Kit Action Bar */}
            <div className="bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-950 border border-amber-500/40 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-extrabold text-white">Kit de Promotion Hebdomadaire (3 Publications)</h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      0 Token IA • 100% Local
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Lundi (Mème M1) • Mercredi ({totalManches ? 'Chiffre clé' : 'Question communauté'}) • Vendredi (Invitation Groupe).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold text-slate-300 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                  Progression : <span className="text-amber-400 font-extrabold">{weeklyKitItems.filter((i) => i.status === 'PRET').length}/3 prêts</span>
                </span>

                <button
                  type="button"
                  onClick={handleDownloadAllKit}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 shadow-md flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger le kit complet (3 PNG)</span>
                </button>

                <button
                  type="button"
                  onClick={initWeeklyKit}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                  title="Régénérer le kit"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                  <span>Régénérer</span>
                </button>
              </div>
            </div>

            {/* Notification Toast */}
            {copiedItemAction && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{copiedItemAction.action}</span>
              </div>
            )}

            {/* 3 Publications Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {weeklyKitItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-3xl p-4 flex flex-col justify-between space-y-3 shadow-lg relative hover:border-slate-700 transition"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-extrabold shrink-0">
                        {item.dayBadge}
                      </span>
                      <span className="text-xs font-bold text-slate-200 truncate">
                        {item.dayTitle}
                      </span>
                    </div>

                    {item.status === 'PRET' ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>✅ Prêt</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shrink-0">
                        <span>⏱️ À relire</span>
                      </span>
                    )}
                  </div>

                  {/* Visual Preview */}
                  <div className="flex-1 bg-slate-900/60 rounded-2xl overflow-hidden p-1 border border-slate-800/60 flex items-center justify-center min-h-[300px]">
                    <KatikaSocialCardPreview data={item.cardData} />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/80">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleDownloadItemPng(item.id)}
                        className="px-3 py-2 rounded-xl text-xs font-extrabold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Télécharger PNG</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyItemFacebook(item.id)}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
                      >
                        <Copy className="w-3.5 h-3.5 text-blue-400" />
                        <span>Copier Facebook</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyItemWhatsAppGroup(item.id)}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Groupe WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyItemWhatsAppStatus(item.id)}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-800/20 hover:bg-emerald-800/30 text-emerald-300 border border-emerald-600/40 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Statut WhatsApp</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRewriteItemWithAi(item.id)}
                      className="w-full mt-0.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                      <span>Réécrire avec l'IA</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
          {/* Left Column: Quick Theme Cards with Direct 1-Click Triggers */}
          <div className="lg:col-span-5 flex flex-col space-y-2.5 max-h-[600px] overflow-hidden">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between shrink-0 px-1">
              <span>Choisir le style d'affiche</span>
              <span className="text-[10px] text-amber-400 font-mono">1 clic = aperçu instantané</span>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
              {displayedThemes.map((themeKey) => {
                const cfg = SOCIAL_THEMES_CONFIG[themeKey] || {
                  label: themeKey,
                  badge: 'NJAMBO',
                  promptExample: 'Visuel Njambo Kora',
                };
                const isSelected = selectedTheme === themeKey;

                return (
                  <div
                    key={themeKey}
                    onClick={() => handleSelectTheme(themeKey)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1.5 select-none ${
                      isSelected
                        ? 'bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border-amber-500/70 shadow-lg ring-1 ring-amber-500/40'
                        : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {getThemeIcon(themeKey)}
                        </div>
                        <span className={`text-xs font-bold truncate ${isSelected ? 'text-amber-300 font-extrabold' : 'text-slate-200'}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700/60 text-slate-400 shrink-0">
                        {cfg.badge}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                      {cfg.promptExample}
                    </p>

                    {/* Quick AI Trigger */}
                    <div className="pt-1 flex items-center justify-between text-[10px]">
                      <span className={`flex items-center gap-1 font-medium ${isSelected ? 'text-amber-300' : 'text-slate-500'}`}>
                        {isSelected ? <CheckCircle2 className="w-3 h-3 text-amber-400" /> : <Flame className="w-3 h-3 text-slate-500" />}
                        <span>{isSelected ? 'Prêt à l’écran' : 'Cliquer pour charger'}</span>
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAskAiForTheme(themeKey);
                        }}
                        className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center gap-1 transition cursor-pointer"
                        title="Demander à Gemini d'adapter ce thème avec vos instructions"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Créer avec Gemini</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Live Interactive Preview & Instant 1-Click Operations */}
          <div className="lg:col-span-7 flex flex-col space-y-2 max-h-[600px] overflow-y-auto">
            <div className="flex items-center justify-between shrink-0 px-1">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Aperçu HD du visuel</span>
              </span>
              <button
                type="button"
                onClick={() => handleAskAiForTheme(selectedTheme)}
                className="px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Personnaliser avec Gemini</span>
              </button>
            </div>

            {/* Meme Status & Validation Bar */}
            {currentMeme && (selectedTheme === 'MEME_OR_PUNCHLINE' || selectedTheme === 'BEFORE_AFTER') && (
              <div className="bg-gradient-to-r from-orange-950/70 via-slate-900 to-slate-950 border border-orange-500/40 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2.5 shadow-md shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-orange-300 flex items-center gap-1.5 min-w-0">
                    <Sparkles className="w-4 h-4 text-orange-400 shrink-0" />
                    <span className="truncate">Mème : <span className="text-white font-extrabold">{currentMeme.setup}</span></span>
                  </span>
                  {currentMeme.status === 'VALIDE' ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Validé
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shrink-0">
                      ⏱️ À relire
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleToggleValidateCurrentMeme}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                      currentMeme.status === 'VALIDE'
                        ? 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm font-extrabold'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{currentMeme.status === 'VALIDE' ? 'Remettre à relire' : 'Valider ce mème'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDrawMemeDay}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40 flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>Suivant</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRewriteMemeWithAi}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                    title="Réécrire ce mème avec l'IA (uniquement sur clic)"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                    <span>Réécrire avec l'IA</span>
                  </button>
                </div>
              </div>
            )}

            {/* Live Interactive Canvas Card */}
            {selectedTheme === 'TACTICAL_PUZZLE' && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-2.5 flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <Flame className="w-3.5 h-3.5" />
                    <span>Situations Réalistes à Risques (1v1 & 3 Joueurs) :</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Table épurée</span>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {[
                    { id: 'ANTI_KORA_ESCAPE' as RealisticRiskScenarioType, label: '⚡ Alerte Kora (4-0)' },
                    { id: 'CLASH_FINAL_2_2' as RealisticRiskScenarioType, label: '🔥 Tour 5 Décisif (2-2)' },
                    { id: 'OVERTRUMP_TRAP' as RealisticRiskScenarioType, label: '🧠 Piège du 4e Tour' },
                    { id: 'DISCARD_DILEMMA' as RealisticRiskScenarioType, label: '⚠️ Défausse Critique' },
                    { id: 'THREE_PLAYERS_SANDWICH' as RealisticRiskScenarioType, label: '⚔️ Table 3 Joueurs' },
                  ].map((sc) => {
                    const isSelected = selectedScenario === sc.id;
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => {
                          setSelectedScenario(sc.id);
                          setPreviewCard(createRealisticNjamboPuzzleScenario(sc.id));
                        }}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition cursor-pointer active:scale-95 ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 shadow-sm font-extrabold ring-1 ring-amber-400'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                        }`}
                      >
                        {sc.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex-1">
              <KatikaSocialCardPreview
                data={activeCardData}
                onRegenerate={() => setPreviewCard(getInstantTemplate(selectedTheme, selectedScenario))}
              />
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  </div>
  );
};
