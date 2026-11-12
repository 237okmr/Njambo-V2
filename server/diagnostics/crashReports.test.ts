import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countOpenCrashes, crashSignature, createCrashLimiter, mergeCrash, parseUserAgent, sanitizeCrashReport, scrubText } from './crashReportRules';
import { createCrashReportService } from './crashReports';
import type { CrashStore } from './crashReportStore';
import type { CrashEntry } from './crashReportRules';

const IPHONE_OLD = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-A135F Build/TP1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

describe('lecture du navigateur', () => {
  it('reconnaît un iPhone sous Safari et sous Chrome iOS', () => {
    assert.deepEqual(parseUserAgent(IPHONE_OLD), { os: 'iOS', osVersion: '14.8', device: 'iPhone', browser: 'Safari', model: '' });
    assert.equal(parseUserAgent(IPHONE_CHROME).browser, 'Chrome');
    assert.equal(parseUserAgent(IPHONE_CHROME).osVersion, '17.4');
  });
  it('donne le modèle d\'un Android', () => {
    const p = parseUserAgent(ANDROID);
    assert.equal(p.os, 'Android');
    assert.equal(p.model, 'SM-A135F');
    assert.equal(p.osVersion, '13');
  });
  it('un texte vide ne plante pas', () => {
    assert.equal(parseUserAgent(undefined).os, 'Autre');
  });
});

describe('nettoyage', () => {
  it('retire hôte, paramètres, courriels et jetons, garde le chemin et la ligne', () => {
    const out = scrubText('Erreur à https://njambo.example/assets/index-ab12.js?token=secret:12:5 pour awa@mail.com clé ' + 'x'.repeat(40), 300);
    assert.ok(out.includes('/assets/index-ab12.js'));
    assert.ok(!out.includes('njambo.example'));
    assert.ok(!out.includes('secret'));
    assert.ok(!out.includes('awa@mail.com'));
    assert.ok(out.includes('<jeton>'));
  });
  it('borne la taille et refuse un rapport sans message', () => {
    assert.equal(sanitizeCrashReport({ message: '' }, IPHONE_OLD).ok, false);
    assert.equal(sanitizeCrashReport(null, IPHONE_OLD).ok, false);
    const r = sanitizeCrashReport({ message: 'ab '.repeat(2000), stack: 'cd '.repeat(2000), phase: 'BOOT', build: 'index-ab12.js<script>' }, IPHONE_OLD);
    assert.ok(r.ok);
    if (r.ok) {
      assert.ok(r.report.message.length <= 300 && r.report.message.length >= 299);
      assert.ok(r.report.stack.length <= 900);
      assert.equal(r.report.build, 'index-ab12.jsscript');
      assert.equal(r.report.phase, 'BOOT');
    }
  });
  it('une valeur inconnue de phase ou de type retombe sur la valeur sûre', () => {
    const r = sanitizeCrashReport({ message: 'x', phase: 'HACK', kind: 'zzz' }, IPHONE_OLD);
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual([r.report.phase, r.report.kind], ['RUNTIME', 'error']);
  });
});

describe('bruit connu et échecs de connexion', () => {
  it('l\'assertion interne de Firebase Auth n\'est pas gardée', () => {
    const r = sanitizeCrashReport({ message: 'INTERNAL ASSERTION FAILED: Pending promise was never set' }, IPHONE_OLD);
    assert.deepEqual(r, { ok: false, reason: 'NOISE' });
  });
  it('un échec de connexion Google est gardé avec son type', () => {
    const r = sanitizeCrashReport({ kind: 'auth', message: 'Connexion Google : auth/popup-blocked' }, IPHONE_OLD);
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.report.kind, 'auth');
  });
});

