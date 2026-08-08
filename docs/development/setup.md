# Development Setup

## Prerequisites

- Node.js with npm
- A desktop environment supported by Electron

The project currently depends on:

- `electron@13.1.7`
- `electron-builder@22.11.7`

GIF export uses a vendored copy of `gif.js`/`gif.worker.js` (`vendor/gif/`) rather than an npm dependency, so packaged builds work without shipping `node_modules`.

## Install

```bash
git clone https://github.com/graphicmismatch/WASRTK.git
cd WASRTK
npm install
```

## Run locally

```bash
npm start
```

Useful variants:

- `npm run dev` launches with DevTools
- `npm run build` packages the app
- `npm run build:win`
- `npm run build:mac`
- `npm run build:linux`

## Project structure

Quick orientation for a first-time setup — for the full, current file-by-file
inventory (all `src/main/` and `src/renderer/` modules, tool modules, and
shared factories), see [Component Architecture](../architecture/components.md),
which is the canonical source.

- `main.js`: Electron bootstrap (main window, IPC handlers, menu, `--smoke` harness)
- `renderer.js`: renderer bootstrap
- `index.html` / `theme-window.html` / `palette-window.html`: the main editor, theme editor, and palette editor UIs
- `src/main/`: menus, IPC, window management, theme/palette config persistence
- `src/renderer/`: the editor controller, tools, project I/O, exporters, references, and theming
- `src/renderer/tools/`: tool modules loaded dynamically at runtime, plus shared factories in `tools/lib/`
- `tests/unit/`: `node:test` unit suites; `tests/smoke/`: the Electron smoke harness

## Development workflow

1. Install dependencies with `npm install`.
2. Launch the app with `npm start` or `npm run dev`.
3. Make changes.
4. Run `npm test` and `npm run smoke` (see [Testing Guide](./testing.md)).
5. Validate manually in the running app; run the relevant section(s) of the
   [manual interaction checklist](../qa/manual-interaction-checklist.md)
   for interaction-affecting changes.
6. Build with `npm run build` if packaging behavior is affected.

## Current constraints

- Automated coverage is a `node:test` unit suite plus an Electron smoke
  harness (`npm test`, `npm run smoke`) — see [Testing Guide](./testing.md).
  It does not replace manual verification for interaction-heavy changes.
- Documentation and manual verification are still part of the normal change workflow.
- The renderer runs with `nodeIntegration: true` and `contextIsolation: false`, so code changes should be reviewed with that trust model in mind.
