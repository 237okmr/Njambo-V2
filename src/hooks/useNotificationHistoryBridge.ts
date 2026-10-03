import { useEffect } from 'react';
import { usePlayerProfile } from '../context/PlayerProfileContext';
import { FriendService } from '../services/friendService';
import { notificationHistory } from '../services/notificationHistoryService';

/**
 * Pont entre l'application et l'historique de notifications (cloche) :
 *  - rattache l'historique au compte courant (uid Google, ou « invité » sinon) ;
 *  - écoute les demandes d'amis reçues sur toute l'application (et plus seulement quand l'écran
 *    multijoueur est ouvert) pour les enregistrer dans l'historique.
 * Aucun délai : l'écoute est pilotée par Firestore (temps réel).
 */
export function useNotificationHistoryBridge(): void {
  const { profile, isLoggedIn } = usePlayerProfile();
  const uid = isLoggedIn && profile?.uid ? profile.uid : null;

  useEffect(() => {
    notificationHistory.setOwner(uid);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let isFirstSnapshot = true;
    const unsubscribe = FriendService.subscribeCloudFriends(uid, (friends) => {
      const list = friends || [];
      const pendingIds = new Set<string>();

      list
        .filter((f) => f.status === 'PENDING_RECEIVED')
        .forEach((f) => {
          const id = `friend:${f.friendUid}:${f.createdAt}`;
          pendingIds.add(id);
          notificationHistory.record({
            id,
            kind: 'FRIEND_REQUEST',
            title: `${f.displayName} veut devenir ton ami`,
            body: 'Demande d\u2019ami reçue',
            createdAt: f.createdAt,
            actorId: f.friendUid,
            actorName: f.displayName,
            actorAvatar: f.avatarId,
          });
        });

      // Un premier instantané vide peut venir du cache : on ne clôt alors aucune demande.
      if (isFirstSnapshot && list.length === 0) {
        isFirstSnapshot = false;
        return;
      }
      isFirstSnapshot = false;

      // Une demande qui n'est plus en attente a été acceptée ou refusée : elle n'est plus actionnable.
      const acceptedUids = new Set(list.filter((f) => f.status === 'ACCEPTED').map((f) => f.friendUid));
      notificationHistory.getSnapshot().forEach((n) => {
        if (n.kind !== 'FRIEND_REQUEST' || n.outcome || pendingIds.has(n.id)) return;
        notificationHistory.resolve(n.id, acceptedUids.has(n.actorId ?? '') ? 'ACCEPTED' : 'DECLINED');
      });
    });
    return unsubscribe;
  }, [uid]);
}
