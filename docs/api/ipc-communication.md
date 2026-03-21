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
- `get-theme-config-path`

These read and mutate the shared `theme.json` file in the Electron user data directory.

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
- `theme-config-updated`

## Error handling

- Main-process file handlers return `{ success: false, error }` instead of throwing for normal I/O failures.
- Screen source handlers log and rethrow errors.
- Renderer code generally displays `alert(...)` on failed file, project, export, or capture flows.
