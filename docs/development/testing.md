# Testing Guide

WASRTK has two layers of automated checks plus a manual QA checklist for
interaction behavior automated tests don't reach. Run all of them before
opening a PR that touches renderer or main-process behavior.

## `npm test` — unit tests

```bash
npm test
```

Runs `node --test tests/unit/*.test.js` — Node's built-in `node:test`
runner, no extra dependencies. Covers the DOM/Electron-free pure-function
modules:

- `tests/unit/project-io.test.js` — `src/renderer/project-io.js`:
  `parseProjectJson` (including BOM stripping and invalid-JSON handling),
  `validateProjectData`, the `buildProjectData`/`serializeProjectData`
  round trip, `clampNumber`, `normalizeProjectSettings`.
- `tests/unit/exporters.test.js` — `src/renderer/exporters.js`:
  `getMimeType`, `getFrameDelayMs`, `drawVisibleLayersToContext` (against a
  fake canvas context that records `drawImage` calls), `saveAsGif`
  (against fake `GIF`/`createCanvas`/`invoke`).
- `tests/unit/color-utils.test.js` — `src/renderer/color-utils.js`:
  `normalizeHexColor`, `dedupeColors`, `hexToRgb`, `rgbToHex`.
- `tests/unit/brush-engine.test.js` — `src/renderer/brush-engine.js`:
  Bresenham/pixel-perfect line point lists, stroke-point interpolation and
  spacing math, `seededRandom` determinism, and stamp geometry against a
  fake canvas context (`fillRect`/`arc`/gradient calls recorded, not
  actually rendered).
- `tests/unit/json-config-store.test.js` — `src/main/json-config-store.js`:
  fresh-load defaults, save/load round trip, and corrupt-JSON recovery
  against a real temp directory (`getDir` is injected, so this runs
  without Electron).
- `tests/unit/selection-geometry.test.js` — `src/renderer/selection-geometry.js`:
  `normalizeSelectionBounds`/`getSelectionSourceBounds` math,
  `createSelectionState` defaults/overrides, `applyFeatherToImageData`
  against a minimal `ImageData` polyfill (Node has no DOM `ImageData`
  global), and `drawSelectionOutline`/`drawSelectionMaskContour`/
  `drawLassoPreview` against a fake canvas context (same style as
  `brush-engine.test.js`).

None of these need a display — they're plain Node processes.

## `npm run smoke` — Electron smoke harness

```bash
npm run smoke
# headless (no display), e.g. CI or a bare Linux box:
xvfb-run -a npm run smoke
```

