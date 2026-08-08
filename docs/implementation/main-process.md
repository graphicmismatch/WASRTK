# Main Process Implementation

The main process is intentionally small and exists to provide Electron shell behavior to the renderer.

## Entry point

`main.js` does three things once `app.whenReady()` resolves:

1. Creates the main window through `createWindowController(...)`
2. Registers screen-capture and file/theme/palette IPC handlers
3. Builds and installs the application menu

It also handles:

- `window-all-closed`
- `activate`

## Window controller

`src/main/window.js` owns three windows: the main editor window, the theme
settings window, and the palette editor window.

### Main window

- Loads `index.html`
- Uses defaults from `getWindowOptions(...)`
- Shows on `ready-to-show`
- Opens DevTools when launched with `--dev`

### Theme window and palette editor window

Both are "child" windows created through a single shared helper,
`createChildWindow({ getWindow, setWindow, htmlFile, title, width, height, minWidth, minHeight })`:

- Focuses the existing window instead of creating a second one if it is
  already open
- Otherwise creates a new `BrowserWindow` (child of the main window),
  removes its menu, loads its HTML file, and shows once ready
- Opens DevTools in detached mode when launched with `--dev`
- Clears its window reference on close so the next open creates a fresh one

`openThemeSettingsWindow()` calls it with `theme-window.html`;
`openPaletteEditorWindow()` calls it with `palette-window.html`. See
`docs/features/palette-editor.md` for the palette editor's workflow.

## Window options

Defined in `src/main/constants.js`.

Current defaults:

- `width: 1400`
- `height: 900`
- `minWidth: 800`
- `minHeight: 600`
- optional app icon from `assets/icon.png`

Current web preferences:

```js
{
  nodeIntegration: true,
  contextIsolation: false,
  webSecurity: false,
  allowRunningInsecureContent: true
}
```

(`enableRemoteModule` was removed as dead configuration — nothing in the
app used Electron's remote module, and the option no longer exists as of
Electron 14.)

## Menus

`src/main/menu.js` maps Electron menu actions to renderer channels or dialog helpers.

Patterns used:

- direct `menuAction(channel, payload)` for fire-and-forget commands
- `showOpenDialogAndSend(...)` for open flows
- `showSaveDialogAndSend(...)` for save/export flows

The main process does not interpret project data or drawing state.

## IPC handlers

`src/main/ipc.js` registers:

- desktop source enumeration through `desktopCapturer`
- text file reads
- binary file reads
- file writes
- theme config load/save/reset/path operations
- palette config load/save/path operations, plus the palette editor
  window-open channel

Three shared helpers keep the handler bodies small:

- `handleWithEnvelope(channel, fn)` wraps a handler in the try/catch ->
  `{ success, error }` envelope shared by the file-read/write handlers.
- `registerConfigChannels({ prefix, load, save, reset, onUpdated })`
  registers the `load-<prefix>-config` / `save-<prefix>-config` /
  (optional) `reset-<prefix>-config` channel block shared by the theme and
  palette stores.
- `getScreenSources(...)` collapses the try/catch/log shared by the two
  screen-capture handlers.

File handlers use synchronous `fs` calls inside the handler body. That is simple and acceptable for current scope, but it means large file operations run on the main process thread.

See `docs/api/ipc-communication.md` for the full channel list.

## Config persistence

`src/main/json-config-store.js` exports `createJsonConfigStore({ getDir, fileName, defaults, sanitize })`, a generic JSON-file store: resolve path -> ensure directory exists -> sanitize -> load with corrupt-JSON recovery -> save. `getDir` is injected (rather than the store calling `app.getPath` itself) so it is unit-testable without Electron. On corrupt-JSON recovery, the unparsable file is best-effort copied to `<path>.bak` before being overwritten with sanitized defaults, so a user's hand-edited config isn't silently destroyed.

Two thin wrappers build on it:

- `src/main/theme-config.js` stores theme config as `theme.json` in `app.getPath('userData')`. If the file does not exist it is created from `DEFAULT_THEME`; invalid or malformed files are replaced with sanitized defaults; saving writes only the known theme keys.
- `src/main/palette-config.js` stores custom palettes as `palettes.json` in the same directory, keyed by a generated palette id. See `docs/features/palette-editor.md` for the full shape and workflow.

Both wrappers keep their original exported function names (`loadThemeConfig`/`saveThemeConfig`/`resetThemeConfig` and `loadPaletteConfig`/`savePaletteConfig`) so `ipc.js` did not need to change its imports when the shared store was extracted.

After a theme save or reset, `windowController.sendThemeUpdate(...)` broadcasts the updated theme to the main and theme windows. After a palette save or delete, `windowController.sendPaletteUpdate(...)` broadcasts to the main and palette editor windows.

## Permissions

`setupPermissions()` on the main window session allows:

- `media`
- `desktop-capture`
- `display-capture`

This supports the reference screen-capture workflow from the renderer.
