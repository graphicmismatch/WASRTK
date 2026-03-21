# Component Architecture

## Top-level components

### `main.js`

Application bootstrap. It creates the window controller, registers IPC handlers, and installs the app menu when Electron is ready.

### `src/main/window.js`

Owns:

- Main editor window creation
- Theme settings window creation
- File dialog helpers that send chosen paths back to the renderer
- Broadcast of `theme-config-updated` events to all open windows

### `src/main/menu.js`

Defines menu sections for:

- File
- Edit
- View
- Animation
- Layers
- Reference
- Tools

Most actions send IPC-driven commands into the renderer rather than mutating state directly in the main process.

### `src/main/ipc.js`

Registers `ipcMain.handle(...)` endpoints for:

- Screen source enumeration
- Text file reads
- Binary file reads
- File saves
- Theme config load/save/reset/path lookup

### `src/renderer/wasrtk.js`

This is the main editor controller. It owns:

- Canvas setup
- Global editor state
- Event listeners
- Undo/redo stacks
- Drawing, shapes, flood fill, and compositing
- Frame and layer management
- Playback
- Status bar and UI refreshes
- Project save/load

### `src/renderer/tools/`

Each tool exports an object with at least an `id`. The loader scans the directory at runtime and builds the tool registry.

Current tool modules:

- `pen.js`
- `line.js`
- `rectangle.js`
- `circle.js`
- `fill.js`
- `eraser.js`

### `src/renderer/project-io.js`

Pure-ish helpers for:

- Parsing JSON project data
- Validating required fields
- Building serializable project objects
- Rebuilding frame/layer canvases from saved data
- Normalizing per-project settings

### `src/renderer/exporters.js`

Contains:

- MIME type lookup for reference file loading
- Visible-layer compositing
- PNG sequence export
- GIF export through `gif.js`

### `src/renderer/reference/`

Split into:

- `settings.js`: UI controls, preview interaction, reset/clear/toggle logic
- `modes/image.js`: file-based reference loading
- `modes/screen-capture.js`: desktop/window capture workflow

### Theme components

- `src/main/theme-config.js` persists and sanitizes theme JSON
- `src/renderer/theme.js` applies CSS custom properties
- `src/renderer/theme-window.js` builds and manages the theme editor UI

## Data ownership

- Main process owns OS integration and filesystem entry points.
- Renderer owns document state and raster data.
- Theme config is shared across windows through IPC updates.
