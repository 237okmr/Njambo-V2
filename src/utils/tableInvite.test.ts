import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spacedTableCode } from './tableInvite';

describe('code de table à dicter', () => {
  it('sépare chaque caractère et met en majuscules', () => {
    assert.equal(spacedTableCode('ab12'), 'A B 1 2');
  });
  it('ignore les symboles et les espaces', () => {
    assert.equal(spacedTableCode(' #ab-12 '), 'A B 1 2');
  });
  it('un code vide ou absent donne une chaîne vide', () => {
    assert.equal(spacedTableCode(''), '');
    assert.equal(spacedTableCode(undefined), '');
  });
});
