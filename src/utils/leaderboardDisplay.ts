/**
 * Palmarès : ce que chaque carte affiche, selon l'onglet. Fonctions pures, sans navigateur ni réseau.
 * Le classement n'en dépend pas : ces valeurs ne servent qu'à l'affichage.
 */

import { LeaderboardCategory, LeaderboardEntry } from '../types/leaderboard';

/** 999 reste 999 ; 12 440 devient « 12,4 k » ; 125 480 « 125 k » ; 1 240 000 « 1,2 M ». */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (Math.round(abs) < 1000) return `${sign}${Math.round(abs)}`;

  const scale = (divisor: number): number => {
    const scaled = abs / divisor;
    // Une décimale tant qu'il y a la place : 12,4 k mais 125 k.
    return scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  };
  const write = (n: number, suffix: string) => `${sign}${String(n).replace('.', ',')} ${suffix}`;

  const thousands = scale(1000);
  if (thousands < 1000) return write(thousands, 'k');
  return write(scale(1000000), 'M');
}

const plural = (count: number, singular: string, pluralForm: string) => (Math.abs(count) > 1 ? pluralForm : singular);

export type LeaderboardTone = 'gold' | 'positive' | 'negative' | 'neutral';

export interface LeaderboardMetric {
  /** Chiffre principal, abrégé. */
  value: string;
  unit: string;
  /** Une seule ligne de détail sous le pseudo. */
  detail: string;
  tone: LeaderboardTone;
}

type MetricEntry = Pick<
  LeaderboardEntry,
  | 'scoreValue'
  | 'masteryScore'
  | 'manchesWon'
  | 'partiesWon'
  | 'gamesWon'
  | 'gamesPlayed'
  | 'winRate'
  | 'koraCount'
  | 'doubleKoraCount'
  | 'fortune'
  | 'multiplayerGains'
  | 'multiplayerPertes'
>;

export function leaderboardMetric(entry: MetricEntry, category: LeaderboardCategory): LeaderboardMetric {
  if (category === 'WIN_RATE') {
    return {
      value: `${entry.winRate} %`,
      unit: plural(entry.gamesWon, 'victoire', 'victoires'),
      detail: `${entry.gamesWon} sur ${entry.gamesPlayed} ${plural(entry.gamesPlayed, 'partie', 'parties')}`,
      tone: 'gold',
    };
  }

  if (category === 'KORAS') {
    const total = entry.koraCount + entry.doubleKoraCount * 2;
    return {
      value: formatCompactNumber(total),
      unit: plural(total, 'Kora', 'Koras'),
      detail: `${entry.koraCount} ${plural(entry.koraCount, 'simple', 'simples')} · ${entry.doubleKoraCount} ${plural(entry.doubleKoraCount, 'double', 'doubles')}`,
      tone: 'gold',
    };
  }

  if (category === 'CHIPS') {
    const fortune = entry.fortune ?? entry.scoreValue ?? 0;
    return {
      value: `${fortune > 0 ? '+' : ''}${formatCompactNumber(fortune)}`,
      unit: plural(fortune, 'jeton', 'jetons'),
      detail: `Gagnés ${formatCompactNumber(entry.multiplayerGains ?? 0)} · Perdus ${formatCompactNumber(entry.multiplayerPertes ?? 0)}`,
      tone: fortune > 0 ? 'positive' : fortune < 0 ? 'negative' : 'neutral',
    };
  }

  const mastery = entry.masteryScore ?? entry.scoreValue ?? 0;
  const manches = entry.manchesWon ?? 0;
  const parties = entry.partiesWon || entry.gamesWon || 0;
  return {
    value: formatCompactNumber(mastery),
    unit: plural(mastery, 'point', 'points'),
    detail: `${manches} ${plural(manches, 'manche', 'manches')} · ${parties} ${plural(parties, 'partie', 'parties')}`,
    tone: 'gold',
  };
}

/** Écart à combler pour dépasser le joueur du dessus, avec l'unité de l'onglet. */
export function leaderboardGapLabel(gap: number, category: LeaderboardCategory): string {
  if (category === 'WIN_RATE') return `${gap} %`;
  const unit =
    category === 'CHIPS'
      ? plural(gap, 'jeton', 'jetons')
      : category === 'KORAS'
        ? plural(gap, 'Kora', 'Koras')
        : plural(gap, 'point', 'points');
  return `${formatCompactNumber(gap)} ${unit}`;
}
