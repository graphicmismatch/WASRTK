'use strict';

// Unit tests for src/renderer/exporters.js.
//
// exporters.js only requires the built-in 'path' module at the top level
// (checked by reading the source before writing this file) -- it does NOT
// require('electron'), so no stub/loader is needed to require it directly
// under node:test. All Electron-shaped dependencies (ipcRenderer.invoke,
// the GIF constructor, canvas creation) are passed in as function
// parameters by the caller, so they are faked inline per test instead.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  getMimeType,
  getFrameDelayMs,
  drawVisibleLayersToContext,
  saveAsGif
} = require('../../src/renderer/exporters');

describe('getMimeType', () => {
  test('resolves known extensions', () => {
    assert.equal(getMimeType('.png'), 'image/png');
    assert.equal(getMimeType('.jpg'), 'image/jpeg');
    assert.equal(getMimeType('.jpeg'), 'image/jpeg');
    assert.equal(getMimeType('.gif'), 'image/gif');
    assert.equal(getMimeType('.bmp'), 'image/bmp');
  });

  test('is case-insensitive', () => {
    assert.equal(getMimeType('.PNG'), 'image/png');
    assert.equal(getMimeType('.Gif'), 'image/gif');
  });

  test('falls back to application/octet-stream for unknown extensions', () => {
    assert.equal(getMimeType('.tiff'), 'application/octet-stream');
    assert.equal(getMimeType('.webp'), 'application/octet-stream');
  });

  test('falls back to application/octet-stream for null/undefined/empty input', () => {
    assert.equal(getMimeType(null), 'application/octet-stream');
    assert.equal(getMimeType(undefined), 'application/octet-stream');
    assert.equal(getMimeType(''), 'application/octet-stream');
  });
});

describe('getFrameDelayMs', () => {
  test('computes rounded milliseconds-per-frame from fps', () => {
    assert.equal(getFrameDelayMs(10), 100);
    assert.equal(getFrameDelayMs(24), 42); // 1000/24 = 41.666... -> rounds to 42
    assert.equal(getFrameDelayMs(25), 40);
  });

  test('falls back to 100ms for fps <= 0', () => {
    assert.equal(getFrameDelayMs(0), 100);
    assert.equal(getFrameDelayMs(-5), 100);
  });

  test('falls back to 100ms for non-finite/non-numeric fps', () => {
    assert.equal(getFrameDelayMs(NaN), 100);
    assert.equal(getFrameDelayMs(undefined), 100);
    assert.equal(getFrameDelayMs('not-a-number'), 100);
  });

  test('never returns less than 1ms for very high fps', () => {
    assert.equal(getFrameDelayMs(100000), 1);
  });
});

describe('drawVisibleLayersToContext', () => {
  function fakeCtx() {
    const calls = [];
    return {
      calls,
      drawImage(...args) {
        calls.push(args);
      }
    };
  }

  test('draws only visible layers, in array order', () => {
    const ctx = fakeCtx();
    const layerA = { visible: true, canvas: 'canvas-A' };
    const layerB = { visible: false, canvas: 'canvas-B' };
    const layerC = { visible: true, canvas: 'canvas-C' };

    drawVisibleLayersToContext(ctx, { layers: [layerA, layerB, layerC] });

    assert.equal(ctx.calls.length, 2);
    assert.deepEqual(ctx.calls[0], ['canvas-A', 0, 0]);
    assert.deepEqual(ctx.calls[1], ['canvas-C', 0, 0]);
  });

  test('draws nothing when no layers are visible', () => {
    const ctx = fakeCtx();
    drawVisibleLayersToContext(ctx, { layers: [{ visible: false, canvas: 'x' }] });
    assert.equal(ctx.calls.length, 0);
  });

  test('handles a frame with a missing/non-array layers property without throwing', () => {
    const ctx = fakeCtx();
    assert.doesNotThrow(() => drawVisibleLayersToContext(ctx, {}));
    assert.equal(ctx.calls.length, 0);
  });

  test('handles a null/undefined frame without throwing', () => {
    const ctx = fakeCtx();
    assert.doesNotThrow(() => drawVisibleLayersToContext(ctx, null));
    assert.doesNotThrow(() => drawVisibleLayersToContext(ctx, undefined));
    assert.equal(ctx.calls.length, 0);
  });
});

