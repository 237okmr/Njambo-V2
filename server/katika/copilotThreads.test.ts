import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeThread, threadDocId, threadsToPrune, type StoredThread } from './copilotThreads';
import { createAiLimiter } from './aiLimiter';

describe('Discussions du copilote gardées par le serveur', () => {
  it('ne garde que le texte, borné, et les messages récents', () => {
    const t = sanitizeThread(
      {
        id: 'thread_1',
        title: 'x'.repeat(200),
        messages: [
          { id: 'a', role: 'user', content: 'ancien', timestamp: 1 },
          { id: 'b', role: 'user', content: 'y'.repeat(9000), timestamp: 2, image: { dataUrl: 'data:image/png;base64,AAA' } },
          { id: 'c', role: 'assistant', content: 'réponse', timestamp: 3, isError: true },
          { id: 'd', role: 'system', content: 'ignoré', timestamp: 4 },
        ],
      },
      2
    );
    assert.ok(t);
    assert.equal(t!.title.length, 80);
    assert.deepEqual(t!.messages.map((m) => m.id), ['b', 'c']);
    assert.equal(t!.messages[0].content.length, 8000);
    assert.equal('image' in t!.messages[0], false);
    assert.equal(t!.messages[1].isError, true);
  });

  it('refuse un identifiant douteux', () => {
    assert.equal(sanitizeThread({ id: '../autre' }, 10), null);
    assert.equal(sanitizeThread(null, 10), null);
  });

  it('le compte fait partie de l\'identifiant du document', () => {
    assert.equal(threadDocId('uid1', 't1'), 'uid1__t1');
  });

  it('au-delà du plafond, supprime les plus anciennes, jamais une épinglée', () => {
    const mk = (id: string, updatedAt: number, isPinned = false): StoredThread => ({ id, title: id, isPinned, createdAt: 0, updatedAt, messages: [] });
    assert.deepEqual(threadsToPrune([mk('a', 3), mk('b', 1, true), mk('c', 2), mk('d', 0)], 2), ['c', 'd']);
    assert.deepEqual(threadsToPrune([mk('a', 3)], 2), []);
  });
});

describe('Limites du copilote par admin', () => {
  function limiter(now = { t: 0 }) {
    return createAiLimiter({ now: () => now.t, maxPerHour: () => 5, maxPerAdminPerHour: () => 2, maxConcurrent: () => 2 });
  }

  it('une seule demande à la fois par admin, mais deux admins peuvent demander en même temps', () => {
    const l = limiter();
    l.acquire('a');
    assert.equal(l.check('a', false).allowed, false);
    assert.equal(l.check('b', false).allowed, true);
    l.release('a');
    assert.equal(l.check('a', false).allowed, true);
  });

  it('un admin ne peut pas épuiser le quota des autres ; le propriétaire n\'a que le plafond commun', () => {
    const l = limiter();
    for (let i = 0; i < 2; i++) {
      l.acquire('a');
      l.release('a');
    }
    const refused = l.check('a', false);
    assert.equal(refused.allowed, false);
    assert.equal(l.check('b', false).allowed, true);
    assert.equal(l.check('owner', true).allowed, true);
    assert.equal(l.status('a', false).mine, 2);
    assert.equal(l.status('owner', true).myMax, null);
  });

  it('plafond commun et nombre de demandes simultanées', () => {
    const now = { t: 0 };
    const l = limiter(now);
    l.acquire('a');
    l.acquire('b');
    assert.match((l.check('c', true) as any).message, /d'autres admins/);
    l.release('a');
    l.release('b');
    l.count('c', 3);
    assert.match((l.check('d', true) as any).message, /pour tout le monde/);
    now.t = 60 * 60 * 1000 + 1;
    assert.equal(l.check('d', true).allowed, true);
  });
});
