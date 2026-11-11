import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GameInvitation } from '../types';
import { buildHomeCard, countInvitations, invitationsForMode, isCashSideAvailable, resolveSocialMode, splitSeatedTable } from './socialCenter';

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
