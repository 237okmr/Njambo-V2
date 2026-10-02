/**
 * Banque locale d'histoires et de questions pour les posts (voix d'Hokuto : un pote humble qui lance un défi).
 * Sert quand l'IA n'a pas fourni de post (quota épuisé, visuel manuel, post qui répétait le visuel) :
 * le post COMPLÈTE toujours le visuel au lieu de le recopier. Coût zéro token, aucun appel réseau.
 *
 * Règles : tutoiement, argot urbain léger, jamais de « premier jeu camerounais », jamais de promesse de gain,
 * aucune mention d'argent réel (ces textes sont valables tant que Kora Cash n'est pas ouvert).
 */
export type StoryTag = 'KORA' | 'BLUFF' | 'DONNE' | 'RAGE_QUIT' | 'DEBUTANT' | 'TABLE' | 'COMMUNAUTE';
export type QuestionType = 'PRONOSTIC' | 'VOTE' | 'DEFI' | 'TAG';

export interface LocalPost {
  story: string;
  question: string;
  questionType: QuestionType;
}

export const LOCAL_STORIES: Record<StoryTag, string[]> = {
  KORA: [
    "Hier soir, à une table de quartier, un pli a tout renversé au dernier tour. Personne n'a vu le 3 arriver. Moi non plus, franchement. C'est ça qui me plaît dans ce jeu.",
    "Un 3 gardé jusqu'au bout, des adversaires qui se croient tranquilles, et boum, le cinquième pli. Je ne m'en lasse pas. Chaque Kora raconte une petite histoire.",
  ],
  BLUFF: [
    "On connaît tous celui qui fait semblant d'avoir la main. Le regard calme, la carte posée sans trembler. Au Njambo, le bluff se joue autant que les cartes.",
    "Poser une carte faible avec l'air sûr de soi, ça marche une fois sur deux. Et l'autre fois, on rigole. Le tapis ne ment jamais longtemps.",
  ],
  DONNE: [
    "Cinq cartes en main, cinq plis à jouer. Tout se décide sur ce que tu gardes et ce que tu lâches. Une bonne donne, c'est déjà la moitié du travail.",
    "Certaines donnes te sourient dès le premier pli, d'autres te demandent de la patience. L'important, c'est de savoir lesquelles tu tiens.",
  ],
  RAGE_QUIT: [
    "Perdre au dernier pli, ça pique, je sais. Mais quitter la table, c'est laisser les autres sans partie. Respire, reviens, et prends ta revanche.",
    "On a tous failli claquer la porte après un mauvais Kora. Moi le premier. Rester jusqu'au bout, c'est ça qui fait la bonne ambiance à la table.",
  ],
  DEBUTANT: [
    "Tu débutes ? Pas de stress, on a tous commencé par poser une mauvaise carte. Un tour de bêta, deux parties, et les règles te rentrent toutes seules.",
    "Les règles du Njambo tiennent en deux minutes, mais les finesses prennent des mois. C'est pour ça qu'on y revient. Viens, on t'explique à la table.",
  ],
  TABLE: [
    "Une table, trois amis, un paquet de cartes. Rien de plus, rien de moins. Je construis ce jeu pour retrouver cette ambiance, même quand on est loin les uns des autres.",
    "Le plus beau dans une partie de Njambo, c'est les commentaires autour de la table. Je voulais garder ça dans la bêta.",
  ],
  COMMUNAUTE: [
    "Je construis ce jeu petit à petit, avec les retours des joueurs de la bêta. Chaque partie que tu joues m'aide à l'améliorer. Merci d'être là.",
    "Les Maîtres du Kora grandissent doucement. Pas de grand discours, juste des parties entre potes et un jeu qui s'améliore à chaque retour.",
  ],
};

export const LOCAL_QUESTIONS: Record<QuestionType, string[]> = {
  PRONOSTIC: ["Toi, tu aurais gardé quelle carte jusqu'au dernier pli ?", 'À ton avis, qui gagne cette table ?'],
  VOTE: ['Team bluff ou team prudence ? Dis-moi en commentaire.', 'Ton 3, tu le joues tôt ou tu le gardes ?'],
  DEFI: ['Tu te sens capable de réussir un Kora ? Viens prouver ça.', 'Cap ou pas cap de gagner le prochain Kora ?'],
  TAG: ['Tag le pote qui bluffe toujours à la table !', 'Tag celui qui quitte la partie quand ça chauffe !'],
};

const QUESTION_TYPES: QuestionType[] = ['PRONOSTIC', 'VOTE', 'DEFI', 'TAG'];

/** Empreinte stable d'un texte : le même visuel donne toujours le même choix, deux visuels différents varient. */
export function hashString(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Thème de l'histoire d'après les mots du visuel. */
export function detectStoryTag(text: string): StoryTag {
  const t = (text || '').toLowerCase();
  if (/quitt|abandon|rage|forfait|claque/.test(t)) return 'RAGE_QUIT';
  if (/d[eé]butant|nouveau|bienvenue|r[eè]gle|apprendre|d[eé]couvr/.test(t)) return 'DEBUTANT';
  if (/bluff|mens|faire semblant/.test(t)) return 'BLUFF';
  if (/kora/.test(t)) return 'KORA';
  if (/donne|cartes?\b|main\b/.test(t)) return 'DONNE';
  if (/table|salon|invit|d[eé]fi/.test(t)) return 'TABLE';
  return 'COMMUNAUTE';
}

/** Type d'une question déjà écrite (par l'IA ou la banque), pour varier d'un post à l'autre. */
export function classifyQuestion(question: string): QuestionType {
  const q = (question || '').toLowerCase();
  if (/\btag\b|identifie|mentionne/.test(q)) return 'TAG';
  if (/\bcap\b|d[eé]fi|prouv|capable|rel[eè]ve/.test(q)) return 'DEFI';
  if (/team|vote|plut[oô]t|\bou\b.*\?/.test(q)) return 'VOTE';
  return 'PRONOSTIC';
}

/**
 * Choisit une histoire et une question. Les types de question à éviter (utilisés récemment) sont écartés
 * tant qu'il reste un autre type disponible.
 */
export function pickLocalPost(visualText: string, seed: string, avoidTypes: QuestionType[] = []): LocalPost {
  const hash = hashString(`${seed}|${visualText}`);
  const tag = detectStoryTag(visualText);
  const stories = LOCAL_STORIES[tag];
  const story = stories[hash % stories.length];

  const ordered = QUESTION_TYPES.map((_, i) => QUESTION_TYPES[(hash + i) % QUESTION_TYPES.length]);
  const questionType = ordered.find((type) => !avoidTypes.includes(type)) ?? ordered[0];
  const questions = LOCAL_QUESTIONS[questionType];
  const question = questions[Math.floor(hash / QUESTION_TYPES.length) % questions.length];

  return { story, question, questionType };
}
