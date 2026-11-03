/**
 * Rang du joueur côté client : demandé au serveur, gardé sur l'appareil pour s'afficher tout de suite au lancement.
 * Le serveur reste seul juge : ce rang ne sert qu'à l'affichage.
 */

import { RankMemory } from './rankChanges';
import { PlayerRank, TierSummary } from './rankTiers';

const STORAGE_KEY = 'njambo_dynamic_rank_v1';

export interface RankSnapshot {
  uid: string;
  rank: PlayerRank | null;
  tiers: TierSummary[];
  totalPlayers: number;
  /** Rang déjà annoncé par notification : le jeu ne répète pas le bandeau. */
  pushedTitleId?: string | null;
}

export function readStoredRank(uid: string): RankSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as RankSnapshot) : null;
    return parsed && parsed.uid === uid && Array.isArray(parsed.tiers) ? parsed : null;
  } catch {
    return null;
  }
}

/** Renvoie null au moindre doute : l'écran garde alors ce qu'il sait déjà. */
export async function fetchRankSnapshot(uid: string): Promise<RankSnapshot | null> {
  try {
    const res = await fetch(`/api/leaderboard/my-rank?uid=${encodeURIComponent(uid)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.success || !Array.isArray(data.tiers)) return null;
    const snapshot: RankSnapshot = { uid, rank: data.rank ?? null, tiers: data.tiers, totalPlayers: Number(data.totalPlayers) || 0, pushedTitleId: data.pushedTitleId ?? null };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // stockage indisponible : le rang sera redemandé au prochain lancement
    }
    return snapshot;
  } catch {
    return null;
  }
}

const MEMORY_KEY = 'njambo_rank_memory_v1';

export function readRankMemory(uid: string): RankMemory | null {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as RankMemory) : null;
    return parsed && parsed.uid === uid ? parsed : null;
  } catch {
    return null;
  }
}

export function writeRankMemory(memory: RankMemory): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // stockage indisponible : la comparaison reprendra au prochain lancement
  }
}