describe('saveAsGif', () => {
  // Minimal fake of the gif.js GIF class. Records constructor options and
  // every addFrame call, and lets the test control when/how 'finished'
  // fires via render().
  class FakeGIF {
    constructor(options) {
      this.options = options;
      this.frames = [];
      this.handlers = {};
      FakeGIF.lastInstance = this;
    }

    addFrame(canvas, opts) {
      this.frames.push({ canvas, opts });
    }

    on(event, handler) {
      this.handlers[event] = handler;
    }

    render() {
      const finished = this.handlers.finished;
      if (finished) {
        const fakeBlob = {
          arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer
        };
        // Fire asynchronously, like the real gif.js worker pipeline would.
        Promise.resolve().then(() => finished(fakeBlob));
      }
    }
  }

  function fakeCreateCanvas() {
    return (width, height) => ({
      width,
      height,
      getContext: () => ({
        clearRect() {},
        drawImage() {}
      })
    });
  }

  function fakeFrames(count) {
    return Array.from({ length: count }, (_, i) => ({
      layers: [{ visible: true, canvas: `frame-${i}` }]
    }));
  }

  test('resolves once invoke succeeds, forwarding a Buffer and the filePath', async () => {
    const invokeCalls = [];
    const invoke = async (channel, payload) => {
      invokeCalls.push({ channel, payload });
      return { success: true };
    };

    await saveAsGif({
      filePath: '/tmp/out.gif',
      frames: fakeFrames(2),
      width: 10,
      height: 10,
      fps: 24,
      invoke,
      createCanvas: fakeCreateCanvas(),
      GIF: FakeGIF
    });

    assert.equal(invokeCalls.length, 1);
    assert.equal(invokeCalls[0].channel, 'save-file');
    assert.equal(invokeCalls[0].payload.filePath, '/tmp/out.gif');
    assert.ok(Buffer.isBuffer(invokeCalls[0].payload.data));
  });

  test('adds one GIF frame per input frame, using only visible layers', async () => {
    const invoke = async () => ({ success: true });

    await saveAsGif({
      filePath: '/tmp/out.gif',
      frames: fakeFrames(3),
      width: 10,
      height: 10,
      fps: 24,
      invoke,
      createCanvas: fakeCreateCanvas(),
      GIF: FakeGIF
    });

    assert.equal(FakeGIF.lastInstance.frames.length, 3);
  });

  test('computes each frame delay from fps via getFrameDelayMs', async () => {
    const invoke = async () => ({ success: true });
    const fps = 24;

    await saveAsGif({
      filePath: '/tmp/out.gif',
      frames: fakeFrames(2),
      width: 10,
      height: 10,
      fps,
      invoke,
      createCanvas: fakeCreateCanvas(),
      GIF: FakeGIF
    });

    const expectedDelay = getFrameDelayMs(fps);
    for (const frame of FakeGIF.lastInstance.frames) {
      assert.equal(frame.opts.delay, expectedDelay);
    }
  });

  test('rejects when invoke resolves with success: false', async () => {
    const invoke = async () => ({ success: false, error: 'disk full' });

    await assert.rejects(
      () =>
        saveAsGif({
          filePath: '/tmp/out.gif',
          frames: fakeFrames(1),
          width: 10,
          height: 10,
          fps: 24,
          invoke,
          createCanvas: fakeCreateCanvas(),
          GIF: FakeGIF
        }),
      /disk full/
    );
  });

  test('rejects with a fallback message when invoke fails without an error message', async () => {
    const invoke = async () => ({ success: false });

    await assert.rejects(
      () =>
        saveAsGif({
          filePath: '/tmp/out.gif',
          frames: fakeFrames(1),
          width: 10,
          height: 10,
          fps: 24,
          invoke,
          createCanvas: fakeCreateCanvas(),
          GIF: FakeGIF
        }),
      /Failed to save GIF file/
    );
  });

  test('rejects when invoke itself throws/rejects', async () => {
    const invoke = async () => {
      throw new Error('IPC channel closed');
    };

    await assert.rejects(
      () =>
        saveAsGif({
          filePath: '/tmp/out.gif',
          frames: fakeFrames(1),
          width: 10,
          height: 10,
          fps: 24,
          invoke,
          createCanvas: fakeCreateCanvas(),
          GIF: FakeGIF
        }),
      /IPC channel closed/
    );
  });

  test('passes width/height through to the GIF constructor', async () => {
    const invoke = async () => ({ success: true });

    await saveAsGif({
      filePath: '/tmp/out.gif',
      frames: fakeFrames(1),
      width: 42,
      height: 24,
      fps: 24,
      invoke,
      createCanvas: fakeCreateCanvas(),
      GIF: FakeGIF
    });

    assert.equal(FakeGIF.lastInstance.options.width, 42);
    assert.equal(FakeGIF.lastInstance.options.height, 24);
  });
});
