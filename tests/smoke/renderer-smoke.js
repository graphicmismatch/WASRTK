'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Renderer-side self-check for `npm run smoke` (electron . --smoke).
//
// Required by src/renderer/index.js only when '--smoke' is in process.argv,
// after `new WASRTK()` has completed. Runs a handful of programmatic probes
// against the live app instance and returns a plain-object report that
// index.js forwards to the main process over the smoke:result IPC channel
// (see main.js for the receiving side).
//
// Every probe uses WASRTK's existing public method surface (the duck-typed
// `app` interface tools/reference code also relies on) -- nothing here pokes
// at module-internal state directly.

const EXPECTED_TOOL_IDS = [
  'pen',
  'eraser',
  'line',
  'rectangle',
  'circle',
  'fill',
  'eyedropper',
  'selection'
];

function readPixel(canvas, x, y) {
  return Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data);
}

function pixelsEqual(a, b) {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function runProbe(probes, name, fn) {
  try {
    fn();
    probes[name] = { pass: true };
  } catch (error) {
    probes[name] = { pass: false, error: error && error.message ? error.message : String(error) };
  }
}

async function runAsyncProbe(probes, name, fn) {
  try {
    await fn();
    probes[name] = { pass: true };
  } catch (error) {
    probes[name] = { pass: false, error: error && error.message ? error.message : String(error) };
  }
}

async function runSmokeChecks(app, { errors = [] } = {}) {
  const probes = {};

  // Probe 1: constructor completed (we would not be running at all
  // otherwise) and window.onerror captured nothing so far.
  runProbe(probes, 'constructor', () => {
    if (!app) {
      throw new Error('WASRTK instance is missing');
    }
    if (errors.length > 0) {
      throw new Error(`window.onerror captured ${errors.length} error(s): ${errors.join(' | ')}`);
    }
  });

  // Probe 2: the tool registry contains exactly the 8 expected tool ids.
  runProbe(probes, 'tools', () => {
    const actualIds = Object.keys(app.tools || {}).sort();
    const expectedIds = [...EXPECTED_TOOL_IDS].sort();
    if (actualIds.length !== expectedIds.length || !actualIds.every((id, i) => id === expectedIds[i])) {
      throw new Error(`expected tool ids [${expectedIds.join(', ')}], got [${actualIds.join(', ')}]`);
    }
  });

  // Probe 3: draw probe. app.drawPoint(x, y) draws a brush stamp onto the
  // active layer via the current tool (default: pen) and re-composites the
  // frame onto the visible mainCanvas, so we can observe the change there
  // without reaching into module-internal layer/frame state.
  runProbe(probes, 'draw', () => {
    const mainCanvas = document.getElementById('mainCanvas');
    if (!mainCanvas) {
      throw new Error('mainCanvas element not found');
    }
    const drawX = 40;
    const drawY = 40;
    const before = readPixel(mainCanvas, drawX, drawY);
    app.drawPoint(drawX, drawY);
    const after = readPixel(mainCanvas, drawX, drawY);
    if (pixelsEqual(before, after)) {
      throw new Error('drawPoint did not change mainCanvas pixel data');
    }
  });

  // Probe 4: history probe. saveState -> draw -> undo -> pixel restored ->
  // redo -> pixel changed again. Uses only the public saveState/undo/redo
  // methods (never the internal undoStack/redoStack directly). A different
  // canvas region than the draw probe is used to avoid interference.
  runProbe(probes, 'history', () => {
    const mainCanvas = document.getElementById('mainCanvas');
    const historyX = 200;
    const historyY = 200;

    const beforeState = readPixel(mainCanvas, historyX, historyY);
    app.saveState();
    app.drawPoint(historyX, historyY);
    const afterDraw = readPixel(mainCanvas, historyX, historyY);

    if (pixelsEqual(beforeState, afterDraw)) {
      throw new Error('drawPoint did not change the history probe pixel');
    }

    app.undo();
    const afterUndo = readPixel(mainCanvas, historyX, historyY);
    if (!pixelsEqual(afterUndo, beforeState)) {
      throw new Error('undo did not restore the pre-draw pixel');
    }

    app.redo();
    const afterRedo = readPixel(mainCanvas, historyX, historyY);
    if (!pixelsEqual(afterRedo, afterDraw)) {
      throw new Error('redo did not restore the post-draw pixel');
    }
  });

  // Probe 5: selection probe. Create a rectangular selection via the public
  // interaction FSM methods (startSelectionInteraction / updateSelectionInteraction
  // / finishSelectionInteraction, the same ones the selection tool's mouse
  // handlers call), then clearSelection. Must not throw. Uses a region away
  // from the draw/history probes.
  runProbe(probes, 'selection', () => {
    app.startSelectionInteraction({ x: 10, y: 10 });
    app.updateSelectionInteraction({ x: 30, y: 30 });
    app.finishSelectionInteraction();
    app.clearSelection();
  });

  // Probe 6: paste probe (regression guard for the 1.8 fix). Pasting used
  // to bake the clipboard pixels straight onto the layer via putImageData,
  // permanently destroying whatever was underneath before a later
  // detach/cancel ever got a chance to snapshot it -- so dragging a pasted
  // selection and pressing Escape restored the (already-baked) pasted
  // pixels instead of the true original background. Reproduces that flow
  // with public methods only: draw a red dot, select + copy it, draw a
  // black "background" dot elsewhere, select that region, paste (lands
  // ~1px offset from the selection, over the background dot), drag the
  // floating paste, then clearSelection() (Escape's public equivalent) and
  // assert the background pixel is restored byte-for-byte. A final
  // paste+commit checks paste is not merely a no-op.
  runProbe(probes, 'paste', () => {
    const mainCanvas = document.getElementById('mainCanvas');
    if (!mainCanvas) {
      throw new Error('mainCanvas element not found');
    }

    app.setColor('#ff0000');
    const clipX = 150;
    const clipY = 15;
    app.drawPoint(clipX, clipY);
    app.startSelectionInteraction({ x: clipX - 5, y: clipY - 5 });
    app.updateSelectionInteraction({ x: clipX + 5, y: clipY + 5 });
    app.finishSelectionInteraction();
    app.copySelectionToClipboard();
    app.clearSelection();

    app.setColor('#000000');
    const bgX = 150;
    const bgY = 55;
    app.drawPoint(bgX, bgY);
    const backgroundBefore = readPixel(mainCanvas, bgX, bgY);

    app.startSelectionInteraction({ x: bgX - 5, y: bgY - 5 });
    app.updateSelectionInteraction({ x: bgX + 5, y: bgY + 5 });
    app.finishSelectionInteraction();

    app.pasteSelectionFromClipboard();

    // Paste must not touch the layer before commit -- mainCanvas (the
    // composited layer view) should still show the untouched background.
    const backgroundDuringPaste = readPixel(mainCanvas, bgX, bgY);
    if (!pixelsEqual(backgroundDuringPaste, backgroundBefore)) {
      throw new Error('paste modified the layer before commit (background pixel changed)');
    }

    // Drag the floating paste, the same as the selection tool's mouse
    // handlers do, then cancel via the public Escape-equivalent.
    app.startSelectionInteraction({ x: bgX, y: bgY });
    app.updateSelectionInteraction({ x: bgX + 20, y: bgY + 20 });
    app.finishSelectionInteraction();
    app.clearSelection();

    const backgroundAfterCancel = readPixel(mainCanvas, bgX, bgY);
    if (!pixelsEqual(backgroundAfterCancel, backgroundBefore)) {
      throw new Error('cancel after moving a pasted selection did not restore the original background pixel');
    }

    // Sanity check the other direction: paste + commit must still land the
    // clipboard content on the layer (the fix must not turn paste into a
    // silent no-op).
    app.startSelectionInteraction({ x: bgX - 5, y: bgY - 5 });
    app.updateSelectionInteraction({ x: bgX + 5, y: bgY + 5 });
    app.finishSelectionInteraction();
    app.pasteSelectionFromClipboard();
    app.commitDetachedSelection();
    app.clearSelection();

    const committedPixel = readPixel(mainCanvas, bgX, bgY);
    if (pixelsEqual(committedPixel, backgroundBefore)) {
      throw new Error('committed paste did not write the clipboard content to the layer');
    }
  });

  // Probe 7: exporters.getMimeType is reachable and correct for a known
  // extension.
  runProbe(probes, 'mime', () => {
    // eslint-disable-next-line global-require
    const { getMimeType } = require('../../src/renderer/exporters');
    const mimeType = getMimeType('.png');
    if (mimeType !== 'image/png') {
      throw new Error(`expected 'image/png', got '${mimeType}'`);
    }
  });

  // Probe 8: fps probe. Dispatching an 'input' event on the FPS slider
  // should update the module-level `fps` state that saveProject persists
  // (not just the on-screen label). Drives the slider the same way a real
  // user drag does, saves a project to a scratch file via the app's own
  // public saveProject method, then reads back settings.fps.
  await runAsyncProbe(probes, 'fps', async () => {
    const fpsSlider = document.getElementById('fpsSlider');
    if (!fpsSlider) {
      throw new Error('fpsSlider element not found');
    }
    const originalValue = fpsSlider.value;
    const probeValue = originalValue === '24' ? '20' : '24';
    const tmpPath = path.join(os.tmpdir(), `wasrtk-smoke-fps-${Date.now()}.wasrtk`);

    try {
      fpsSlider.value = probeValue;
      fpsSlider.dispatchEvent(new Event('input', { bubbles: true }));

      await app.saveProject(tmpPath);

      const saved = JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
      const savedFps = saved && saved.settings && saved.settings.fps;
      if (String(savedFps) !== probeValue) {
        throw new Error(`expected saved settings.fps to be ${probeValue}, got ${savedFps}`);
      }
    } finally {
      fpsSlider.value = originalValue;
      fpsSlider.dispatchEvent(new Event('input', { bubbles: true }));
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    }
  });

  // Probe 9: frames probe. Regression guard for the upcoming frame-manager
  // extraction (addFrame/duplicateFrame/deleteFrame/moveFrame* are moving
  // out of wasrtk.js). Drives only the public frame methods and reads back
  // through #timeline (the DOM updateTimeline() renders) and mainCanvas
  // pixels, the same way the draw/history probes do -- frames/currentFrame
  // are module-private and never touched directly. Ends by restoring the
  // original frame count/selection so later probes are unaffected.
  runProbe(probes, 'frames', () => {
    const timeline = document.getElementById('timeline');
    const mainCanvas = document.getElementById('mainCanvas');
    if (!timeline) {
      throw new Error('timeline element not found');
    }
    if (!mainCanvas) {
      throw new Error('mainCanvas element not found');
    }
    const frameX = 220;
    const frameY = 220;
    const getFrameItems = () => timeline.querySelectorAll('.frame-item');
    const getActiveIndex = () => Array.from(getFrameItems()).findIndex((el) => el.classList.contains('active'));

    const initialCount = getFrameItems().length;

    app.addFrame();
    const afterAdd = getFrameItems();
    if (afterAdd.length !== initialCount + 1) {
      throw new Error(`addFrame: expected ${initialCount + 1} frame-items, got ${afterAdd.length}`);
    }
    if (!afterAdd[afterAdd.length - 1].classList.contains('active')) {
      throw new Error('addFrame did not select the newly added frame');
    }

    // A large brush keeps the sampled pixel deep inside a solid-color
    // region, away from the antialiased edge of the stamp -- sampling
    // right at an AA edge is sensitive to canvas resampling quirks during
    // the frame-copy drawImage() call and is not what this probe is for.
    const originalBrushSize = app.getBrushSize();
    app.setBrushSize(24, { silent: true });
    app.setColor('#00ff00');
    app.drawPoint(frameX, frameY);
    const sourceFramePixel = readPixel(mainCanvas, frameX, frameY);

    app.duplicateFrame();
    const afterDuplicate = getFrameItems();
    if (afterDuplicate.length !== initialCount + 2) {
      throw new Error(`duplicateFrame: expected ${initialCount + 2} frame-items, got ${afterDuplicate.length}`);
    }
    const duplicatedPixel = readPixel(mainCanvas, frameX, frameY);
    if (!pixelsEqual(duplicatedPixel, sourceFramePixel)) {
      throw new Error('duplicateFrame did not copy the source frame pixel data');
    }
    app.setBrushSize(originalBrushSize, { silent: true });

    // Drawing on the duplicate must not leak into the frame it was copied from.
    app.setColor('#ff00ff');
    app.drawPoint(frameX, frameY);
    app.selectFrame(afterDuplicate.length - 2);
    const sourceAfterDuplicateEdit = readPixel(mainCanvas, frameX, frameY);
    if (!pixelsEqual(sourceAfterDuplicateEdit, sourceFramePixel)) {
      throw new Error('editing the duplicated frame leaked into the frame it was copied from');
    }

    app.selectFrame(afterDuplicate.length - 1);
    app.deleteFrame();
    const afterDelete = getFrameItems();
    if (afterDelete.length !== initialCount + 1) {
      throw new Error(`deleteFrame: expected ${initialCount + 1} frame-items, got ${afterDelete.length}`);
    }

    const beforeMoveIndex = getActiveIndex();
    if (beforeMoveIndex <= 0) {
      throw new Error(`frames probe setup error: expected active frame index > 0 before moveFrameLeft, got ${beforeMoveIndex}`);
    }
    app.moveFrameLeft();
    const afterMoveLeftIndex = getActiveIndex();
    if (afterMoveLeftIndex !== beforeMoveIndex - 1) {
      throw new Error(`moveFrameLeft: expected active index ${beforeMoveIndex - 1}, got ${afterMoveLeftIndex}`);
    }
    app.moveFrameRight();
    const afterMoveRightIndex = getActiveIndex();
    if (afterMoveRightIndex !== beforeMoveIndex) {
      throw new Error(`moveFrameRight: expected active index ${beforeMoveIndex} after moving back, got ${afterMoveRightIndex}`);
    }

    // Restore the original frame count/selection for later probes.
    app.deleteFrame();
    const finalCount = getFrameItems().length;
    if (finalCount !== initialCount) {
      throw new Error(`frames probe cleanup: expected ${initialCount} frame-items restored, got ${finalCount}`);
    }
  });

  // Probe 10: layers probe. Regression guard for the upcoming layer-manager
  // extraction (addLayer/deleteLayer/moveLayer*/toggleLayerVisibility are
  // moving out of wasrtk.js). Drives only the public layer methods and
  // reads back through #layerList (the DOM updateLayerList() renders) --
  // layers/currentLayer are module-private and never touched directly.
  // Ends by restoring the original layer count so later probes are
  // unaffected.
  runProbe(probes, 'layers', () => {
    const layerList = document.getElementById('layerList');
    if (!layerList) {
      throw new Error('layerList element not found');
    }
    const getLayerItems = () => layerList.querySelectorAll('.layer-item');
    const getLayerItem = (index) => layerList.querySelector(`.layer-item[data-layer="${index}"]`);

    const initialCount = getLayerItems().length;
    const newLayerIndex = initialCount;

    app.addLayer();
    const afterAdd = getLayerItems();
    if (afterAdd.length !== initialCount + 1) {
      throw new Error(`addLayer: expected ${initialCount + 1} layer-items, got ${afterAdd.length}`);
    }
    if (!getLayerItem(newLayerIndex)) {
      throw new Error('addLayer: new layer element not found in layerList');
    }

    app.toggleLayerVisibility(newLayerIndex);
    const toggledIcon = layerList.querySelector(`.layer-item[data-layer="${newLayerIndex}"] .layer-visibility i`);
    if (!toggledIcon || !toggledIcon.className.includes('eye-slash')) {
      throw new Error('toggleLayerVisibility did not hide the layer');
    }
    app.toggleLayerVisibility(newLayerIndex);
    const restoredIcon = layerList.querySelector(`.layer-item[data-layer="${newLayerIndex}"] .layer-visibility i`);
    if (!restoredIcon || restoredIcon.className.includes('eye-slash')) {
      throw new Error('toggleLayerVisibility did not restore layer visibility on second call');
    }

    app.selectLayer(newLayerIndex);
    app.moveLayerDown();
    if (!getLayerItem(newLayerIndex - 1).classList.contains('active')) {
      throw new Error('moveLayerDown did not move the active layer down one slot');
    }
    app.moveLayerUp();
    if (!getLayerItem(newLayerIndex).classList.contains('active')) {
      throw new Error('moveLayerUp did not restore the original layer position');
    }

    app.deleteLayer();
    const afterDelete = getLayerItems();
    if (afterDelete.length !== initialCount) {
      throw new Error(`deleteLayer: expected ${initialCount} layer-items restored, got ${afterDelete.length}`);
    }
  });

  // Probe 11: zoom probe. Regression guard for the upcoming zoom.js
  // extraction. Drives only the public zoom methods and reads back through
  // #zoomInput (the DOM updateZoom() writes to) -- the zoom variable is
  // module-private. Ends on resetZoom() so later probes see the default
  // 100% zoom.
  runProbe(probes, 'zoom', () => {
    const zoomInput = document.getElementById('zoomInput');
    if (!zoomInput) {
      throw new Error('zoomInput element not found');
    }

    app.resetZoom();
    const baseline = Number(zoomInput.value);
    if (baseline !== 100) {
      throw new Error(`resetZoom: expected zoomInput 100, got ${baseline}`);
    }

    app.zoomIn();
    const afterZoomIn = Number(zoomInput.value);
    if (!(afterZoomIn > baseline)) {
      throw new Error(`zoomIn: expected zoomInput to increase above ${baseline}, got ${afterZoomIn}`);
    }

    app.zoomOut();
    app.zoomOut();
    const afterZoomOut = Number(zoomInput.value);
    if (!(afterZoomOut < baseline)) {
      throw new Error(`zoomOut: expected zoomInput to drop below ${baseline}, got ${afterZoomOut}`);
    }

    app.resetZoom();
    const afterReset = Number(zoomInput.value);
    if (afterReset !== 100) {
      throw new Error(`resetZoom: expected zoomInput 100 after reset, got ${afterReset}`);
    }
  });

  // Probe 12: fill probe. Regression guard for the upcoming canvas-engine.js
  // extraction (floodFill is moving out of wasrtk.js along with the rest of
  // the drawing/shape core). Fills from a region left untouched by earlier
  // probes and checks the sampled pixel actually changed to the fill color,
  // reading straight from the active layer's own canvas (floodFill commits
  // via putImageData on that layer directly -- no need to go through
  // renderCurrentFrame's compositing to observe it).
  runProbe(probes, 'fill', () => {
    const layerContext = app.getActiveLayerContext();
    if (!layerContext) {
      throw new Error('no active layer context for fill probe');
    }
    const { ctx } = layerContext;
    const fillX = 100;
    const fillY = 180;

    const before = readPixel(ctx.canvas, fillX, fillY);
    const changedCount = app.floodFill(ctx, fillX, fillY, '#00ffff');
    if (changedCount <= 0) {
      throw new Error(`floodFill reported ${changedCount} changed pixels, expected > 0`);
    }

    const after = readPixel(ctx.canvas, fillX, fillY);
    if (pixelsEqual(before, after)) {
      throw new Error('floodFill did not change the sampled pixel');
    }
    if (after[0] !== 0 || after[1] !== 255 || after[2] !== 255) {
      throw new Error(`floodFill pixel color mismatch: expected rgb(0,255,255), got rgb(${after[0]},${after[1]},${after[2]})`);
    }
  });

  // Probe 13: shape probe. Regression guard for the upcoming
  // canvas-engine.js extraction (commitShape is moving out along with
  // floodFill). Uses a thick brush so the stroke reliably overlaps a
  // generously sized sample region regardless of the exact sub-pixel
  // inset math buildShapePath applies for the brush-width-aware rectangle
  // path -- this probe checks commitShape paints *something*, not the
  // precise geometry.
  runProbe(probes, 'shape', () => {
    const layerContext = app.getActiveLayerContext();
    if (!layerContext) {
      throw new Error('no active layer context for shape probe');
    }
    const { ctx } = layerContext;
    const originalBrushSize = app.getBrushSize();
    const start = { x: 30, y: 220 };
    const end = { x: 90, y: 250 };
    const sampleWidth = end.x - start.x;
    const sampleHeight = 20;

    app.setBrushSize(10, { silent: true });
    app.setColor('#ff8800');

    const before = ctx.getImageData(start.x, start.y, sampleWidth, sampleHeight).data.slice();
    app.commitShape(start, end, 'rectangle');
    const after = ctx.getImageData(start.x, start.y, sampleWidth, sampleHeight).data;

    app.setBrushSize(originalBrushSize, { silent: true });

    let changed = false;
    for (let i = 0; i < before.length; i++) {
      if (before[i] !== after[i]) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      throw new Error('commitShape did not change any pixel in the sampled rectangle region');
    }
  });

  const ok = Object.values(probes).every((probe) => probe.pass) && errors.length === 0;

  return {
    ok,
    probes,
    errors
  };
}

module.exports = {
  runSmokeChecks,
  EXPECTED_TOOL_IDS
};
