/**
 * Notifications de rang : stockage et envoi réels. Un seul document, fermé aux clients (écriture serveur, Admin SDK) :
 * une lecture et une écriture par vérification, quel que soit le nombre de joueurs.
 */

import { FieldPath } from 'firebase-admin/firestore';
import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { recordServerReads } from '../katika/readBudget';
import { buildGameUrl, pushService } from '../pushService';
import { RankPushDeps, RankPushState } from './rankPush';

const STATE_COLLECTION = 'rank_push_state';
const STATE_DOC = 'current';

const stateRef = () => getFirebaseAdminAppDb().collection(STATE_COLLECTION).doc(STATE_DOC);

export function createLiveRankPushDeps(): RankPushDeps {
  return {
    batchSize: 10,
    overwrite: async (players: RankPushState) => {
      await stateRef().set({ players, updatedAt: Date.now() });
    },
    transact: (update) =>
      getFirebaseAdminAppDb().runTransaction(async (tx) => {
        const ref = stateRef();
        const snap = await tx.get(ref);
        recordServerReads(1);
        const { next, sends } = update(snap.exists ? ((snap.data()?.players as RankPushState) ?? {}) : null);
        tx.set(ref, { players: next, updatedAt: Date.now() });
        return sends;
      }),
    restore: async (uid, entry) => {
      await stateRef().update(new FieldPath('players', uid), entry);
    },
    send: (push, night) =>
      pushService.sendNotificationToUser(
        push.uid,
        { title: push.title, body: push.body, tag: 'njambo-rank', data: { type: 'RANK_CHANGE', url: buildGameUrl() } },
        { nightWindow: night }
      ),
  };
}
