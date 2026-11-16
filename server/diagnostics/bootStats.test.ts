import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeBootFamilies,
  bootFamilyKey,
  createBootTally,
  mergeBootDay,
  recentDayKeys,
  sanitizeBootSignal,
  sumBootDays,
  type BootFamily,
  type BootFamilyRow,
} from './bootStatsRules';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const fam = (over: Partial<BootFamily> = {}): BootFamily => ({ device: 'iPhone', os: 'iOS', osVersion: '15', browser: 'Safari', build: 'index-abc.js', ...over });
const row = (over: Partial<BootFamilyRow> = {}): BootFamilyRow => {
  const f = fam(over);
  return { key: bootFamilyKey(f), ...f, started: 0, home: 0, ...over };
};

describe('démarrages : validation du signal', () => {
  it('accepte start et home, déduit la famille de l\'user-agent et ne garde que la version majeure', () => {
    const r = sanitizeBootSignal({ step: 'start', build: 'index-Ab1.js' }, IPHONE_UA);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.step, 'start');
      assert.deepEqual(r.family, { device: 'iPhone', os: 'iOS', osVersion: '15', browser: 'Safari', build: 'index-Ab1.js' });
    }
  });

  it('ne retient jamais le modèle de téléphone', () => {
    const r = sanitizeBootSignal({ step: 'home' }, ANDROID_UA);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(JSON.stringify(r.family).includes('SM-A135F'), false);
  });

  it('refuse un type de signal inconnu ou un corps absent', () => {
    assert.equal(sanitizeBootSignal({ step: 'autre' }, IPHONE_UA).ok, false);
    assert.equal(sanitizeBootSignal(null, IPHONE_UA).ok, false);
    assert.equal(sanitizeBootSignal('start', IPHONE_UA).ok, false);
  });

  it('nettoie et borne la version de l\'application', () => {
    const r = sanitizeBootSignal({ step: 'start', build: `a b/c<script>${'x'.repeat(200)}` }, IPHONE_UA);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.match(r.family.build, /^[A-Za-z0-9._-]*$/);
      assert.ok(r.family.build.length <= 60);
    }
  });

  it('la clé d\'une famille est stable, sans caractère gênant pour Firestore, et distingue les versions', () => {
    assert.equal(bootFamilyKey(fam()), bootFamilyKey(fam()));
    assert.notEqual(bootFamilyKey(fam()), bootFamilyKey(fam({ osVersion: '16' })));
    assert.notEqual(bootFamilyKey(fam()), bootFamilyKey(fam({ build: 'index-zzz.js' })));
    assert.match(bootFamilyKey(fam()), /^[0-9a-f]{16}$/);
  });
});

describe('démarrages : cumul en mémoire', () => {
  it('additionne par jour et par famille, puis se vide', () => {
    const t = createBootTally();
    t.record('2026-11-13', 'start', fam(), 100);
    t.record('2026-11-13', 'start', fam(), 100);
    t.record('2026-11-13', 'home', fam(), 100);
    t.record('2026-11-14', 'start', fam(), 100);
    assert.equal(t.pendingCount(), 4);
    const out = t.drain();
    assert.equal(out.length, 2);
    const d13 = out.find((d) => d.day === '2026-11-13')!;
    assert.equal(d13.rows.length, 1);
    assert.deepEqual([d13.rows[0].started, d13.rows[0].home], [2, 1]);
    assert.equal(t.pendingCount(), 0);
  });

  it('au-delà du plafond de familles, les nouvelles vont sous « autres »', () => {
    const t = createBootTally();
    t.record('j', 'start', fam({ build: 'a' }), 2);
    t.record('j', 'start', fam({ build: 'b' }), 2);
    t.record('j', 'start', fam({ build: 'c' }), 2);
    t.record('j', 'start', fam({ build: 'd' }), 2);
    t.record('j', 'start', fam({ build: 'a' }), 2); // famille déjà connue : reste elle-même
    const rows = t.drain()[0].rows;
    assert.equal(rows.length, 3);
    const autres = rows.find((r) => r.key === 'autres')!;
    assert.equal(autres.started, 2);
    assert.equal(rows.find((r) => r.build === 'a')!.started, 2);
  });

  it('restore remet en attente ce qui n\'a pas pu être écrit, sans rien perdre', () => {
    const t = createBootTally();
    t.record('j', 'start', fam(), 100);
    t.record('j', 'start', fam(), 100);
    t.record('j', 'home', fam(), 100);
    const out = t.drain();
    t.restore(out[0].day, out[0].rows, 100);
    t.record('j', 'start', fam(), 100);
    const rows = t.drain()[0].rows;
    assert.deepEqual([rows[0].started, rows[0].home], [3, 1]);
  });
});

