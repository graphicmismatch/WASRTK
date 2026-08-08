# Component Architecture

This page is the canonical file inventory for WASRTK. Other docs (README,
`docs/development/setup.md`) link here rather than duplicating the list.

## Top-level components

### `main.js`

Application bootstrap. It creates the window controller, registers
screen-capture/file/theme/palette IPC handlers, and installs the app menu
when Electron is ready. Also wires up the `--smoke` self-test harness
(see `docs/development/testing.md`).

### `src/main/window.js`

Owns three windows and their shared helpers:

- Main editor window creation
- Theme settings window and palette editor window creation, through a
  single shared `createChildWindow(...)` helper (focus-if-open, else
  create/load/show)
- File dialog helpers that send chosen paths back to the renderer
- Broadcast helpers: `sendThemeUpdate` (`theme-config-updated` to the main
  and theme windows) and `sendPaletteUpdate` (`palette-config-updated` to
  the main and palette editor windows)
- `sendToRenderer`, which guards on `isDestroyed()` before sending to the
  main window

### `src/main/menu.js`

Defines menu sections for:

- File
- Edit
- View (includes Theme Settings and Palette Editor)
- Animation
- Layers
- Reference
- Tools (one item per tool id, built from a small tool-list table)

Most actions send IPC-driven commands into the renderer rather than mutating state directly in the main process.

### `src/main/ipc.js`

Registers `ipcMain.handle(...)` endpoints for:

- Screen source enumeration
- Text file reads, binary file reads, file saves
- Theme config load/save/reset/path lookup
- Palette config load/save/path lookup, plus opening the palette editor window

Built on three shared helpers: `handleWithEnvelope` (try/catch ->
`{ success, error }` envelope), `registerConfigChannels` (the theme/palette
4-channel block), and a small `getScreenSources` wrapper for the two
screen-capture handlers. See `docs/api/ipc-communication.md` for the full
channel list.

### `src/main/json-config-store.js`

Generic JSON-file config persistence factory:
`createJsonConfigStore({ getDir, fileName, defaults, sanitize })`. Handles
directory creation, corrupt-JSON recovery, and sanitize-on-load/save.
`getDir` is injected so the store is unit-testable without Electron.

### `src/main/theme-config.js` / `src/main/palette-config.js`

Thin wrappers around `json-config-store` that add their own sanitize
functions and keep their original exported names (so `ipc.js` did not need
to change on extraction). Theme config is `theme.json`; palette config is
`palettes.json`. Both live in `app.getPath('userData')`.

### `src/main/constants.js`

Shared main-process constants: `THUMBNAIL_SIZE`, `FILE_FILTERS` (dialog
filters for images/projects/animation exports), `getWindowOptions(baseDir)`
(window size/webPreferences/icon resolution), and `isDev` (computed once
from `process.argv`, independent of the `--smoke` flag).

### `src/renderer/wasrtk.js`

The main editor controller. It owns:

- Canvas setup and global editor state (module-level state, not a class
  field object)
- IPC listeners (`setupIPCListeners`); DOM event wiring
  (`setupEventListeners`) is a one-line call into `event-bindings.js`
- Project save/load (via `project-io.js`)
- Thin delegator methods for the extracted subsystems below, so every
  method tools/reference code call by name (the duck-typed `app`
  interface) still exists on the class

Undo/redo, selection, brush rasterization, canvas zoom, the status bar,
the palette selector UI, frame/playback management, layer management,
DOM event wiring, the core drawing/shape engine, and color/brush
settings (with their cursor-preview UI) have been extracted into their
own modules (below); `wasrtk.js` builds a small closure-accessor `env`
object for each in its constructor (`app` itself, for `canvas-engine.js`,
`event-bindings.js`, and `brush-settings.js`, since tools and DOM
handlers need to call arbitrary methods on the live instance) and keeps
one-line delegator
methods for their public surface.

### `src/renderer/history.js`

`createHistory(env)` — undo/redo stacks and the operations built on them:
`saveState`, `discardLastUndoState`, `saveStructureState`, `undo`, `redo`,
`updateUndoRedoButtons`, `cloneFrames`. The stacks live in this module's
closure; `wasrtk.js` reaches them only through the returned methods.

### `src/renderer/selection-manager.js`

