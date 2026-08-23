'use strict';

// Unit tests for src/renderer/history.js. history.js touches
// document.getElementById directly inside updateUndoRedoButtons() (a
// pre-existing pattern, not introduced by this test) -- stub the minimum
// DOM surface it needs rather than pulling in a full DOM environment.

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

global.document = {
  getElementById: () => ({ disabled: false })
};

const { createHistory } = require('../../src/renderer/history');

// A minimal fake canvas/ctx: "pixels" is just a plain array standing in
// for ImageData.data, snapshotted/restored by value on get/put so tests
// can tell distinct states apart without a real Canvas2D implementation.
function fakeCanvas(width, height, pixels) {
  const canvas = { width, height, pixels: pixels.slice() };
  canvas.getContext = () => ({
    getImageData: () => ({ data: canvas.pixels.slice() }),
    putImageData: (imageData) => { canvas.pixels = imageData.data.slice(); },
    drawImage: (source) => { canvas.pixels = source.pixels.slice(); }
  });
  return canvas;
}

function makeFakeApp() {
  let frames = [{
    id: 0,
    layers: [{ id: 0, canvas: fakeCanvas(2, 2, [1, 1, 1, 1]) }]
  }];
  let layers = [{ id: 0, name: 'Background' }];
  let currentFrame = 0;
  let currentLayer = 0;
  let afterRestoreCalls = 0;
  let historyChangedCalls = 0;
  let activeLayerContextBlocked = false;

  const env = {
    getFrames: () => frames,
    setFrames: (value) => { frames = value; },
    getLayers: () => layers,
    setLayers: (value) => { layers = value; },
    getCurrentFrame: () => currentFrame,
    setCurrentFrame: (value) => { currentFrame = value; },
    getCurrentLayer: () => currentLayer,
    setCurrentLayer: (value) => { currentLayer = value; },
    getActiveLayerContext: () => {
      if (activeLayerContextBlocked) return null;
      const frame = frames[currentFrame];
      const layer = frame.layers[currentLayer];
      return layer ? { frame, layer, ctx: layer.canvas.getContext('2d') } : null;
    },
    createCanvas: (width, height) => fakeCanvas(width, height, [0, 0, 0, 0]),
    onAfterRestore: () => { afterRestoreCalls += 1; },
    onHistoryChanged: () => { historyChangedCalls += 1; }
  };

  const history = createHistory(env);

  return {
    history,
    getPixels: () => frames[0].layers[0].canvas.pixels,
    setPixels: (pixels) => { frames[0].layers[0].canvas.pixels = pixels.slice(); },
    getLayerName: () => layers[0].name,
    setLayerName: (name) => { layers[0] = { ...layers[0], name }; },
    getAfterRestoreCalls: () => afterRestoreCalls,
    getHistoryChangedCalls: () => historyChangedCalls,
    blockActiveLayerContext: (blocked) => { activeLayerContextBlocked = blocked; }
  };
}

describe('saveState / undo / redo (draw entries)', () => {
  test('undo restores the pixels from before saveState, redo restores them again', () => {
    const app = makeFakeApp();
    app.history.saveState();
    app.setPixels([9, 9, 9, 9]);

    app.history.undo();
    assert.deepEqual(app.getPixels(), [1, 1, 1, 1]);

    app.history.redo();
    assert.deepEqual(app.getPixels(), [9, 9, 9, 9]);
  });

  test('undo at the very start (nothing pushed) is a no-op', () => {
    const app = makeFakeApp();
    assert.doesNotThrow(() => app.history.undo());
    assert.deepEqual(app.getPixels(), [1, 1, 1, 1]);
  });

  test('redo past the tip (nothing to redo) is a no-op', () => {
    const app = makeFakeApp();
    app.history.saveState();
    app.setPixels([9, 9, 9, 9]);
    assert.doesNotThrow(() => app.history.redo());
    assert.deepEqual(app.getPixels(), [9, 9, 9, 9]);
  });

  test('a new saveState after undoing discards the redo branch', () => {
    const app = makeFakeApp();
    app.history.saveState();
    app.setPixels([2, 2, 2, 2]);
    app.history.saveState();
    app.setPixels([3, 3, 3, 3]);

    app.history.undo(); // back to [2,2,2,2]
    assert.deepEqual(app.getPixels(), [2, 2, 2, 2]);

    app.history.saveState();
    app.setPixels([4, 4, 4, 4]);

    // The old "redo to [3,3,3,3]" branch is gone.
    app.history.redo();
    assert.deepEqual(app.getPixels(), [4, 4, 4, 4]);
  });

  test('discardLastUndoState un-pushes a saveState that turned out to be a no-op', () => {
    const app = makeFakeApp();
    app.history.saveState();
    app.history.discardLastUndoState();

    // Nothing to undo -- the checkpoint was discarded.
    app.setPixels([5, 5, 5, 5]);
    app.history.undo();
    assert.deepEqual(app.getPixels(), [5, 5, 5, 5]);
  });

  test('getActiveLayerContext() returning null (e.g. a locked layer) makes saveState a no-op', () => {
    const app = makeFakeApp();
    app.blockActiveLayerContext(true);

    const before = app.history.getTimeline().length;
    app.history.saveState();
    assert.equal(app.history.getTimeline().length, before, 'no entry should be pushed when there is no active layer context');
  });
});

describe('saveStructureState / undo / redo (structure entries)', () => {
  test('undo restores prior layer metadata, redo restores the change again', () => {
    const app = makeFakeApp();
    app.history.saveStructureState();
    app.setLayerName('Renamed');

    app.history.undo();
    assert.equal(app.getLayerName(), 'Background');

    app.history.redo();
    assert.equal(app.getLayerName(), 'Renamed');
  });
});

