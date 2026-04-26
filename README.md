# WASRTK

WASRTK is an Electron desktop app for frame-by-frame drawing, simple animation, and rotoscoping with reference images or live screen capture.

## Current feature set

- Seven drawing tools: pen, line, rectangle, circle, fill, eraser, and selection
- Frame timeline with add, duplicate, delete, drag-to-reorder, and playback
- Multi-layer editing with visibility toggles, reordering, and flattening
- Onion skinning with configurable range
- Reference images from files or desktop/window capture
- Project save/load in `.wasrtk`
- Export to PNG sequences or animated GIF
- Multiple palette presets with quick swatch switching
- Palette creation/import workflows via dedicated Palette Editor window (image extraction + Lospec formats excluding Paint.NET/Photoshop)
- Eyedropper tool with zoomed color-pick preview lens
- Theme customization through a separate theme settings window

## Project task list

- [x] Add additional professional-grade tool types (selection tool). **Done**
- [x] Add selection workflows for region move/edit. **Done**
- [x] Add palette choices for fast color workflow switching. **Done**
- [x] Expand selection editing with copy/cut/paste, nudge, and constrained marquee. **Done**
- [x] Fix selection edge cases (undo noise, out-of-bounds drags, locked-layer safety). **Done**
- [x] Verify selection interactions do not interfere with frame/layer operations or other tools. **Done**
- [x] Fix flood-fill accuracy so fills remain consistent across zoom levels. **Done**
- [x] Align selection move workflow with paint.net-style drag-and-commit behavior. **Done**
- [x] Require explicit Enter to commit detached selection moves (Escape to cancel restore). **Done**
- [x] Reset selection state automatically after Enter commit. **Done**
- [x] Add palette creation/import support for editor, image extraction, and Lospec-compatible files (excluding Paint.NET/Photoshop formats). **Done**
- [x] Improve palette image import extraction quality so representative colors are detected reliably. **Done**
- [x] Add palette management workflow with saved-palette preview and draft preview before committing to the palette list. **Done**
- [x] Add an eyedropper tool with zoomed pick-area preview for easier color selection. **Done**
- [x] Keep eyedropper preview hex label live-updating while hovering before click. **Done**
- [x] Harden export helpers (case-insensitive MIME lookup, safer layer iteration, and FPS fallback for GIF delay). **Done**
- [x] Improve config/file IPC resilience (auto-recover palette config file + validate read/write file paths). **Done**
- [x] Add pen tool straight-line assist (Shift from last point + Ctrl/Cmd snap to 45° increments like Aseprite). **Done**
- [x] Cache per-layer 2D rendering contexts to reduce repeated context lookups in hot drawing/render paths. **Done**
- [x] Constrain rectangle and ellipse tools with Shift so previews/commits become perfect squares and circles. **Done**
- [x] Start Phase 1 implementation by expanding fill controls with contiguous toggle and sample-all-layers behavior. **Done**
- [x] Add initial brush engine presets (hard round, soft round, pixel, textured) with live preset switching. **Done**
- [x] Add brush flow and spacing controls wired into the brush engine for pen/eraser presets. **Done**
- [x] Add pressure sensitivity controls for brush size/flow response on tablet-compatible pointer input. **Done**
- [x] Add initial transform actions (flip horizontal/vertical and rotate 90°) for active selections or current layer. **Done**
- [x] Add magic-wand selection mode (tolerance-based contiguous pickup) as the first advanced selection variant. **Done**
- [x] Add quick scale transform actions (Scale + / Scale -) for active selections or current layer. **Done**
- [x] Add quick skew transform actions (Skew X / Skew Y) for active selections or current layer. **Done**
- [x] Add lasso selection mode for freehand region capture in the selection workflow. **Done**


## Fully fledged drawing app plan

This roadmap expands WASRTK from a focused animation sketch tool into a full-featured drawing and illustration application.

### Phase 1 — Core drawing power

