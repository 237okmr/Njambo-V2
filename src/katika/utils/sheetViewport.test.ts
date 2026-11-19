import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSheetBox } from './sheetViewport';

test('sans mesure du navigateur, aucun réglage', () => {
  assert.equal(computeSheetBox(null), null);
  assert.equal(computeSheetBox(undefined), null);
});

test('zone visible normale : arrondie', () => {
  assert.deepEqual(computeSheetBox({ height: 640.4, offsetTop: 0 }), { top: 0, height: 640 });
});

test('clavier ouvert : la zone se réduit et se décale', () => {
  assert.deepEqual(computeSheetBox({ height: 310.6, offsetTop: 24.2 }), { top: 24, height: 311 });
});

test('décalage négatif ramené à zéro', () => {
  assert.deepEqual(computeSheetBox({ height: 500, offsetTop: -3 }), { top: 0, height: 500 });
});

test('valeurs inutilisables : aucun réglage', () => {
  assert.equal(computeSheetBox({ height: 0, offsetTop: 0 }), null);
  assert.equal(computeSheetBox({ height: -10, offsetTop: 0 }), null);
  assert.equal(computeSheetBox({ height: Number.NaN, offsetTop: 0 }), null);
  assert.equal(computeSheetBox({ height: 400, offsetTop: Number.POSITIVE_INFINITY }), null);
});