describe('signature et regroupement', () => {
  const rep = (over: Record<string, unknown> = {}) => {
    const r = sanitizeCrashReport({ message: 'Cannot read x at line 12', build: 'index-1.js', phase: 'BOOT', ...over }, IPHONE_OLD);
    if (r.ok === false) throw new Error('rapport refusé');
    return r.report;
  };
  it('même bug : même signature, numéros de ligne ignorés', () => {
    assert.equal(crashSignature(rep()), crashSignature(rep({ message: 'Cannot read x at line 99' })));
  });
  it('autre version de l\'application ou autre iOS : autre signature', () => {
    assert.notEqual(crashSignature(rep()), crashSignature(rep({ build: 'index-2.js' })));
    const ios17 = sanitizeCrashReport({ message: 'Cannot read x at line 12', build: 'index-1.js', phase: 'BOOT' }, IPHONE_CHROME);
    assert.ok(ios17.ok);
    if (ios17.ok) assert.notEqual(crashSignature(rep()), crashSignature(ios17.report));
  });
  it('compte les occurrences et rouvre un bug traité qui revient', () => {
    const first = mergeCrash(null, rep(), 'sig', 100);
    assert.equal(first.count, 1);
    const second = mergeCrash({ ...first, resolved: true }, rep(), 'sig', 200);
    assert.deepEqual([second.count, second.firstSeenAt, second.lastSeenAt, second.resolved], [2, 100, 200, false]);
  });
  it('compte les types à examiner', () => {
    const e = [{ resolved: false, lastSeenAt: 500 }, { resolved: true, lastSeenAt: 500 }, { resolved: false, lastSeenAt: 10 }];
    assert.equal(countOpenCrashes(e, 100), 1);
  });
});

describe('plafonds', () => {
  const limits = { windowMs: 1000, maxPerKey: 2, maxGlobal: 3 };
  it('limite par appareil puis libère à la fin de la fenêtre', () => {
    const l = createCrashLimiter();
    assert.equal(l.allow('a', 0, limits), true);
    assert.equal(l.allow('a', 10, limits), true);
    assert.equal(l.allow('a', 20, limits), false);
    assert.equal(l.allow('a', 1500, limits), true);
  });
  it('limite aussi pour tout le serveur', () => {
    const l = createCrashLimiter();
    assert.equal(l.allow('a', 0, limits), true);
    assert.equal(l.allow('b', 1, limits), true);
    assert.equal(l.allow('c', 2, limits), true);
    assert.equal(l.allow('d', 3, limits), false);
  });
});

describe('service de réception', () => {
  function setup() {
    const rows = new Map<string, CrashEntry>();
    const news: string[] = [];
    let fail = false;
    const store: CrashStore = {
      record: async (sig, report, now) => {
        if (fail) throw new Error('hors ligne');
        const existing = rows.get(sig) ?? null;
        const entry = mergeCrash(existing, report, sig, now);
        rows.set(sig, entry);
        return { entry, isNew: !existing };
      },
      list: async () => [...rows.values()],
      setResolved: async () => undefined,
      remove: async () => undefined,
      removeResolved: async () => 0,
    };
    const svc = createCrashReportService({ store, now: () => 1000, limits: () => ({ windowMs: 60_000, maxPerKey: 2, maxGlobal: 10 }), onNewSignature: (s) => news.push(s) });
    return { rows, news, svc, setFail: (v: boolean) => (fail = v) };
  }
  const body = { message: 'Boom', phase: 'BOOT', build: 'index-1.js' };

  it('range un rapport, signale seulement un nouveau type, compte les suivants', async () => {
    const { rows, news, svc } = setup();
    assert.equal(await svc.receive({ body, userAgent: IPHONE_OLD, clientKey: 'ip1' }), 'STORED');
    assert.equal(await svc.receive({ body, userAgent: IPHONE_OLD, clientKey: 'ip2' }), 'STORED');
    assert.equal(rows.size, 1);
    assert.equal([...rows.values()][0].count, 2);
    assert.equal(news.length, 1);
    assert.match(news[0], /iPhone iOS 14.8/);
  });
  it('ignore un rapport vide, plafonne un appareil bavard, survit à une panne de base', async () => {
    const { svc, setFail } = setup();
    assert.equal(await svc.receive({ body: {}, userAgent: IPHONE_OLD, clientKey: 'ip1' }), 'IGNORED');
    await svc.receive({ body, userAgent: IPHONE_OLD, clientKey: 'ip9' });
    await svc.receive({ body, userAgent: IPHONE_OLD, clientKey: 'ip9' });
    assert.equal(await svc.receive({ body, userAgent: IPHONE_OLD, clientKey: 'ip9' }), 'LIMITED');
    setFail(true);
    assert.equal(await svc.receive({ body, userAgent: IPHONE_OLD, clientKey: 'ip5' }), 'FAILED');
  });
});
