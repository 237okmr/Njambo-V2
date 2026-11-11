import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CashLedgerEntry } from './cashTypes';
import {
  JournalBatchReader,
  JOURNAL_CSV_HEADER,
  buildJournalCsv,
  csvCell,
  formatDoualaDateTime,
  formatJournalCursor,
  journalPlayerName,
  parseJournalCursor,
  parseJournalQuery,
  resolvePlayerFilter,
  scanJournal,
  toJournalLine,
} from './cashJournalRules';

const NOW = Date.UTC(2026, 10, 11, 12, 0, 0);

function entry(partial: Partial<CashLedgerEntry> & { createdAt: number }): CashLedgerEntry {
  return {
    ref: `ref-${partial.createdAt}-aaaa`,
    uid: 'joueur-1',
    kind: 'DEPOSIT',
    availableDelta: 100,
    lockedDelta: 0,
    availableBefore: 0,
    availableAfter: 100,
    lockedBefore: 0,
    lockedAfter: 0,
    ...partial,
  };
}

/** Faux registre : lignes triées de la plus récente à la plus ancienne, lues par lots après le curseur. */
function fakeReader(all: CashLedgerEntry[], counter: { reads: number }): JournalBatchReader {
  const sorted = [...all].sort((a, b) => b.createdAt - a.createdAt || (a.ref < b.ref ? 1 : -1));
  return async (cursor, limit) => {
    let start = 0;
    if (cursor) start = sorted.findIndex((e) => e.createdAt === cursor.createdAt && e.ref === cursor.ref) + 1;
    const batch = sorted.slice(start, start + limit);
    counter.reads += batch.length;
    return batch;
  };
}

describe('requête du journal Kora Cash', () => {
  it('prend 7 jours et l’environnement actif par défaut', () => {
    const parsed = parseJournalQuery({}, NOW, 'DEMO');
    assert.ok(parsed.ok);
    if (parsed.ok) {
      assert.equal(parsed.query.environment, 'DEMO');
      assert.equal(parsed.query.to, NOW);
      assert.equal(NOW - parsed.query.from, 7 * 24 * 3600 * 1000);
      assert.equal(parsed.query.kinds, null);
      assert.equal(parsed.query.cursor, null);
    }
  });

  it('accepte des dates choisies et refuse des dates absurdes', () => {
    assert.equal(parseJournalQuery({ period: 'CUSTOM', from: '1000', to: '2000' }, NOW, 'DEMO').ok, true);
    assert.equal(parseJournalQuery({ period: 'CUSTOM', from: '2000', to: '1000' }, NOW, 'DEMO').ok, false);
    assert.equal(parseJournalQuery({ period: 'CUSTOM', from: 'x', to: '1' }, NOW, 'DEMO').ok, false);
    assert.equal(parseJournalQuery({ period: 'AN' }, NOW, 'DEMO').ok, false);
  });

  it('refuse un environnement ou un type inconnus, accepte plusieurs types', () => {
    assert.equal(parseJournalQuery({ env: 'TEST' }, NOW, 'DEMO').ok, false);
    assert.equal(parseJournalQuery({ kind: 'VOL' }, NOW, 'DEMO').ok, false);
    const parsed = parseJournalQuery({ env: 'live', kind: 'deposit,adjustment' }, NOW, 'DEMO');
    assert.ok(parsed.ok);
    if (parsed.ok) {
      assert.equal(parsed.query.environment, 'LIVE');
      assert.deepEqual(parsed.query.kinds, ['DEPOSIT', 'ADJUSTMENT']);
    }
  });

  it('relit un curseur et refuse un curseur forgé', () => {
    const cursor = formatJournalCursor({ createdAt: 1234, ref: 'ref-abcdefgh' });
    assert.deepEqual(parseJournalCursor(cursor), { createdAt: 1234, ref: 'ref-abcdefgh' });
    assert.equal(parseJournalCursor('abc'), null);
    assert.equal(parseJournalCursor('12:../../x'), null);
    assert.equal(parseJournalCursor('-5:ref-abcdefgh'), null);
    assert.equal(parseJournalQuery({ cursor: 'n’importe quoi' }, NOW, 'DEMO').ok, false);
  });
});

describe('noms et recherche de joueur', () => {
  it('n’affiche jamais d’e-mail : nom Google ou Joueur #xxxx', () => {
    assert.equal(journalPlayerName('abc123XYZ789', 'Hokuto'), 'Hokuto');
    assert.equal(journalPlayerName('abc123XYZ789', undefined), 'Joueur #Z789');
    assert.equal(journalPlayerName('abc123XYZ789', '   '), 'Joueur #Z789');
  });

  it('retrouve par identifiant exact ou par morceau de nom', () => {
    const names = new Map([
      ['uid-1', 'Hokuto'],
      ['uid-2', 'Hokuto Fan'],
      ['uid-3', 'Marie'],
    ]);
    assert.deepEqual([...resolvePlayerFilter('uid-3', names)], ['uid-3']);
    assert.deepEqual([...resolvePlayerFilter('hoku', names)].sort(), ['uid-1', 'uid-2']);
    assert.equal(resolvePlayerFilter('personne', names).size, 0);
    assert.equal(resolvePlayerFilter('', names).size, 0);
  });
});

