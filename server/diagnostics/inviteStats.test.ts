import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeInviteRows,
  createInviteTally,
  inviteGroupKey,
  mergeInviteDay,
  normalizeFailureMotif,
  sanitizeInviteSignal,
  sumInviteDays,
  type InviteGroup,
  type InviteRow,
} from './inviteStatsRules';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const group = (over: Partial<InviteGroup> = {}): InviteGroup => ({
  device: 'iPhone', os: 'iOS', osVersion: '15', browser: 'Safari', build: 'index-abc.js', channel: 'link', mode: 'free', ...over,
});
const row = (over: Partial<InviteGroup> = {}, counts: Record<string, number> = {}): InviteRow => {
  const g = group(over);
  return { key: inviteGroupKey(g), ...g, counts };
};
const thresholds = { minClicks: 20, gapPoints: 25 };

describe('parcours d\'invitation : validation du signal', () => {
  it('accepte les étapes simples et déduit l\'appareil de l\'user-agent', () => {
    const r = sanitizeInviteSignal({ step: 'click', channel: 'link', mode: 'free', build: 'index-Ab1.js' }, IPHONE_UA);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.counter, 'click');
      assert.deepEqual(r.group, { device: 'iPhone', os: 'iOS', osVersion: '15', browser: 'Safari', build: 'index-Ab1.js', channel: 'link', mode: 'free' });
    }
  });

  it('la carte exige un état connu, l\'échec un motif ramené à la liste fermée', () => {
    const card = sanitizeInviteSignal({ step: 'card', channel: 'link', detail: 'FULL' }, IPHONE_UA);
    assert.equal(card.ok && card.counter, 'card_FULL');
    assert.equal(sanitizeInviteSignal({ step: 'card', channel: 'link', detail: 'ABC123' }, IPHONE_UA).ok, false);
    assert.equal(sanitizeInviteSignal({ step: 'card', channel: 'link' }, IPHONE_UA).ok, false);
    const fail = sanitizeInviteSignal({ step: 'failed', channel: 'notification', detail: 'TIMEOUT' }, ANDROID_UA);
    assert.equal(fail.ok && fail.counter, 'fail_TIMEOUT');
    const unknown = sanitizeInviteSignal({ step: 'failed', channel: 'link', detail: 'code-de-table-ABCD' }, ANDROID_UA);
    assert.equal(unknown.ok && unknown.counter, 'fail_UNKNOWN');
  });

  it('refuse une étape, un canal ou un corps inconnu ; le mode vaut gratuit par défaut', () => {
    assert.equal(sanitizeInviteSignal({ step: 'autre', channel: 'link' }, IPHONE_UA).ok, false);
    assert.equal(sanitizeInviteSignal({ step: 'click', channel: 'email' }, IPHONE_UA).ok, false);
    assert.equal(sanitizeInviteSignal(null, IPHONE_UA).ok, false);
    const r = sanitizeInviteSignal({ step: 'click', channel: 'link', mode: 'bizarre' }, IPHONE_UA);
    assert.equal(r.ok && r.group.mode, 'free');
  });

  it('le mode Kora Cash est accepté par le format, sans que rien ne change pour les données gratuites', () => {
    const r = sanitizeInviteSignal({ step: 'click', channel: 'link', mode: 'cash' }, IPHONE_UA);
    assert.equal(r.ok && r.group.mode, 'cash');
    assert.notEqual(inviteGroupKey(group({ mode: 'cash' })), inviteGroupKey(group()));
  });

  it('ne garde jamais le modèle du téléphone ni un texte libre du détail', () => {
    const r = sanitizeInviteSignal({ step: 'failed', channel: 'link', detail: 'Joueur Gilles' }, ANDROID_UA);
    assert.equal(r.ok, true);
    if (r.ok) {
      const text = JSON.stringify(r);
      assert.equal(text.includes('SM-A135F'), false);
      assert.equal(text.includes('Gilles'), false);
    }
  });

  it('ramène les codes d\'erreur à la liste fermée', () => {
    assert.equal(normalizeFailureMotif('ROOM_NOT_FOUND'), 'ROOM_NOT_FOUND');
    assert.equal(normalizeFailureMotif('room_not_found'), 'ROOM_NOT_FOUND');
    assert.equal(normalizeFailureMotif('AUTH_TOKEN_INVALID'), 'AUTH');
    assert.equal(normalizeFailureMotif('QUELQUE_CHOSE'), 'UNKNOWN');
    assert.equal(normalizeFailureMotif(42), 'UNKNOWN');
    assert.equal(normalizeFailureMotif(undefined), 'UNKNOWN');
  });

  it('la clé distingue le canal, le mode et la famille', () => {
    assert.equal(inviteGroupKey(group()), inviteGroupKey(group()));
    assert.notEqual(inviteGroupKey(group()), inviteGroupKey(group({ channel: 'notification' })));
    assert.notEqual(inviteGroupKey(group()), inviteGroupKey(group({ osVersion: '16' })));
    assert.match(inviteGroupKey(group()), /^[0-9a-f]{16}$/);
  });
});

