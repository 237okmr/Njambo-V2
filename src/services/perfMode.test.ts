/**
 * Mode de performance : détection des signaux navigateur (mémoire, cœurs, connexion, préférence système)
 * et détecteur de saccades (utile quand ces signaux manquent, notamment sur iPhone).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectLowEndSignals, startJankSampling } from './perfMode';

describe('détection des signaux navigateur bas de gamme (detectLowEndSignals)', () => {
  it('aucun signal : renvoie false', () => {
    assert.equal(detectLowEndSignals({}), false);
  });

  it('mémoire faible (4 Go ou moins) déclenche le mode léger', () => {
    assert.equal(detectLowEndSignals({ deviceMemory: 2 }), true);
    assert.equal(detectLowEndSignals({ deviceMemory: 4 }), true);
    assert.equal(detectLowEndSignals({ deviceMemory: 8 }), false);
  });

  it('peu de cœurs (4 ou moins) déclenche le mode léger', () => {
    assert.equal(detectLowEndSignals({ hardwareConcurrency: 4 }), true);
    assert.equal(detectLowEndSignals({ hardwareConcurrency: 8 }), false);
  });

  it('connexion économe (saveData) ou lente (2g/3g) déclenche le mode léger', () => {
    assert.equal(detectLowEndSignals({ connection: { saveData: true } }), true);
    assert.equal(detectLowEndSignals({ connection: { effectiveType: '3g' } }), true);
    assert.equal(detectLowEndSignals({ connection: { effectiveType: '2g' } }), true);
    assert.equal(detectLowEndSignals({ connection: { effectiveType: '4g' } }), false);
  });

  it('une valeur de 0 (information non fournie par certains navigateurs) n\'est jamais traitée comme un signal', () => {
    assert.equal(detectLowEndSignals({ deviceMemory: 0, hardwareConcurrency: 0 }), false);
  });
});

describe('détecteur de saccades (startJankSampling)', () => {
  it('bascule en mode léger si le temps moyen entre deux images dépasse le seuil', () => {
    let t = 0;
    const raf = (cb: (t: number) => void) => {
      t += 80;
      if (t <= 400) cb(t);
      return 0;
    };
    let triggered = false;
    const stop = startJankSampling(200, 50, () => { triggered = true; }, raf);
    assert.equal(triggered, true, 'le mode léger doit se déclencher pour des images lentes');
    stop();
  });

  it('ne déclenche rien pour des images fluides', () => {
    let t = 0;
    let calls = 0;
    const raf = (cb: (t: number) => void) => {
      t += 16;
      calls++;
      if (calls <= 30) cb(t);
      return 0;
    };
    let triggered = false;
    const stop = startJankSampling(200, 50, () => { triggered = true; }, raf);
    assert.equal(triggered, false, 'des images fluides ne doivent jamais déclencher le mode léger');
    stop();
  });
});
