import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ENGINE_CONFIG, getEngineConfig, updateEngineConfig } from './engineConfig';

describe('Config de parole des bots (multijoueur)', () => {
  it('fournit les valeurs par défaut des réglages de répliques', () => {
    assert.equal(DEFAULT_ENGINE_CONFIG.botEmoteCooldownSeconds, 7);
    assert.equal(DEFAULT_ENGINE_CONFIG.botMaxEmotesPerRound, 2);
    assert.equal(DEFAULT_ENGINE_CONFIG.botEmoteHokutoRatePct, 28);
    assert.equal(DEFAULT_ENGINE_CONFIG.botEmoteMbapRatePct, 25);
    assert.equal(DEFAULT_ENGINE_CONFIG.botEmoteLeadDiscardRatePct, 10);
    assert.equal(DEFAULT_ENGINE_CONFIG.botEmoteCriticalBypassLimit, true);
  });

  it('ramène le délai entre répliques dans ses bornes', () => {
    updateEngineConfig({ botEmoteCooldownSeconds: 9999 });
    assert.equal(getEngineConfig().botEmoteCooldownSeconds, 60);
    updateEngineConfig({ botEmoteCooldownSeconds: 7 });
    assert.equal(getEngineConfig().botEmoteCooldownSeconds, 7);
  });

  it('accepte les réglages de répliques envoyés par katika', () => {
    updateEngineConfig({ botMaxEmotesPerRound: 0 });
    assert.equal(getEngineConfig().botMaxEmotesPerRound, 0);
    updateEngineConfig({ botMaxEmotesPerRound: 2 });
  });
});
