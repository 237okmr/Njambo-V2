/**
 * Reconnexion progressive : 1, 2, 4, 8 s... plafonnée, avec une variation aléatoire de ±20 %.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeReconnectDelayMs } from './reconnectBackoff';

const noJitter = () => 0.5; // random() = 0.5 => jitter neutre (facteur exactement 1)

describe('reconnexion progressive (computeReconnectDelayMs)', () => {
  it('double à chaque tentative, sans jitter (1, 2, 4, 8 s)', () => {
    const base = 1000;
    const max = 60000;
    assert.equal(computeReconnectDelayMs(0, base, max, 0.2, noJitter), 1000);
    assert.equal(computeReconnectDelayMs(1, base, max, 0.2, noJitter), 2000);
    assert.equal(computeReconnectDelayMs(2, base, max, 0.2, noJitter), 4000);
    assert.equal(computeReconnectDelayMs(3, base, max, 0.2, noJitter), 8000);
  });

  it('ne dépasse jamais le plafond', () => {
    const delay = computeReconnectDelayMs(20, 1000, 10000, 0.2, noJitter);
    assert.equal(delay, 10000);
  });

  it('la variation aléatoire reste dans ±20 % de la valeur nominale', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const delay = computeReconnectDelayMs(2, 1000, 60000, 0.2, () => r);
      assert.ok(delay >= 4000 * 0.8 - 1 && delay <= 4000 * 1.2 + 1, `delay ${delay} hors plage pour random=${r}`);
    }
  });

  it('n\'est jamais négatif, même avec des entrées limites', () => {
    assert.ok(computeReconnectDelayMs(-5, 1000, 10000) >= 0);
    assert.ok(computeReconnectDelayMs(0, 0, 0) >= 0);
  });
});
