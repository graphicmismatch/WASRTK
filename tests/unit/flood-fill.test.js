'use strict';

// Unit tests for src/renderer/flood-fill.js.
// floodRegion is pure (pixels-in, positions-out) -- no DOM/canvas needed.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { floodRegion } = require('../../src/renderer/flood-fill');

function makePixels(width, height, fillFn) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fillFn(x, y);
      const pos = (y * width + x) * 4;
      pixels[pos] = r;
      pixels[pos + 1] = g;
      pixels[pos + 2] = b;
      pixels[pos + 3] = a;
    }
  }
  return pixels;
}

describe('floodRegion', () => {
  test('fills only the contiguous same-color region, not across a different-color border', () => {
    // 3x3 grid: a 1-pixel white border around a black interior.
    const width = 3;
    const height = 3;
    const pixels = makePixels(width, height, (x, y) => {
      const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      return isBorder ? [255, 255, 255, 255] : [0, 0, 0, 255];
    });

    const region = floodRegion(pixels, width, height, 1, 1, 0);

    assert.equal(region.length, 1);
    assert.deepEqual(region[0], { x: 1, y: 1, pos: (1 * width + 1) * 4 });
  });

  test('respects the tolerance threshold', () => {
    // Two adjacent pixels: black, then a slightly-off gray.
    const width = 2;
    const height = 1;
    const pixels = new Uint8ClampedArray([0, 0, 0, 255, 10, 10, 10, 255]);
    const distance = Math.sqrt(10 * 10 * 3);

    const belowTolerance = floodRegion(pixels, width, height, 0, 0, distance - 1);
    assert.equal(belowTolerance.length, 1);

    const aboveTolerance = floodRegion(pixels, width, height, 0, 0, distance + 1);
    assert.equal(aboveTolerance.length, 2);
  });

  test('an isolated pixel with zero tolerance returns just that pixel', () => {
    const width = 3;
    const height = 3;
    const pixels = makePixels(width, height, (x, y) => (x === 1 && y === 1 ? [0, 0, 0, 255] : [255, 0, 0, 255]));

    const region = floodRegion(pixels, width, height, 1, 1, 0);

    assert.equal(region.length, 1);
    assert.deepEqual(region[0], { x: 1, y: 1, pos: (1 * width + 1) * 4 });
  });

  test('out-of-range start coordinates are clamped into bounds', () => {
    const width = 2;
    const height = 2;
    const pixels = makePixels(width, height, () => [0, 0, 0, 255]);

    const region = floodRegion(pixels, width, height, 99, -99, 0);

    assert.equal(region.length, 4);
  });

  test('non-finite start coordinates return an empty region', () => {
    const width = 2;
    const height = 2;
    const pixels = makePixels(width, height, () => [0, 0, 0, 255]);

    assert.deepEqual(floodRegion(pixels, width, height, NaN, 0, 0), []);
  });
});
