import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isRangeTruncated, summarizeDataQuality, type KatikaDataQuality } from './dataQuality';

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);

function quality(patch: Partial<KatikaDataQuality> = {}): KatikaDataQuality {
  return {
    range: 'ALL',
    rangeStartMs: 0,
    live: { status: 'ok', fetchedAt: NOW },
    users: { status: 'ok', fetchedAt: NOW },
    records: { status: 'ok', fetchedAt: NOW, capped: false, maxDocs: 1000 },
    totals: { status: 'ok', fetchedAt: NOW },
    ...patch,
  };
}

describe('Fiabilité des chiffres de katika', () => {
  it('tout va bien : aucun avertissement', () => {
    const s = summarizeDataQuality(quality());
    assert.equal(s.level, 'OK');
    assert.deepEqual(s.notices, []);
    assert.equal(s.oldestFetchedAt, NOW);
  });

  it('sans information, les chiffres sont déclarés indisponibles, jamais à zéro', () => {
    assert.equal(summarizeDataQuality(null).level, 'UNAVAILABLE');
  });

  it('une lecture ratée de l\'historique rend les chiffres indisponibles', () => {
    const s = summarizeDataQuality(quality({ records: { status: 'unavailable', message: 'Quota atteint.' } }));
    assert.equal(s.level, 'UNAVAILABLE');
    assert.match(s.notices[0], /pas de vrais zéros/);
    assert.match(s.notices[0], /Quota atteint/);
  });

  it('une panne du direct seul laisse l\'historique utilisable', () => {
    const s = summarizeDataQuality(quality({ live: { status: 'unavailable' } }));
    assert.equal(s.level, 'PARTIAL');
    assert.match(s.notices[0], /en direct/);
  });

  it('des chiffres anciens sont signalés avec leur date', () => {
    const s = summarizeDataQuality(quality({ users: { status: 'stale', fetchedAt: NOW - 3_600_000, message: 'Pare-feu.' } }));
    assert.equal(s.level, 'PARTIAL');
    assert.match(s.notices[0], /relevé du/);
    assert.equal(s.oldestFetchedAt, NOW - 3_600_000);
  });

  it('au plafond, le cumul est annoncé comme partiel', () => {
    const s = summarizeDataQuality(quality({ records: { status: 'ok', capped: true, maxDocs: 1000, oldestAt: NOW - 1000 } }));
    assert.equal(s.level, 'PARTIAL');
    assert.match(s.notices[0], /1\s000 manches/);
  });

  it('au plafond, une courte période reste complète si les fiches la couvrent', () => {
    const records = { status: 'ok' as const, capped: true, maxDocs: 1000, oldestAt: NOW - 10 * 86_400_000 };
    assert.equal(isRangeTruncated(records, NOW - 7 * 86_400_000), false);
    assert.equal(isRangeTruncated(records, NOW - 30 * 86_400_000), true);
    assert.equal(isRangeTruncated(records, 0), true);
    assert.equal(isRangeTruncated({ ...records, capped: false }, 0), false);
  });
});
