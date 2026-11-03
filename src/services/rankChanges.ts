/**
 * Mémoire du rang sur l'appareil : dernier rang vu, meilleur rang, messages à annoncer.
 * Fonctions pures, sans navigateur : le stockage et l'affichage sont dans useRankAnnouncements.
 */

import { RankTitleId } from './rankTiers';

const LADDER: RankTitleId[] = ['APPRENTI', 'CONFIRME', 'CHASSEUR_KORA', 'MAITRE_POSITION', 'MAITRE_NJAMBO', 'LEGENDE_KORA'];

const level = (titleId: string | null | undefined): number => LADDER.indexOf(titleId as RankTitleId);

export interface RankMemory {
  uid: string;
  lastTitleId: RankTitleId;
  bestTitleId: RankTitleId;
  lastMessageAt: number;
}

export interface RankUpdate {
  uid: string;
  titleId: RankTitleId;
  titleName: string;
  bestTitleName: (titleId: RankTitleId) => string;
  /** Rang selon l'ancien système, calculé d'après les statistiques : devient le premier meilleur rang. */
  previousSystemTitleId: RankTitleId;
  inactivitySteps: number;
  gamesPlayed: number;
}

export interface RankMessage {
  kind: 'SYSTEM_CHANGE' | 'NEW_BEST' | 'RANK_UP' | 'RANK_DOWN' | 'RANK_DOWN_INACTIVE';
  title: string;
  body: string;
  tone: 'success' | 'warning' | 'info';
}

const higher = (a: RankTitleId, b: RankTitleId): RankTitleId => (level(a) >= level(b) ? a : b);

/**
 * Compare le rang reçu à la mémoire. Un rang change toujours aussitôt ; seul le message est limité dans le temps,
 * pour qu'un joueur proche d'un palier ne soit pas sollicité sans arrêt. Un nouveau meilleur rang passe toujours.
 */
export function applyRankUpdate(
  memory: RankMemory | null,
  update: RankUpdate,
  nowMs: number,
  cooldownMs: number
): { memory: RankMemory; message: RankMessage | null } {
  if (!memory || memory.uid !== update.uid) {
    const bestTitleId = higher(update.previousSystemTitleId, update.titleId);
    const first: RankMemory = { uid: update.uid, lastTitleId: update.titleId, bestTitleId, lastMessageAt: nowMs };
    // Message de passage, une seule fois, et seulement pour un joueur qui a déjà joué.
    if (update.gamesPlayed <= 0) return { memory: first, message: null };
    return {
      memory: first,
      message: {
        kind: 'SYSTEM_CHANGE',
        title: 'Les rangs se jouent maintenant entre joueurs',
        body:
          bestTitleId !== update.titleId
            ? `Ton rang suit ta place parmi les joueurs : tu es ${update.titleName}. ${update.bestTitleName(bestTitleId)} reste ton meilleur rang.`
            : `Ton rang suit ta place parmi les joueurs : tu es ${update.titleName}. Il peut monter et redescendre.`,
        tone: 'info',
      },
    };
  }

  if (memory.lastTitleId === update.titleId) return { memory, message: null };

  const bestTitleId = higher(memory.bestTitleId, update.titleId);
  const isNewBest = level(update.titleId) > level(memory.bestTitleId);
  const silent = !isNewBest && nowMs - memory.lastMessageAt < cooldownMs;
  const next: RankMemory = { ...memory, lastTitleId: update.titleId, bestTitleId };
  if (silent) return { memory: next, message: null };

  const isUp = level(update.titleId) > level(memory.lastTitleId);
  let message: RankMessage;
  if (isNewBest) {
    message = { kind: 'NEW_BEST', title: `Nouveau meilleur rang : ${update.titleName} 🎉`, body: 'Bravo ! Continue pour garder ta place.', tone: 'success' };
  } else if (isUp) {
    message = { kind: 'RANK_UP', title: `Tu remontes : ${update.titleName}`, body: 'Bien joué, tu reprends du terrain.', tone: 'success' };
  } else if (update.inactivitySteps > 0) {
    message = { kind: 'RANK_DOWN_INACTIVE', title: `Tu passes ${update.titleName}`, body: 'Faute de partie récente. Rejoue pour retrouver ta place.', tone: 'warning' };
  } else {
    message = { kind: 'RANK_DOWN', title: `Tu passes ${update.titleName}`, body: 'D’autres joueurs t’ont dépassé. Rejoue pour reprendre ta place.', tone: 'warning' };
  }
  return { memory: { ...next, lastMessageAt: nowMs }, message };
}