Launches the real app (`electron . --smoke --no-sandbox`) and runs a
renderer-side self-check after `new WASRTK()` completes
(`tests/smoke/renderer-smoke.js`'s `runSmokeChecks`, wired up from
`src/renderer/index.js` when `--smoke` is present; `main.js` forwards the
flag to the renderer process via an env var since Chromium subprocess args
don't propagate automatically). Every probe drives WASRTK's existing
public method surface — the same duck-typed `app` interface tool and
reference modules rely on — never module-internal state directly. The
report is sent back to the main process over the `smoke:result` IPC
channel (registered only for this run), printed as JSON, and used to set
the process exit code; a 30-second failsafe timer exits non-zero if the
renderer never reports back (e.g. it crashed before the self-check ran),
and any error-level `console-message` from the renderer also fails the run.

Probes, in order:

1. **constructor** — `new WASRTK()` completed and `window.onerror` caught
   nothing.
2. **tools** — the tool registry has exactly the 8 expected ids (`pen`,
   `eraser`, `line`, `rectangle`, `circle`, `fill`, `eyedropper`,
   `selection`).
3. **draw** — `app.drawPoint(...)` changes a `mainCanvas` pixel.
4. **history** — `saveState` -> draw -> `undo` restores the pixel ->
   `redo` reapplies it.
5. **selection** — create a rectangular selection via the public
   interaction FSM (`startSelectionInteraction`/`updateSelectionInteraction`/
   `finishSelectionInteraction`) and `clearSelection()` without throwing.
6. **paste** — regression guard for the Phase 1.8 fix: paste must not
   touch the layer before commit, dragging a pasted selection and
   canceling must restore the true original background (not the pasted
   pixels), and paste + commit must still land the clipboard content.
7. **mime** — `getMimeType('.png')` returns `'image/png'`.
8. **fps** — regression guard for the Phase 1.2 fix: dispatching an
   `input` event on the FPS slider updates the state `saveProject`
   persists, not just the on-screen label.
9. **frames** — `addFrame`/`duplicateFrame`/`deleteFrame`/`moveFrameLeft`/
   `moveFrameRight`, read back through `#timeline`'s rendered frame-items
   and `mainCanvas` pixels (a large brush keeps the sampled pixel away
   from antialiased stamp edges, since duplication re-copies the layer
   canvas through a `drawImage()` that is sensitive to canvas smoothing
   quality at edges). Added as a safety net before extracting frame
   management out of `wasrtk.js`.
10. **layers** — `addLayer`/`deleteLayer`/`moveLayerUp`/`moveLayerDown`/
    `toggleLayerVisibility`, read back through `#layerList`'s rendered
    layer-items. Added as a safety net before extracting layer management
    out of `wasrtk.js`.
11. **zoom** — `zoomIn`/`zoomOut`/`resetZoom`, read back through
    `#zoomInput`'s value. Added as a safety net before extracting the zoom
    controller out of `wasrtk.js`.
12. **fill** — `floodFill(ctx, x, y, color)` against the active layer's own
    canvas. Added as a safety net before extracting the drawing/shape core
    into `canvas-engine.js`.
13. **shape** — `commitShape(start, end, 'rectangle')` with a thick brush,
    checked against a generously sized sample region rather than an exact
    pixel (the brush-width-aware inset math in `buildShapePath` isn't worth
    reproducing in the test). Added alongside the fill probe.

The smoke harness needs a display (it launches a real `BrowserWindow`).
In headless environments (most CI runners, SSH sessions without X)
prefix it with `xvfb-run -a`, or ensure an X server / `DISPLAY` is
otherwise available.

## Manual QA checklist

`docs/qa/manual-interaction-checklist.md` covers interaction behavior the
automated layers above don't reach in full: brush preset/pressure
combinations, fill and magic-wand edge cases, the full selection
copy/cut/paste/move/transform/commit/cancel matrix, and project
persistence round trips.

Run it:

- After any change to renderer interaction code (drawing, selection,
  fill, transforms, project save/load) — the checklist header says as
  much, and it's the right trigger to use.
- Before a release, or after a significant refactor of `wasrtk.js`,
  `selection-manager.js`, `history.js`, or `brush-engine.js`.
- Targeted sections only for smaller, contained changes (e.g. only the
  "Fill and Magic Wand" section for a flood-fill change) — a full pass
  isn't required for every PR.

The checklist itself always stays in its unchecked `[ ]` template form in
version control — do not commit it with boxes checked. Instead, when you
complete a run, write the results to a new dated file in
`docs/qa/runs/YYYY-MM-DD.md`: copy the checklist's sections, mark each item
`[x]` (pass), `[!]` (failed, with an inline note on what broke), or leave
`[ ]`/note `not exercised` for anything skipped, and record the build or
commit tested. `docs/qa/runs/2026-08-07.md` is a worked example, including
how to write up a failed item and cross-reference the commit that fixed it.

## Quick reference

| Command | Covers | Needs a display? |
| --- | --- | --- |
| `npm test` | project-io, exporters, color-utils, brush-engine, json-config-store | No |
| `npm run smoke` (or `xvfb-run -a npm run smoke`) | app boot, 8 tools, draw/undo/redo/selection/paste/fps probes | Yes |
| Manual checklist (`docs/qa/manual-interaction-checklist.md`) | full interaction surface | Yes |
