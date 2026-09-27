/**
 * Garde-fou : un profil ne doit jamais être enregistré comme "invité" si Firebase confirme, à l'instant
 * présent, une session Google active. Empêche toute nouvelle variante du bug où un compte authentifié
 * bascule silencieusement en invité anonyme (voir aussi la correction de getLocalProfile : isGuest ne
 * doit jamais devenir vrai par défaut faute d'une information manquante).
 */
process.env.NODE_ENV = 'test';
if (typeof (globalThis as any).localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => { store.set(key, String(val)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    location: { protocol: 'http:', host: 'localhost:3000' },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = { hidden: false, addEventListener: () => {}, removeEventListener: () => {} };
}

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { auth } from '../lib/firebase';
import { playerProfileService } from './playerProfileService';

const PROFILE_KEY = 'njambo_player_profile_v1';

describe('garde-fou : Google authentifié + profil marqué invité par erreur', () => {
  beforeEach(() => {
    localStorage.clear();
    (auth as any).currentUser = null;
  });

  it('corrige isGuest avant écriture si Firebase confirme une session Google active', () => {
    (auth as any).currentUser = {
      uid: 'google_uid_test_1',
      isAnonymous: false,
      providerData: [{ providerId: 'google.com' }],
    };

    const badProfile: any = {
      uid: 'google_uid_test_1',
      displayName: 'TestJoueur',
      email: 'test@example.com',
      photoURL: null,
      avatarId: 'lion',
      isGuest: true, // incohérent avec la session Google active : doit être corrigé avant écriture
      chips: 500,
      stats: {},
      fairPlay: {},
      honorificTitleId: 'APPRENTI',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    playerProfileService.saveLocalProfile(badProfile);

    const stored = JSON.parse(localStorage.getItem(PROFILE_KEY)!);
    assert.equal(stored.isGuest, false, 'le profil écrit ne doit plus être marqué invité');
    assert.equal(stored.uid, 'google_uid_test_1');
  });

  it('laisse isGuest à true si aucune session Google n\'est active (comportement normal, invité réel)', () => {
    (auth as any).currentUser = null;

    const guestProfile: any = {
      uid: 'usr_guest_test_1',
      displayName: 'Invité',
      email: null,
      photoURL: null,
      avatarId: 'lion',
      isGuest: true,
      chips: 1000,
      stats: {},
      fairPlay: {},
      honorificTitleId: 'APPRENTI',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    playerProfileService.saveLocalProfile(guestProfile);

    const stored = JSON.parse(localStorage.getItem(PROFILE_KEY)!);
    assert.equal(stored.isGuest, true, 'un invité réel (sans session Google) doit rester invité');
  });

  it('ne touche pas un profil déjà correctement marqué non-invité', () => {
    (auth as any).currentUser = {
      uid: 'google_uid_test_2',
      isAnonymous: false,
      providerData: [{ providerId: 'google.com' }],
    };

    const goodProfile: any = {
      uid: 'google_uid_test_2',
      displayName: 'DéjàBon',
      email: 'dejabon@example.com',
      photoURL: null,
      avatarId: 'lion',
      isGuest: false,
      chips: 500,
      stats: {},
      fairPlay: {},
      honorificTitleId: 'APPRENTI',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    playerProfileService.saveLocalProfile(goodProfile);

    const stored = JSON.parse(localStorage.getItem(PROFILE_KEY)!);
    assert.equal(stored.isGuest, false);
    assert.equal(stored.uid, 'google_uid_test_2');
  });
});
