# Architecture Overview

WASRTK is a two-process Electron application with most editor behavior implemented in the renderer.

## High-level split

### Main process

Responsible for:

- Creating the main window and theme window
- Building the application menu
- Handling file dialogs
- Reading and writing files
- Listing desktop capture sources
- Loading, saving, and resetting theme config

### Renderer process

Responsible for:

- Managing editor state
- Rendering canvases and previews
- Handling drawing tools
- Managing frames and layers
- Serializing and hydrating projects
- Exporting PNG sequences and GIFs
- Managing reference images and live screen capture
- Applying theme variables to the DOM

## Runtime shape

```text
Electron app
├── main.js
│   ├── src/main/window.js
│   ├── src/main/menu.js
│   ├── src/main/ipc.js
│   └── src/main/theme-config.js
└── renderer.js
    └── src/renderer/index.js
        └── src/renderer/wasrtk.js
```

## Important architectural choices

- The editor keeps most mutable state in module-level variables inside `src/renderer/wasrtk.js`.
- Each frame owns a canvas per layer rather than storing vector commands.
- Tool implementations are loaded dynamically from `src/renderer/tools/`.
- File access happens through main-process IPC handlers instead of direct renderer filesystem calls.
- Theme state is stored outside project files and broadcast to both windows.

## Security model

The current BrowserWindow configuration enables:

- `nodeIntegration: true`
- `contextIsolation: false`
- `webSecurity: false`
- `allowRunningInsecureContent: true`

That makes the app simple to wire up, but it also means the renderer runs with a broad trust model. Changes in IPC, file access, or remote content handling should be reviewed carefully.
