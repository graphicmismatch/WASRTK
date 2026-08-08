# Palette Editor

The Palette Editor is a separate Electron window for creating, importing,
and managing named color palettes. Saved palettes appear in the main
editor's palette dropdown (`paletteSelect`) and swatch grid (`colorPresets`)
for quick color picking.

## Opening the Palette Editor

Two paths open the same window:

- Menu: **View > Palette Editor** (`Ctrl/Cmd+Alt+P`), wired in
  `src/main/menu.js` to `windowController.openPaletteEditorWindow`.
- In-app button: the "Open Palette Editor" button (`openPaletteEditorBtn`)
  next to the palette dropdown in the main window, which invokes the
  `open-palette-editor-window` IPC channel (`src/renderer/wasrtk.js`).

Both routes go through `openPaletteEditorWindow()` in `src/main/window.js`,
which uses the shared `createChildWindow(...)` helper (also used by the
theme settings window): if a palette window is already open it is focused
instead of creating a second one; otherwise a new `BrowserWindow` is
created (no application menu), loads `palette-window.html`, and shows once
ready. `src/renderer/palette-window.js` is the window's renderer script.

## Custom palette workflow

The editor keeps one "draft" palette in memory (`paletteEditorColors`) plus
the full set of saved palettes (`existingPalettes`), loaded from disk on
open.

- **Add a color manually** — enter a hex value and click "Add Color"; the
  value is normalized through `normalizeHexColor` (`src/renderer/color-utils.js`)
  before being added, and duplicates are ignored.
- **Remove a color** — click a swatch in the draft preview to remove it.
- **Clear the draft** — resets the draft's color list (keeps the name field).
- **Import from a file** — accepts:
  - Image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.webp`): colors
    are extracted by downscaling the image to at most 200px on a side,
    quantizing each channel to 5-bit precision to reduce noise, and ranking
    by pixel frequency (top 64 unique colors, pixels with alpha < 10 are
    skipped).
  - `.gpl` (GIMP palette), `.pal` (JASC-PAL), `.json` (array of colors, or
    `{ colors: [...] }`), and generic hex-list text files.
  - Photoshop formats (`.aco`, `.ase`, `.act`) and Paint.NET palette files
    (detected by the `; Paint.NET palette file` header) are explicitly
    rejected with an error message — not supported.
- **Import from an image (direct button)** — same extraction logic as the
  image-file import path, exposed as its own "Import from Image" control.
- **Load a saved palette into the draft** — pick a saved palette from the
  "Saved Palettes" dropdown and click "Load"; this makes further edits
  overwrite that palette (by id) on next save instead of creating a new one.
- **Save** — requires a non-empty name and at least one color. Reuses the
  existing palette id when editing a loaded palette, otherwise derives a
  new id by slugifying the name (`buildPaletteIdFromName`, with numeric
  suffixes to avoid collisions).
- **Delete** — removes a saved palette after a confirm dialog.

Saving or deleting persists the full palette map immediately (no separate
"apply" step), and the result is broadcast to every open window (see IPC
below) so the main editor's palette dropdown and the palette window's own
saved-palette list both stay in sync live.

## Persistence

Palettes are stored as a single JSON file, `palettes.json`, in Electron's
`app.getPath('userData')` directory (`src/main/palette-config.js`, backed
by the shared `src/main/json-config-store.js` factory — see
`docs/architecture/components.md`). The on-disk shape is:

```json
{
  "palettes": {
    "my-palette-id": {
      "label": "My Palette",
      "colors": ["#ff0000", "#00ff00", "#0000ff"]
    }
  }
}
```

`json-config-store` handles directory creation, corrupt-JSON recovery
(falls back to `{ palettes: {} }` and rewrites the file if the existing
JSON fails to parse), and sanitization on every load and save
(`sanitizePalettes`/`sanitizePaletteEntry` in `palette-config.js` drop
entries without a label or without at least one valid 6-digit hex color,
lowercase and dedupe the rest). The resolved file path is shown at the
bottom of the Palette Editor window, taken from the `path` field already
returned by the load/save/`palette-config-updated` payloads.

## IPC channels

Registered in `src/main/ipc.js` via the generic `registerConfigChannels`
helper (prefix `palettes`) plus one dedicated window-open channel:

| Channel | Direction | Purpose |
| --- | --- | --- |
| `load-palettes-config` | renderer -> main (invoke) | Load `palettes.json`, returns `{ palettes, path, recoveredFromError? }`. |
| `save-palettes-config` | renderer -> main (invoke) | Persist the given palette map, returns the same shape as load. |
| `open-palette-editor-window` | renderer -> main (invoke) | Opens (or focuses) the Palette Editor window; used by the main window's "Open Palette Editor" button. |
| `palette-config-updated` | main -> renderer (send) | Broadcast to the main window and the palette window whenever palettes are saved or deleted, so both stay in sync without polling. |

Note there is no `reset-palettes-config` channel — unlike the theme config
store, the palette store has no "reset all" concept (individual palettes
are deleted instead), so `registerConfigChannels` is called without a
`reset` function for the `palettes` prefix.

The main window subscribes to `palette-config-updated` in
`src/renderer/wasrtk.js` to refresh its palette dropdown/swatches; the
palette window subscribes to the same channel in
`src/renderer/palette-window.js` to refresh its saved-palette list and
clear the current draft's edit target if the palette it was editing was
deleted elsewhere.
