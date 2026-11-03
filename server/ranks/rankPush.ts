/**
 * Notifications de rang, quand l'application est fermée. Ce fichier ne contient que les règles : aucun réseau,
 * le stockage et l'envoi lui sont passés (voir rankPushLive.ts).
 *
 * Un joueur n'est prévenu que pour une perte de rang ou un nouveau meilleur rang, au plus une fois par période.
 * Tant qu'une annonce n'a pas pu partir (délai, nuit, plafond), elle reste en attente, et disparaît si le rang revient.
 */

import { rankMessageText } from '../../src/services/rankChanges';
import { RankTitleId } from '../../src/services/rankTiers';

const LADDER: RankTitleId[] = ['APPRENTI', 'CONFIRME', 'CHASSEUR_KORA', 'MAITRE_POSITION', 'MAITRE_NJAMBO', 'LEGENDE_KORA'];
const level = (titleId: RankTitleId): number => LADDER.indexOf(titleId);
const higher = (a: RankTitleId, b: RankTitleId): RankTitleId => (level(a) >= level(b) ? a : b);

export interface RankPushEntry {
  /** Dernier rang annoncé ou accepté en silence : la référence pour détecter une perte. */
  notifiedTitleId: RankTitleId;
  bestTitleId: RankTitleId;
  lastPushAt: number;
}

export type RankPushState = Record<string, RankPushEntry>;

export interface RankPushPlayer {
  uid: string;
  titleId: RankTitleId;
  /** Rang selon l'ancien système : il compte déjà comme meilleur rang, comme dans le profil. */
  legacyTitleId: RankTitleId;
  inactivitySteps: number;
}

export interface RankPushSettings {
  enabled: boolean;
  cooldownMs: number;
  maxPerCheck: number;
  nightStartHour: number;
  nightEndHour: number;
  titleName: (titleId: RankTitleId) => string;
}

export interface PlannedRankPush {
  uid: string;
  titleId: RankTitleId;
  title: string;
  body: string;
  /** État à rétablir si l'annonce ne part pas. */
  previous: RankPushEntry;
}

export function seedRankPushState(players: RankPushPlayer[]): RankPushState {
  const state: RankPushState = {};
  for (const player of players) {
    state[player.uid] = { notifiedTitleId: player.titleId, bestTitleId: higher(player.titleId, player.legacyTitleId), lastPushAt: 0 };
  }
  return state;
}

/** Compare les rangs à l'état enregistré. Un joueur absent de la lecture est oublié ; à son retour, il repart sans annonce. */
export function planRankPushes(
  state: RankPushState,
  players: RankPushPlayer[],
  settings: Pick<RankPushSettings, 'cooldownMs' | 'maxPerCheck' | 'titleName'>,
  nowMs: number
): { next: RankPushState; sends: PlannedRankPush[] } {
  const next: RankPushState = {};
  const sends: PlannedRankPush[] = [];

  for (const player of players) {
    const entry = state[player.uid];
    if (!entry) {
      next[player.uid] = seedRankPushState([player])[player.uid];
      continue;
    }
    next[player.uid] = entry;

    const isNewBest = level(player.titleId) > level(entry.bestTitleId);
    const isLoss = level(player.titleId) < level(entry.notifiedTitleId);

    if (!isNewBest && !isLoss) {
      // Même rang ou simple remontée : pas d'annonce, c'est le jeu qui le dira à l'ouverture.
      if (player.titleId !== entry.notifiedTitleId) next[player.uid] = { ...entry, notifiedTitleId: player.titleId };
      continue;
    }

    if (nowMs - entry.lastPushAt < settings.cooldownMs || sends.length >= settings.maxPerCheck) continue;

    const kind = isNewBest ? 'NEW_BEST' : player.inactivitySteps > 0 ? 'RANK_DOWN_INACTIVE' : 'RANK_DOWN';
    const text = rankMessageText(kind, settings.titleName(player.titleId));
    sends.push({ uid: player.uid, titleId: player.titleId, title: text.title, body: text.body, previous: entry });
    next[player.uid] = { notifiedTitleId: player.titleId, bestTitleId: higher(entry.bestTitleId, player.titleId), lastPushAt: nowMs };
  }

  return { next, sends };
}

export interface RankPushDeps {
  /** Écrit l'état sans le lire : interrupteur fermé, l'état suit les rangs pour qu'une ouverture n'annonce rien de vieux. */
  overwrite: (state: RankPushState) => Promise<void>;
  /** Lit puis écrit l'état d'un seul tenant : deux serveurs ne peuvent pas annoncer le même changement. */
  transact: (update: (current: RankPushState | null) => { next: RankPushState; sends: PlannedRankPush[] }) => Promise<PlannedRankPush[]>;
  restore: (uid: string, entry: RankPushEntry) => Promise<void>;
  send: (push: PlannedRankPush, night: { startHour: number; endHour: number }) => Promise<{ success: number; failed: number; deferred: number }>;
  /** Taille des envois simultanés. */
  batchSize: number;
}

/** Vérifie les rangs et envoie les annonces. Renvoie celles qui sont parties, pour éviter de les répéter à l'ouverture du jeu. */
export async function runRankPushes(deps: RankPushDeps, players: RankPushPlayer[], settings: RankPushSettings, nowMs: number): Promise<PlannedRankPush[]> {
  if (!settings.enabled) {
    await deps.overwrite(seedRankPushState(players));
    return [];
  }

  // Sans état enregistré, on l'initialise sans rien envoyer : jamais de rafale à toute la base.
  const sends = await deps.transact((current) => (current ? planRankPushes(current, players, settings, nowMs) : { next: seedRankPushState(players), sends: [] }));

  const delivered: PlannedRankPush[] = [];
  for (let i = 0; i < sends.length; i += deps.batchSize) {
    await Promise.all(
      sends.slice(i, i + deps.batchSize).map(async (push) => {
        try {
          const result = await deps.send(push, { startHour: settings.nightStartHour, endHour: settings.nightEndHour });
          if (result.success > 0) {
            delivered.push(push);
          } else if (result.deferred > 0 || result.failed > 0) {
            // Nuit ou panne : l'annonce repart à la prochaine vérification. Sans appareil abonné, rien à refaire.
            await deps.restore(push.uid, push.previous);
          }
        } catch (err) {
          console.warn('[RankPush] Envoi impossible.', err instanceof Error ? err.message : String(err));
          await deps.restore(push.uid, push.previous).catch(() => {});
        }
      })
    );
  }
  return delivered;
}