describe('démarrages : fusion dans le document du jour', () => {
  it('ajoute aux compteurs existants', () => {
    const existing = { day: 'j', families: { [row().key]: row({ started: 10, home: 9 }) } };
    const merged = mergeBootDay(existing, 'j', [row({ started: 5, home: 4 })], 100);
    const r = merged.families[row().key];
    assert.deepEqual([r.started, r.home], [15, 13]);
  });

  it('respecte le plafond de familles du document', () => {
    const existing = { day: 'j', families: { [row({ build: 'a' }).key]: row({ build: 'a', started: 1 }) } };
    const merged = mergeBootDay(existing, 'j', [row({ build: 'b', started: 3 }), row({ build: 'c', started: 4 })], 1);
    assert.equal(Object.keys(merged.families).length, 2);
    assert.equal(merged.families.autres.started, 7);
  });

  it('un document absent ou abîmé ne fait pas planter la fusion', () => {
    const merged = mergeBootDay(null, 'j', [row({ started: 2 })], 100);
    assert.equal(merged.families[row().key].started, 2);
    const damaged = mergeBootDay({ day: 'j', families: { x: { ...row(), started: 'oups' as unknown as number } } }, 'j', [], 100);
    assert.equal(damaged.families.x.started, 0);
  });

  it('additionne plusieurs jours', () => {
    const days = [
      { day: 'a', families: { [row().key]: row({ started: 10, home: 8 }) } },
      { day: 'b', families: { [row().key]: row({ started: 5, home: 5 }) } },
    ];
    const total = sumBootDays(days);
    assert.equal(total.length, 1);
    assert.deepEqual([total[0].started, total[0].home], [15, 13]);
  });
});

describe('démarrages : détection d\'une famille suspecte', () => {
  const thresholds = { minStarts: 30, gapPoints: 25 };

  it('signale une famille dont l\'accueil s\'affiche bien moins que chez les autres', () => {
    const rows = [
      row({ device: 'iPhone', osVersion: '15', started: 100, home: 20 }),
      row({ device: 'Android', os: 'Android', browser: 'Chrome', osVersion: '13', started: 400, home: 360 }),
    ];
    const out = analyzeBootFamilies(rows, thresholds);
    assert.equal(out[0].device, 'iPhone');
    assert.equal(out[0].suspect, true);
    assert.equal(out[0].ratePct, 20);
    assert.equal(out[0].othersRatePct, 90);
    assert.equal(out[0].gapPoints, 70);
    assert.equal(out[1].suspect, false);
  });

  it('ne juge pas une famille qui a trop peu de démarrages', () => {
    const rows = [
      row({ started: 5, home: 0 }),
      row({ device: 'Android', os: 'Android', browser: 'Chrome', started: 400, home: 360 }),
    ];
    const out = analyzeBootFamilies(rows, thresholds);
    assert.equal(out.find((r) => r.device === 'iPhone')!.judged, false);
    assert.equal(out.find((r) => r.device === 'iPhone')!.suspect, false);
  });

  it('un taux bas partout n\'accuse personne : on compare aux autres, pas à un chiffre inventé', () => {
    const rows = [
      row({ device: 'iPhone', started: 100, home: 40 }),
      row({ device: 'Android', os: 'Android', browser: 'Chrome', started: 100, home: 42 }),
    ];
    assert.equal(analyzeBootFamilies(rows, thresholds).some((r) => r.suspect), false);
  });

  it('un écart inférieur au seuil n\'est pas signalé', () => {
    const rows = [
      row({ device: 'iPhone', started: 100, home: 70 }),
      row({ device: 'Android', os: 'Android', browser: 'Chrome', started: 100, home: 90 }),
    ];
    assert.equal(analyzeBootFamilies(rows, thresholds).some((r) => r.suspect), false);
  });

  it('une seule famille : rien à comparer, donc personne n\'est signalé', () => {
    const out = analyzeBootFamilies([row({ started: 100, home: 0 })], thresholds);
    assert.equal(out[0].othersRatePct, null);
    assert.equal(out[0].suspect, false);
  });

  it('le groupe « autres » n\'est jamais jugé', () => {
    const rows = [
      { ...row({ started: 100, home: 0 }), key: 'autres' },
      row({ device: 'Android', os: 'Android', browser: 'Chrome', started: 400, home: 360 }),
    ];
    assert.equal(analyzeBootFamilies(rows, thresholds).some((r) => r.suspect), false);
  });

  it('aucun démarrage : pas de division par zéro', () => {
    const out = analyzeBootFamilies([row({ started: 0, home: 3 }), row({ device: 'X', started: 0, home: 0 })], thresholds);
    assert.ok(out.every((r) => Number.isFinite(r.ratePct)));
  });
});

describe('démarrages : jours à lire', () => {
  it('renvoie les n derniers jours, le plus récent d\'abord, borné à 1..90', () => {
    const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const now = Date.UTC(2026, 10, 13, 12);
    assert.deepEqual(recentDayKeys(now, 3, keyOf), ['2026-11-13', '2026-11-12', '2026-11-11']);
    assert.equal(recentDayKeys(now, 0, keyOf).length, 1);
    assert.equal(recentDayKeys(now, 500, keyOf).length, 90);
  });
});
