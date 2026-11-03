import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertCanvasPainted, roundRect } from './socialVisualCanvasRenderer';

describe('Dessin des visuels', () => {
  it('le rectangle arrondi revient au coin de départ, sans trait qui sort du cadre', () => {
    const points: Array<[number, number]> = [];
    const ctx = {
      beginPath() {},
      closePath() {},
      fill() {},
      stroke() {},
      moveTo(x: number, y: number) {
        points.push([x, y]);
      },
      arcTo(x1: number, y1: number, x2: number, y2: number) {
        points.push([x1, y1], [x2, y2]);
      },
    } as unknown as CanvasRenderingContext2D;

    const [x, y, w, h] = [100, 200, 600, 50];
    roundRect(ctx, x, y, w, h, 10);

    for (const [px, py] of points) {
      assert.ok(px >= x && px <= x + w, `abscisse hors du cadre : ${px}`);
      assert.ok(py >= y && py <= y + h, `ordonnée hors du cadre : ${py}`);
    }
  });

  function fakeCanvas(pixels: number[]): HTMLCanvasElement {
    return {
      width: 1,
      height: 1,
      getContext: () => ({ getImageData: () => ({ data: Uint8ClampedArray.from(pixels) }) }),
    } as unknown as HTMLCanvasElement;
  }

  it('refuse d\'exporter une image entièrement transparente', () => {
    assert.throws(() => assertCanvasPainted(fakeCanvas([0, 0, 0, 0])), /Visuel vide/);
  });

  it('accepte une image dessinée', () => {
    assert.doesNotThrow(() => assertCanvasPainted(fakeCanvas([0, 0, 0, 0, 10, 20, 30, 255])));
  });
});
