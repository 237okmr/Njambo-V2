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
  Share2,
  Copy,
  Check,
  Flame,
  CheckCircle2,
  ArrowRight,
  Package,
  Calendar,
  Download,
  Smartphone,
  RefreshCw,
} from 'lucide-react';
import {
  SocialVisualTheme,
  SocialVisualCardData,
  SOCIAL_THEMES_CONFIG,
  NJAMBO_APP_URL,
  NJAMBO_DOMAIN,
  NJAMBO_WHATSAPP_GROUP_URL,
  getFormattedCaptionForPlatform,
  getWhatsAppStatusCaption,
} from '../types/socialVisuals';
import {
  drawRandomMeme,
  convertMemeToSocialCardData,
  saveMemeStatus,
  MemeEntry,
} from '../data/memeBank';
import { KatikaSocialCardPreview } from '../components/social/KatikaSocialCardPreview';
import { KatikaVisualComposer } from '../components/social/KatikaVisualComposer';
import { downloadSocialVisualPng } from '../utils/socialVisualCanvasRenderer';

export interface WeeklyKitItem {
  id: string;
  day: 'LUNDI' | 'MERCREDI' | 'VENDREDI';
  dayBadge: string;
  dayTitle: string;
  cardData: SocialVisualCardData;
  status: 'A_RELIRE' | 'PRET';
  memeEntry?: MemeEntry | null;
}

interface KatikaMobileSocialStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendToAi: (prompt: string) => void;
  metricsSnapshot?: any;
}

