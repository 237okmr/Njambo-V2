import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearRedirectMarker,
  isIosDevice,
  readRedirectMarker,
  REDIRECT_MARKER_KEY,
  resolveAuthDomain,
  shouldFallbackToRedirect,
  writeRedirectMarker,
} from './authFlow';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('connexion de secours : appareil', () => {
  it('reconnaît iPhone, iPad et iPad déguisé en Mac, pas les autres', () => {
    assert.equal(isIosDevice(IPHONE), true);
    assert.equal(isIosDevice(IPAD_AS_MAC, 5), true);
    assert.equal(isIosDevice(IPAD_AS_MAC, 0), false, 'un vrai Mac n\'a pas d\'écran tactile');
    assert.equal(isIosDevice(ANDROID, 5), false);
  });
});

describe('connexion de secours : décision', () => {
  it('bascule seulement réglage ouvert, sur iOS, après un échec net de la fenêtre', () => {
    const ok = { enabled: true, ios: true, errorCode: 'auth/popup-blocked' };
    assert.equal(shouldFallbackToRedirect(ok), true);
    assert.equal(shouldFallbackToRedirect({ ...ok, errorCode: 'auth/operation-not-supported-in-this-environment' }), true);
    assert.equal(shouldFallbackToRedirect({ ...ok, errorCode: 'auth/web-storage-unsupported' }), true);
    assert.equal(shouldFallbackToRedirect({ ...ok, enabled: false }), false, 'réglage fermé : rien ne change');
    assert.equal(shouldFallbackToRedirect({ ...ok, ios: false }), false, 'hors iOS : rien ne change');
  });

  it('un abandon, un réseau coupé ou une erreur inconnue ne relancent rien', () => {
    for (const errorCode of ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/network-request-failed', 'auth/too-many-requests', 'inconnu']) {
      assert.equal(shouldFallbackToRedirect({ enabled: true, ios: true, errorCode }), false, errorCode);
    }
  });
});

describe('connexion de secours : domaine de connexion', () => {
  const base = { configDomain: 'projet.firebaseapp.com', host: 'jeu.exemple.org' };
  it('prend le domaine du jeu seulement sur iOS réglage ouvert', () => {
    assert.equal(resolveAuthDomain({ ...base, enabled: true, ios: true }), 'jeu.exemple.org');
    assert.equal(resolveAuthDomain({ ...base, enabled: true, ios: false }), 'projet.firebaseapp.com');
    assert.equal(resolveAuthDomain({ ...base, enabled: false, ios: true }), 'projet.firebaseapp.com');
    assert.equal(resolveAuthDomain({ ...base, host: '', enabled: true, ios: true }), 'projet.firebaseapp.com');
  });
});

describe('connexion de secours : marqueur de retour', () => {
  it('se relit tant qu\'il est récent, puis s\'efface', () => {
    const s = memoryStorage();
    writeRedirectMarker(s, { at: 1000, relay: true });
    assert.deepEqual(readRedirectMarker(s, 5000, 600_000), { at: 1000, relay: true });
    clearRedirectMarker(s);
    assert.equal(readRedirectMarker(s, 5000, 600_000), null);
  });

  it('un marqueur trop ancien, venu du futur ou illisible est ignoré', () => {
    const s = memoryStorage();
    writeRedirectMarker(s, { at: 1000, relay: false });
    assert.equal(readRedirectMarker(s, 1000 + 600_001, 600_000), null);
    writeRedirectMarker(s, { at: 10_000_000, relay: false });
    assert.equal(readRedirectMarker(s, 1000, 600_000), null);
    s.setItem(REDIRECT_MARKER_KEY, '{pas du json');
    assert.equal(readRedirectMarker(s, 1000, 600_000), null);
  });

  it('un stockage qui plante ne casse rien', () => {
    const broken = {
      getItem: () => { throw new Error('refusé'); },
      setItem: () => { throw new Error('refusé'); },
      removeItem: () => { throw new Error('refusé'); },
    };
    writeRedirectMarker(broken, { at: 1, relay: false });
    clearRedirectMarker(broken);
    assert.equal(readRedirectMarker(broken, 2, 10), null);
  });
});
