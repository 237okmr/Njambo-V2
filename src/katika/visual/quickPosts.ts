/**
 * Publications immédiates : un visuel prêt à partager, construit sur de vraies données (moments Kora anonymes, Palmarès public)
 * ou la banque de mèmes, sans appel à l'IA ni quota. L'IA peut ensuite proposer des variantes, sur demande.
 * Anti-redite : les publications déjà proposées sur cet appareil ne reviennent pas tant qu'il en reste d'autres.
 */
import type { KoraMoment } from '../../../server/engine/koraMoment';
import { buildTrickBlock, seatLabel } from './situation';
import type { CardItem, VisualSpec } from './visualSpec';

export type QuickFormat = 'PUZZLE' | 'KORA_DAY' | 'PODIUM' | 'MEME';

export const QUICK_FORMATS: Array<{ id: QuickFormat; label: string; emoji: string }> = [
  { id: 'PUZZLE', label: 'Casse-tête', emoji: '🃏' },
  { id: 'KORA_DAY', label: 'Vrai Kora', emoji: '⚡' },
  { id: 'PODIUM', label: 'Podium', emoji: '🏆' },
  { id: 'MEME', label: 'Mème', emoji: '😂' },
];

export interface QuickPost {
  format: QuickFormat;
  /** Identifiant de contenu, pour ne pas reproposer la même publication. */
  key: string;
  spec: VisualSpec;
  caption: string;
  /** Casse-tête : la réponse, à publier le lendemain. */
  answer?: string;
  /** Moment réel illustré, transmis à l'IA si l'on demande des variantes. */
  moment?: KoraMoment;
  /** Consigne donnée à l'IA pour proposer 3 variantes du même sujet. */
  aiBrief: string;
}

export interface PodiumPlayer {
  name: string;
  score: number;
  title?: string;
}

const FOOTER = { text: 'njambo-kora.ai.studio', app: true, whatsapp: true };
const HASHTAGS = '#NjamboKora #JeuDeCartes';

const card = (play: { rank: string; suit: string }) => `${play.rank}${play.suit}`;

function pickUnused<T>(items: T[], keyOf: (item: T) => string, recentKeys: string[]): T | null {
  return items.find((item) => !recentKeys.includes(keyOf(item))) ?? items[0] ?? null;
}

/** Casse-tête à vote : un vrai pli, deux cartes candidates, « qui le remporte ? ». La réponse vient de la partie. */
export function buildPuzzlePost(moments: KoraMoment[], recentKeys: string[]): QuickPost | null {
  const candidates = moments.flatMap((m) =>
    m.tricks
      .filter((t) => t.number < 5 && t.plays.length >= 3 && t.winnerSeat !== null)
      .map((t) => ({ moment: m, trick: t, key: `PUZZLE:${m.id}:${t.number}` }))
  );
  const chosen = pickUnused(candidates, (c) => c.key, recentKeys);
  if (!chosen) return null;
  const { moment, trick, key } = chosen;
  const winner = trick.plays.find((p) => p.seat === trick.winnerSeat)!;
  const other = trick.plays.find((p) => p.seat !== trick.winnerSeat && p !== trick.plays[0]) ?? trick.plays.find((p) => p.seat !== trick.winnerSeat)!;
  // L'ordre A / B dépend du moment, pas du hasard : la même proposition reste la même.
  const winnerFirst = moment.id.length % 2 === 0;
  const [a, b] = winnerFirst ? [winner, other] : [other, winner];
  const cards: CardItem[] = trick.plays.slice(0, 4).map((p) => ({ rank: p.rank, suit: p.suit, player: seatLabel(p.seat) }));
  const spec: VisualSpec = {
    version: 2,
    format: 'SQUARE',
    palette: 'EMERALD_GOLD',
    pattern: 'NDOP_CHEVRON',
    blocks: [
      { id: 'badge', type: 'BADGE', text: `CASSE-TÊTE · TOUR ${trick.number}`, priority: 2 },
      { id: 'hook', type: 'HOOK', text: 'Qui remporte ce pli ?', priority: 1 },
      { id: 'cards', type: 'CARDS', cards, arrangement: 'TRICK', priority: 1 },
      {
        id: 'choices',
        type: 'BULLETS',
        style: 'NUMBER',
        items: [`A : ${seatLabel(a.seat)} avec ${card(a)}`, `B : ${seatLabel(b.seat)} avec ${card(b)}`],
        priority: 1,
      },
    ],
    cta: { text: 'Vote A ou B', intent: 'COMMENT' },
    footer: FOOTER,
    meta: { presetId: 'QUICK_PUZZLE', source: 'PRESET' },
  };
  const letter = a === winner ? 'A' : 'B';
  return {
    format: 'PUZZLE',
    key,
    spec,
    moment,
    caption: `Une vraie main jouée sur Njambo Kora. Qui remporte ce pli : A ou B ? Réponds en commentaire, la réponse tombe demain 👇\n${HASHTAGS}`,
    answer: `Réponse : ${letter} ! ${seatLabel(winner.seat)} remporte le pli avec ${card(winner)}, la plus forte carte de la couleur demandée (${trick.plays[0].suit}). Bravo à ceux qui l'avaient vu 👏`,
    aiBrief: `Crée un casse-tête à vote « Qui remporte ce pli ? A ou B » à partir de ce vrai pli, sans donner la réponse.`,
  };
}