- [x] Add brush engine presets (hard/soft round, textured, pixel) with size, opacity, flow, spacing, and smoothing controls. **Done**
- [x] Add pressure sensitivity support (size/opacity/flow) for drawing tablets. **Done**
- [x] Add non-destructive transform tools (scale, rotate, skew, flip) for selections and full layers. **Done**
- [ ] Add lasso/polygon/magic-wand selection modes with anti-alias and feather options.
- [x] Add advanced fill controls (tolerance slider, contiguous toggle, sample-all-layers). **Done**

### Phase 2 — Layering and composition

- [ ] Add layer groups/folders with collapse/expand, locking, and group visibility controls.
- [ ] Add blend modes (Normal, Multiply, Screen, Overlay, etc.) and per-layer opacity.
- [ ] Add adjustment layers (levels, curves, hue/saturation, brightness/contrast).
- [ ] Add clipping masks and alpha-lock workflows for targeted painting.
- [ ] Add smart guides, rulers, and snapping for precise layout alignment.

### Phase 3 — Productivity and pro workflow

- [ ] Add customizable keyboard shortcuts and command palette search.
- [ ] Add dockable/resizable panels (layers, colors, history, navigator, brush settings).
- [ ] Add robust history timeline with named snapshots and non-linear jump points.
- [ ] Add macro/action recording for repeated drawing and editing workflows.
- [ ] Add autosave, crash recovery, and backup version history controls.

### Phase 4 — File compatibility and output

- [ ] Add import support for PSD (core layer data), Aseprite, and common image formats with metadata retention where possible.
- [ ] Add export presets for print, web, social media, sprite sheets, and animation pipelines.
- [ ] Add color management (sRGB/Display P3 profiles, soft proofing, gamma-safe export).
- [ ] Add vector text layers with font controls, alignment, and path text support.
- [ ] Add batch export and asset slicing workflows for game/UI pipelines.

### Phase 5 — Collaboration and ecosystem

- [ ] Add plugin API for custom tools, importers/exporters, and automation extensions.
- [ ] Add cloud sync and optional real-time collaboration for shared projects.
- [ ] Add in-app asset browser for brushes, palettes, textures, and community templates.
- [ ] Add onboarding tutorials, contextual tips, and searchable help docs inside the app.
- [ ] Add telemetry-free performance diagnostics panel to help users optimize large projects.

### Success criteria for “fully fledged” status

- [ ] Professional drawing workflow is possible without leaving WASRTK for core illustration tasks.
- [ ] Large projects (100+ layers, high-resolution canvases) remain responsive on mid-range hardware.
- [ ] File interoperability is sufficient for mixed-tool studio workflows.
- [ ] New users can complete first illustration workflows via onboarding without external docs.
- [ ] Power users can tailor the UI/shortcuts/tools to match established workflows.


## Getting started

```bash
git clone https://github.com/graphicmismatch/WASRTK.git
cd WASRTK
npm install
npm start
```

The repo currently ships Electron `13.1.7` and `gif.js` as its only runtime dependency. There is no automated test suite in this repository at the moment; validation is manual by launching the app.

## Scripts

- `npm start` launches the app
- `npm run dev` launches the app and opens DevTools
- `npm run build` creates packaged output with `electron-builder`
- `npm run build:win`, `npm run build:mac`, `npm run build:linux` build platform-specific bundles

## Documentation

- [Quick Start](./QUICKSTART.md)
- [Documentation Index](./docs/README.md)
- [Architecture Overview](./docs/architecture/overview.md)
- [Drawing Tools](./docs/features/drawing-tools.md)
- [Timeline System](./docs/features/timeline-system.md)
- [Keyboard Shortcuts](./docs/api/keyboard-shortcuts.md)
- [File Formats](./docs/api/file-formats.md)

## Repository layout

- `main.js` wires Electron startup
- `src/main/` contains menus, IPC, window management, and theme config persistence
- `src/renderer/` contains the editor, tools, project I/O, exporters, references, and theming
- `index.html` and `styles.css` define the main UI
- `theme-window.html` and `theme-window.js` provide the theme editor window

## License

WASRTK is licensed under [GPL-3.0-or-later](./LICENSE).
