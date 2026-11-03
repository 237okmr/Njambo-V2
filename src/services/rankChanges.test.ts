import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RankMemory, RankUpdate, applyRankUpdate } from './rankChanges';

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;
const COOLDOWN = 24 * HOUR;

const NAMES: Record<string, string> = {
  APPRENTI: 'Apprenti',
  CONFIRME: 'Joueur Confirmé',
  CHASSEUR_KORA: 'Chasseur de Kora',
  MAITRE_POSITION: 'Maître de Position',
  MAITRE_NJAMBO: 'Maître Njambo',
  LEGENDE_KORA: 'Légende du Kora',
};

const update = (partial: Partial<RankUpdate> = {}): RankUpdate => {
  const titleId = partial.titleId ?? 'CHASSEUR_KORA';
  return {
    uid: 'ada',
    titleId,
    titleName: NAMES[titleId],
    bestTitleName: (id) => NAMES[id],
    previousSystemTitleId: 'CONFIRME',
    inactivitySteps: 0,
    gamesPlayed: 40,
    ...partial,
  };
};

const memory = (partial: Partial<RankMemory> = {}): RankMemory => ({
  uid: 'ada',
  lastTitleId: 'CHASSEUR_KORA',
  bestTitleId: 'MAITRE_POSITION',
  lastMessageAt: NOW - 48 * HOUR,
  ...partial,
});

describe('passage au nouveau système de rangs', () => {
  it('garde l’ancien rang comme meilleur rang et le dit au joueur', () => {
    const result = applyRankUpdate(null, update({ previousSystemTitleId: 'LEGENDE_KORA' }), NOW, COOLDOWN);
    assert.equal(result.memory.bestTitleId, 'LEGENDE_KORA');
    assert.equal(result.memory.lastTitleId, 'CHASSEUR_KORA');
    assert.equal(result.message?.kind, 'SYSTEM_CHANGE');
    assert.match(result.message!.body, /Légende du Kora reste ton meilleur rang/);
  });

  it('prend le rang actuel comme meilleur s’il dépasse l’ancien', () => {
    const result = applyRankUpdate(null, update({ titleId: 'MAITRE_NJAMBO', previousSystemTitleId: 'CONFIRME' }), NOW, COOLDOWN);
    assert.equal(result.memory.bestTitleId, 'MAITRE_NJAMBO');
    assert.doesNotMatch(result.message!.body, /meilleur rang/);
  });

  it('ne dit rien à un nouveau joueur', () => {
    assert.equal(applyRankUpdate(null, update({ gamesPlayed: 0 }), NOW, COOLDOWN).message, null);
  });

  it('n’annonce le passage qu’une fois', () => {
    const first = applyRankUpdate(null, update(), NOW, COOLDOWN);
    assert.equal(applyRankUpdate(first.memory, update(), NOW + HOUR, COOLDOWN).message, null);
  });

  it('un autre compte sur l’appareil repart de zéro', () => {
    const result = applyRankUpdate(memory({ uid: 'bo' }), update(), NOW, COOLDOWN);
    assert.equal(result.memory.uid, 'ada');
    assert.equal(result.message?.kind, 'SYSTEM_CHANGE');
  });
});

describe('changements de rang', () => {
  it('annonce une descente et distingue dépassé d’inactif', () => {
    const down = update({ titleId: 'CONFIRME' });
    assert.equal(applyRankUpdate(memory(), down, NOW, COOLDOWN).message?.kind, 'RANK_DOWN');
    assert.equal(applyRankUpdate(memory(), { ...down, inactivitySteps: 1 }, NOW, COOLDOWN).message?.kind, 'RANK_DOWN_INACTIVE');
  });

  it('annonce une remontée sous le meilleur rang', () => {
    const result = applyRankUpdate(memory({ lastTitleId: 'CONFIRME' }), update(), NOW, COOLDOWN);
    assert.equal(result.message?.kind, 'RANK_UP');
    assert.equal(result.memory.bestTitleId, 'MAITRE_POSITION');
  });

  it('un nouveau meilleur rang passe toujours, même juste après un message', () => {
    const result = applyRankUpdate(memory({ lastMessageAt: NOW - HOUR }), update({ titleId: 'LEGENDE_KORA' }), NOW, COOLDOWN);
    assert.equal(result.message?.kind, 'NEW_BEST');
    assert.equal(result.memory.bestTitleId, 'LEGENDE_KORA');
  });

  it('dans la période de calme : le rang suit, sans message ni nouveau délai', () => {
    const before = memory({ lastMessageAt: NOW - HOUR });
    const result = applyRankUpdate(before, update({ titleId: 'CONFIRME' }), NOW, COOLDOWN);
    assert.equal(result.message, null);
    assert.equal(result.memory.lastTitleId, 'CONFIRME');
    assert.equal(result.memory.lastMessageAt, before.lastMessageAt);
  });

  it('à zéro, la limite de rappels est coupée', () => {
    assert.equal(applyRankUpdate(memory({ lastMessageAt: NOW }), update({ titleId: 'CONFIRME' }), NOW, 0).message?.kind, 'RANK_DOWN');
  });

  it('sans changement, rien', () => {
    const before = memory();
    const result = applyRankUpdate(before, update(), NOW, COOLDOWN);
    assert.equal(result.message, null);
    assert.equal(result.memory, before);
  });
});
