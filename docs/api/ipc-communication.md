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

### Layout channels

- `load-layout-config`
- `save-layout-config`

Read and mutate the shared `layout.json` file: `{ panels: { [panelId]: {top, left, width, height} } }`, one entry per floating panel (`#toolsPanel`, `#colorPanel`, `#historyPanel`). `save-layout-config` merges the sent partial update onto the currently-stored panels rather than replacing the file, so saving one panel's position/size never drops another panel's already-saved state (`mergePanelsUpdate` in `src/main/layout-config.js`). There is no `reset-layout-config`.

### Shortcuts channels

- `load-shortcuts-config`
- `save-shortcuts-config`

Read and mutate the shared `shortcuts.json` file: a flat `{ [actionId]: comboString }` override map for the renderer's rebindable actions (`src/renderer/shortcuts.js`'s `rebindable: true` entries -- tool selection, toggle-animation, selection copy/cut/paste). `save-shortcuts-config` sends the whole override map (not a partial merge, unlike layout) since the renderer always holds the full map in memory. There is no `reset-shortcuts-config` -- resetting is done renderer-side by saving an empty map.

Theme, palette, layout, and shortcuts channels are all registered through the same `registerConfigChannels(...)` helper in `src/main/ipc.js`, backed by the shared `createJsonConfigStore(...)` factory in `src/main/json-config-store.js` (directory creation, corrupt-JSON recovery, and load/save sanitization are implemented once and reused by every store).

### Autosave channels

- `save-autosave`
  - Direction: renderer -> main
  - Payload: serialized project JSON (same format `save-file`/`save-project` use)
  - Returns `{ success, path }` (the `handleWithEnvelope` envelope)

  Writes a new timestamped `.wasrtk` backup under the `autosaves/` folder in the Electron user data directory and prunes down to the configured max (`src/main/autosave-store.js`). Called by `wasrtk.js`'s `performAutosave()`, itself gated on a dirty flag and fired on a fixed interval (`startAutosaveTimer()`).

- `list-autosaves`
  - Direction: renderer -> main
  - Returns an array of `{ name, path, mtimeMs }`, newest first.

  There is no dedicated channel for the crash-recovery check itself (`checkForCrashRecovery()`) or for marking a clean exit (`markCleanExit()`) -- both run entirely in the main process (`main.js`, around `app.whenReady()`/`before-quit`), since the decision to show the native recovery dialog has to happen before the renderer necessarily exists yet. Accepting the recovery prompt sends the recovered file's path down the existing `load-project` channel below, unchanged.

## One-way channels sent to the renderer

Defined by `windowController.sendToRenderer(...)` in `src/main/window.js` and consumed in `setupIPCListeners()` inside `src/renderer/wasrtk.js`.

### File and project actions

- `new-project`
- `open-reference-image`
- `load-project` -- also sent (with an autosave's path) when the user accepts the crash-recovery prompt or picks a file via File > Restore Backup..., not just from the Load Project menu item
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

### Shortcuts actions

- `open-command-palette` — sent by the View menu's "Command Palette" item (`CmdOrCtrl+Shift+P`); opens the `#commandPaletteModal` overlay.
- `open-shortcuts-panel` — sent by the View menu's "Keyboard Shortcuts..." item; opens the `#shortcutsModal` rebinding panel.

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