describe('parcours d\'invitation : cumul en mémoire', () => {
  it('additionne par jour, groupe et étape, puis se vide', () => {
    const t = createInviteTally();
    t.record('j1', 'opened', group(), 100);
    t.record('j1', 'click', group(), 100);
    t.record('j1', 'click', group(), 100);
    t.record('j1', 'joined', group({ channel: 'notification' }), 100);
    t.record('j2', 'opened', group(), 100);
    assert.equal(t.pendingCount(), 5);
    const out = t.drain();
    assert.equal(out.length, 2);
    const j1 = out.find((d) => d.day === 'j1')!;
    assert.equal(j1.rows.length, 2);
    assert.equal(j1.rows.find((r) => r.channel === 'link')!.counts.click, 2);
    assert.equal(t.pendingCount(), 0);
  });

  it('au-delà du plafond, les nouveaux groupes vont sous « autres », séparés par canal', () => {
    const t = createInviteTally();
    t.record('j', 'click', group({ build: 'a' }), 2);
    t.record('j', 'click', group({ build: 'b' }), 2);
    t.record('j', 'click', group({ build: 'c' }), 2);
    t.record('j', 'click', group({ build: 'd', channel: 'notification' }), 2);
    const rows = t.drain()[0].rows;
    assert.equal(rows.length, 4);
    assert.equal(rows.filter((r) => r.key.startsWith('autres')).length, 2);
  });

  it('restore remet en attente ce qui n\'a pas pu être écrit', () => {
    const t = createInviteTally();
    t.record('j', 'click', group(), 100);
    t.record('j', 'click', group(), 100);
    t.record('j', 'fail_TIMEOUT', group(), 100);
    const out = t.drain();
    t.restore(out[0].day, out[0].rows, 100);
    t.record('j', 'click', group(), 100);
    const rows = t.drain()[0].rows;
    assert.deepEqual([rows[0].counts.click, rows[0].counts.fail_TIMEOUT], [3, 1]);
  });
});

describe('parcours d\'invitation : fusion dans le document du jour', () => {
  it('ajoute aux compteurs existants', () => {
    const existing = { day: 'j', rows: { [row().key]: row({}, { click: 10, joined: 8 }) } };
    const merged = mergeInviteDay(existing, 'j', [row({}, { click: 5, joined: 4, fail_TIMEOUT: 1 })], 100);
    assert.deepEqual(merged.rows[row().key].counts, { click: 15, joined: 12, fail_TIMEOUT: 1 });
  });

  it('respecte le plafond de groupes du document', () => {
    const existing = { day: 'j', rows: { [row({ build: 'a' }).key]: row({ build: 'a' }, { click: 1 }) } };
    const merged = mergeInviteDay(existing, 'j', [row({ build: 'b' }, { click: 3 }), row({ build: 'c' }, { click: 4 })], 1);
    assert.equal(Object.keys(merged.rows).length, 2);
    assert.equal(merged.rows.autres_link_free.counts.click, 7);
  });

  it('un document absent ou abîmé ne fait pas planter la fusion', () => {
    assert.equal(mergeInviteDay(null, 'j', [row({}, { click: 2 })], 100).rows[row().key].counts.click, 2);
    const damaged = mergeInviteDay({ day: 'j', rows: { x: { ...row(), counts: { click: 'oups' as unknown as number } } } }, 'j', [], 100);
    assert.equal(damaged.rows.x.counts.click, undefined);
  });

  it('additionne plusieurs jours', () => {
    const total = sumInviteDays([
      { day: 'a', rows: { [row().key]: row({}, { click: 10, joined: 8 }) } },
      { day: 'b', rows: { [row().key]: row({}, { click: 5, joined: 5 }) } },
    ]);
    assert.equal(total.length, 1);
    assert.deepEqual([total[0].counts.click, total[0].counts.joined], [15, 13]);
  });
});

