import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAllHokutoModels,
  collectHokutoTendencies,
  resetHokutoModelsWithPrefix,
} from './hokutoPlayerModel';

const players = [
  { id: 'bot', isHuman: false },
  { id: 'h1', isHuman: true },
  { id: 'relay', isHuman: true, isAiRelay: true },
  { id: 'bot2', isHuman: false },
];

describe('collectHokutoTendencies', () => {
  it('ne suit que les humains réels (ni bots, ni relais, ni le bot lui-même)', () => {
    clearAllHokutoModels();
    const map = collectHokutoTendencies('t1', players, [], 0);
    assert.deepEqual([...map.keys()], [1]);
    assert.equal(map.get(1)?.confidence, 0);
  });

  it('une remise à zéro par préfixe ne touche pas les autres tables', () => {
    clearAllHokutoModels();
    collectHokutoTendencies('t1', players, [], 0);
    collectHokutoTendencies('t2', players, [], 0);
    resetHokutoModelsWithPrefix('t1:');
    const map = collectHokutoTendencies('t2', players, [], 0);
    assert.equal(map.size, 1);
  });
});
