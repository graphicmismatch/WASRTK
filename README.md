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
- Theme customization through a separate theme settings window

## Project task list

- [x] Add additional professional-grade tool types (selection tool).
- [x] Add selection workflows for region move/edit.
- [x] Add palette choices for fast color workflow switching.
- [x] Expand selection editing with copy/cut/paste, nudge, and constrained marquee.
- [x] Fix selection edge cases (undo noise, out-of-bounds drags, locked-layer safety).
- [x] Verify selection interactions do not interfere with frame/layer operations or other tools.
- [x] Fix flood-fill accuracy so fills remain consistent across zoom levels.
- [x] Align selection move workflow with paint.net-style drag-and-commit behavior.

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
