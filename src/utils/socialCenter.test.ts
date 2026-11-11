import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GameInvitation } from '../types';
import { appointmentsForMode, countAppointmentsToAnswer, buildHomeCard, countInvitations, countSearchCalls, liveSearchCalls, invitationsForMode, isCashSideAvailable, resolveSocialMode, splitSeatedTable } from './socialCenter';

const NOW = 1_000_000;

function inv(id: string, patch: Partial<GameInvitation> = {}): GameInvitation {
  return { id, fromUserId: 'u', fromUserName: 'Awa', fromUserAvatar: 'a', toUserId: 'me', roomCode: 'ABCD', baseBet: 10, status: 'PENDING', createdAt: NOW - 1000, expiresAt: NOW + 60_000, ...patch };
}

describe('centre social : côté Kora Cash', () => {
  const all = { centerEnabled: true, cashSideEnabled: true, koraCashEnabled: true, isGoogle: true };
  it('exige le centre, son côté Cash, Kora Cash ouvert et un compte Google', () => {
    assert.equal(isCashSideAvailable(all), true);
    for (const key of Object.keys(all) as (keyof typeof all)[]) {
      assert.equal(isCashSideAvailable({ ...all, [key]: false }), false, key);
    }
  });
  it('ramène un mode Cash non disponible à Gratuit', () => {
    assert.equal(resolveSocialMode('CASH', true), 'CASH');
    assert.equal(resolveSocialMode('CASH', false), 'FREE');
    assert.equal(resolveSocialMode(null, true), 'FREE');
    assert.equal(resolveSocialMode('FREE', true), 'FREE');
  });
});

describe('centre social : invitations séparées par mode', () => {
  const list = [inv('free2', { expiresAt: NOW + 50_000 }), inv('cash1', { cash: true, expiresAt: NOW + 10_000 }), inv('free1', { expiresAt: NOW + 5_000 }), inv('old', { expiresAt: NOW - 1 }), inv('cash-old', { cash: true, expiresAt: NOW })];
  it('ne mélange jamais les deux modes et retire les expirées', () => {
    assert.deepEqual(invitationsForMode(list, 'FREE', NOW).map((i) => i.id), ['free1', 'free2']);
    assert.deepEqual(invitationsForMode(list, 'CASH', NOW).map((i) => i.id), ['cash1']);
  });
  it('compte séparément, et ignore le Cash quand son côté est fermé', () => {
    assert.deepEqual(countInvitations(list, true, NOW), { free: 2, cash: 1 });
    assert.deepEqual(countInvitations(list, false, NOW), { free: 2, cash: 0 });
  });
});

describe('carte d’accueil', () => {
  it('invite un invité à se connecter', () => {
    const card = buildHomeCard({ isGoogle: false, counts: { free: 3, cash: 1 } });
    assert.equal(card.action, 'SIGN_IN');
    assert.equal(card.badge, 0);
  });
  it('reste utile sans invitation', () => {
    const card = buildHomeCard({ isGoogle: true, counts: { free: 0, cash: 0 } });
    assert.equal(card.badge, 0);
    assert.equal(card.action, 'OPEN');
    assert.ok(card.detail.length > 0);
  });
  it('compte défis et invitations Kora Cash, sans jamais montrer de mise', () => {
    const card = buildHomeCard({ isGoogle: true, counts: { free: 2, cash: 1 } });
    assert.equal(card.badge, 3);
    assert.match(card.detail, /2 défis/);
    assert.match(card.detail, /1 invitation Kora Cash/);
    assert.ok(!/FCFA|jetons|\d{3}/.test(card.detail));
  });
});

describe('appels « je cherche une partie »', () => {
  const calls = [
    { mode: 'FREE' as const, expiresAt: NOW + 1000 },
    { mode: 'FREE' as const, expiresAt: NOW },
    { mode: 'CASH' as const, expiresAt: NOW + 1000 },
  ];
  it('sépare les modes et ignore les appels échus', () => {
    assert.equal(liveSearchCalls(calls, 'FREE', NOW).length, 1);
    assert.deepEqual(countSearchCalls(calls, true, NOW), { free: 1, cash: 1 });
  });
  it('ne compte pas le Cash quand son côté est indisponible', () => {
    assert.deepEqual(countSearchCalls(calls, false, NOW), { free: 1, cash: 0 });
  });
  it('ajoute les appels à la pastille et au texte de la carte d\'accueil', () => {
    const card = buildHomeCard({ isGoogle: true, counts: { free: 1, cash: 0 }, searching: { free: 2, cash: 0 } });
    assert.equal(card.badge, 3);
    assert.match(card.detail, /1 défi/);
    assert.match(card.detail, /2 cherchent une partie/);
    assert.equal(buildHomeCard({ isGoogle: true, counts: { free: 0, cash: 0 }, searching: { free: 1, cash: 0 } }).detail, '1 cherche une partie');
  });
});

describe('table où le joueur est assis', () => {
  const base = { id: 'T1', baseBet: 10, status: 'LOBBY', players: [{}, {}], maxPlayers: 4 };
  it('range une table gratuite côté gratuit et une table Cash côté Cash', () => {
    assert.equal(splitSeatedTable(base).free?.id, 'T1');
    assert.equal(splitSeatedTable(base).cash, null);
    const cash = splitSeatedTable({ ...base, cash: { tableId: 'T1' } });
    assert.equal(cash.free, null);
    assert.equal(cash.cash?.seated, 2);
  });
  it('aucune table : rien des deux côtés', () => {
    assert.deepEqual(splitSeatedTable(null), { free: null, cash: null });
  });
});

describe('rendez-vous dans le centre social', () => {
  const now = 1_000_000;
  const apt = (over: Record<string, unknown> = {}) => ({ mode: 'FREE' as const, startsAt: now + 600_000, isMine: false, myAnswer: null as 'YES' | 'NO' | null, ...over });

  it('compte à part Gratuit et Cash, sans mes rendez-vous ni ceux déjà répondus', () => {
    const list = [apt(), apt({ mode: 'CASH' }), apt({ isMine: true }), apt({ myAnswer: 'YES' }), apt({ startsAt: now - 1 })];
    assert.deepEqual(countAppointmentsToAnswer(list, true, now), { free: 1, cash: 1 });
    assert.deepEqual(countAppointmentsToAnswer(list, false, now), { free: 1, cash: 0 });
  });

  it('filtre par mode et trie par heure', () => {
    const list = [apt({ startsAt: now + 900_000 }), apt({ mode: 'CASH' }), apt({ startsAt: now + 300_000 })];
    assert.deepEqual(appointmentsForMode(list, 'FREE').map((a) => a.startsAt), [now + 300_000, now + 900_000]);
  });

  it('la carte d\'accueil les mentionne', () => {
    const card = buildHomeCard({ isGoogle: true, counts: { free: 0, cash: 0 }, appointments: { free: 2, cash: 0 } });
    assert.equal(card.badge, 2);
    assert.equal(card.detail, '2 rendez-vous à confirmer');
  });
});
