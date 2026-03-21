# Main Process Implementation

The main process is intentionally small and exists to provide Electron shell behavior to the renderer.

## Entry point

`main.js` does three things once `app.whenReady()` resolves:

1. Creates the main window through `createWindowController(...)`
2. Registers screen-capture and file/theme IPC handlers
3. Builds and installs the application menu

It also handles:

- `window-all-closed`
- `activate`

## Window controller

`src/main/window.js` owns both windows.

### Main window

- Loads `index.html`
- Uses defaults from `getWindowOptions(...)`
- Shows on `ready-to-show`
- Opens DevTools when launched with `--dev`

### Theme window

- Loads `theme-window.html`
- Reuses the same base BrowserWindow options
- Removes its menu
- Reuses a single window instance when reopened

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
  enableRemoteModule: true,
  webSecurity: false,
  allowRunningInsecureContent: true
}
```

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

File handlers use synchronous `fs` calls inside the handler body. That is simple and acceptable for current scope, but it means large file operations run on the main process thread.

## Theme persistence

`src/main/theme-config.js` stores theme config as `theme.json` in `app.getPath('userData')`.

Behavior:

- If the file does not exist, it is created from `DEFAULT_THEME`
- Invalid or malformed theme files are replaced with sanitized defaults
- Saving writes only the known theme keys

After save or reset, `windowController.sendThemeUpdate(...)` broadcasts the updated theme to both renderer windows.

## Permissions

`setupPermissions()` on the main window session allows:

- `media`
- `desktop-capture`
- `display-capture`

This supports the reference screen-capture workflow from the renderer.
