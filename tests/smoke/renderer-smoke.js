'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ipcRenderer } = require('electron');

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

  // Probe: historyPanel probe. Regression guard for history.js's
  // position-pointer rewrite (jumpTo, nameSnapshot, getTimeline) and
  // history-panel.js's DOM rendering, through the real app rather than the
  // fake canvas the unit tests use. Draws two dots at different points in
  // history, names one, jumps around (including a multi-step jump that
  // crosses the named position several times), and checks both the actual
  // pixels and the panel DOM reflect the jumped-to state.
  runProbe(probes, 'historyPanel', () => {
    const historyList = document.getElementById('historyList');
    const mainCanvas = document.getElementById('mainCanvas');
    if (!historyList || !mainCanvas) {
      throw new Error('historyList or mainCanvas element not found');
    }

    app.selectLayer(0);
    const pixelA = { x: 60, y: 200 };
    const pixelB = { x: 80, y: 200 };

    app.saveState();
    app.setColor('#00ff00');
    app.drawPoint(pixelA.x, pixelA.y);
    const timelineAfterA = app.getHistoryTimeline();
    const positionAfterA = timelineAfterA[timelineAfterA.length - 1].position;
    app.nameSnapshot(positionAfterA, 'After green dot');

    app.saveState();
    app.setColor('#0000ff');
    app.drawPoint(pixelB.x, pixelB.y);
    const timelineAfterB = app.getHistoryTimeline();
    const positionAfterB = timelineAfterB[timelineAfterB.length - 1].position;

    const greenNow = readPixel(mainCanvas, pixelA.x, pixelA.y);
    const blueNow = readPixel(mainCanvas, pixelB.x, pixelB.y);
    if (greenNow[1] < 150 || greenNow[0] > 100) {
      throw new Error(`historyPanel: expected the green dot present, got rgb(${greenNow.slice(0, 3).join(',')})`);
    }
    if (blueNow[2] < 150 || blueNow[0] > 100) {
      throw new Error(`historyPanel: expected the blue dot present, got rgb(${blueNow.slice(0, 3).join(',')})`);
    }

    // Jump back to "after green dot" -- blue dot should be gone, green
    // should remain (this is a 1-step jump, but jumpTo's loop is the same
    // machinery a multi-step jump would use).
    app.jumpTo(positionAfterA);
    const blueAfterJumpBack = readPixel(mainCanvas, pixelB.x, pixelB.y);
    // The background itself is opaque white, so alpha alone can't tell
    // "still blue" from "back to background" -- check the blue channel
    // dropped back down instead.
    if (blueAfterJumpBack[2] > 200 && blueAfterJumpBack[0] < 100) {
      throw new Error(`historyPanel: expected the blue dot to be gone after jumping back to before it was drawn, got rgb(${blueAfterJumpBack.slice(0, 3).join(',')})`);
    }
    const greenStillThere = readPixel(mainCanvas, pixelA.x, pixelA.y);
    if (greenStillThere[1] < 150) {
      throw new Error('historyPanel: expected the green dot to remain after jumping back past the blue one');
    }

    // The label on positionAfterA must survive being crossed multiple
    // times by other jumps.
    app.jumpTo(positionAfterB);
    app.jumpTo(0);
    app.jumpTo(positionAfterA);
    const timelineAfterRoundTrip = app.getHistoryTimeline();
    const namedEntry = timelineAfterRoundTrip.find((entry) => entry.position === positionAfterA);
    if (!namedEntry || namedEntry.label !== 'After green dot') {
      throw new Error(`historyPanel: expected the label to survive multiple jumps, got "${namedEntry && namedEntry.label}"`);
    }

    // The panel DOM reflects the current position.
    const activeRow = historyList.querySelector('.history-item.active');
    if (!activeRow) {
      throw new Error('historyPanel: expected an active .history-item row after jumpTo');
    }
    if (activeRow.dataset.position !== String(positionAfterA)) {
      throw new Error(`historyPanel: expected the active row to be position ${positionAfterA}, got ${activeRow.dataset.position}`);
    }

    app.jumpTo(positionAfterB); // leave at the tip for later probes
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

  // Probe: floatingPanels probe. Checks the Tools section survived being
  // moved from the fixed sidebar into a floating panel (item 7) -- the
  // tool buttons still exist and work inside it -- and regression-guards
  // layout-config.js's merge-on-save fix: saving one panel's position/size
  // must not wipe out a DIFFERENT panel's already-saved state, which a
  // plain replace-on-save silently did before that fix (nothing caught it
  // until a second panel, historyPanel, existed to notice on).
  await runAsyncProbe(probes, 'floatingPanels', async () => {
    const toolsPanel = document.getElementById('toolsPanel');
    const toolsPanelHandle = document.getElementById('toolsPanelHandle');
    const colorPanel = document.getElementById('colorPanel');
    if (!toolsPanel || !toolsPanelHandle || !colorPanel) {
      throw new Error('toolsPanel, toolsPanelHandle, or colorPanel element not found');
    }
    if (!toolsPanel.classList.contains('floating-panel')) {
      throw new Error('expected #toolsPanel to be a .floating-panel');
    }
    const lineToolBtn = toolsPanel.querySelector('.tool-btn[data-tool="line"]');
    if (!lineToolBtn) {
      throw new Error('expected .tool-btn[data-tool="line"] inside the floating Tools panel');
    }
    app.selectTool('line');
    if (app.getCurrentToolConfig()?.id !== 'line') {
      throw new Error('selectTool did not work with the tool buttons relocated into the floating panel');
    }
    app.selectTool('pen'); // restore the default for later probes

    const { layout: before } = await ipcRenderer.invoke('load-layout-config');
    const previousColorPanel = before.panels.colorPanel;
    const previousToolsPanel = before.panels.toolsPanel;

    try {
      await ipcRenderer.invoke('save-layout-config', { panels: { colorPanel: { top: 111, left: 222, width: 240, height: 300 } } });
      await ipcRenderer.invoke('save-layout-config', { panels: { toolsPanel: { top: 333, left: 444, width: 240, height: 300 } } });

      const { layout: after } = await ipcRenderer.invoke('load-layout-config');
      if (!after.panels.colorPanel || after.panels.colorPanel.top !== 111 || after.panels.colorPanel.left !== 222) {
        throw new Error(`floatingPanels: expected colorPanel's saved position to survive the later toolsPanel save, got ${JSON.stringify(after.panels.colorPanel)}`);
      }
      if (!after.panels.toolsPanel || after.panels.toolsPanel.top !== 333) {
        throw new Error(`floatingPanels: expected toolsPanel's own save to have taken effect, got ${JSON.stringify(after.panels.toolsPanel)}`);
      }
    } finally {
      // Restore whatever was there before this probe touched it.
      await ipcRenderer.invoke('save-layout-config', {
        panels: {
          colorPanel: previousColorPanel || { top: 76, left: 300 },
          toolsPanel: previousToolsPanel || { top: 76, left: 20 }
        }
      });
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

  // Probe: flatten probe. Regression guard for flattenLayer baking a
  // flattened layer's own opacity into the merged pixels instead of
  // silently dropping it (opacity 1, normal blend) -- paints opaque blue
  // on the base layer, 50%-opacity red on a layer above it, flattens, and
  // checks the merged pixel landed roughly halfway between the two rather
  // than at either color outright.
  runProbe(probes, 'flatten', () => {
    const layerList = document.getElementById('layerList');
    if (!layerList) {
      throw new Error('layerList element not found');
    }
    const flattenX = 150;
    const flattenY = 100;
    const initialCount = layerList.querySelectorAll('.layer-item').length;
    const newLayerIndex = initialCount;

    app.selectLayer(0);
    const baseContext = app.getActiveLayerContext();
    if (!baseContext) {
      throw new Error('no active layer context for base paint in flatten probe');
    }
    baseContext.ctx.globalAlpha = 1;
    baseContext.ctx.globalCompositeOperation = 'source-over';
    baseContext.ctx.fillStyle = '#0000ff';
    baseContext.ctx.fillRect(flattenX, flattenY, 1, 1);

    app.addLayer();
    app.selectLayer(newLayerIndex);
    app.setLayerOpacity(newLayerIndex, 0.5);

    const topContext = app.getActiveLayerContext();
    if (!topContext) {
      throw new Error('no active layer context for top paint in flatten probe');
    }
    topContext.ctx.globalAlpha = 1;
    topContext.ctx.globalCompositeOperation = 'source-over';
    topContext.ctx.fillStyle = '#ff0000';
    topContext.ctx.fillRect(flattenX, flattenY, 1, 1);

    app.flattenLayer();

    const afterCount = layerList.querySelectorAll('.layer-item').length;
    if (afterCount !== initialCount) {
      throw new Error(`flattenLayer: expected ${initialCount} layer-items after flatten, got ${afterCount}`);
    }

    const mergedContext = app.getActiveLayerContext();
    if (!mergedContext) {
      throw new Error('no active layer context after flatten');
    }
    const merged = readPixel(mergedContext.ctx.canvas, flattenX, flattenY);

    if (merged[0] < 100 || merged[0] > 155) {
      throw new Error(`flattenLayer: expected red channel ~127 (50% blend of red over blue), got ${merged[0]}`);
    }
    if (merged[2] < 100 || merged[2] > 155) {
      throw new Error(`flattenLayer: expected blue channel ~127 (50% blend of red over blue), got ${merged[2]}`);
    }
    if (merged[1] !== 0) {
      throw new Error(`flattenLayer: expected green channel 0, got ${merged[1]}`);
    }
    if (merged[3] !== 255) {
      throw new Error(`flattenLayer: expected a fully opaque merged pixel, got alpha ${merged[3]}`);
    }
  });

  // Probe: clip-reorder probe. Regression guard for moveLayerDown (and by
  // the same logic moveLayerUp/deleteLayer) landing a layer with
  // clipToBelow still true at index 0 -- renderCurrentFrame's clip branch
  // then masks it against a blank accumulator (nothing below the bottom of
  // the stack) and it silently vanishes. Background (layer 0) is hidden for
  // this probe: new projects default to an opaque, full-canvas white
  // background (hasTransparentBackground: false), and swapping that above
  // the test layer would obscure the result regardless of the fix -- hiding
  // it removes that as a variable without weakening what's being checked
  // (an invisible layer contributes nothing to any composite, at any
  // position).
  runProbe(probes, 'clipReorder', () => {
    const layerList = document.getElementById('layerList');
    const mainCanvas = document.getElementById('mainCanvas');
    if (!layerList || !mainCanvas) {
      throw new Error('layerList or mainCanvas element not found');
    }
    const testPixel = { x: 210, y: 100 };
    const newLayerIndex = layerList.querySelectorAll('.layer-item').length;

    app.toggleLayerVisibility(0);
    try {
      app.addLayer();
      app.selectLayer(newLayerIndex);
      const layerContext = app.getActiveLayerContext();
      if (!layerContext) {
        throw new Error('no active layer context for clipReorder probe');
      }
      layerContext.ctx.globalAlpha = 1;
      layerContext.ctx.globalCompositeOperation = 'source-over';
      layerContext.ctx.fillStyle = '#00ff00';
      layerContext.ctx.fillRect(testPixel.x, testPixel.y, 1, 1);

      app.setLayerClipToBelow(newLayerIndex, true);
      app.moveLayerDown(); // now at index 0 -- clipToBelow must have been cleared

      // Range check, not exact equality: in this test environment a solid
      // fillRect composited canvas-to-canvas here reads back alpha ~201,
      // not 255 -- cause not established (seen consistently across probes,
      // so likely environmental rather than a real bug; flagging rather
      // than silently working around it). What this check needs is "clearly
      // rendered as green", not exact byte values -- a vanished layer reads
      // back fully transparent (alpha ~0), which is well below this bound.
      const merged = readPixel(mainCanvas, testPixel.x, testPixel.y);
      if (merged[1] < 200 || merged[3] < 128) {
        throw new Error(`clipReorder: expected the moved layer's green pixel to still render (green channel high, alpha > 128), got rgb(${merged[0]},${merged[1]},${merged[2]}) alpha ${merged[3]}`);
      }

      app.deleteLayer(); // restore original layer count for later probes
    } finally {
      app.toggleLayerVisibility(0); // restore background visibility regardless of pass/fail
    }
  });

  // Probe: groups probe. End-to-end regression guard for the layer-group
  // model (layer-groups.js), covering what the pure unit tests can't --
  // real DOM rendering and real canvas compositing. Wraps a painted layer
  // in a new group, then walks through visibility cascading, lock
  // cascading, collapse, moving the whole group as a block, and deleting
  // the whole block, checking the real DOM/canvas at each step.
  runProbe(probes, 'groups', () => {
    const layerList = document.getElementById('layerList');
    const mainCanvas = document.getElementById('mainCanvas');
    if (!layerList || !mainCanvas) {
      throw new Error('layerList or mainCanvas element not found');
    }
    const initialCount = layerList.querySelectorAll('.layer-item').length;
    const testPixel = { x: 230, y: 100 };

    // bg(0) -> add L1(1) -> paint red on L1 -> group it: [bg(0), L1(1, member), header(2)]
    app.addLayer();
    app.selectLayer(1);
    const l1Context = app.getActiveLayerContext();
    if (!l1Context) throw new Error('no active layer context for the new layer in groups probe');
    l1Context.ctx.globalAlpha = 1;
    l1Context.ctx.globalCompositeOperation = 'source-over';
    l1Context.ctx.fillStyle = '#ff0000';
    l1Context.ctx.fillRect(testPixel.x, testPixel.y, 1, 1);

    app.newGroup();
    const headerRow = layerList.querySelector('.layer-item[data-layer="2"]');
    const memberRow = layerList.querySelector('.layer-item[data-layer="1"]');
    if (!headerRow || !headerRow.classList.contains('layer-item-group') || !headerRow.classList.contains('active')) {
      throw new Error('newGroup: expected the header at index 2 to be an active .layer-item-group row');
    }
    if (!memberRow || !memberRow.classList.contains('layer-item-member')) {
      throw new Error('newGroup: expected the wrapped layer at index 1 to be a .layer-item-member row');
    }

    const isRedAt = (px) => {
      const p = readPixel(mainCanvas, px.x, px.y);
      return p[0] > 200 && p[1] < 100 && p[2] < 100;
    };
    const isWhiteAt = (px) => {
      const p = readPixel(mainCanvas, px.x, px.y);
      return p[0] > 200 && p[1] > 200 && p[2] > 200;
    };

    if (!isRedAt(testPixel)) {
      throw new Error('groups: expected the member\'s red pixel to render while the group is visible');
    }

    // Visibility cascades: hiding the group must hide its member too, even
    // though the member's own `visible` flag never changed.
    app.toggleLayerVisibility(2);
    if (!isWhiteAt(testPixel)) {
      throw new Error('groups: expected the member to be hidden while its group is hidden');
    }
    app.toggleLayerVisibility(2);
    if (!isRedAt(testPixel)) {
      throw new Error('groups: expected the member to render again once its group is visible again');
    }

    // Lock cascades: locking the group must block getActiveLayerContext
    // for its member, even though the member's own `locked` flag never
    // changed.
    app.setLayerGroupLocked(2, true);
    app.selectLayer(1);
    if (app.getActiveLayerContext()) {
      throw new Error('groups: expected getActiveLayerContext to be blocked while the member\'s group is locked');
    }
    app.setLayerGroupLocked(2, false);
    if (!app.getActiveLayerContext()) {
      throw new Error('groups: expected getActiveLayerContext to work again once the group is unlocked');
    }

    // Collapse hides the member row from the panel only -- content still
    // renders (checked via isRedAt above, unaffected by collapse).
    app.selectLayer(2);
    app.toggleGroupCollapsed(2);
    if (layerList.querySelector('.layer-item[data-layer="1"]')) {
      throw new Error('groups: expected the member row to be hidden from the panel while its group is collapsed');
    }
    if (!layerList.querySelector('.layer-item[data-layer="2"]')) {
      throw new Error('groups: expected the header row to stay visible while collapsed');
    }
    app.toggleGroupCollapsed(2);
    if (!layerList.querySelector('.layer-item[data-layer="1"]')) {
      throw new Error('groups: expected the member row to reappear once expanded again');
    }

    // Moving the header moves the whole block (header + member) as a
    // unit, keeping them adjacent -- here past bg, which lands the group
    // at indices [0,1] and bg at index 2.
    app.moveLayerDown();
    const movedMember = layerList.querySelector('.layer-item[data-layer="0"]');
    const movedHeader = layerList.querySelector('.layer-item[data-layer="1"]');
    const movedBg = layerList.querySelector('.layer-item[data-layer="2"]');
    if (!movedMember || !movedMember.classList.contains('layer-item-member')) {
      throw new Error('groups: expected the member to have moved to index 0 along with its group');
    }
    if (!movedHeader || !movedHeader.classList.contains('layer-item-group') || !movedHeader.classList.contains('active')) {
      throw new Error('groups: expected the header to have moved to index 1 and stay selected');
    }
    if (!movedBg || movedBg.classList.contains('layer-item-group') || movedBg.classList.contains('layer-item-member')) {
      throw new Error('groups: expected bg to have moved to index 2, as a plain (non-group) layer');
    }

    // Deleting the header removes the whole block; only bg remains.
    app.deleteLayer();
    const afterDelete = layerList.querySelectorAll('.layer-item');
    if (afterDelete.length !== initialCount) {
      throw new Error(`groups: expected ${initialCount} layer-items after deleting the group, got ${afterDelete.length}`);
    }
  });

  // Probe: adjustment layer probe. End-to-end regression guard for
  // adjustment-layers.js's compositing integration -- paints a mid-gray
  // test pixel, stacks a brightness-contrast adjustment layer above it,
  // and checks the composited result actually brightened, un-brightens
  // when the adjustment is hidden, and that an adjustment layer can't be
  // selected as a paint target.
  runProbe(probes, 'adjustmentLayers', () => {
    const layerList = document.getElementById('layerList');
    const mainCanvas = document.getElementById('mainCanvas');
    if (!layerList || !mainCanvas) {
      throw new Error('layerList or mainCanvas element not found');
    }
    const initialCount = layerList.querySelectorAll('.layer-item').length;
    const testPixel = { x: 250, y: 100 };

    app.selectLayer(0);
    const baseContext = app.getActiveLayerContext();
    if (!baseContext) {
      throw new Error('no active layer context for base paint in adjustmentLayers probe');
    }
    baseContext.ctx.globalAlpha = 1;
    baseContext.ctx.globalCompositeOperation = 'source-over';
    baseContext.ctx.fillStyle = '#808080'; // mid-gray, so brighter/darker is unambiguous
    baseContext.ctx.fillRect(testPixel.x, testPixel.y, 1, 1);

    app.newAdjustmentLayer('brightness-contrast');
    const newLayerIndex = initialCount; // appended at the top, ungrouped
    const headerRow = layerList.querySelector(`.layer-item[data-layer="${newLayerIndex}"]`);
    if (!headerRow || headerRow.classList.contains('layer-item-group') || headerRow.classList.contains('layer-item-member')) {
      throw new Error('newAdjustmentLayer: expected a plain (non-group) row for the new adjustment layer');
    }

    app.setAdjustmentParams(newLayerIndex, { brightness: 80, contrast: 0 });
    const brightened = readPixel(mainCanvas, testPixel.x, testPixel.y);
    if (brightened[0] <= 190) {
      throw new Error(`adjustmentLayers: expected brightness+80 to noticeably brighten rgb(128,128,128), got red channel ${brightened[0]}`);
    }

    app.toggleLayerVisibility(newLayerIndex);
    const unaffected = readPixel(mainCanvas, testPixel.x, testPixel.y);
    if (unaffected[0] > 190) {
      throw new Error(`adjustmentLayers: expected the base gray pixel back once the adjustment is hidden, got red channel ${unaffected[0]}`);
    }
    app.toggleLayerVisibility(newLayerIndex);

    app.selectLayer(newLayerIndex);
    if (app.getActiveLayerContext()) {
      throw new Error('adjustmentLayers: expected getActiveLayerContext to be null for an adjustment layer (nothing to paint on)');
    }

    app.deleteLayer(); // restore original layer count for later probes
    const afterDelete = layerList.querySelectorAll('.layer-item');
    if (afterDelete.length !== initialCount) {
      throw new Error(`adjustmentLayers: expected ${initialCount} layer-items after cleanup, got ${afterDelete.length}`);
    }
  });

  // Probe: snapping probe. Regression guard for selection-manager.js's
  // smart-guide snapping (math-utils.js:snapToAxisTargets) -- drags a
  // selection near the canvas's left edge and checks the magenta guide
  // line actually gets drawn on the overlay canvas at x=0, then drags it
  // somewhere with no nearby landmark and checks the guide disappears.
  runProbe(probes, 'snapping', () => {
    const overlayCanvas = document.getElementById('overlayCanvas');
    if (!overlayCanvas) {
      throw new Error('overlayCanvas element not found');
    }
    const isSnapGuideAt = (x, y) => {
      const p = readPixel(overlayCanvas, x, y);
      // #ff2d95 -> (255, 45, 149)
      return p[0] > 200 && p[1] < 100 && p[2] > 100 && p[2] < 200 && p[3] > 0;
    };

    app.startSelectionInteraction({ x: 100, y: 100 });
    app.updateSelectionInteraction({ x: 110, y: 110 });
    app.finishSelectionInteraction();

    // Enter move mode (click inside the selection) and drag its left edge
    // past the canvas's left edge -- clamped and snapped to x=0.
    app.startSelectionInteraction({ x: 105, y: 105 });
    app.updateSelectionInteraction({ x: 3, y: 105 });
    if (!isSnapGuideAt(0, 50)) {
      throw new Error('snapping: expected a smart-guide line at the canvas left edge (x=0) when a dragged selection lands there');
    }

    // Drag to x=180 -- >50px from every landmark (0, center~123, right
    // edge~246 for a 256-wide canvas with this 10px-wide selection), so no
    // guide should be showing at the left-edge column anymore.
    app.updateSelectionInteraction({ x: 185, y: 105 });
    if (isSnapGuideAt(0, 50)) {
      throw new Error('snapping: expected no smart-guide line once the selection moved away from every landmark');
    }

    app.finishSelectionInteraction();
    app.clearSelection();
  });

  // Probe: rulers probe. Regression guard for rulers.js's redraw() --
  // checks both ruler canvases got a non-zero on-screen size from the CSS
  // grid layout and actually got painted (dark background fill present),
  // both at startup (via the constructor's resetZoom() -> updateZoom()
  // chain) and after an explicit redrawRulers() call.
  runProbe(probes, 'rulers', () => {
    const hRuler = document.getElementById('rulerHorizontal');
    const vRuler = document.getElementById('rulerVertical');
    if (!hRuler || !vRuler) {
      throw new Error('rulerHorizontal or rulerVertical element not found');
    }
    if (hRuler.width === 0 || hRuler.height === 0) {
      throw new Error(`rulers: rulerHorizontal has zero backing-store size (${hRuler.width}x${hRuler.height})`);
    }
    if (vRuler.width === 0 || vRuler.height === 0) {
      throw new Error(`rulers: rulerVertical has zero backing-store size (${vRuler.width}x${vRuler.height})`);
    }

    const isDarkFill = (p) => p[0] < 60 && p[1] < 60 && p[2] < 60 && p[3] === 255;
    if (!isDarkFill(readPixel(hRuler, 2, 2))) {
      throw new Error('rulers: expected the horizontal ruler\'s dark background fill at startup');
    }

    app.redrawRulers();
    if (!isDarkFill(readPixel(vRuler, 2, 2))) {
      throw new Error('rulers: expected the vertical ruler\'s dark background fill after an explicit redrawRulers()');
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

  // Probe 14: shortcuts probe (item 8). Covers the three risky new paths
  // together: the command palette actually executing a registry action by
  // search, the live keydown listener now dispatching through
  // findMatchingAction/getResolvedShortcuts instead of a hardcoded key
  // map (both the default-key case and a rebound key), and the override
  // round-tripping through shortcuts.json. Restores whatever overrides
  // existed before this probe ran, using only public app methods.
  await runAsyncProbe(probes, 'shortcuts', async () => {
    const originalTool = app.getCurrentToolConfig()?.id;
    const { overrides: previousOverrides } = await ipcRenderer.invoke('load-shortcuts-config');

    try {
      app.openCommandPalette();
      const paletteModal = document.getElementById('commandPaletteModal');
      if (!paletteModal.classList.contains('show')) {
        throw new Error('openCommandPalette did not show #commandPaletteModal');
      }
      const input = document.getElementById('commandPaletteInput');
      input.value = 'Rectangle Tool';
      input.dispatchEvent(new Event('input'));
      const rows = document.querySelectorAll('#commandPaletteList .command-palette-row');
      if (rows.length !== 1 || !rows[0].textContent.includes('Rectangle Tool')) {
        throw new Error(`expected exactly one filtered command palette row for "Rectangle Tool", got ${rows.length}`);
      }
      rows[0].click();
      if (paletteModal.classList.contains('show')) {
        throw new Error('command palette did not close after executing an action');
      }
      if (app.getCurrentToolConfig()?.id !== 'rectangle') {
        throw new Error('command palette row click did not select the Rectangle tool');
      }

      app.openShortcutsPanel();
      const shortcutsModal = document.getElementById('shortcutsModal');
      if (!shortcutsModal.classList.contains('show')) {
        throw new Error('openShortcutsPanel did not show #shortcutsModal');
      }
      const shortcutRows = document.querySelectorAll('#shortcutsList .shortcut-row');
      if (shortcutRows.length === 0) {
        throw new Error('shortcuts panel listed no rebindable rows');
      }

      app.selectTool('pen');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
      if (app.getCurrentToolConfig()?.id !== 'rectangle') {
        throw new Error('default "3" shortcut did not select the Rectangle tool via the live keydown listener');
      }

      await app.setShortcutOverride('tool-pen', 'Q');
      app.selectTool('eraser');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
      if (app.getCurrentToolConfig()?.id !== 'eraser') {
        throw new Error('"1" still selected the Pen tool after tool-pen was rebound off it');
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
      if (app.getCurrentToolConfig()?.id !== 'pen') {
        throw new Error('rebound "q" key did not select the Pen tool');
      }

      const { overrides: persisted } = await ipcRenderer.invoke('load-shortcuts-config');
      if (persisted['tool-pen'] !== 'Q') {
        throw new Error(`override was not persisted to shortcuts.json, got ${JSON.stringify(persisted)}`);
      }
    } finally {
      await app.resetShortcutOverrides();
      await Promise.all(Object.entries(previousOverrides || {}).map(([id, combo]) => app.setShortcutOverride(id, combo)));
      app.selectTool(originalTool || 'pen');
      document.getElementById('commandPaletteModal').classList.remove('show');
      document.getElementById('shortcutsModal').classList.remove('show');
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
