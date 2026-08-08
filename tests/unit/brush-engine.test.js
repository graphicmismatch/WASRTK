'use strict';

// Unit tests for src/renderer/brush-engine.js.
// The geometry helpers are pure; the painters take a canvas context, so a
// small fake ctx that records fillRect/arc/gradient calls is enough to
// verify stamp geometry without a DOM.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  getInterpolatedStrokePoints,
  getPixelPerfectLinePoints,
  drawPixelPerfectBrushStamp,
  seededRandom,
  drawBrushStamp
} = require('../../src/renderer/brush-engine');

function createFakeCtx() {
  const calls = [];
  return {
    calls,
    globalAlpha: 1,
    fillStyle: null,
    strokeStyle: null,
    lineWidth: null,
    lineCap: null,
    lineJoin: null,
    fillRect(x, y, w, h) { calls.push(['fillRect', x, y, w, h]); },
    beginPath() { calls.push(['beginPath']); },
    arc(x, y, r) { calls.push(['arc', x, y, r]); },
    fill() { calls.push(['fill']); },
    moveTo(x, y) { calls.push(['moveTo', x, y]); },
    lineTo(x, y) { calls.push(['lineTo', x, y]); },
    stroke() { calls.push(['stroke']); },
    createRadialGradient(...args) {
      calls.push(['createRadialGradient', ...args]);
      return { addColorStop() {} };
    }
  };
}

function baseOpts(overrides = {}) {
  return {
    color: '#ff0000',
    size: 4,
    flow: 1,
    preset: 'hard-round',
    shape: 'circle',
    spacing: 0.25,
    antialias: true,
    strokeSeed: 12345,
    ...overrides
  };
}

describe('getPixelPerfectLinePoints', () => {
  test('horizontal line yields every integer x', () => {
    assert.deepEqual(getPixelPerfectLinePoints(0, 0, 3, 0), [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 }
    ]);
  });

  test('perfect diagonal steps both axes each iteration', () => {
    assert.deepEqual(getPixelPerfectLinePoints(0, 0, 3, 3), [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 }
    ]);
  });

  test('reversed direction produces the mirrored point list', () => {
    assert.deepEqual(getPixelPerfectLinePoints(3, 0, 0, 0), [
      { x: 3, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 }
    ]);
  });

  test('rounds fractional endpoints before walking', () => {
    assert.deepEqual(getPixelPerfectLinePoints(0.4, 0.4, 1.6, 0.4), [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ]);
  });

  test('degenerate line is a single point', () => {
    assert.deepEqual(getPixelPerfectLinePoints(5, 5, 5, 5), [{ x: 5, y: 5 }]);
  });

  test('shallow line never skips a column', () => {
    const points = getPixelPerfectLinePoints(0, 0, 6, 2);
    const xs = points.map((p) => p.x);
    assert.deepEqual(xs, [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(points[0].y, 0);
    assert.equal(points[points.length - 1].y, 2);
  });
});

describe('getInterpolatedStrokePoints', () => {
  test('splits a segment into evenly spaced points including both ends', () => {
    const points = getInterpolatedStrokePoints(0, 0, 10, 0, 2);
    assert.equal(points.length, 6); // ceil(10 / 2) = 5 steps -> 6 points
    assert.deepEqual(points[0], { x: 0, y: 0 });
    assert.deepEqual(points[points.length - 1], { x: 10, y: 0 });
    for (let i = 1; i < points.length; i++) {
      assert.ok(Math.abs((points[i].x - points[i - 1].x) - 2) < 1e-9);
    }
  });

  test('clamps spacing below 0.25', () => {
    // spacing 0.01 is clamped to 0.25: ceil(1 / 0.25) = 4 steps -> 5 points
    const points = getInterpolatedStrokePoints(0, 0, 1, 0, 0.01);
    assert.equal(points.length, 5);
  });

  test('zero-length segment still returns start and end', () => {
    const points = getInterpolatedStrokePoints(3, 3, 3, 3, 1);
    assert.equal(points.length, 2);
    assert.deepEqual(points[0], { x: 3, y: 3 });
    assert.deepEqual(points[1], { x: 3, y: 3 });
  });
});

describe('seededRandom', () => {
  test('is deterministic for the same seed', () => {
    assert.equal(seededRandom(42), seededRandom(42));
    assert.equal(seededRandom(9999.5), seededRandom(9999.5));
  });

  test('different seeds give different values', () => {
    assert.notEqual(seededRandom(1), seededRandom(2));
  });

  test('stays within [0, 1)', () => {
    for (let seed = 0; seed < 100; seed++) {
      const value = seededRandom(seed * 17.3);
      assert.ok(value >= 0 && value < 1, `seed ${seed} -> ${value}`);
    }
  });
});

