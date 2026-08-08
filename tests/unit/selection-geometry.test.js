'use strict';

// Unit tests for src/renderer/selection-geometry.js.
// normalizeSelectionBounds/getSelectionSourceBounds/createSelectionState
// are pure math/object-factory functions -- no DOM needed. The
// draw*/applyFeatherToImageData functions take a canvas context (or
// ImageData) explicitly, so a small fake ctx (mirroring
// tests/unit/brush-engine.test.js) and a minimal ImageData polyfill are
// enough to test them without a real DOM. imageDataToCanvas is not
// covered here -- it calls document.createElement('canvas') directly and
// isn't worth a DOM shim for a five-line wrapper.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// Plain Node has no ImageData global; applyFeatherToImageData only reads
// width/height/data and constructs `new ImageData(output, width, height)`,
// so a minimal stand-in is enough.
global.ImageData = class FakeImageData {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height ?? Math.round(data.length / 4 / width);
  }
};

const {
  createSelectionState,
  normalizeSelectionBounds,
  drawSelectionMaskContour,
  drawSelectionOutline,
  drawLassoPreview,
  applyFeatherToImageData,
  getSelectionSourceBounds
} = require('../../src/renderer/selection-geometry');

function createFakeCtx(width = 100, height = 100) {
  const calls = [];
  return {
    calls,
    canvas: { width, height },
    strokeStyle: null,
    lineWidth: null,
    clearRect(...args) { calls.push(['clearRect', ...args]); },
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    beginPath() { calls.push(['beginPath']); },
    moveTo(x, y) { calls.push(['moveTo', x, y]); },
    lineTo(x, y) { calls.push(['lineTo', x, y]); },
    stroke() { calls.push(['stroke']); },
    strokeRect(...args) { calls.push(['strokeRect', ...args]); },
    setLineDash(dash) { calls.push(['setLineDash', dash]); },
    putImageData(...args) { calls.push(['putImageData', ...args]); }
  };
}

describe('createSelectionState', () => {
  test('fills in the default fields', () => {
    const state = createSelectionState();
    assert.equal(state.x, 0);
    assert.equal(state.width, 0);
    assert.equal(state.detached, false);
    assert.equal(state.masked, false);
    assert.equal(state.imageData, null);
  });

  test('overrides win over defaults', () => {
    const state = createSelectionState({ x: 5, width: 10, masked: true });
    assert.equal(state.x, 5);
    assert.equal(state.width, 10);
    assert.equal(state.masked, true);
    assert.equal(state.detached, false); // untouched default
  });
});

describe('normalizeSelectionBounds', () => {
  test('normalizes an arbitrary drag into positive x/y/width/height', () => {
    const bounds = normalizeSelectionBounds({ x: 20, y: 30 }, { x: 5, y: 10 });
    assert.deepEqual(bounds, { x: 5, y: 10, width: 15, height: 20 });
  });

  test('keepSquare forces equal width/height using the larger delta', () => {
    const bounds = normalizeSelectionBounds({ x: 0, y: 0 }, { x: 10, y: 4 }, { keepSquare: true });
    assert.equal(bounds.width, bounds.height);
    assert.equal(bounds.width, 10);
  });

  test('keepSquare respects the drag direction sign', () => {
    const bounds = normalizeSelectionBounds({ x: 10, y: 10 }, { x: 4, y: 16 }, { keepSquare: true });
    // dx = -6, dy = 6 -> side 6, end should move up-left from start on x, down on y
    assert.equal(bounds.width, 6);
    assert.equal(bounds.height, 6);
  });
});

describe('getSelectionSourceBounds', () => {
  test('reads sourceBounds when present, clamped to canvas size', () => {
    const bounds = getSelectionSourceBounds({ sourceBounds: { x: -5, y: -5, width: 20, height: 20 } }, 100, 100);
    assert.equal(bounds.x, 0);
    assert.equal(bounds.y, 0);
    assert.equal(bounds.width, 20);
    assert.equal(bounds.height, 20);
  });

  test('falls back to originalX/Y + width/height when sourceBounds is absent', () => {
    const bounds = getSelectionSourceBounds({ originalX: 10, originalY: 15, width: 30, height: 40 }, 100, 100);
    assert.deepEqual(bounds, { x: 10, y: 15, width: 30, height: 40 });
  });

  test('clamps width/height so the bounds never exceed the canvas', () => {
    const bounds = getSelectionSourceBounds({ originalX: 90, originalY: 90, width: 50, height: 50 }, 100, 100);
    assert.equal(bounds.x, 90);
    assert.equal(bounds.y, 90);
    assert.equal(bounds.width, 10);
    assert.equal(bounds.height, 10);
  });
});

