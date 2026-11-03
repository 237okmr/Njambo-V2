import { useEffect } from 'react';
import { useNotify } from '../components/common/NotificationCenter';
import { usePlayerProfile } from '../context/PlayerProfileContext';
import { HONORIFIC_TITLES } from '../types/playerProfile';
import { notificationHistory } from '../services/notificationHistoryService';
import { computeHonorificTitle } from '../services/playerProfileService';
import { getPublicParamNumber } from '../services/publicConfig';
import { applyRankUpdate } from '../services/rankChanges';
import { readRankMemory, writeRankMemory } from '../services/rankClient';
import { RankTitleId } from '../services/rankTiers';

const titleName = (titleId: string): string => HONORIFIC_TITLES.find((t) => t.id === titleId)?.title ?? titleId;

/**
 * Annonce les changements de rang reçus du serveur : message et entrée dans la cloche.
 * Attend le retour à l'accueil : une partie en cours n'est jamais interrompue.
 */
export function useRankAnnouncements(isOnHomeScreen: boolean): void {
  const { liveRank, profile, isLoggedIn } = usePlayerProfile();
  const { notify } = useNotify();

  useEffect(() => {
    if (!isOnHomeScreen || !isLoggedIn || !liveRank?.rank || liveRank.uid !== profile.uid) return;
    const titleId = liveRank.rank.titleId;
    const now = Date.now();
    const { memory, message } = applyRankUpdate(
      readRankMemory(profile.uid),
      {
        uid: profile.uid,
        titleId,
        titleName: titleName(titleId),
        bestTitleName: titleName,
        // Ancien calcul, gardé pour reconnaître le rang déjà atteint au moment du passage.
        previousSystemTitleId: computeHonorificTitle(profile.stats).currentTitle.id as RankTitleId,
        inactivitySteps: liveRank.rank.inactivitySteps,
        gamesPlayed: profile.stats?.gamesPlayed || 0,
      },
      now,
      getPublicParamNumber('rankMessageCooldownHours') * 60 * 60 * 1000
    );
    writeRankMemory(memory);
    if (!message) return;
    notificationHistory.record({ id: `rank:${titleId}:${now}`, kind: 'RANK_CHANGE', title: message.title, body: message.body, createdAt: now });
    notify({ message: `${message.title}. ${message.body}`, tone: message.tone, durationMs: 7000 });
    // Le profil change à chaque partie : seule une réponse du serveur déclenche une comparaison.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRank, isOnHomeScreen, isLoggedIn]);
}