describe('parcours d\'invitation : analyse et alerte', () => {
  const androidOk = row({ device: 'Android', os: 'Android', browser: 'Chrome', osVersion: '13' }, { opened: 400, card_OPEN: 390, click: 380, joined: 370, fail_TIMEOUT: 4, fail_JOIN_REFUSED: 6 });

  it('signale un groupe dont les clics échouent techniquement bien plus que chez les autres', () => {
    const iphone = row({}, { opened: 100, card_OPEN: 95, click: 80, joined: 20, fail_TIMEOUT: 50, fail_EXCEPTION: 5, fail_ROOM_NOT_FOUND: 5 });
    const out = analyzeInviteRows([iphone, androidOk], thresholds);
    assert.equal(out[0].device, 'iPhone');
    assert.equal(out[0].suspect, true);
    assert.equal(out[0].technicalFailures, 55);
    assert.equal(out[0].normalRefusals, 5);
    assert.equal(out[0].technicalRatePct, 68.8);
    assert.equal(out[1].suspect, false);
  });

  it('les refus normaux ne comptent jamais comme des échecs', () => {
    const full = row({}, { click: 100, joined: 10, fail_JOIN_REFUSED: 40, fail_ROOM_NOT_FOUND: 30, fail_BANNED: 5, fail_MAINTENANCE: 5, fail_ACTIVE_GAME_IN_PROGRESS: 10 });
    const out = analyzeInviteRows([full, androidOk], thresholds);
    const r = out.find((x) => x.device === 'iPhone')!;
    assert.equal(r.technicalFailures, 0);
    assert.equal(r.normalRefusals, 90);
    assert.equal(r.suspect, false);
  });

  it('ne juge pas un groupe qui a trop peu de tentatives', () => {
    const few = row({}, { click: 5, fail_TIMEOUT: 5 });
    const r = analyzeInviteRows([few, androidOk], thresholds).find((x) => x.device === 'iPhone')!;
    assert.equal(r.judged, false);
    assert.equal(r.suspect, false);
  });

  it('un taux d\'échec élevé partout n\'accuse personne : on compare aux autres, pas à un chiffre inventé', () => {
    const a = row({}, { click: 100, fail_TIMEOUT: 40, joined: 60 });
    const b = row({ device: 'Android', os: 'Android', browser: 'Chrome' }, { click: 100, fail_TIMEOUT: 42, joined: 58 });
    assert.equal(analyzeInviteRows([a, b], thresholds).some((r) => r.suspect), false);
  });

  it('compare chaque groupe aux autres du même canal seulement', () => {
    const notifFail = row({ channel: 'notification' }, { click: 100, fail_TIMEOUT: 60, joined: 40 });
    const linkOk = row({ device: 'Android', os: 'Android', browser: 'Chrome' }, { click: 100, joined: 95, fail_TIMEOUT: 2 });
    const out = analyzeInviteRows([notifFail, linkOk], thresholds);
    assert.equal(out.find((r) => r.channel === 'notification')!.othersTechnicalRatePct, null);
    assert.equal(out.some((r) => r.suspect), false);
  });

  it('les clics sans réponse sont comptés à part, sans déclencher l\'alerte', () => {
    const silent = row({}, { click: 100, joined: 50, fail_JOIN_REFUSED: 10 });
    const r = analyzeInviteRows([silent, androidOk], thresholds).find((x) => x.device === 'iPhone')!;
    assert.equal(r.noAnswer, 40);
    assert.equal(r.suspect, false);
  });

  it('le groupe « autres » n\'est jamais jugé, et aucun clic ne provoque pas de division par zéro', () => {
    const autres = { ...row({}, { click: 100, fail_TIMEOUT: 100 }), key: 'autres_link_free' };
    assert.equal(analyzeInviteRows([autres, androidOk], thresholds).some((r) => r.suspect), false);
    const out = analyzeInviteRows([row({}, { opened: 3 }), row({ device: 'X' }, {})], thresholds);
    assert.ok(out.every((r) => Number.isFinite(r.technicalRatePct)));
  });
});
