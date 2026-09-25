/**
 * Lot 6 : conversion des derniers délais codés en dur (sanctions Fair-Play, invitations directes,
 * emotes, rythme des plis, battement de table). Vérifie que les valeurs réglées dans la config sont
 * effectivement appliquées, à la place des littéraux d'origine.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).require = () => ({ RoomManager: { getRoom: () => null } });

import { RoomManager } from './roomManager';
import { DEFAULT_ENGINE_CONFIG } from '../engine/engineConfig';

after(() => {
  // Ne pas laisser les réglages de test fuiter vers d'autres fichiers de test (ordre non garanti).
  RoomManager.updateEngineConfig({ ...DEFAULT_ENGINE_CONFIG });
});

describe('sanctions Fair-Play : durées lues depuis la config', () => {
  it('la suspension temporaire (5 abandons) utilise fairPlayTempBanMinutes', () => {
    RoomManager.updateEngineConfig({ fairPlayTempBanMinutes: 90 });
    const playerId = 'sanction_test_' + Math.random().toString(36).slice(2, 8);
    let result: ReturnType<typeof RoomManager.recordPlayerForfeit> | null = null;
    for (let i = 0; i < 5; i++) {
      result = RoomManager.recordPlayerForfeit(playerId, 'test');
    }
    assert.equal(result!.sanctionType, 'TEMP_BAN');
    const remainingMinutes = Math.round((result!.expiresAt! - Date.now()) / 60000);
    assert.ok(Math.abs(remainingMinutes - 90) <= 1, `attendu environ 90 min, obtenu ${remainingMinutes}`);
    assert.ok(result!.message.includes('90'), 'le message doit mentionner la durée réelle');
  });

  it('la restriction de création de table (3 abandons) utilise fairPlayRestrictCreateMinutes', () => {
    RoomManager.updateEngineConfig({ fairPlayRestrictCreateMinutes: 7 });
    const playerId = 'sanction_test_' + Math.random().toString(36).slice(2, 8);
    let result: ReturnType<typeof RoomManager.recordPlayerForfeit> | null = null;
    for (let i = 0; i < 3; i++) {
      result = RoomManager.recordPlayerForfeit(playerId, 'test');
    }
    assert.equal(result!.sanctionType, 'RESTRICT_CREATE_ROOM');
    const remainingMinutes = Math.round((result!.expiresAt! - Date.now()) / 60000);
    assert.ok(Math.abs(remainingMinutes - 7) <= 1, `attendu environ 7 min, obtenu ${remainingMinutes}`);
  });
});

describe('registre : bornes des nouveaux paramètres du lot 6', () => {
  it('les valeurs par défaut sont bien celles attendues', () => {
    assert.equal(DEFAULT_ENGINE_CONFIG.emoteCooldownMs, 1200);
    assert.equal(DEFAULT_ENGINE_CONFIG.emoteDisplayMs, 3500);
    assert.equal(DEFAULT_ENGINE_CONFIG.roomTickIntervalMs, 1000);
    assert.equal(DEFAULT_ENGINE_CONFIG.trickWinnerViewMs, 1050);
    assert.equal(DEFAULT_ENGINE_CONFIG.trickSweepMs, 350);
    assert.equal(DEFAULT_ENGINE_CONFIG.fairPlayRestrictCreateMinutes, 15);
    assert.equal(DEFAULT_ENGINE_CONFIG.fairPlayRestrictJoinMinutes, 30);
    assert.equal(DEFAULT_ENGINE_CONFIG.fairPlayTempBanMinutes, 60);
    assert.equal(DEFAULT_ENGINE_CONFIG.directInviteLifetimeSeconds, 120);
    assert.equal(DEFAULT_ENGINE_CONFIG.directInviteCooldownSeconds, 30);
  });

  it('une valeur hors bornes est ramenée à la borne la plus proche', () => {
    const updated = RoomManager.updateEngineConfig({ fairPlayTempBanMinutes: 99999, emoteCooldownMs: 1 });
    assert.equal(updated.fairPlayTempBanMinutes, 1440);
    assert.equal(updated.emoteCooldownMs, 500);
  });
});