/** Vrai Kora du jour : le dernier pli d'un vrai Kora, cartes exactes, joueurs anonymes. */
export function buildKoraDayPost(moments: KoraMoment[], recentKeys: string[]): QuickPost | null {
  const moment = pickUnused(moments, (m) => `KORA:${m.id}`, recentKeys);
  if (!moment) return null;
  const trick = buildTrickBlock(moment, 'cards');
  if (!trick) return null;
  const double = moment.kind === 'DOUBLE_KORA';
  const spec: VisualSpec = {
    version: 2,
    format: 'SQUARE',
    palette: 'EBONY_GOLD',
    pattern: 'DIAMONDS',
    blocks: [
      { id: 'badge', type: 'BADGE', text: double ? 'VRAI DOUBLE KORA' : 'VRAI KORA DU JOUR', priority: 2 },
      { id: 'hook', type: 'HOOK', text: double ? 'Double Kora sur la table !' : 'Le Kora du jour', accentWords: ['Kora'], priority: 1 },
      trick,
      { id: 'body', type: 'BODY', text: 'Une vraie partie, cartes exactes, joueurs anonymes.', priority: 3 },
    ],
    cta: { text: 'À toi de jouer', intent: 'PLAY' },
    footer: FOOTER,
    meta: { presetId: 'QUICK_KORA_DAY', source: 'PRESET' },
  };
  return {
    format: 'KORA_DAY',
    key: `KORA:${moment.id}`,
    spec,
    moment,
    caption: `${double ? 'Un Double Kora' : 'Un Kora'} réussi pour de vrai sur Njambo Kora 🔥 Le dernier pli avec un 3, ça se mérite. Tu l'aurais vu venir ?\n${HASHTAGS}`,
    aiBrief: `Crée un visuel pour ce vrai ${double ? 'Double Kora' : 'Kora'} de la table.`,
  };
}

const formatScore = (n: number) => n.toLocaleString('fr-FR');

/** Podium du Palmarès : les 3 premiers, avec leur pseudo public et leur rang. */
/** Le podium n'a qu'une version à la fois : il est reproposé même s'il l'a déjà été (recentKeys n'est pas utilisé). */
export function buildPodiumPost(players: PodiumPlayer[], _recentKeys: string[], today: string): QuickPost | null {
  const top = players.filter((p) => p.name && Number.isFinite(p.score)).slice(0, 3);
  if (top.length === 0) return null;
  const key = `PODIUM:${today}:${top.map((p) => p.name).join('|')}`;
  const medals = ['🥇', '🥈', '🥉'];
  const spec: VisualSpec = {
    version: 2,
    format: 'SQUARE',
    palette: 'ROYAL_SAPPHIRE',
    pattern: 'NDOP_CHEVRON',
    blocks: [
      { id: 'badge', type: 'BADGE', text: 'PALMARÈS NJAMBO KORA', priority: 2 },
      { id: 'hook', type: 'HOOK', text: 'Qui va les détrôner ?', priority: 1 },
      {
        id: 'podium',
        type: 'BULLETS',
        style: 'NUMBER',
        items: top.map((p, i) => `${medals[i]} ${p.name} · ${formatScore(p.score)} pts${p.title ? ` · ${p.title}` : ''}`.slice(0, 60)),
        priority: 1,
      },
    ],
    cta: { text: 'Défie-les', intent: 'PLAY' },
    footer: FOOTER,
    meta: { presetId: 'QUICK_PODIUM', source: 'PRESET' },
  };
  return {
    format: 'PODIUM',
    key,
    spec,
    caption: `Le podium du Palmarès en ce moment : ${top.map((p, i) => `${medals[i]} ${p.name}`).join(', ')}. Qui va les faire descendre ? Tag un pote qui peut le faire 👇\n${HASHTAGS}`,
    aiBrief: `Crée un visuel podium du Palmarès avec ces vrais joueurs : ${top.map((p) => `${p.name} (${p.score} points)`).join(', ')}. Termine par un défi « Qui va les détrôner ? ».`,
  };
}

// ---------- Anti-redite (cet appareil) ----------

const HISTORY_KEY = 'katika_quick_posts_v1';
const HISTORY_SIZE = 40;

export function getRecentQuickKeys(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberQuickKey(key: string): void {
  try {
    const next = [key, ...getRecentQuickKeys().filter((k) => k !== key)].slice(0, HISTORY_SIZE);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // stockage indisponible : l'anti-redite ne joue simplement pas
  }
}