describe('jumpTo', () => {
  test('jumps multiple steps back in one call and calls onAfterRestore exactly once', () => {
    const app = makeFakeApp();
    app.history.saveState();
    app.setPixels([2, 2, 2, 2]);
    app.history.saveState();
    app.setPixels([3, 3, 3, 3]);
    app.history.saveState();
    app.setPixels([4, 4, 4, 4]);

    const before = app.getAfterRestoreCalls();
    app.history.jumpTo(0);
    assert.deepEqual(app.getPixels(), [1, 1, 1, 1]);
    assert.equal(app.getAfterRestoreCalls(), before + 1);
  });

  test('jumps forward multiple steps in one call', () => {
    const app = makeFakeApp();
    app.history.saveState();
    app.setPixels([2, 2, 2, 2]);
    app.history.saveState();
    app.setPixels([3, 3, 3, 3]);
    app.history.jumpTo(0);

    app.history.jumpTo(2);
    assert.deepEqual(app.getPixels(), [3, 3, 3, 3]);
  });

  test('jumping to the current position is a no-op (no onAfterRestore call)', () => {
    const app = makeFakeApp();
    app.history.saveState();
    const before = app.getAfterRestoreCalls();
    app.history.jumpTo(1);
    assert.equal(app.getAfterRestoreCalls(), before);
  });

  test('clamps an out-of-range target to the nearest valid position', () => {
    const app = makeFakeApp();
    app.history.saveState();
    assert.doesNotThrow(() => app.history.jumpTo(999));
    assert.doesNotThrow(() => app.history.jumpTo(-5));
  });
});

describe('named snapshots survive undo/redo/jump passes', () => {
  test('a label on a position stays attached even after the pointer crosses it repeatedly', () => {
    const app = makeFakeApp();
    app.history.saveState(); // position 1
    app.setPixels([2, 2, 2, 2]);
    app.history.saveState(); // position 2
    app.setPixels([3, 3, 3, 3]);

    app.history.nameSnapshot(1, 'Before the second stroke');

    // Cross position 1 back and forth several times.
    app.history.jumpTo(0);
    app.history.jumpTo(2);
    app.history.jumpTo(0);
    app.history.jumpTo(1);

    const timeline = app.history.getTimeline();
    const named = timeline.find((entry) => entry.position === 1);
    assert.equal(named.label, 'Before the second stroke');
  });

  test('renaming an already-visited position after further undo/redo still finds it', () => {
    const app = makeFakeApp();
    app.history.saveState();
    app.setPixels([2, 2, 2, 2]);
    app.history.undo();
    app.history.redo();

    app.history.nameSnapshot(1, 'Named after redo');
    assert.equal(app.history.getTimeline()[1].label, 'Named after redo');
  });

  test('a new action after undo discards labels on the truncated redo branch', () => {
    const app = makeFakeApp();
    app.history.saveState(); // position 1
    app.setPixels([2, 2, 2, 2]);
    app.history.saveState(); // position 2
    app.history.nameSnapshot(2, 'Doomed label');

    app.history.jumpTo(1);
    app.history.saveState(); // discards the old position 2, pushes a new one

    const timeline = app.history.getTimeline();
    assert.equal(timeline.length, 3); // positions 0, 1, 2
    assert.notEqual(timeline[2].label, 'Doomed label');
  });

  test('naming an out-of-range position is a no-op, does not throw', () => {
    const app = makeFakeApp();
    assert.doesNotThrow(() => app.history.nameSnapshot(999, 'nope'));
    assert.doesNotThrow(() => app.history.nameSnapshot(-1, 'nope'));
  });
});

describe('getTimeline', () => {
  test('a fresh history has just the Start position, current', () => {
    const app = makeFakeApp();
    const timeline = app.history.getTimeline();
    assert.equal(timeline.length, 1);
    assert.equal(timeline[0].position, 0);
    assert.equal(timeline[0].label, 'Start');
    assert.equal(timeline[0].isCurrent, true);
  });

  test('defaults an unlabeled draw entry\'s label to "Draw #n"', () => {
    const app = makeFakeApp();
    app.history.saveState();
    assert.equal(app.history.getTimeline()[1].label, 'Draw #1');
  });

  test('defaults an unlabeled structure entry\'s label to "Structure change #n"', () => {
    const app = makeFakeApp();
    app.history.saveStructureState();
    assert.equal(app.history.getTimeline()[1].label, 'Structure change #1');
  });

  test('isCurrent tracks the pointer as it moves', () => {
    const app = makeFakeApp();
    app.history.saveState();
    app.history.saveState();
    let timeline = app.history.getTimeline();
    assert.deepEqual(timeline.map((e) => e.isCurrent), [false, false, true]);

    app.history.undo();
    timeline = app.history.getTimeline();
    assert.deepEqual(timeline.map((e) => e.isCurrent), [false, true, false]);
  });

  test('each pushed entry gets a numeric timestamp', () => {
    const app = makeFakeApp();
    app.history.saveState();
    const entry = app.history.getTimeline()[1];
    assert.equal(typeof entry.timestamp, 'number');
  });
});

describe('onHistoryChanged fires on every mutating operation', () => {
  test('fires on saveState, undo, redo, jumpTo, and nameSnapshot', () => {
    const app = makeFakeApp();
    const calls = () => app.getHistoryChangedCalls();

    const c0 = calls();
    app.history.saveState();
    assert.ok(calls() > c0);

    const c1 = calls();
    app.history.undo();
    assert.ok(calls() > c1);

    const c2 = calls();
    app.history.redo();
    assert.ok(calls() > c2);

    const c3 = calls();
    app.history.nameSnapshot(1, 'x');
    assert.ok(calls() > c3);
  });
});
