# Phase 1 Interaction Bug Audit

Date: 2026-05-12

This audit reviews the Phase 1 drawing, fill, selection, transform, and persistence work for interaction bugs and subpar behavior. It is a static/manual code review checklist, not a substitute for full manual QA in the Electron UI.

## Summary

Phase 1 roadmap items are implemented, but several interactions still need follow-up hardening. The most important remaining risks are selection-mask data loss, pressure input not using pointer events, non-antialiased stroke instability, transform commit/undo corruption, and mismatches between UI claims and actual behavior.

## Fixed in latest pass

| ID | Area | Status | Finding | Impact | Relevant code |
| --- | --- | --- | --- | --- | --- |
| FILL-001 | Paint bucket / transparent canvas | Fixed | Flood fill used RGB-only comparisons and always wrote alpha as `255`, so transparent pixels with black RGB data could be treated as already-filled black and opacity was ignored. Fill matching now includes alpha and writes alpha from current opacity. | Paint bucket now works on transparent backgrounds and respects fill opacity. | `src/renderer/wasrtk.js` `floodFill` |

## Open bugs and subpar behaviors found

### Critical / data-loss risks

| ID | Area | Status | Finding | Repro / trigger | Impact | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- |
| SEL-001 | Advanced selections | Open | Lasso, polygon, and magic-wand selections store a masked `ImageData`, but detach/cut/commit paths clear the entire rectangular bounds with `clearRect`. Pixels inside the bounding box but outside the actual selected shape can be erased. | Create lasso around a donut/concave shape, move or cut it, then commit. | Data loss outside selected shape. | Store a selection mask and use it for clear/restore/commit instead of rectangular clears. |
| SEL-002 | Tool switching | Open | Switching away from the Selection tool discards `activeSelection` directly instead of calling `clearSelection()`. If the selection is detached, the source area can remain cleared and the selected pixels are lost. | Select a region, drag it so it detaches, then click Pen/Fill/Eraser before pressing Enter/Escape. | Data loss. | In `selectTool`, call `clearSelection({ commitDetached: false })` or prompt/auto-commit before switching tools. |
| SEL-003 | Selection transforms | Open | Transforming a detached selection changes `activeSelection.width/height/originalX/originalY` while `sourceSnapshot` still represents the old rectangular source. Commit then restores and clears using mismatched geometry. | Select a region, rotate/scale/skew it, then press Enter. | Incorrect restore/clear area; possible erased or duplicated pixels. | Preserve immutable source bounds separately from transformed selection bounds. |
| SEL-004 | Selection undo | Open | `commitDetachedSelection()` mutates the layer by restoring `sourceSnapshot` before `saveState()`, so undo may capture the wrong pre-commit state. | Move/transform a detached selection, commit, undo. | Undo may not return to the original layer state. | Save state before any layer mutations in commit/cancel paths. |

### High-priority interaction bugs

| ID | Area | Status | Finding | Repro / trigger | Impact | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- |
| DRAW-001 | Pen/Eraser with antialiasing off | Open | `drawLine()` has a non-AA Bresenham loop that compares floating-point `x/y` to floating-point endpoints. If endpoints are non-integers, the loop can fail to terminate. | Disable antialiasing and draw a freehand stroke where canvas coordinates are fractional. | Potential renderer hang. | Round endpoints before loop or delegate to `getPixelPerfectLinePoints()`. |
| PRESS-001 | Pressure sensitivity | Open | The app listens to `mousedown`/`mousemove` mouse events, but tablet pressure normally arrives on pointer events (`pointerdown`/`pointermove`) via `PointerEvent.pressure`. Current pressure support will usually read as `1`. | Draw with a stylus/tablet. | Pressure controls appear functional but do not respond to hardware pressure. | Migrate drawing input to pointer events or add pointer-event listeners with pressure propagation. |
| BRUSH-001 | Brush flow / hard round lines | Open | Hard-round antialiased line strokes use native `ctx.stroke()` in `drawBrushLine()` and do not apply `brushFlow` / pressure flow the same way stamps do. | Select Hard Round, reduce Flow, draw a continuous stroke. | Line segments may ignore flow/pressure-flow settings. | Apply adjusted alpha around native stroke or stamp all brush modes consistently. |
| BRUSH-002 | Pixel/non-AA line flow | Open | Pixel preset and non-antialiased line paths call `drawPixelPerfectBrushStamp()` directly, bypassing `drawBrushStamp()` and therefore bypassing brush-flow alpha behavior. | Select Pixel preset, reduce Flow, draw line/freehand. | Flow/pressure-flow inconsistent across brush presets. | Route pixel line points through a stamp helper that applies flow. |
| FILL-002 | Fill undo noise | Open | Fill saves history before knowing whether any pixel will change. Same-color fills or zero-pixel fills still create undo entries. | Fill an area with the same color/alpha. | Undo stack pollution. | Have `floodFill()` return changed pixel count and save state only when nonzero, or roll back empty saves. |
| FILL-003 | Magic wand tolerance UI | Open | Magic wand selection uses the global `fillTolerance`, but the tolerance UI is only shown for the Fill tool. Users cannot adjust magic-wand tolerance while using Selection mode. | Select Magic Wand, try changing tolerance without switching to Fill. | Hidden coupling and poor discoverability. | Show a tolerance slider in selection controls or use a dedicated `selectionTolerance`. |
| SEL-005 | Magic wand anti-alias claim | Open | Selection anti-alias controls affect lasso/polygon rasterization, but magic-wand selection remains a hard pixel mask; only feather is applied afterward. | Enable Selection Anti-alias, use Magic Wand. | UI overpromises anti-aliasing behavior for magic wand. | Add edge anti-aliasing for magic wand masks or scope the label to lasso/polygon. |
| SEL-006 | Detached selection bounds | Open | Dragging a detached selection can set negative/out-of-canvas preview coordinates; commit does not clamp before `putImageData()`. | Drag detached selection partly outside canvas and press Enter. | Potential clipped, misplaced, or exception-prone commit behavior. | Clamp detached selection coordinates on move and before commit. |
| PROJECT-001 | New project background color | Open | `createNewProject()` reads `backgroundColor` and paints `mainCtx`, but `initializeFrames()` recreates the actual background layer and always fills white when not transparent. | Create a non-transparent project with a custom background color. | Chosen background color is ignored. | Store project background color and pass it into initial layer creation. |
| PROJECT-002 | Transparent-background UI sync | Open | `updateTransparentBackgroundClass()` is not called during project creation/load, and the `transparentBackground` checkbox is not restored on load. | Create/load a transparent project, inspect canvas checkerboard/checkbox state. | UI can misrepresent transparency state. | Call `updateTransparentBackgroundClass()` after create/load and restore checkbox state. |

