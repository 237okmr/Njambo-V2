/**
 * RÈGLE PERMANENTE DU PALMARÈS :
 * Tests unitaires validant l'éligibilité stricte au Palmarès (joueurs Google uniquement, stats valides, aucun bot).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isEligibleLeaderboardUser,
  getLeaderboardIneligibilityReasons,
} from './masteryConfig.ts';

describe('Règle Permanente du Palmarès - Éligibilité Utilisateurs', () => {
  const validGoogleUser = {
    uid: 'google_user_12345',
    displayName: 'Samuel Eto’o',
    isGuest: false,
    authProvider: 'google.com',
    isBot: false,
    stats: {
      partiesPlayed: 10,
      partiesWon: 6,
      gamesPlayed: 10,
      gamesWon: 6,
      manchesPlayed: 25,
      manchesWon: 15,
      koraCount: 3,
      doubleKoraCount: 1,
      masteryScore: 120,
      chips: 2500,
    },
  };

  it('Accepte un joueur humain authentifié par Google avec des stats valides', () => {
    assert.strictEqual(isEligibleLeaderboardUser(validGoogleUser.uid, validGoogleUser), true);
    assert.deepStrictEqual(getLeaderboardIneligibilityReasons(validGoogleUser.uid, validGoogleUser), []);
  });

  it('Rejette un compte invité / anonyme (isGuest = true)', () => {
    const guestUser = { ...validGoogleUser, isGuest: true };
    assert.strictEqual(isEligibleLeaderboardUser(guestUser.uid, guestUser), false);
    assert.ok(getLeaderboardIneligibilityReasons(guestUser.uid, guestUser).includes('DRAPEAU_INVITE'));
  });

  it('Rejette un compte sans authProvider google.com', () => {
    const customUser = { ...validGoogleUser, authProvider: 'anonymous' };
    assert.strictEqual(isEligibleLeaderboardUser(customUser.uid, customUser), false);
    assert.ok(getLeaderboardIneligibilityReasons(customUser.uid, customUser).includes('SANS_MARQUEUR_GOOGLE'));

    const noProviderUser = { ...validGoogleUser, authProvider: undefined };
    assert.strictEqual(isEligibleLeaderboardUser(noProviderUser.uid, noProviderUser), false);
    assert.ok(getLeaderboardIneligibilityReasons(noProviderUser.uid, noProviderUser).includes('SANS_MARQUEUR_GOOGLE'));
  });

  it('Rejette un bot avec drapeau isBot: true', () => {
    const botUser = { ...validGoogleUser, isBot: true };
    assert.strictEqual(isEligibleLeaderboardUser(botUser.uid, botUser), false);
    assert.ok(getLeaderboardIneligibilityReasons(botUser.uid, botUser).includes('ID_BOT'));
  });

  it('Rejette les préfixes d’UID interdits (champ_kora_, bot_, usr_, etc.)', () => {
    const testCases = [
      'champ_kora_1',
      'bot_expert_3',
      'usr_local',
      'guest_998',
      'test_player',
      'demo_user',
      'mock_123',
      'fake_account',
    ];

    for (const uid of testCases) {
      const u = { ...validGoogleUser, uid };
      assert.strictEqual(isEligibleLeaderboardUser(u.uid, u), false, `Devrait rejeter l'UID ${uid}`);
      assert.ok(getLeaderboardIneligibilityReasons(u.uid, u).includes('ID_BOT'));
    }
  });

  it('Rejette les pseudonymes génériques de substitution', () => {
    const genericNames = ['Joueur', 'joueur anonyme', 'BOT', 'Adversaire', 'Vous', 'ordinateur'];
    for (const displayName of genericNames) {
      const u = { ...validGoogleUser, displayName };
      assert.strictEqual(isEligibleLeaderboardUser(u.uid, u), false, `Devrait rejeter le nom ${displayName}`);
      assert.ok(getLeaderboardIneligibilityReasons(u.uid, u).includes('NOM_GENERIQUE'));
    }
  });

  it('Rejette les utilisateurs n’ayant jamais joué (0 partie)', () => {
    const zeroGamesUser = {
      ...validGoogleUser,
      stats: {
        partiesPlayed: 0,
        partiesWon: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        koraCount: 0,
        doubleKoraCount: 0,
        masteryScore: 0,
      },
    };
    assert.strictEqual(isEligibleLeaderboardUser(zeroGamesUser.uid, zeroGamesUser), false);
    assert.ok(getLeaderboardIneligibilityReasons(zeroGamesUser.uid, zeroGamesUser).includes('AUCUNE_PARTIE'));
  });

  it('Rejette les statistiques incohérentes (victoires > parties ou double kora > kora)', () => {
    const invalidVictories = {
      ...validGoogleUser,
      stats: {
        ...validGoogleUser.stats,
        partiesPlayed: 5,
        partiesWon: 10, // Incohérent
      },
    };
    assert.strictEqual(isEligibleLeaderboardUser(invalidVictories.uid, invalidVictories), false);
    assert.ok(getLeaderboardIneligibilityReasons(invalidVictories.uid, invalidVictories).includes('STATS_INVALIDES'));

    const invalidKoras = {
      ...validGoogleUser,
      stats: {
        ...validGoogleUser.stats,
        koraCount: 1,
        doubleKoraCount: 4, // Incohérent
      },
    };
    assert.strictEqual(isEligibleLeaderboardUser(invalidKoras.uid, invalidKoras), false);
    assert.ok(getLeaderboardIneligibilityReasons(invalidKoras.uid, invalidKoras).includes('STATS_INVALIDES'));
  });
});
