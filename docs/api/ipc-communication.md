# IPC Communication

WASRTK uses Electron IPC in a straightforward split:

- `ipcMain.handle(...)` for request/response operations
- `webContents.send(...)` for menu actions and theme broadcasts

## Request/response channels

Defined in `src/main/ipc.js`.

### `get-screen-sources`

- Direction: renderer -> main
- Returns: array of screen and window sources
- Used by: reference screen-capture flow

### `get-screen-sources-fallback`

- Direction: renderer -> main
- Returns: array of screen-only sources
- Used when the primary source query fails

### `save-file`

- Direction: renderer -> main
- Payload:

```js
{
  filePath,
  data
}
```

- Returns:

```js
{
  success,
  path?,
  canceled?,
  error?
}
```

Used for project saves and export output.

### `read-file`

- Direction: renderer -> main
- Payload: `filePath`
- Returns:

```js
{
  success,
  data?,
  error?
}
```

Used for loading `.wasrtk` projects.

### `read-binary-file`

- Direction: renderer -> main
- Payload: `filePath`
- Returns base64-encoded binary content.

Used for loading reference images from disk when the path originates from a menu action.

### Theme channels

- `load-theme-config`
- `save-theme-config`
- `reset-theme-config`

These read and mutate the shared `theme.json` file in the Electron user data directory.

### Palette channels

- `load-palettes-config`
- `save-palettes-config`
- `open-palette-editor-window`

These read and mutate the shared `palettes.json` file in the Electron user data directory. Unlike the theme channels there is no `reset-palettes-config` — palettes are removed individually instead of reset in bulk. `open-palette-editor-window` opens (or focuses, if already open) the Palette Editor window; both the main window's "Open Palette Editor" button and the View menu's "Palette Editor" item lead to it, though the menu item calls the window controller directly rather than through this channel. See `docs/features/palette-editor.md` for the full workflow.

Both the theme and palette channels are registered through the same `registerConfigChannels(...)` helper in `src/main/ipc.js`, backed by the shared `createJsonConfigStore(...)` factory in `src/main/json-config-store.js` (directory creation, corrupt-JSON recovery, and load/save sanitization are implemented once and reused by both stores).

## One-way channels sent to the renderer

Defined by `windowController.sendToRenderer(...)` in `src/main/window.js` and consumed in `setupIPCListeners()` inside `src/renderer/wasrtk.js`.

### File and project actions

- `new-project`
- `open-reference-image`
- `load-project`
- `save-project`
- `save-animation`

### Editing and tools

- `undo`
- `redo`
- `select-tool`

### Animation actions

- `add-frame`
- `duplicate-frame`
- `delete-frame`
- `play-animation`
- `stop-animation`

### Layer actions

- `move-layer-up`
- `move-layer-down`
- `flatten-layer`

### Reference/theme actions

- `reset-reference`
- `toggle-antialiasing`
- `theme-config-updated` — broadcast to the main window and the theme settings window (`windowController.sendThemeUpdate(...)`) whenever the theme is saved or reset, so both apply the new theme live. The palette editor window also has a listener wired up (`initializeThemeSync` in `src/renderer/theme.js`, shared by all three renderer scripts) but is not currently included in the broadcast list, so it only picks up theme changes on its next open.

### Palette actions

- `palette-config-updated` — broadcast to the main window and the palette editor window (`windowController.sendPaletteUpdate(...)`) whenever a palette is saved or deleted, so both stay in sync without polling.

## Test-only channels

- `smoke:result` — renderer -> main, sent once by `tests/smoke/renderer-smoke.js` (via `src/renderer/index.js`) after the smoke self-check finishes. Only registered when the app is launched with `--smoke` (`npm run smoke`); not present in normal app usage. See `docs/development/testing.md`.

## Error handling

- Main-process file handlers return `{ success: false, error }` instead of throwing for normal I/O failures.
- Screen source handlers log and rethrow errors.
- Renderer code generally displays `alert(...)` on failed file, project, export, or capture flows.
