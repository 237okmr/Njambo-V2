import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildKoraMoment } from './koraMoment';

describe('koraMoment - fiche d\'un Kora', () => {
  const tricks = [1, 2, 3, 4, 5].map((n) => ({
    trickNumber: n,
    winnerIndex: 1,
    plays: [
      { playerIndex: 0, card: { value: 7, suit: 'COEUR' }, playerName: 'Secret', playerId: 'uid-secret' },
      { playerIndex: 1, card: { value: n === 5 ? 3 : 9, suit: 'PIQUE' }, playerName: 'Autre', playerId: 'uid-autre' },
    ],
  }));

  it('construit une fiche de 5 plis avec rang et enseigne', () => {
    const moment = buildKoraMoment({ roomId: 'K8T4', partieCount: 2, kind: 'KORA', winnerSeat: 1, playerCount: 2, tricks, now: 1000 });
    assert.strictEqual(moment.id, 'K8T4_p2_1000');
    assert.strictEqual(moment.tricks.length, 5);
    assert.deepStrictEqual(moment.tricks[4].plays[1], { seat: 1, rank: '3', suit: '♠' });
    assert.strictEqual(moment.tricks[0].winnerSeat, 1);
  });

  it('ne contient aucun nom, identifiant de joueur ni montant', () => {
    const moment = buildKoraMoment({ roomId: 'K8T4', partieCount: 1, kind: 'DOUBLE_KORA', winnerSeat: 1, playerCount: 2, tricks });
    const json = JSON.stringify(moment);
    assert.ok(!json.includes('Secret'));
    assert.ok(!json.includes('uid-'));
    assert.ok(!/pot|bet|mise|capital|gain/i.test(json));
  });

  it('ignore une carte dont l\'enseigne est inconnue', () => {
    const bad = [{ trickNumber: 1, winnerIndex: 0, plays: [{ playerIndex: 0, card: { value: 7, suit: 'JOKER' } }] }];
    const moment = buildKoraMoment({ roomId: 'R', partieCount: 1, kind: 'KORA', winnerSeat: 0, playerCount: 2, tricks: bad });
    assert.strictEqual(moment.tricks[0].plays.length, 0);
  });
});