export const KatikaMobileSocialStudioModal: React.FC<KatikaMobileSocialStudioModalProps> = ({
  isOpen,
  onClose,
  onSendToAi,
  metricsSnapshot,
}) => {
  const [selectedTheme, setSelectedTheme] = useState<SocialVisualTheme>('STAT_OF_THE_WEEK');
  const [previewCard, setPreviewCard] = useState<SocialVisualCardData | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [currentMeme, setCurrentMeme] = useState<MemeEntry | null>(null);
  const [studioMode, setStudioMode] = useState<'CLASSIC' | 'COMPOSER'>('CLASSIC');

  const [weeklyKitMode, setWeeklyKitMode] = useState<boolean>(false);
  const [weeklyKitItems, setWeeklyKitItems] = useState<WeeklyKitItem[]>([]);
  const [copiedItemAction, setCopiedItemAction] = useState<{ id: string; action: string } | null>(null);

  if (!isOpen) return null;

  const totalManches = metricsSnapshot?.summary?.totalManches ?? null;
  const koraCount = metricsSnapshot?.kpis?.allTime?.koraCount ?? null;

  // Instant template data generator with real metrics
  const getInstantTemplate = (theme: SocialVisualTheme): SocialVisualCardData => {
    switch (theme) {
      case 'STAT_OF_THE_WEEK':
        return {
          theme: 'STAT_OF_THE_WEEK',
          badge: 'CHIFFRE DE LA SEMAINE 🃏',
          headline: totalManches != null ? `${totalManches} manches disputées cette semaine !` : 'Bilan hebdomadaire de l’arène',
          mainText: totalManches != null
            ? `Les Maîtres du Kora ont fait trembler la table avec ${koraCount ?? 0} Kora spectaculaires validés sur Katika.`
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
            ? `🃏 CHIFFRE DE LA SEMAINE NJAMBO KORA 🔥\n\nC'est le grand bilan de l'arène : cette semaine, pas moins de ${totalManches} manches ont été disputées par nos joueurs !\n\nAu total, ${koraCount ?? 0} Kora ont retourné des donnes in extremis au 5e tour avec un 3 posé au moment décisif !\n\n👉 Vous étiez de la partie ? Combien de Kora avez-vous validés cette semaine ? Dites-le-nous en commentaire !\n\n🎮 Lien du jeu en bêta (PC & Mobile) : ${NJAMBO_APP_URL}\n💬 Rejoins notre groupe WhatsApp officiel : ${NJAMBO_WHATSAPP_GROUP_URL}`
            : `🃏 CHIFFRE DE LA SEMAINE NJAMBO KORA 🔥\n\nLes statistiques de la semaine sont en cours de synchronisation dans l'arène Katika.\n\n🎮 Lien du jeu en bêta (PC & Mobile) : ${NJAMBO_APP_URL}\n💬 Rejoins notre groupe WhatsApp officiel : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: totalManches != null
            ? `🃏 *CHIFFRE DE LA SEMAINE NJAMBO KORA* 🔥\n\n*${totalManches} manches* jouées et *${koraCount ?? 0} Kora* spectaculaires !\n\n👉 *Joue en bêta en ligne :* ${NJAMBO_APP_URL}\n💬 *Rejoins le groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`
            : `🃏 *CHIFFRE DE LA SEMAINE NJAMBO KORA* 🔥\n\nStatistiques en cours de calcul.\n\n👉 *Joue en bêta en ligne :* ${NJAMBO_APP_URL}\n💬 *Rejoins le groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
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
          ctaText: 'Viens tester ton niveau • Gratuit',
          linkUrl: `${NJAMBO_DOMAIN} • Groupe WhatsApp`,
          postCaption: `🎙️ LA PAROLE DU JOUEUR DU JOUR !\n\n« Quand tu places le Double Kora au 5e tour alors que ton adversaire croyait avoir la main... la table entière se tait. » — Témoignage joueur.\n\nC'est cette tension, ce bluff et ce respect du jeu qui font la légende du Njambo Kora.\n\n🎮 Viens défier les maîtres : ${NJAMBO_APP_URL}\n💬 Rejoins notre communauté WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🎙️ *PAROLE DE JOUEUR AU NJAMBO !* 🇨🇲\n\n« Quand tu places le Double Kora au 5e tour, la table entière se tait. »\n\n👉 *Joue maintenant :* ${NJAMBO_APP_URL}\n💬 *Rejoins le groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#NjamboKora', '#CitationJoueur', '#DoubleKora', '#JeuxTraditionnels'],
        };

      case 'BEFORE_AFTER':
        return {
          theme: 'BEFORE_AFTER',
          badge: 'ÉVOLUTION DU JEU ⚡',
          headline: 'Une fluidité de donne inédite',
          mainText: 'Avant vs Maintenant : des donnes plus rapides, une détection Kora instantanée et des effets de jetons animés.',
          comparison: {
            beforeTitle: 'Avant',
            beforeText: 'Temps de réflexion figé, sans retour visuel dynamique sur les tours.',
            afterTitle: 'Maintenant dans Katika ⚡',
            afterText: 'Timer adaptatif, distribution streamée et alerte Kora Hunter en direct.',
          },
          ctaText: 'Découvre la nouvelle version • Gratuit',
          linkUrl: `${NJAMBO_DOMAIN} • Rejoins la bêta`,
          postCaption: `⚡ COULISSES & AMÉLIORATIONS NJAMBO KORA !\n\nGrâce aux retours des joueurs, le moteur de jeu vient de franchir un cap :\n\n✅ Donnes ultra-fluides avec animations soignées\n✅ Détection instantanée du Kora et du Double Kora\n✅ Sons immersifs de la table et des jetons\n\nVenez tester dès maintenant sur votre téléphone ou PC ! 👇\n🎮 ${NJAMBO_APP_URL}\n💬 Donne tes impressions sur WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `⚡ *NOUVELLE MISE À JOUR NJAMBO KORA !* 🇨🇲\n\nPlus fluide, plus rapide, animations et sons immersifs !\n\n👉 *Teste en direct :* ${NJAMBO_APP_URL}\n💬 *Rejoins la bêta sur WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#Coulisses', '#MiseAJour', '#GameDesign', '#NjamboKora', '#GamingAfrica'],
        };

      case 'TIP_OR_RULE':
        return {
          theme: 'TIP_OR_RULE',
          badge: 'ASTUCE STRATÉGIQUE 💡',
          headline: 'Le secret du Kora au 5e tour',
          mainText: 'Ne gaspillez jamais vos cartes maîtresses (10 ou 9) dès l\'entame si vous préparez un Kora avec votre 3 au 5e tour. Gardez le contrôle de la couleur demandée jusqu’au bout !',
          palette: 'ROYAL_SAPPHIRE',
          decorativeCards: [
            { rank: '9', suit: '♠', label: 'BLACK' },
            { rank: '3', suit: '♥', label: '3 KOUBI' },
          ],
          ctaText: 'Pratique ton bluff dès maintenant',
          linkUrl: `${NJAMBO_DOMAIN} • Astuces`,
          postCaption: `💡 ASTUCE DE MAÎTRE : Le piège du 5e tour !\n\nBeaucoup de débutants se précipitent et gaspillent leurs cartes maîtresses dès l'entame. Erreur fatale ! Au Njambo Kora, remporter le 5e tour avec son 3 nécessite d'observer les défausses et d'anticiper la couleur menée.\n\n🎮 Joue gratuitement en ligne : ${NJAMBO_APP_URL}\n💬 Échange tes tactiques sur notre groupe WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `💡 *ASTUCE NJAMBO DU JOUR !* 🇨🇲\n\nObserve les défausses et prépare ton 3 pour le 5e tour décisif !\n\n👉 *Lien du jeu :* ${NJAMBO_APP_URL}\n💬 *Groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#NjamboKora', '#AstuceKora', '#StrategieCartes', '#GamingAfrique'],
        };

      case 'CULTURE_NJAMBO':
        return {
          theme: 'CULTURE_NJAMBO',
          badge: 'CULTURE & TRADITION 🇨🇲',
          headline: 'Le Njambo : Bien plus qu’un jeu de cartes',
          mainText: 'Né au cœur des quartiers de Yaoundé et Douala, le Njambo Kora est une véritable joute d’esprit, de bravoure et de convivialité intergénérationnelle.',
          ctaText: 'Fais vivre la tradition en ligne',
          linkUrl: `${NJAMBO_DOMAIN} • Tradition 237`,
          postCaption: `🇨🇲 LE NJAMBO KORA : UN PATRIMOINE VIVANT !\n\nAutour d'une table en bois, sous une véranda ou lors des grandes veillées, le Njambo a toujours rassemblé les passionnés de cartes. Aujourd'hui, Katika numérise fidèlement chaque subtilité de ce trésor camerounais !\n\n🎮 Joue au Njambo en ligne : ${NJAMBO_APP_URL}\n💬 Communauté WhatsApp officielle : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🇨🇲 *LE NJAMBO KORA, FIERTÉ DU MBOA !* 🃏\n\nRetrouve les sensations authentiques de nos tables de quartier !\n\n👉 *Joue gratuitement :* ${NJAMBO_APP_URL}\n💬 *Rejoins le groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#NjamboKora', '#CultureCamerounaise', '#PatrimoineAfricain', '#Fierte237'],
        };

      case 'HIGHLIGHT_MOMENT':
        return {
          theme: 'HIGHLIGHT_MOMENT',
          badge: 'ACTION DE LÉGENDE 🏆',
          headline: 'Le Double Kora qui a retourné la table !',
          mainText: 'Mené au score, ce joueur n\'a rien lâché et a verrouillé la donne avec un Double Kora magistral aux 4e et 5e tours avec ses 3 !',
          ctaText: 'Toi aussi tente le coup parfait • Gratuit',
          linkUrl: `${NJAMBO_DOMAIN} • Moment fort`,
          postCaption: `🏆 COUP DE MAÎTRE DANS L'ARÈNE !\n\nCertains tours restent gravés dans les mémoires : mené au score, ce joueur n'a rien lâché et a verrouillé la donne avec un Double Kora magistral !\n\n🎮 Tente le coup parfait en ligne : ${NJAMBO_APP_URL}\n💬 Partage tes plus beaux tours sur WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🏆 *COUP DE MAÎTRE DANS L'ARÈNE !* 🇨🇲\n\nMené au score, il claque un Double Kora au 5e tour et rafle la mise !\n\n👉 *Viens défier la table :* ${NJAMBO_APP_URL}\n💬 *Groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#MomentFort', '#DoubleKora', '#Remontada', '#NjamboKora', '#Victoire'],
        };

      case 'COMMUNITY_QUESTION':
        return {
          theme: 'COMMUNITY_QUESTION',
          badge: 'À VOUS LA PAROLE 🗣️',
          headline: 'Vous jouez plutôt en duel ou à 4 joueurs ?',
          mainText: 'Le tête-à-tête ultra tactique ou la grande table animée entre amis ? Dites-nous votre format préféré !',
          options: ['En duel 1v1 ultra tactique', 'À 4 joueurs sur table animée'],
          ctaText: 'Donne ton avis en commentaire',
          linkUrl: `${NJAMBO_DOMAIN} • Sondage`,
          postCaption: `🗣️ QUESTION À LA COMMUNAUTÉ NJAMBO !\n\nAu Njambo Kora, chaque format a ses adeptes :\n\n1️⃣ Le duel 1v1 : où chaque tour est une guerre psychologique directe.\n2️⃣ La table à 4 : ambiance surchauffée, feintes et chambrages bon enfant.\n\nVous êtes plutôt quelle école ? Votez en commentaire ! 💬\n\n🎮 Joue ton format préféré : ${NJAMBO_APP_URL}\n💬 Participe au sondage sur WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🗣️ *QUESTION À LA COMMUNAUTÉ !* 🇨🇲\n\nPlutôt duel 1v1 intense ou table à 4 surchauffée ?\n\n👉 *Lance une partie :* ${NJAMBO_APP_URL}\n💬 *Donne ton avis sur le groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#DebatNjambo', '#CommunauteGaming', '#Sondage', '#Cameroun'],
        };

      case 'JOIN_INVITATION':
        return {
          theme: 'JOIN_INVITATION',
          badge: 'NJAMBO KORA LIVE 🔥',
          headline: 'Arène de cartes 100% en direct !',
          mainText: 'Rejoignez la table multijoueur dès aujourd’hui et défiez les maîtres du pays en temps réel.',
          ctaText: 'Jouer gratuitement en ligne',
          linkUrl: `${NJAMBO_DOMAIN} • Rejoins-nous`,
          postCaption: `🔥 Rejoins les tables de Njambo Kora en ligne ! Défie tes amis en direct sur mobile ou ordinateur :\n\n🎮 Lien du jeu : ${NJAMBO_APP_URL}\n💬 Groupe WhatsApp officiel : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🔥 *REJOINS LES TABLES DE NJAMBO KORA EN LIGNE !* 🇨🇲\n\nJoue directement sur ton téléphone ou PC, sans installation !\n\n👉 *Lien du jeu :* ${NJAMBO_APP_URL}\n💬 *Rejoins notre groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          hashtags: ['#NjamboKora', '#JeuEnLigne', '#Kora', '#AfriqueGaming'],
        };

      case 'TOURNAMENT_ANNOUNCEMENT':
        return {
          theme: 'TOURNAMENT_ANNOUNCEMENT',
          badge: 'GRAND TOURNOI NJAMBO 🏆',
          headline: 'Le Grand Clash du Samedi Soir',
          mainText: 'Affrontez les meilleurs maîtres dans une arène sans pitié ! Inscriptions ouvertes et direct retransmis.',
          palette: 'EBONY_GOLD',
          eventDetails: {
            date: 'Samedi • 21h00',
            prizePool: 'Dotation à annoncer',
            mode: 'Table à 4 • Élimination',
            spotsRemaining: '32 Places',
          },
          ctaText: 'Inscris-toi • Gratuit',
          linkUrl: `${NJAMBO_DOMAIN} • WhatsApp officiel`,
          postCaption: `🏆 GRAND TOURNOI NJAMBO DU WEEK-END ! 🇨🇲\n\nDotation à annoncer (jetons virtuels). 32 places max !\n\n🎮 Lien du jeu : ${NJAMBO_APP_URL}\n💬 Inscriptions sur le groupe WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🏆 *TOURNOI NJAMBO SAMEDI 21H !* 🇨🇲\n\nDotation à annoncer ! Rejoins la table :\n👉 ${NJAMBO_APP_URL}\n💬 *Inscriptions sur le groupe WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          aiImagePrompt: `Cinematic 8k photography of a card game trophy tournament table, Ndop gold details, volumetric dramatic lighting.`,
          hashtags: ['#TournoiNjambo', '#MaitresDuKora', '#DoubleKora'],
        };

      case 'TACTICAL_PUZZLE':
        return {
          theme: 'TACTICAL_PUZZLE',
          badge: 'CASSE-TÊTE DU JOUR 🧩',
          headline: 'Tour 4 : Quel coup sauve la donne ?',
          mainText: 'L’adversaire abat le 8♥. Quelle carte joues-tu pour bloquer son Kora ?',
          palette: 'ROYAL_SAPPHIRE',
          puzzleCards: [
            { rank: '9', suit: '♠', label: 'OPTION A' },
            { rank: '7', suit: '♣', label: 'OPTION B', isBestMove: true },
            { rank: '10', suit: '♦', label: 'OPTION C' },
          ],
          ctaText: 'Donne ton choix en commentaire 👇',
          linkUrl: `${NJAMBO_DOMAIN} • Défi Tactique`,
          postCaption: `🧩 CASSE-TÊTE DU JOUR : Quel coup joues-tu au 4e tour ? Vote A, B ou C ! 👇\n\n🎮 Teste la situation en direct : ${NJAMBO_APP_URL}\n💬 Débats avec nous sur WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `🧩 *DÉFI TACTIQUE NJAMBO !* 🇨🇲\n\nQuelle carte abats-tu au 4e tour ? Teste en direct :\n👉 ${NJAMBO_APP_URL}\n💬 *Débats la solution sur WhatsApp :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          aiImagePrompt: `Close-up shot of three vintage playing cards on blue felt table with golden dramatic rim lighting.`,
          hashtags: ['#CasseTeteNjambo', '#TactiqueDuJour'],
        };

      case 'MEME_OR_PUNCHLINE':
        return {
          theme: 'MEME_OR_PUNCHLINE',
          badge: 'HUMOUR NJAMBO 😂',
          headline: '« J’ai une main pourrie, je joue au hasard... »',
          mainText: 'Le gars qui te dit qu’il n’a rien reçu, et qui te claque un Kora avec son 3 au 5e tour !',
          palette: 'SUNSET_TERRACOTTA',
          heroCard: {
            rank: '3',
            suit: '♥',
            label: 'LE KORA ! 💥',
          },
          ctaText: 'Identifie ce menteur 🤣',
          linkUrl: `${NJAMBO_DOMAIN} • Humour 237`,
          postCaption: `😂 On a tous ce joueur à la table ! Tague ton pote en commentaire ! 🃏👇\n\n🎮 Joue gratuitement au Njambo : ${NJAMBO_APP_URL}\n💬 Rejoins les délires sur WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `😂 « J'ai une main pourrie... » et BAM Kora au 3 au 5e tour ! 🃏🤣\n\n👉 *Viens jouer :* ${NJAMBO_APP_URL}\n💬 *Groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          aiImagePrompt: `Funny candid high contrast portrait of smiling African man revealing a winning card under wooden table, evening lights.`,
          hashtags: ['#NjamboMeme', '#HumourCameroun'],
        };

      case 'CAROUSEL_SLIDE':
      default:
        return {
          theme: 'CAROUSEL_SLIDE',
          badge: 'GUIDE TACTIQUE 📚 (1/3)',
          headline: 'Ne Subis Plus Jamais de Kora',
          mainText: 'Règle #1 : La mémorisation des tours. Observe toujours les cartes maîtresses tombées.',
          palette: 'EMERALD_GOLD',
          carouselStep: {
            current: 1,
            total: 3,
            stepTitle: 'La Mémorisation',
          },
          ctaText: 'Glisse pour la suite ➔',
          linkUrl: `${NJAMBO_DOMAIN} • Guide`,
          postCaption: `📚 Guide express pour maîtriser le Njambo Kora ! Glisse pour lire la suite ! 🃏\n\n🎮 Entraîne-toi dès maintenant : ${NJAMBO_APP_URL}\n💬 Astuces sur le groupe WhatsApp : ${NJAMBO_WHATSAPP_GROUP_URL}`,
          whatsAppMessage: `📚 *ASTUCE NJAMBO :* Observe toujours les cartes maîtresses tombées aux premiers tours avant de jouer ton 3 !\n\n👉 *Viens t'entraîner gratuitement :* ${NJAMBO_APP_URL}\n💬 *Rejoins notre groupe WhatsApp officiel :* ${NJAMBO_WHATSAPP_GROUP_URL}`,
          aiImagePrompt: `Modern minimalist African graphic card poster, geometric Ndop border, golden accents.`,
          hashtags: ['#GuideNjambo', '#CamerounGaming'],
        };
    }
  };

  const activeCardData = previewCard || getInstantTemplate(selectedTheme);

  const getThemeIcon = (theme: SocialVisualTheme) => {
    switch (theme) {
      case 'STAT_OF_THE_WEEK':
        return <BarChart3 className="w-3.5 h-3.5" />;
      case 'TESTIMONIAL':
        return <Quote className="w-3.5 h-3.5" />;
      case 'BEFORE_AFTER':
        return <Layers className="w-3.5 h-3.5" />;
      case 'TIP_OR_RULE':
        return <HelpCircle className="w-3.5 h-3.5" />;
      case 'CULTURE_NJAMBO':
        return <Flame className="w-3.5 h-3.5" />;
      case 'HIGHLIGHT_MOMENT':
        return <Trophy className="w-3.5 h-3.5" />;
      case 'COMMUNITY_QUESTION':
        return <MessageSquare className="w-3.5 h-3.5" />;
      case 'JOIN_INVITATION':
        return <UserPlus className="w-3.5 h-3.5" />;
      case 'TOURNAMENT_ANNOUNCEMENT':
        return <Trophy className="w-3.5 h-3.5 text-amber-400" />;
      case 'TACTICAL_PUZZLE':
        return <HelpCircle className="w-3.5 h-3.5 text-blue-400" />;
      case 'MEME_OR_PUNCHLINE':
        return <Sparkles className="w-3.5 h-3.5 text-orange-400" />;
      case 'CAROUSEL_SLIDE':
        return <Layers className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Sparkles className="w-3.5 h-3.5" />;
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
        dayTitle: 'Lundi • Mème Njambo (M1)',
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
    setCopiedItemAction({ id: itemId, action: 'PNG téléchargé !' });
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
    setCopiedItemAction({ id: itemId, action: 'Texte Facebook copié !' });
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
    setCopiedItemAction({ id: itemId, action: 'Message WhatsApp copié !' });
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
    setCopiedItemAction({ id: itemId, action: 'Statut WhatsApp copié !' });
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
    setCopiedItemAction({ id: 'all', action: '3 visuels téléchargés !' });
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

  const handleSelectTheme = (theme: SocialVisualTheme) => {
    setSelectedTheme(theme);
    if (theme === 'MEME_OR_PUNCHLINE' || theme === 'BEFORE_AFTER') {
      if (!currentMeme) {
        const meme = drawRandomMeme();
        setCurrentMeme(meme);
        setPreviewCard(convertMemeToSocialCardData(meme));
        return;
      }
    }
    setPreviewCard(getInstantTemplate(theme));
  };

  const handleAskAiForTheme = (theme: SocialVisualTheme) => {
    const cfg = SOCIAL_THEMES_CONFIG[theme];
    const prompt = `Génère un visuel pour réseaux sociaux sur le thème '${cfg.label}' (${cfg.badge}). Utilise les statistiques actuelles de la plateforme. Retourne UNIQUEMENT le JSON de la carte visuelle.`;
    onSendToAi(prompt);
    onClose();
  };

  const handleCopyCaption = () => {
    if (!activeCardData.postCaption) return;
    const fullText = `${activeCardData.postCaption}\n\n${(activeCardData.hashtags || []).join(' ')}`;
    navigator.clipboard.writeText(fullText).catch(() => {});
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col justify-end sm:justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/95 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Studio Visuels Réseaux</h2>
              <p className="text-[10px] text-slate-400">Créez & exportez vos posts officiels</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setStudioMode('CLASSIC')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                  studioMode === 'CLASSIC'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Classique
              </button>
              <button
                type="button"
                onClick={() => setStudioMode('COMPOSER')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                  studioMode === 'COMPOSER'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                Composer V2
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {studioMode === 'COMPOSER' ? (
          <div className="flex-1 overflow-y-auto p-3">
            <KatikaVisualComposer onClose={onClose} />
          </div>
        ) : (
        /* Scrollable Body */
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Quick Action: Kit de la semaine & Meme du Jour */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleOpenWeeklyKit}
              className={`py-2.5 px-3 rounded-xl active:scale-[0.99] font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition ${
                weeklyKitMode
                  ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 text-slate-950 ring-2 ring-amber-400'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
              }`}
              title="Générer automatiquement le kit de promotion hebdomadaire"
            >
              <Package className="w-4 h-4 text-amber-400 fill-amber-400/20" />
              <span>📦 Kit Semaine</span>
            </button>

            <button
              type="button"
              onClick={handleDrawMemeDay}
              className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 active:scale-[0.99] text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
              title="Tirer un mème prêt à l'emploi (0 coût en tokens)"
            >
              <Sparkles className="w-4 h-4 fill-slate-950 text-slate-950" />
              <span>🃏 Mème du jour</span>
            </button>
          </div>

          {weeklyKitMode ? (
            <div className="flex flex-col space-y-4">
              {/* Kit Info & Progress Bar */}
              <div className="bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-950 border border-amber-500/40 rounded-2xl p-3 flex flex-col gap-2.5 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-extrabold text-white">Kit Hebdomadaire (3 Posts)</span>
                  </div>
                  <span className="text-[10px] font-bold text-amber-400 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
                    {weeklyKitItems.filter((i) => i.status === 'PRET').length}/3 prêts
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 leading-snug">
                  Lundi (Mème M1) • Mercredi ({totalManches ? 'Chiffre clé' : 'Question communauté'}) • Vendredi (Invitation Groupe).
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleDownloadAllKit}
                    className="py-1.5 px-2 rounded-xl text-[11px] font-extrabold bg-amber-500 text-slate-950 flex items-center justify-center gap-1 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tout (3 PNG)</span>
                  </button>

                  <button
                    type="button"
                    onClick={initWeeklyKit}
                    className="py-1.5 px-2 rounded-xl text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Régénérer</span>
                  </button>
                </div>
              </div>

              {/* Toast Feedback */}
              {copiedItemAction && (
                <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{copiedItemAction.action}</span>
                </div>
              )}

              {/* Items List */}
              <div className="flex flex-col space-y-4">
                {weeklyKitItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex flex-col space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-extrabold shrink-0">
                          {item.dayBadge}
                        </span>
                        <span className="text-xs font-bold text-slate-200 truncate">
                          {item.dayTitle}
                        </span>
                      </div>

                      {item.status === 'PRET' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>✅ Prêt</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shrink-0">
                          <span>⏱️ À relire</span>
                        </span>
                      )}
                    </div>

                    <div className="bg-slate-900/60 rounded-xl overflow-hidden p-1 border border-slate-800/60 flex items-center justify-center">
                      <KatikaSocialCardPreview data={item.cardData} initialPhonePreview={true} />
                    </div>

                    <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-800/80">
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDownloadItemPng(item.id)}
                          className="py-1.5 px-2 rounded-xl text-[11px] font-bold bg-amber-500 text-slate-950 flex items-center justify-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>PNG</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyItemFacebook(item.id)}
                          className="py-1.5 px-2 rounded-xl text-[11px] font-bold bg-blue-600/20 text-blue-300 border border-blue-500/40 flex items-center justify-center gap-1"
                        >
                          <Copy className="w-3 h-3 text-blue-400" />
                          <span>Facebook</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyItemWhatsAppGroup(item.id)}
                          className="py-1.5 px-2 rounded-xl text-[11px] font-bold bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 flex items-center justify-center gap-1"
                        >
                          <MessageSquare className="w-3 h-3 text-emerald-400" />
                          <span>Groupe WApp</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyItemWhatsAppStatus(item.id)}
                          className="py-1.5 px-2 rounded-xl text-[11px] font-bold bg-emerald-800/20 text-emerald-300 border border-emerald-600/40 flex items-center justify-center gap-1"
                        >
                          <Smartphone className="w-3 h-3 text-emerald-400" />
                          <span>Statut WApp</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRewriteItemWithAi(item.id)}
                        className="w-full py-1 px-2 rounded-xl text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30 flex items-center justify-center gap-1"
                      >
                        <Sparkles className="w-3 h-3 text-purple-300" />
                        <span>Réécrire avec l'IA</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>

          {/* Theme Horizontal Selector */}
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Choisir un thème de post
            </span>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {(Object.keys(SOCIAL_THEMES_CONFIG) as SocialVisualTheme[]).map((themeKey) => {
                const cfg = SOCIAL_THEMES_CONFIG[themeKey];
                const isSelected = selectedTheme === themeKey;
                return (
                  <button
                    key={themeKey}
                    type="button"
                    onClick={() => handleSelectTheme(themeKey)}
                    className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                    }`}
                  >
                    {getThemeIcon(themeKey)}
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Meme Status & Validation Bar */}
          {currentMeme && (selectedTheme === 'MEME_OR_PUNCHLINE' || selectedTheme === 'BEFORE_AFTER') && (
            <div className="bg-gradient-to-r from-orange-950/70 via-slate-900 to-slate-950 border border-orange-500/40 rounded-2xl p-3 flex flex-col gap-2.5 shadow-md">
              <div className="flex items-center justify-between gap-2">
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

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleValidateCurrentMeme}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer active:scale-95 ${
                    currentMeme.status === 'VALIDE'
                      ? 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm font-extrabold'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{currentMeme.status === 'VALIDE' ? 'À relire' : 'Valider'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDrawMemeDay}
                  className="flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40 flex items-center justify-center gap-1 transition cursor-pointer active:scale-95"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Suivant</span>
                </button>

                <button
                  type="button"
                  onClick={handleRewriteMemeWithAi}
                  className="flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 flex items-center justify-center gap-1 transition cursor-pointer active:scale-95"
                  title="Réécrire avec Gemini (sur clic)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                  <span>IA</span>
                </button>
              </div>
            </div>
          )}

          {/* AI Customization Button */}
          <button
            type="button"
            onClick={() => handleAskAiForTheme(selectedTheme)}
            className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 active:scale-[0.99] text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Personnaliser ce post avec Gemini IA</span>
          </button>

          {/* Interactive Card Canvas Preview */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-2 overflow-hidden">
            <KatikaSocialCardPreview
              data={activeCardData}
              initialPhonePreview={true}
              onRegenerate={() => setPreviewCard(getInstantTemplate(selectedTheme))}
            />
          </div>

          {/* Caption & Copy section */}
          {activeCardData.postCaption && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300">Texte prêt à publier</span>
                <button
                  type="button"
                  onClick={handleCopyCaption}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 transition cursor-pointer"
                >
                  {copiedCaption ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCaption ? 'Copié !' : 'Copier'}</span>
                </button>
              </div>
              <p className="text-xs text-slate-400 whitespace-pre-line line-clamp-4 font-sans leading-relaxed">
                {activeCardData.postCaption}
              </p>
            </div>
          )}
        </>
      )}
        </div>
      )}
      </div>
    </div>
  );
};