describe('balayage du journal', () => {
  const all = Array.from({ length: 300 }, (_, i) =>
    entry({
      createdAt: 1_000_000 - i,
      ref: `ref-${String(i).padStart(4, '0')}-xxxx`,
      uid: i % 10 === 0 ? 'rare-joueur' : 'autre-joueur',
      kind: i % 2 === 0 ? 'DEPOSIT' : 'TABLE_SETTLEMENT',
    })
  );

  it('remplit une page sans lire plus que nécessaire', async () => {
    const counter = { reads: 0 };
    const result = await scanJournal(fakeReader(all, counter), null, { pageSize: 10, maxReads: 500, kinds: null, uids: null });
    assert.equal(result.entries.length, 10);
    assert.equal(result.capped, false);
    assert.ok(result.nextCursor);
    assert.equal(counter.reads, result.scanned);
  });

  it('enchaîne les pages sans doublon ni trou', async () => {
    const counter = { reads: 0 };
    const seen: string[] = [];
    let cursor = null as ReturnType<typeof parseJournalCursor>;
    for (let i = 0; i < 40; i++) {
      const page = await scanJournal(fakeReader(all, counter), cursor, { pageSize: 25, maxReads: 500, kinds: null, uids: null });
      seen.push(...page.entries.map((e) => e.ref));
      if (!page.nextCursor) break;
      cursor = parseJournalCursor(page.nextCursor);
    }
    assert.equal(seen.length, 300);
    assert.equal(new Set(seen).size, 300);
  });

  it('s’arrête au plafond de lectures quand le filtre est rare, et le dit', async () => {
    const counter = { reads: 0 };
    const only = new Set(['introuvable']);
    const result = await scanJournal(fakeReader(all, counter), null, { pageSize: 50, maxReads: 120, kinds: null, uids: only });
    assert.equal(result.entries.length, 0);
    assert.equal(result.capped, true);
    assert.equal(result.scanned, 120);
    assert.ok(result.nextCursor, 'on peut continuer plus loin');
    assert.ok(counter.reads <= 120);
  });

  it('applique le type et le joueur sur les lignes lues', async () => {
    const counter = { reads: 0 };
    const result = await scanJournal(fakeReader(all, counter), null, { pageSize: 50, maxReads: 500, kinds: ['DEPOSIT'], uids: new Set(['rare-joueur']) });
    assert.equal(result.entries.length, 30);
    assert.ok(result.entries.every((e) => e.uid === 'rare-joueur' && e.kind === 'DEPOSIT'));
    assert.equal(result.nextCursor, null);
    assert.equal(result.capped, false);
  });

  it('reprend juste après la dernière ligne gardée quand la page se remplit au milieu d’un lot', async () => {
    const counter = { reads: 0 };
    const first = await scanJournal(fakeReader(all, counter), null, { pageSize: 7, maxReads: 500, kinds: null, uids: null });
    assert.equal(first.entries.length, 7);
    const next = await scanJournal(fakeReader(all, counter), parseJournalCursor(first.nextCursor as string), { pageSize: 7, maxReads: 500, kinds: null, uids: null });
    assert.equal(next.entries[0].ref, all[7].ref);
  });
});

describe('ligne et export CSV', () => {
  it('donne l’effet sur le joueur et ne laisse sortir que des métadonnées sûres', () => {
    const line = toJournalLine(
      entry({
        createdAt: NOW,
        kind: 'TABLE_SETTLEMENT',
        availableDelta: 0,
        lockedDelta: -500,
        meta: { tableId: 'tbl-1', roomCode: 'FJW3', phone: '237690000000', email: 'a@b.cm', campayRef: 'secret' },
        actorUid: 'admin-1',
        note: 'Correction',
      }),
      'Hokuto'
    );
    assert.equal(line.amount, -500);
    assert.equal(line.label, 'Résultat de partie');
    assert.equal(line.roomCode, 'FJW3');
    const json = JSON.stringify(line);
    assert.ok(!json.includes('237690000000'));
    assert.ok(!json.includes('a@b.cm'));
    assert.ok(!json.includes('secret'));
  });

  it('écrit les dates en heure de Douala (UTC+1)', () => {
    assert.equal(formatDoualaDateTime(Date.UTC(2026, 10, 11, 23, 30, 5)), '2026-11-12 00:30:05');
  });

  it('protège les cellules : guillemets, point-virgule et formules de tableur', () => {
    assert.equal(csvCell('a;b'), '"a;b"');
    assert.equal(csvCell('dit "oui"'), '"dit ""oui"""');
    assert.equal(csvCell('=SOMME(A1)'), "'=SOMME(A1)");
    assert.equal(csvCell('+237'), "'+237");
    assert.equal(csvCell(-500), '-500');
    assert.equal(csvCell('ligne1\nligne2'), '"ligne1\nligne2"');
  });

  it('produit un CSV à point-virgule, avec BOM, entête française et sans e-mail ni téléphone', () => {
    const csv = buildJournalCsv([
      toJournalLine(entry({ createdAt: NOW, meta: { phone: '237690000000' }, note: 'Dépôt ; test' }), '=Hacker'),
    ]);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    const [header, row] = csv.slice(1).split('\r\n');
    assert.equal(header, JOURNAL_CSV_HEADER.join(';'));
    assert.ok(row.includes("'=Hacker"));
    assert.ok(row.includes('"Dépôt ; test"'));
    assert.ok(row.includes('2026-11-11 13:00:00'));
    assert.ok(!csv.includes('237690000000'));
    assert.ok(csv.endsWith('\r\n'));
  });
});
