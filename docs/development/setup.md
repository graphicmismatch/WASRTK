# Development Setup

## Prerequisites

- Node.js with npm
- A desktop environment supported by Electron

The project currently depends on:

- `electron@13.1.7`
- `electron-builder@22.11.7`
- `gif.js@0.2.0`

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

- `main.js`: Electron bootstrap
- `renderer.js`: renderer bootstrap
- `index.html`: main editor UI
- `theme-window.html`: theme editor UI
- `src/main/constants.js`: dialog filters, window defaults, thumbnail size
- `src/main/window.js`: main window and theme window control
- `src/main/menu.js`: application menus and accelerators
- `src/main/ipc.js`: filesystem, theme, and screen-source IPC handlers
- `src/main/theme-config.js`: theme persistence and sanitization
- `src/renderer/wasrtk.js`: main editor class and app state
- `src/renderer/project-io.js`: project serialization and hydration
- `src/renderer/exporters.js`: PNG sequence and GIF export
- `src/renderer/tools/`: tool modules loaded dynamically at runtime
- `src/renderer/reference/`: reference image and screen-capture workflows

## Development workflow

1. Install dependencies with `npm install`.
2. Launch the app with `npm start` or `npm run dev`.
3. Make changes.
4. Validate manually in the running app.
5. Build with `npm run build` if packaging behavior is affected.

## Current constraints

- There is no automated test suite in this repo.
- Documentation and manual verification are part of the normal change workflow.
- The renderer runs with `nodeIntegration: true` and `contextIsolation: false`, so code changes should be reviewed with that trust model in mind.