`createSelectionManager(env)` — the selection interaction subsystem:
lasso/polygon/magic-wand/rectangle selection creation, the drag/move
interaction state machine, detach + commit/cancel of floating
selections, and clipboard copy/cut/paste. Selection state itself
(`activeSelection`, `selectionInteraction`, `selectionClipboard`) still
lives in the `wasrtk.js` module globals, reached through `env`
getter/setter pairs.

`drawSelectionOutline`, `drawLassoPreview`, and `getSelectionSourceBounds`
are thin wrappers here -- their real implementations moved to
`selection-geometry.js` below, which takes the overlay context / canvas
dimensions explicitly instead of closing over `env`. `applyTransformAction`
is likewise a thin wrapper into `selection-transforms.js`. The wrappers
exist so every other call site in this file (and every external caller:
the `wasrtk.js` delegators, `event-bindings.js`'s keyboard shortcuts)
keeps calling the same signatures as before.

### `src/renderer/selection-geometry.js`

Pure selection geometry/rendering helpers split out of
`selection-manager.js`: `createSelectionState` (the
`activeSelection`/`selectionClipboard` record factory),
`normalizeSelectionBounds`, `drawSelectionMaskContour`,
`drawSelectionOutline`, `drawLassoPreview`, `applyFeatherToImageData`,
`getSelectionSourceBounds`, and `imageDataToCanvas`. Every function takes
its canvas context and/or dimensions as explicit arguments -- the same
"ctx-in, no DOM globals" shape as `brush-engine.js` -- which is what
makes most of them unit-testable with a fake canvas-context object
(`tests/unit/selection-geometry.test.js`; `imageDataToCanvas` is the one
exception, since it calls `document.createElement('canvas')` directly).
`drawSelectionOutline`/`drawLassoPreview` clear their own canvas via
`ctx.clearRect(...)` instead of calling back into `wasrtk.js`'s
`clearOverlay()` -- the two are exactly equivalent, so taking `ctx`
explicitly removes that callback dependency entirely.

### `src/renderer/selection-transforms.js`

`createSelectionTransforms(env)` — pixel transforms (flip/rotate/scale/
skew) for the active selection or the whole current layer:
`applyTransformAction`, `buildTransformedImageData`,
`transformPointForBounds`, `transformActiveSelection`,
`transformCurrentLayer`. Only `applyTransformAction` is exposed outside
this module (the other four are called only from within it); `env` here
is not the raw `wasrtk.js` env `selection-manager.js` itself receives --
it's a small object `selection-manager.js` builds, re-declaring
`activeSelection` as a live getter/setter (object-spreading `env` would
evaluate the getter once and freeze a stale value) plus three functions
still defined in `selection-manager.js`'s own closure
(`detachSelectionFromLayer`, `clampSelectionPosition`,
`drawSelectionOutline`) that these transforms call into.

### `src/renderer/brush-engine.js`

Pure brush rasterizers with no `app`/`env` dependency: stroke-point
interpolation, pixel-perfect line/Bresenham helpers, seeded randomness for
the textured preset, and `drawBrushStamp`/`drawBrushLine`, which take a
canvas context plus an explicit options object (`{ color, size, flow,
preset, shape, spacing, antialias, strokeSeed }`, assembled by
`WASRTK.getBrushRenderOptions()`) instead of reading globals directly.

### `src/renderer/zoom.js`

`createZoomController(env)` — the canvas zoom controller: `zoomIn`,
`zoomOut`, `zoomAtPoint` (cursor-anchored wheel/shortcut zoom, scrolling
the canvas wrapper to keep the point under the cursor fixed), `resetZoom`,
and `updateZoom` (applies the zoom to `#canvas-scaler`'s size and syncs the
`#zoomInput`/`#zoomSlider` controls). The `zoom` level itself stays in the
`wasrtk.js` module globals, reached through `env.getZoom`/`env.setZoom`.

### `src/renderer/status-bar.js`

`createStatusBar(env)` — `updateStatusBar`, the read-only status bar sync
(current tool/color/brush/frame/layer text, antialiasing and reference
image status). Every `env` entry is a getter; the function never mutates
state.

### `src/renderer/palette-ui.js`

`createPaletteUI(env)` — the palette selector UI: `initializePaletteUI`,
`refreshPaletteSelect`, `renderPalettePresets`, `mergeCustomPalettes`
(reconciles saved custom palettes with the builtin `COLOR_PALETTES` set),
and `loadCustomPalettesFromConfig` (loads them over IPC at startup and via
the `palette-config-updated` broadcast). `COLOR_PALETTES` and
`BUILTIN_PALETTE_IDS` stay `wasrtk.js` module-level objects, mutated in
place through `env`; `selectedPalette` is reached through
`env.getSelectedPalette`/`setSelectedPalette` (the palette `<select>`'s
own change handler still writes it directly in `wasrtk.js`).

### `src/renderer/frame-manager.js`

`createFrameManager(env)` — frame CRUD (`addFrame`, `duplicateFrame`,
`deleteFrame`, `reindexFrames`, `moveFrame`/`moveFrameLeft`/
`moveFrameRight`, including the timeline's drag-and-drop reorder),
`selectFrame`, playback (`toggleAnimation`, `animate`), rendering
(`renderCurrentFrame`, `drawOnionSkinning`, `drawFrameAsOnionSkin`), and
`updateTimeline` (the timeline's DOM, including per-frame drag handlers
and thumbnail previews). `frames`/`currentFrame` stay `wasrtk.js` module
globals, reached through `env.getFrames`/`getCurrentFrame`/
`setCurrentFrame`; `getFrames` is a getter (not a captured reference)
because `history.js`'s undo/redo reassigns the `frames` array wholesale,
and a captured reference would go stale across that.

### `src/renderer/layer-manager.js`

`createLayerManager(env)` — layer CRUD (`addLayer`, `deleteLayer`,
`moveLayerUp`/`moveLayerDown`, `flattenLayer`), `selectLayer`,
`toggleLayerVisibility`, and `updateLayerList` (the layer list's DOM,
including the visibility-toggle and select click handlers).
`layers`/`currentLayer` stay `wasrtk.js` module globals, reached through
`env.getLayers`/`getCurrentLayer`/`setCurrentLayer` (getters, not
captured references, for the same undo/redo staleness reason as
`frame-manager.js`).

### `src/renderer/event-bindings.js`

`bindAppEvents(app, env)` — every DOM event listener the main editor
window wires up, split into one registrar per concern (tool/color,
brush/fill/selection settings, canvas pointer events including
Ctrl+click reference dragging, timeline/playback, zoom, layer buttons,
onion skinning, reference buttons, modals, undo/redo, middle-mouse
panning, keyboard shortcuts). Requires `electron`, `./reference`, and
`./project-io` directly rather than threading `ipcRenderer`/
`clampNumber` through `env` -- those are stable, already-shared
utilities, not state this module owns.

Almost every call goes through an existing public `WASRTK` method
(`app.<method>()`), same as any other consumer of the duck-typed `app`
interface. `env` exists only for the handful of settings that are still
raw `wasrtk.js` module globals with no owning module yet (fill/selection
tool settings, pressure/antialiasing toggles, canvas drag/pan/zoom
interaction state, `activeSelection`/`selectionInteraction`) -- each is
an independent getter/setter closure built fresh in
`setupEventListeners()`, over the same module globals other `env`
objects (history's, selection's, frame-manager's, ...) already close
over elsewhere in the constructor.

### `src/renderer/canvas-engine.js`

`createCanvasEngine(app, env)` — the core raster drawing/shape path:
the pointer draw lifecycle (`startDrawing`/`draw`/`stopDrawing`),
`withDrawContext`/`drawPoint`/`drawLine` (point/line rasterization entry
points, resolving the stroke-preview or active-layer context and
dispatching into the current tool's `drawPoint`/`drawLine`/`onStart`/
`onDraw`/`onStop`), `floodFill`, `getMergedVisibleLayersImageData`, and
the shape (line/rectangle/circle) preview+commit path
(`getConstrainedShapeEndPoint`, `buildShapePath`, `drawShapePreview`,
`commitShape`).

Tools are called as `tool.drawPoint(app, {...})` etc. (the duck-typed
`app` interface), so this factory takes the live `WASRTK` instance
directly instead of a pure accessor object -- `app` covers every
cross-module call (`saveState`, `renderCurrentFrame`, `showStrokePreview`,
`getActiveLayerContext`, `applyImageSmoothing`, `roundToPixel`,
`screenToCanvas`, `getEventPressure`, the brush-engine delegators, and
`app.startShape`, a plain instance property rather than a module
global); `env` covers the raw `wasrtk.js` module globals with no owning
module yet (`isDrawing`, stroke seed/pressure, `lastMousePos`,
`currentTool`/`currentColor`/`brushSize`/`currentOpacity`/
`antialiasingEnabled`, fill settings, `frames`/`currentFrame`).
`env.getStrokeCtx` is a getter, not a captured reference --
`createStrokeLayer`/`commitStrokeLayer`/`clearStrokeLayer` (still
directly on `WASRTK`) reassign `strokeCtx`/`strokeCanvas` outright.

### `src/renderer/brush-settings.js`

`createBrushSettings(app, env)` — color/brush setters
(`setColor`/`setBrushSize`/`setBrushShape`/`setBrushPreset`/
`setBrushFlow`/`setBrushSpacing`/`setOpacity`) together with the two
cursor-lens overlays they keep in sync: the canvas brush-size preview
(`updateBrushSizePreview`/`hideBrushSizePreview`,
`refreshBrushPreviewFromCursor`) and the eyedropper zoom-pick lens
(`updateEyedropperZoomPreview`/`hideEyedropperZoomPreview`,
`getColorAtCanvasPosition`/`pickColorAt`); pressure-adjusted size/flow
helpers (`getEventPressure`/`getPressureAdjustedBrushSize`/
`getPressureAdjustedFlow`); the brush swatch preview canvas
(`updateBrushPreview`); and the in-progress stroke overlay
(`showStrokePreview`). Kept together rather than split into separate
settings vs. UI modules because the setters call straight into the UI
refreshers they affect (`setBrushSize` -> `updateBrushPreview`/
`refreshBrushPreviewFromCursor`).

Takes the live `WASRTK` instance directly, same as `canvas-engine.js`
and `event-bindings.js`. `env.getStrokeCanvas` is a getter, not a
captured reference, for the same reason `canvas-engine.js`'s
`getStrokeCtx` is: `createStrokeLayer`/`commitStrokeLayer`/
`clearStrokeLayer` (still directly on `WASRTK`) reassign
`strokeCanvas`/`strokeCtx` outright.

### `src/renderer/color-utils.js`

Shared hex/RGB helpers used by the main window, palette editor, and theme
window: `normalizeHexColor`, `dedupeColors`, `hexToRgb`, `rgbToHex`.

### `src/renderer/math-utils.js`

`clampNumber(value, fallback, min, max)` -- generic numeric clamp helper
(coerces to a number, returns `fallback` if non-finite, else clamps to
`[min, max]`). Used by brush-settings.js, selection-manager.js,
canvas-engine.js, event-bindings.js, project-io.js, wasrtk.js, and (via
`env.clampNumber`) zoom.js.

### `src/renderer/constants.js`

Renderer-wide constants that would otherwise be re-declared in multiple
modules: `BRUSH_PRESETS`, `SELECTION_MODES` (both validated against in
project-io.js and enforced/read in brush-settings.js/event-bindings.js),
and `ZOOM_MIN`/`ZOOM_MAX` (the 10%-2000% zoom range, read by zoom.js and
event-bindings.js).

### `src/renderer/flood-fill.js`

`floodRegion(pixels, width, height, startX, startY, tolerance)` -- the
stack-based 4-neighbor flood traversal shared by the fill tool
(canvas-engine.js's `floodFill`, contiguous branch) and the magic-wand
selection tool (selection-manager.js's `createMagicWandSelection`), which
used to each hand-roll an identical visited-set/colorDistance/stack loop.
Pixels-in, `{x, y, pos}` list out -- no canvas or `env` dependency, same
convention as brush-engine.js and selection-geometry.js.

### `src/renderer/tools/`

Each tool module exports an object with at least an `id`. `load-tools.js`
scans the directory at runtime (`readdirSync`, skipping `index.js`,
`load-tools.js`, and anything not ending in `.js` — which also skips the
`lib/` subdirectory since it isn't a `.js` file itself) and builds the tool
registry keyed by `id`.

Current tool modules (8 tools, matching the smoke-test probe list):

- `pen.js`, `eraser.js` — thin wrappers over `createStrokeTool` (below)
- `line.js`, `rectangle.js`, `circle.js` — thin wrappers over
  `createShapeTool` (below)
- `fill.js` — flood fill
- `eyedropper.js` — color picking
- `selection.js` — delegates to the selection interaction FSM in
  `selection-manager.js`

`src/renderer/tools/lib/` holds shared tool factories, not tools
themselves (`load-tools.js` never sees this directory, by design — see
`load-tools.js`'s filter above):

- `shape-tool.js` — `createShapeTool({ id, keepSquare })`, the shared body
  for rectangle/circle/line (clear-overlay-on-start, live preview on move,
  commit on release; `keepSquare` gates the Shift-to-constrain behavior,
  which line does not support)
- `stroke-tool.js` — `createStrokeTool({ id, getColor, commitOptions,
  supportsStraightLine })`, the shared body for pen/eraser (draw into a
  temporary stroke layer, commit on release; differs in stroke color and
  composite mode, and only pen supports the Shift-anchor straight-line
  assist)

### `src/renderer/project-io.js`

Pure-ish helpers for:

- Parsing JSON project data (including BOM stripping)
- Validating required fields
- Building and serializing project objects
- Rebuilding frame/layer canvases from saved data
- Normalizing per-project settings (`normalizeProjectSettings`) and
  clamping numeric fields (`clampNumber`)

### `src/renderer/exporters.js`

Contains:

- MIME type lookup for reference file loading (`getMimeType`)
- Frame delay computation for GIF export (`getFrameDelayMs`)
- Visible-layer compositing (`drawVisibleLayersToContext`)
- PNG sequence export
- GIF export through vendored `gif.js`/`gif.worker.js`
  (`vendor/gif/`, packaged explicitly since asar cannot reliably run
  workers from inside the archive)

### `src/renderer/reference/`

Split into:

- `settings.js`: UI controls, preview interaction, reset/clear/toggle
  logic, and `hasReferenceSource(app, api)` (true if either a loaded
  image or an active screen-capture interval exists)
- `modes/image.js`: file-based reference loading, including
  `setLoadedReferenceImage(app, api, img, dataUrl)` -- resets position/
  scale to defaults and unconditionally forces the reference visible,
  unlike `loadReferenceFromBlob`/`updateReferenceImageOnly` in the same
  file, which preserve or conditionally touch visibility for their own
  callers (screen-share ticks, dropping a new file over an existing one)
- `modes/screen-capture.js`: desktop/window capture workflow
- `index.js`: re-exports the combined public surface of the three above

Every exported function here follows the `(app, api)` convention: `app`
is the `WASRTK` instance (for cross-module calls like
`renderCurrentFrame`/`updateStatusBar`, and for `app.screenCaptureInterval`,
which lives directly on the instance rather than in `_referenceApi`);
`api` is `app.getReferenceApi()`, the closure-accessor object built once
in the constructor over the reference-related module globals
(`referenceImage`, `referenceVisible`, `referenceX`/`Y`, `referenceScale`,
`userModifiedReference`). `wasrtk.js` keeps one-line delegators
(`loadReferenceImage`, `hasReferenceSource`, `setLoadedReferenceImage`,
`toggleReference`, `startScreenShare`/`stopScreenShare`,
`updateReferenceImageOnly`, `loadReferenceFromBlob`,
`resetReferencePosition`, `clearReferenceImage`, `updateReferencePreview`)
for the reference module's entire public surface.

### Theme components

- `src/main/theme-config.js` persists and sanitizes theme JSON
- `src/renderer/theme.js` applies CSS custom properties and exposes
  `initializeThemeSync(...)`, used by all three renderer windows (main,
  theme, palette editor) to load the current theme and subscribe to live
  updates
- `src/renderer/theme-window.js` builds and manages the theme editor UI

### Palette editor components

- `src/main/palette-config.js` persists and sanitizes palette JSON
- `src/renderer/palette-window.js` builds and manages the palette editor
  UI: draft palette editing, file/image import, saved-palette management
- See `docs/features/palette-editor.md` for the full workflow and IPC
  channels

## Data ownership

- Main process owns OS integration and filesystem entry points.
- Renderer owns document state and raster data.
- Theme and palette config are shared across windows through IPC updates.
