import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeThreads, pendingChanges, textOnlyThread } from './copilotThreadsSync';
import type { ChatThread } from './aiAdminChatClient';

const thread = (id: string, updatedAt: number, patch: Partial<ChatThread> = {}): ChatThread => ({
  id,
  title: id,
  messages: [{ id: 'm', role: 'user', content: 'bonjour', timestamp: 1 }],
  createdAt: 0,
  updatedAt,
  ...patch,
});

describe('Discussions du copilote sur PC et téléphone', () => {
  it('la version la plus récente l\'emporte', () => {
    const merged = mergeThreads([thread('a', 5)], [thread('a', 9, { title: 'serveur' })], { synced: { a: 5 } });
    assert.equal(merged[0].title, 'serveur');
    assert.equal(mergeThreads([thread('a', 12, { title: 'local' })], [thread('a', 9)], { synced: { a: 9 } })[0].title, 'local');
  });

  it('une discussion supprimée sur un autre appareil disparaît, une discussion jamais envoyée reste', () => {
    const merged = mergeThreads([thread('ancienne', 1), thread('neuve', 2)], [], { synced: { ancienne: 1 } });
    assert.deepEqual(merged.map((t) => t.id), ['neuve']);
  });

  it('les épinglées passent en premier', () => {
    const merged = mergeThreads([], [thread('a', 9), thread('b', 1, { isPinned: true })], { synced: {} });
    assert.deepEqual(merged.map((t) => t.id), ['b', 'a']);
  });

  it('envoie seulement ce qui a changé, et supprime ce qui a disparu', () => {
    const changes = pendingChanges([thread('a', 5), thread('b', 7), thread('vide', 3, { messages: [] })], { synced: { a: 5, b: 6, partie: 2 } });
    assert.deepEqual(changes.toSave.map((t) => t.id), ['b']);
    assert.deepEqual(changes.toDelete, ['partie']);
  });

  it('ne garde jamais une image jointe', () => {
    const t = textOnlyThread(
      thread('a', 1, { messages: [{ id: 'm', role: 'user', content: '', timestamp: 1, image: { dataUrl: 'data:image/png;base64,AAA', name: 'capture.png' } }] })
    );
    assert.equal('image' in t.messages[0], false);
    assert.equal(t.messages[0].content, '[Image jointe : capture.png]');
  });
});
