import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

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

import {
  HistoryNotification,
  RecordInput,
  applyCap,
  countUnread,
  isActionable,
  isExpiredInvite,
  markAllReadInList,
  markReadInList,
  notificationHistory,
  removeFromList,
  resetNotificationHistoryForTests,
  resolveInList,
  upsertNotification,
} from './notificationHistoryService';

const make = (id: string, createdAt: number, extra: Partial<RecordInput> = {}): RecordInput => ({
  id,
  kind: 'FRIEND_REQUEST',
  title: `titre ${id}`,
  body: `corps ${id}`,
  createdAt,
  ...extra,
});

describe('notificationHistoryService — fonctions pures', () => {
  it('ajoute une notification non lue, la plus récente en premier', () => {
    let list: HistoryNotification[] = [];
    list = upsertNotification(list, make('a', 1000), 5000, 100);
    list = upsertNotification(list, make('b', 2000), 5000, 100);
    assert.deepEqual(list.map((n) => n.id), ['b', 'a']);
    assert.equal(countUnread(list), 2);
  });

  it('fusionne par id sans perdre l\'état « lu » ni la date de création', () => {
    let list = upsertNotification([], make('a', 1000), 5000, 100);
    list = markReadInList(list, 'a', 6000);
    list = upsertNotification(list, make('a', 9999, { title: 'nouveau titre' }), 7000, 100);
    assert.equal(list.length, 1);
    assert.equal(list[0].title, 'nouveau titre');
    assert.equal(list[0].read, true);
    assert.equal(list[0].createdAt, 1000);
    assert.equal(list[0].updatedAt, 7000);
  });

  it('respecte le plafond en supprimant les plus anciennes', () => {
    let list: HistoryNotification[] = [];
    for (let i = 1; i <= 5; i++) list = upsertNotification(list, make(`n${i}`, i * 100), 9000, 3);
    assert.deepEqual(list.map((n) => n.id), ['n5', 'n4', 'n3']);
    assert.equal(applyCap(list, 2).length, 2);
  });

  it('la pastille baisse à chaque lecture', () => {
    let list: HistoryNotification[] = [];
    list = upsertNotification(list, make('a', 1), 10, 100);
    list = upsertNotification(list, make('b', 2), 10, 100);
    list = upsertNotification(list, make('c', 3), 10, 100);
    assert.equal(countUnread(list), 3);
    list = markReadInList(list, 'b', 20);
    assert.equal(countUnread(list), 2);
    list = markAllReadInList(list, 30);
    assert.equal(countUnread(list), 0);
  });

  it('une invitation expirée ou traitée n\'est plus actionnable', () => {
    const invite = (extra: Partial<RecordInput>) =>
      upsertNotification([], make('i', 1, { kind: 'DIRECT_INVITE', expiresAt: 10_000, ...extra }), 0, 100)[0];
    assert.equal(isActionable(invite({}), 5_000), true);
    assert.equal(isActionable(invite({}), 10_000), false);
    assert.equal(isExpiredInvite(invite({}), 10_000), true);
    const resolved = resolveInList([invite({})], 'i', 'ACCEPTED', 6_000)[0];
    assert.equal(isActionable(resolved, 5_000), false);
    assert.equal(isExpiredInvite(resolved, 20_000), false);
  });

  it('une demande d\'ami reste actionnable tant qu\'elle n\'est pas traitée', () => {
    const item = upsertNotification([], make('f', 1), 0, 100)[0];
    assert.equal(isActionable(item, 999_999), true);
    assert.equal(isActionable(resolveInList([item], 'f', 'DECLINED', 5)[0], 0), false);
  });

  it('supprime une notification par id', () => {
    const list = upsertNotification(upsertNotification([], make('a', 1), 0, 100), make('b', 2), 0, 100);
    assert.deepEqual(removeFromList(list, 'a').map((n) => n.id), ['b']);
  });
});

describe('notificationHistoryService — stockage local', () => {
  beforeEach(() => {
    localStorage.clear();
    resetNotificationHistoryForTests();
  });

  it('enregistre, relit et persiste par compte', () => {
    notificationHistory.setOwner('uid-1');
    notificationHistory.record(make('a', 1000));
    assert.equal(notificationHistory.getSnapshot().length, 1);
    notificationHistory.setOwner('uid-2');
    assert.equal(notificationHistory.getSnapshot().length, 0);
    notificationHistory.setOwner('uid-1');
    assert.equal(notificationHistory.getSnapshot().length, 1);
  });

  it('une notification supprimée par le joueur ne réapparaît pas', () => {
    notificationHistory.setOwner('uid-1');
    notificationHistory.record(make('friend:x:1', 1000));
    notificationHistory.remove('friend:x:1');
    notificationHistory.record(make('friend:x:1', 1000));
    assert.equal(notificationHistory.getSnapshot().length, 0);
    notificationHistory.record(make('friend:x:2', 2000));
    assert.equal(notificationHistory.getSnapshot().length, 1);
  });

  it('« Tout effacer » vide la liste et empêche le retour des mêmes entrées', () => {
    notificationHistory.setOwner('uid-1');
    notificationHistory.record(make('a', 1));
    notificationHistory.record(make('b', 2));
    notificationHistory.clearAll();
    assert.equal(notificationHistory.getSnapshot().length, 0);
    notificationHistory.record(make('a', 1));
    assert.equal(notificationHistory.getSnapshot().length, 0);
  });

  it('prévient les abonnés à chaque changement', () => {
    notificationHistory.setOwner('uid-1');
    let calls = 0;
    const unsubscribe = notificationHistory.subscribe(() => { calls += 1; });
    notificationHistory.record(make('a', 1));
    notificationHistory.markRead('a');
    notificationHistory.markRead('a');
    unsubscribe();
    notificationHistory.record(make('b', 2));
    assert.equal(calls, 2);
  });
});
