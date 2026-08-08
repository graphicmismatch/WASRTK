# Manual Interaction QA Checklist

Use this checklist after renderer interaction changes. Record the app build/commit, OS, input device, and any deviations in PR notes.

## Drawing and Brush Input

- [ ] Draw freehand strokes with Pen, Line, and Eraser with antialiasing enabled and disabled.
- [ ] Verify non-antialiased strokes with fractional zoomed canvas coordinates complete without hangs.
- [ ] Test Hard Round, Soft Round, Pixel, and Textured presets with low Flow values.
- [ ] If a tablet/stylus is available, verify pressure changes brush size and/or flow when pressure controls are enabled.
- [ ] Ctrl/Cmd+wheel zoom advances exactly one 1.1x step per wheel notch (over the canvas and over the surrounding canvas-wrapper margin).

## Fill and Magic Wand

- [ ] Fill transparent, opaque, and semi-transparent regions at tolerance 0 and nonzero tolerance.
- [ ] Fill an area with the same color/opacity and verify no visible change and no extra undo step.
- [ ] In Selection > Magic Wand, adjust Tolerance without switching to the Fill tool and verify selection size changes.

## Selection Safety

- [ ] Create rectangle, lasso, polygon, and magic-wand selections; copy, cut, paste, move, and cancel each.
- [ ] Paste a selection over detailed pixels, drag the pasted selection, then Escape; verify the original background pixels are restored (not the pasted pixels) before commit.
- [ ] Move a detached lasso/magic-wand selection over detailed pixels and verify pixels outside the selected mask are preserved.
- [ ] Drag a detached selection partially outside the canvas and press Enter; verify the commit is clamped and does not throw.
- [ ] Transform a detached selection, commit, then undo; verify the original layer state is restored.
- [ ] Switch from Selection to Pen/Fill/Eraser while a detached selection is active and verify the source pixels are restored.

## Transforms and Project Persistence

- [ ] Apply flip, rotate, scale, and skew to a selection and to a full layer.
- [ ] Transform a full-canvas layer larger than the canvas and verify clipping remains centered rather than top-left biased.
- [ ] Create a project with a custom non-transparent background color and verify the first layer uses that color.
- [ ] Save and load transparent and non-transparent projects; verify the checkerboard class, checkbox, and background color input are restored.
- [ ] Change the FPS slider, then save the project and re-load it; verify the saved FPS value persists and matches the slider, and that a GIF export uses the matching frame delay.
- [ ] Add a new frame to a project with a custom (non-white) or transparent background; verify the new frame uses the project's background color/transparency setting instead of defaulting to white.

## Packaging

- [ ] Build a packaged/installed app (e.g. `npm run build:linux`) and verify GIF export succeeds from the packaged build, not just `npm start`.
