import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLastTable, serializeLastTable, pickTeammates, mergeLastTable, type LastTableSettings } from './lastTable';

const settings: LastTableSettings = {
  isPublic: false, fillWithBots: false, maxPlayers: 3, baseBet: 20, initialCapital: 100,
  turnTimerSeconds: 20, enableDoubleKora: true, enableUnder21: false,
};

test('aller-retour sérialisation', () => {
  const t = { settings, teammates: [{ id: 'a', name: 'Ama' }] };
  assert.deepEqual(parseLastTable(serializeLastTable(t)), t);
});

test('données absentes ou abîmées : null', () => {
  assert.equal(parseLastTable(null), null);
  assert.equal(parseLastTable('pas du json'), null);
  assert.equal(parseLastTable('{"settings":{"maxPlayers":"x"}}'), null);
});

test('pickTeammates exclut moi, bots et doublons', () => {
  const r = pickTeammates([
    { id: 'me', name: 'Moi', isHuman: true },
    { id: 'b1', name: 'Bot', isHuman: false },
    { id: 'u1', name: 'Ama', isHuman: true },
    { id: 'u1', name: 'Ama', isHuman: true },
    { id: 'u2', name: 'Eto', isHuman: true },
  ], 'me');
  assert.deepEqual(r.map((t) => t.id), ['u1', 'u2']);
});

test('mergeLastTable garde les anciens coéquipiers si la table n\'en a pas', () => {
  const prev = { settings, teammates: [{ id: 'a', name: 'Ama' }] };
  assert.deepEqual(mergeLastTable(prev, settings, []).teammates, prev.teammates);
  assert.deepEqual(mergeLastTable(prev, settings, [{ id: 'z', name: 'Zo' }]).teammates, [{ id: 'z', name: 'Zo' }]);
});

test('maxPlayers borné entre 2 et 4', () => {
  const raw = JSON.stringify({ settings: { ...settings, maxPlayers: 9 }, teammates: [] });
  assert.equal(parseLastTable(raw)?.settings.maxPlayers, 4);
});