describe('drawPixelPerfectBrushStamp', () => {
  test('square stamp is one fillRect covering size x size', () => {
    const ctx = createFakeCtx();
    drawPixelPerfectBrushStamp(ctx, 10, 10, 4, 'square');
    assert.deepEqual(ctx.calls, [['fillRect', 8, 8, 4, 4]]);
  });

  test('size-1 circle collapses to a single pixel', () => {
    const ctx = createFakeCtx();
    drawPixelPerfectBrushStamp(ctx, 5, 5, 1, 'circle');
    assert.deepEqual(ctx.calls, [['fillRect', 5, 5, 1, 1]]);
  });

  test('size-4 circle fills the 12-pixel rasterized disc (corners cut)', () => {
    const ctx = createFakeCtx();
    drawPixelPerfectBrushStamp(ctx, 10, 10, 4, 'circle');
    const rects = ctx.calls.filter(([name]) => name === 'fillRect');
    assert.equal(rects.length, 12);
    rects.forEach(([, , , w, h]) => {
      assert.equal(w, 1);
      assert.equal(h, 1);
    });
    // Corners of the 4x4 bounding box must be cut off.
    const painted = new Set(rects.map(([, x, y]) => `${x},${y}`));
    ['8,8', '11,8', '8,11', '11,11'].forEach((corner) => {
      assert.ok(!painted.has(corner), `corner ${corner} should not be painted`);
    });
  });

  test('rounds fractional center and size', () => {
    const ctx = createFakeCtx();
    drawPixelPerfectBrushStamp(ctx, 10.4, 9.6, 2.4, 'square');
    assert.deepEqual(ctx.calls, [['fillRect', 9, 9, 2, 2]]);
  });
});

describe('drawBrushStamp', () => {
  test('hard-round antialiased stamp arcs at the given center', () => {
    const ctx = createFakeCtx();
    drawBrushStamp(ctx, 12, 8, baseOpts());
    assert.deepEqual(ctx.calls, [['beginPath'], ['arc', 12, 8, 2], ['fill']]);
    assert.equal(ctx.fillStyle, '#ff0000');
    assert.equal(ctx.globalAlpha, 1); // restored
  });

  test('pixel preset rasterizes with fillRect even when antialias is on', () => {
    const ctx = createFakeCtx();
    drawBrushStamp(ctx, 12, 8, baseOpts({ preset: 'pixel', size: 3 }));
    assert.ok(ctx.calls.every(([name]) => name === 'fillRect'));
    assert.ok(ctx.calls.length > 0);
  });

  test('antialias off forces the pixel-perfect path for any preset', () => {
    const ctx = createFakeCtx();
    drawBrushStamp(ctx, 12, 8, baseOpts({ antialias: false, shape: 'square', size: 2 }));
    assert.deepEqual(ctx.calls, [['fillRect', 11, 7, 2, 2]]);
  });

  test('soft-round uses a radial gradient centered on the stamp', () => {
    const ctx = createFakeCtx();
    drawBrushStamp(ctx, 10, 10, baseOpts({ preset: 'soft-round' }));
    const gradient = ctx.calls.find(([name]) => name === 'createRadialGradient');
    assert.ok(gradient, 'expected createRadialGradient call');
    assert.deepEqual(gradient.slice(1), [10, 10, 2 * 0.05, 10, 10, 2]);
    assert.ok(ctx.calls.some(([name]) => name === 'arc'));
  });

  test('textured preset is deterministic for a fixed stroke seed', () => {
    const a = createFakeCtx();
    const b = createFakeCtx();
    drawBrushStamp(a, 20, 20, baseOpts({ preset: 'textured' }));
    drawBrushStamp(b, 20, 20, baseOpts({ preset: 'textured' }));
    assert.deepEqual(a.calls, b.calls);
    assert.ok(a.calls.filter(([name]) => name === 'fillRect').length >= 8);
  });

  test('textured preset changes with the stroke seed', () => {
    const a = createFakeCtx();
    const b = createFakeCtx();
    drawBrushStamp(a, 20, 20, baseOpts({ preset: 'textured', strokeSeed: 1 }));
    drawBrushStamp(b, 20, 20, baseOpts({ preset: 'textured', strokeSeed: 2 }));
    assert.notDeepEqual(a.calls, b.calls);
  });

  test('flow scales alpha during the stamp and restores it after', () => {
    const ctx = createFakeCtx();
    let alphaDuringFill = null;
    const originalFill = ctx.fill.bind(ctx);
    ctx.fill = () => {
      alphaDuringFill = ctx.globalAlpha;
      originalFill();
    };
    drawBrushStamp(ctx, 5, 5, baseOpts({ flow: 0.5 }));
    assert.equal(alphaDuringFill, 0.5);
    assert.equal(ctx.globalAlpha, 1);
  });
});
