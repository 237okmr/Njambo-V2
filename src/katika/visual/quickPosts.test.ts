import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildKoraDayPost, buildPodiumPost, buildPuzzlePost } from './quickPosts';
import { validateAndRepairSpec } from './validateSpec';
import type { KoraMoment } from '../../../server/engine/koraMoment';

const moment = (id: string, kind: 'KORA' | 'DOUBLE_KORA' = 'KORA'): KoraMoment => ({
  id,
  createdAt: 1,
  kind,
  playerCount: 3,
  winnerSeat: 0,
  tricks: [
    { number: 1, winnerSeat: 2, plays: [{ seat: 0, rank: '5', suit: '♥' }, { seat: 1, rank: '7', suit: '♥' }, { seat: 2, rank: '9', suit: '♥' }] },
    { number: 5, winnerSeat: 0, plays: [{ seat: 1, rank: '6', suit: '♣' }, { seat: 2, rank: '8', suit: '♣' }, { seat: 0, rank: '3', suit: '♣' }] },
  ],
});

const valid = (spec: unknown) => validateAndRepairSpec(spec).spec !== null;

describe('Publications immédiates', () => {
  it('casse-tête : un vrai pli, deux choix, et la vraie réponse', () => {
    const post = buildPuzzlePost([moment('m1')], []);
    assert.ok(post);
    assert.equal(post!.key, 'PUZZLE:m1:1');
    assert.match(post!.answer!, /9♥/);
    const choices = post!.spec.blocks.find((b) => b.type === 'BULLETS') as any;
    assert.equal(choices.items.length, 2);
    assert.ok(choices.items.some((i: string) => i.includes('9♥')));
    assert.ok(valid(post!.spec));
  });

  it('vrai Kora : le dernier pli, et pas deux fois le même moment s\'il y en a d\'autres', () => {
    const first = buildKoraDayPost([moment('m1'), moment('m2', 'DOUBLE_KORA')], ['KORA:m1']);
    assert.equal(first!.key, 'KORA:m2');
    assert.match(first!.caption, /Double Kora/);
    assert.ok(first!.spec.blocks.some((b) => b.type === 'CARDS'));
    assert.ok(valid(first!.spec));
    assert.equal(buildKoraDayPost([moment('m1')], ['KORA:m1'])!.key, 'KORA:m1');
    assert.equal(buildKoraDayPost([], []), null);
  });

  it('podium : les trois premiers avec leur score', () => {
    const post = buildPodiumPost(
      [
        { name: 'Ada', score: 1240, title: 'Légende du Kora' },
        { name: 'Bello', score: 900 },
        { name: 'Kossi', score: 450 },
        { name: 'Nadia', score: 10 },
      ],
      [],
      '2026-11-03'
    );
    const items = (post!.spec.blocks.find((b) => b.type === 'BULLETS') as any).items;
    assert.equal(items.length, 3);
    assert.match(items[0], /Ada · 1\s240 pts · Légende du Kora/);
    assert.ok(valid(post!.spec));
    assert.equal(buildPodiumPost([], [], '2026-11-03'), null);
  });
});
