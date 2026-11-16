import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeAuthRows,
  authGroupKey,
  createAuthTally,
  mergeAuthDay,
  normalizeAuthCode,
  sanitizeAuthSignal,
  sumAuthDays,
  type AuthGroup,
  type AuthRow,
} from './authStatsRules';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1';

const group = (over: Partial<AuthGroup> = {}): AuthGroup => ({
  device: 'iPhone', os: 'iOS', osVersion: '15', browser: 'Safari', build: 'index-abc.js', relay: false, ...over,
});
const row = (over: Partial<AuthGroup> = {}, counts: Record<string, number> = {}): AuthRow => {
  const g = group(over);
  return { key: authGroupKey(g), ...g, counts };
};
const thresholds = { minAttempts: 20, gapPoints: 25 };

describe('connexion Google : validation du signal', () => {
  it('accepte une étape simple et déduit l\'appareil de l\'user-agent', () => {
    const r = sanitizeAuthSignal({ step: 'popup_start', build: 'index-Ab1.js', relay: true }, IPHONE_UA);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.counter, 'popup_start');
      assert.deepEqual(r.group, { device: 'iPhone', os: 'iOS', osVersion: '15', browser: 'Safari', build: 'index-Ab1.js', relay: true });
    }
  });

  it('un échec garde son code d\'erreur Firebase s\'il est connu, sinon « other »', () => {
    const blocked = sanitizeAuthSignal({ step: 'popup_fail', detail: 'auth/popup-blocked' }, IPHONE_UA);
    assert.equal(blocked.ok && blocked.counter, 'popup_fail_popup-blocked');
    const weird = sanitizeAuthSignal({ step: 'redirect_fail', detail: 'auth/jean.dupont@exemple.fr' }, IPHONE_UA);
    assert.equal(weird.ok && weird.counter, 'redirect_fail_other');
    assert.equal(normalizeAuthCode(undefined), 'other');
    assert.equal(normalizeAuthCode('AUTH/Popup-Blocked'), 'popup-blocked');
  });

  it('refuse les étapes inconnues et ignore tout champ hors liste', () => {
    assert.equal(sanitizeAuthSignal({ step: 'hack' }, IPHONE_UA).ok, false);
    assert.equal(sanitizeAuthSignal(null, IPHONE_UA).ok, false);
    const r = sanitizeAuthSignal({ step: 'popup_ok', email: 'x@y.z', name: 'Gilles', relay: 'oui' }, IPHONE_UA);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(JSON.stringify(r).includes('Gilles'), false);
      assert.equal(JSON.stringify(r).includes('x@y.z'), false);
      assert.equal(r.group.relay, false, 'seul le booléen true active « relay »');
    }
  });

  it('nettoie la version de l\'application', () => {
    const r = sanitizeAuthSignal({ step: 'popup_ok', build: 'index-<script>.js' }, IPHONE_UA);
    assert.equal(r.ok && r.group.build, 'index-script.js');
  });
});

describe('connexion Google : cumul en mémoire et fusion', () => {
  it('additionne par jour et par groupe, vide et restaure', () => {
    const t = createAuthTally();
    t.record('2026-11-16', 'popup_start', group(), 100);
    t.record('2026-11-16', 'popup_start', group(), 100);
    t.record('2026-11-16', 'popup_ok', group(), 100);
    assert.equal(t.pendingCount(), 3);
    const drained = t.drain();
    assert.equal(t.pendingCount(), 0);
    assert.equal(drained[0].rows[0].counts.popup_start, 2);
    t.restore(drained[0].day, drained[0].rows, 100);
    assert.equal(t.pendingCount(), 3);
  });

  it('au-delà du plafond de groupes, les nouveaux passent sous « autres »', () => {
    const t = createAuthTally();
    t.record('d', 'popup_start', group({ build: 'a' }), 1);
    t.record('d', 'popup_start', group({ build: 'b' }), 1);
    const rows = t.drain()[0].rows;
    assert.equal(rows.length, 2);
    assert.ok(rows.some((r) => r.key === 'autres'));
  });

  it('fusionne dans le document existant sans perdre ce qui y était', () => {
    const existing = { day: 'd', rows: { [row().key]: row({}, { popup_start: 3, popup_ok: 2 }) } };
    const merged = mergeAuthDay(existing, 'd', [row({}, { popup_start: 1, popup_fail_popup_blocked: 1 })], 100);
    assert.equal(merged.rows[row().key].counts.popup_start, 4);
    assert.equal(merged.rows[row().key].counts.popup_ok, 2);
  });

  it('somme plusieurs jours', () => {
    const d1 = { day: 'a', rows: { [row().key]: row({}, { popup_start: 2 }) } };
    const d2 = { day: 'b', rows: { [row().key]: row({}, { popup_start: 5 }) } };
    assert.equal(sumAuthDays([d1, d2])[0].counts.popup_start, 7);
  });
});