describe('applyFeatherToImageData', () => {
  test('radius 0 returns the same imageData unchanged', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255]);
    const imageData = new ImageData(data, 1, 1);
    const result = applyFeatherToImageData(imageData, 0);
    assert.equal(result, imageData);
  });

  test('feathers a fully-opaque single pixel down toward the surrounding zero alpha', () => {
    // 3x3, only the center pixel opaque.
    const width = 3;
    const height = 3;
    const data = new Uint8ClampedArray(width * height * 4);
    const centerPos = ((1 * width) + 1) * 4;
    data[centerPos + 3] = 255;
    const imageData = new ImageData(data, width, height);

    const result = applyFeatherToImageData(imageData, 1);
    // Averaged with its (mostly zero-alpha) neighborhood, the center alpha
    // should drop well below fully opaque, but stay above zero.
    const centerAlpha = result.data[centerPos + 3];
    assert.ok(centerAlpha > 0 && centerAlpha < 255, `expected 0 < alpha < 255, got ${centerAlpha}`);
  });
});

describe('drawSelectionOutline', () => {
  test('clears the canvas and strokes the bounds rect', () => {
    const ctx = createFakeCtx(50, 50);
    drawSelectionOutline(ctx, { x: 5, y: 5, width: 10, height: 10 });

    assert.deepEqual(ctx.calls[0], ['clearRect', 0, 0, 50, 50]);
    assert.ok(ctx.calls.some((call) => call[0] === 'strokeRect'));
  });

  test('showPreview paints the bounds imageData before stroking', () => {
    const ctx = createFakeCtx();
    const imageData = { fake: true };
    drawSelectionOutline(ctx, { x: 1, y: 2, width: 3, height: 4, imageData }, { showPreview: true });

    assert.deepEqual(ctx.calls[1], ['putImageData', imageData, 1, 2]);
  });
});

describe('drawSelectionMaskContour', () => {
  test('no-ops when the selection is not masked', () => {
    const ctx = createFakeCtx();
    drawSelectionMaskContour(ctx, { masked: false, imageData: {} });
    assert.deepEqual(ctx.calls, []);
  });

  test('traces the outline of a fully-opaque single-pixel mask', () => {
    const ctx = createFakeCtx();
    const data = new Uint8ClampedArray([0, 0, 0, 255]);
    drawSelectionMaskContour(ctx, { x: 0, y: 0, masked: true, imageData: { width: 1, height: 1, data } });

    assert.deepEqual(ctx.calls[0], ['beginPath']);
    // All four edges of the single pixel are boundary edges.
    const lineToCount = ctx.calls.filter((call) => call[0] === 'lineTo').length;
    assert.equal(lineToCount, 4);
    assert.deepEqual(ctx.calls.at(-1), ['stroke']);
  });
});

describe('drawLassoPreview', () => {
  test('clears the canvas and no-ops with no points', () => {
    const ctx = createFakeCtx(20, 20);
    drawLassoPreview(ctx, [], null);
    assert.deepEqual(ctx.calls, [['clearRect', 0, 0, 20, 20]]);
  });

  test('traces a line through every point plus the current hover point', () => {
    const ctx = createFakeCtx();
    drawLassoPreview(ctx, [{ x: 0, y: 0 }, { x: 5, y: 5 }], { x: 8, y: 8 });

    const moveTo = ctx.calls.find((call) => call[0] === 'moveTo');
    assert.deepEqual(moveTo, ['moveTo', 0.5, 0.5]);
    const lineTos = ctx.calls.filter((call) => call[0] === 'lineTo');
    assert.deepEqual(lineTos, [
      ['lineTo', 5.5, 5.5],
      ['lineTo', 8.5, 8.5]
    ]);
  });
});
