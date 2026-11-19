/**
 * Mesures de santé des connexions : agrégation en mémoire (connexions, déconnexions par code, délai
 * moyen de reconnexion, relais, sièges libérés, tables restaurées, identifiants invalides rejetés).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordConnection,
  recordDisconnection,
  recordReconnection,
  recordRelayTriggered,
  recordSeatReleased,
  recordRoomRestored,
  recordRejectedInvalidIdentifier,
  recordPushOutcome,
  getTodaySnapshot,
} from './connectionMetrics';

describe('mesures de santé des connexions', () => {
  it('compte les connexions et les déconnexions par code', () => {
    const before = getTodaySnapshot();
    recordConnection();
    recordConnection();
    recordDisconnection('p1', 1000);
    recordDisconnection('p2', 4001);
    const after = getTodaySnapshot();
    assert.equal(after.connections, before.connections + 2);
    assert.equal(after.disconnectionsByCode['1000'], (before.disconnectionsByCode['1000'] || 0) + 1);
    assert.equal(after.disconnectionsByCode['4001'], (before.disconnectionsByCode['4001'] || 0) + 1);
    assert.equal(after.sessionTakeovers, before.sessionTakeovers + 1, 'le code 4001 est aussi compté comme une prise de contrôle');
  });

  it('mesure le délai de reconnexion entre une déconnexion et le retour du même joueur', () => {
    recordDisconnection('reco_test', 1006);
    const before = getTodaySnapshot();
    recordReconnection('reco_test');
    const after = getTodaySnapshot();
    assert.equal(after.reconnectSuccesses, before.reconnectSuccesses + 1);
    assert.ok(after.averageReconnectDelayMs >= 0);
  });

  it('une reconnexion sans déconnexion préalable connue n\'est pas comptée (évite les faux positifs)', () => {
    const before = getTodaySnapshot();
    recordReconnection('jamais_deconnecte_' + Math.random());
    const after = getTodaySnapshot();
    assert.equal(after.reconnectSuccesses, before.reconnectSuccesses);
  });

  it('compte les relais, sièges libérés, tables restaurées et identifiants rejetés', () => {
    const before = getTodaySnapshot();
    recordRelayTriggered();
    recordSeatReleased();
    recordRoomRestored();
    recordRejectedInvalidIdentifier();
    const after = getTodaySnapshot();
    assert.equal(after.relaysTriggered, before.relaysTriggered + 1);
    assert.equal(after.seatsReleased, before.seatsReleased + 1);
    assert.equal(after.roomsRestored, before.roomsRestored + 1);
    assert.equal(after.rejectedInvalidIdentifier, before.rejectedInvalidIdentifier + 1);
  });

  it('identifie les joueurs avec 3 déconnexions ou plus dans la journée', () => {
    const playerId = 'flaky_' + Math.random().toString(36).slice(2, 8);
    const before = getTodaySnapshot();
    recordDisconnection(playerId, 1006);
    recordDisconnection(playerId, 1006);
    recordDisconnection(playerId, 1006);
    const after = getTodaySnapshot();
    assert.equal(after.playersWithMultipleDisconnects, before.playersWithMultipleDisconnects + 1);
  });
  it('compte le sort des notifications push par type, sans identifiant ni contenu', () => {
    const before = getTodaySnapshot().pushOutcomes;
    recordPushOutcome('INVITATION', 'ok');
    recordPushOutcome('INVITATION', 'no_subscription');
    recordPushOutcome('APPOINTMENT', 'failed', 410);
    recordPushOutcome('APPOINTMENT', 'failed', 'ECONNRESET');
    const after = getTodaySnapshot().pushOutcomes;
    const gain = (k: string) => (after[k] || 0) - (before[k] || 0);
    assert.equal(gain('INVITATION_ok'), 1);
    assert.equal(gain('INVITATION_no_subscription'), 1);
    assert.equal(gain('APPOINTMENT_failed_410'), 1);
    assert.equal(gain('APPOINTMENT_failed_error'), 1);
  });

  it('un type ou un résultat hors liste est rangé sous « SYSTEM » ou « other » (aucune clé libre)', () => {
    const before = getTodaySnapshot().pushOutcomes;
    recordPushOutcome('XvhceH5fLKPlMMrkLVJp8xYHC5H2', 'bizarre');
    recordPushOutcome(undefined, 'ok');
    const after = getTodaySnapshot().pushOutcomes;
    assert.equal((after.SYSTEM_other || 0) - (before.SYSTEM_other || 0), 1);
    assert.equal((after.SYSTEM_ok || 0) - (before.SYSTEM_ok || 0), 1);
    assert.equal(Object.keys(after).some((k) => k.includes('Xvhce')), false);
  });
});