describe('connexion Google : analyse', () => {
  it('signale un groupe dont les fenêtres échouent bien plus que chez les autres', () => {
    const rows = [
      row({ device: 'iPhone' }, { popup_start: 40, popup_ok: 10, 'popup_fail_popup-blocked': 30 }),
      row({ device: 'Android', os: 'Android', browser: 'Chrome' }, { popup_start: 200, popup_ok: 190, 'popup_fail_network-request-failed': 10 }),
    ];
    const out = analyzeAuthRows(rows, thresholds);
    const iphone = out.find((r) => r.device === 'iPhone')!;
    assert.equal(iphone.popupTechnicalRatePct, 75);
    assert.equal(iphone.othersPopupTechnicalRatePct, 5);
    assert.equal(iphone.suspect, true);
    assert.equal(out.find((r) => r.device === 'Android')!.suspect, false);
    assert.equal(out[0].device, 'iPhone', 'les suspects passent en premier');
  });

  it('ne compte jamais « fermée par l\'utilisateur » comme un échec technique', () => {
    const rows = [
      row({ device: 'iPhone' }, { popup_start: 40, 'popup_fail_popup-closed-by-user': 30, popup_ok: 10 }),
      row({ device: 'Android', os: 'Android' }, { popup_start: 200, popup_ok: 200 }),
    ];
    const iphone = analyzeAuthRows(rows, thresholds).find((r) => r.device === 'iPhone')!;
    assert.equal(iphone.popupTechnicalFailures, 0);
    assert.equal(iphone.popupAbandons, 30);
    assert.equal(iphone.suspect, false);
  });

  it('ne juge pas un groupe en dessous du volume minimum ni le groupe « autres »', () => {
    const few = analyzeAuthRows([row({}, { popup_start: 5, 'popup_fail_popup-blocked': 5 }), row({ device: 'X', os: 'X' }, { popup_start: 100, popup_ok: 100 })], thresholds);
    assert.equal(few.find((r) => r.device === 'iPhone')!.judged, false);
    const other: AuthRow = { key: 'autres', device: 'Autres', os: 'Autres', osVersion: '', browser: 'Autres', build: '', relay: false, counts: { popup_start: 50, 'popup_fail_popup-blocked': 50 } };
    const out = analyzeAuthRows([other, row({}, { popup_start: 100, popup_ok: 100 })], thresholds);
    assert.equal(out.find((r) => r.key === 'autres')!.suspect, false);
  });

  it('affiche le secours sans s\'en servir pour juger', () => {
    const rows = [row({}, { popup_start: 30, popup_ok: 30, redirect_start: 4, redirect_ok: 3, 'redirect_fail_web-storage-unsupported': 1, redirect_lost: 2 })];
    const r = analyzeAuthRows(rows, thresholds)[0];
    assert.equal(r.redirectStarts, 4);
    assert.equal(r.redirectOk, 3);
    assert.equal(r.redirectFailures, 1);
    assert.equal(r.redirectLost, 2);
    assert.equal(r.suspect, false);
  });

  it('sépare les groupes selon le domaine de connexion utilisé (relais ou direct)', () => {
    assert.notEqual(authGroupKey(group({ relay: true })), authGroupKey(group({ relay: false })));
  });
});