### Medium-priority correctness / UX issues

| ID | Area | Status | Finding | Repro / trigger | Impact | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- |
| XFORM-001 | Transform semantics | Open | README labels transforms as non-destructive, but current-layer transforms immediately overwrite layer pixels. Selection transforms are preview-like until Enter, but layer transforms are destructive. | Click transform button without an active selection. | Documentation/UX mismatch. | Rename roadmap wording or implement transform preview/history transaction for layers. |
| XFORM-002 | Large transforms | Open | Layer transforms larger than the canvas are pasted at `(0,0)` after clipping because negative centering is clamped to `0`. | Scale/rotate/skew a full layer to a larger output. | Result is top-left biased rather than centered crop. | Draw transformed output through a destination canvas with centered negative offsets. |
| XFORM-003 | Skew bounds | Open | Skew padding is estimated with `tan()` and center transform order; edge pixels can still be clipped for combinations of rotate/scale/skew. | Apply skew after rotate/scale on a full-canvas layer. | Possible clipping. | Compute transformed corner bounds and translate by min corner. |
| SEL-007 | Selection outline | Open | Lasso/polygon/magic-wand selections display only rectangular bounds, not actual mask contours. | Create a lasso or magic-wand selection. | Users may think the rectangular bounding box is selected. | Draw mask contour/marching ants from alpha mask. |
| SEL-008 | Polygon discoverability | Open | Polygon mode relies on Enter/Escape and near-start click behavior without in-app hints. | Select Polygon mode. | Hard to discover finalize/cancel controls. | Add inline help text or status-bar hint. |
| PERF-001 | Flood fill performance | Open | Contiguous flood fill uses a JavaScript `Set` keyed by byte offsets, which can be memory-heavy on large canvases. | Fill a large high-resolution canvas. | Performance/memory spikes. | Use `Uint8Array(width * height)` visited flags. |
| PERF-002 | Feather performance | Open | Feather applies repeated full-image 3x3 alpha blur passes over the whole selection bounds. | Feather a large lasso/magic-wand selection. | Slow on large selections. | Optimize with separable blur or restrict to alpha-edge bands. |
| BRUSH-003 | Textured preset semantics | Open | Textured brush scatter is deterministic but tied to absolute coordinates and uses a simple sine pattern; repeated passes can produce visible regularity. | Draw slow strokes with Textured preset. | Texture may look artificial/repetitive. | Add seeded noise/jitter with stroke-local randomization. |
| STATUS-001 | Status-bar verbosity | Open | Status text includes long preset/flow/spacing/pressure information in a compact status item. | Use narrow window/sidebar. | Truncation/noisy status display. | Move detailed brush settings to a dedicated panel or concise tooltip. |

### Lower-priority / validation gaps

| ID | Area | Status | Finding | Repro / trigger | Impact | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- |
| IO-001 | Settings validation | Open | Some project settings are normalized but not fully clamped (`brushFlow`, `brushSpacing`, `fillTolerance`, opacity) to their UI ranges. | Load hand-edited project JSON with invalid values. | Sliders/state can diverge from expected range. | Clamp all numeric settings in `normalizeProjectSettings()`. |
| UI-001 | Transform controls layout | Open | Seven transform buttons can crowd the Layers panel despite auto-fit. | Narrow app window. | Hard-to-read controls. | Use a dropdown/menu or icon buttons with wrapping labels. |
| UI-002 | Selection controls styling | Open | Selection controls reuse `.fill-option`, which couples unrelated UI styles and naming. | Maintain styles. | Confusing CSS semantics. | Add dedicated `.selection-option` class. |
| DOC-001 | Testing claims | Open | README says no automated test suite, but repeated changes are only syntax-checked; no manual QA script is captured. | Review PR/testing notes. | Reviewers lack reproducible interaction validation. | Add a manual QA checklist for tool interactions. |

## Recommended fix order

1. SEL-001, SEL-002, SEL-003, SEL-004: prevent selection data loss.
2. DRAW-001 and PRESS-001: prevent hangs and make pressure real.
3. PROJECT-001 and PROJECT-002: fix project creation/load correctness.
4. BRUSH-001 / BRUSH-002 and FILL-002 / FILL-003: make controls behave consistently.
5. Transform and performance polish after correctness fixes.
