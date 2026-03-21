# File Formats

## Project files

WASRTK project files use the `.wasrtk` extension and are stored as JSON.

## Project shape

`buildProjectData(...)` in `src/renderer/project-io.js` produces this structure:

```json
{
  "name": "WASRTK Project",
  "version": "1.0.0",
  "canvas": {
    "width": 256,
    "height": 256,
    "backgroundColor": "#ffffff",
    "transparentBackground": false,
    "author": "WASRTK"
  },
  "frames": [],
  "layers": [],
  "settings": {},
  "metadata": {
    "created": "2026-03-22T00:00:00.000Z",
    "modified": "2026-03-22T00:00:00.000Z",
    "author": "WASRTK",
    "description": "WASRTK pixel art and animation project"
  }
}
```

## Frame and layer payloads

Each frame stores:

- `id`
- `name`
- `timestamp`
- `layers[]`

Each saved layer stores:

- `id`
- `name`
- `visible`
- `locked`
- `data`

`data` is a `data:image/png;base64,...` URL generated from the layer canvas.

## Saved settings

The renderer currently persists:

- `fps`
- `onionSkinningEnabled`
- `onionSkinningRange`
- `referenceOpacity`
- `referenceVisible`
- `antialiasingEnabled`
- `currentTool`
- `currentColor`
- `currentOpacity`
- `brushSize`
- `brushShape`
- `zoom`

On load, missing values are normalized with defaults in `normalizeProjectSettings(...)`.

## What is not persisted

Project files do not currently store:

- the active reference image bitmap
- an active desktop/window capture source
- theme configuration

The project file can remember `referenceVisible` and `referenceOpacity`, but not the reference content itself.

## Export formats

### PNG sequence

- Save target uses a `.png` path as a base name
- Output files are written as `basename-0001.png`, `basename-0002.png`, and so on
- Each exported frame is a composite of visible layers only

### GIF

- Uses `gif.js`
- Delay per frame is derived from the current FPS
- Visible layers are composited into a temporary canvas before encoding

## Reference image input formats

Supported image file extensions:

- `.png`
- `.jpg`
- `.jpeg`
- `.gif`
- `.bmp`

These are used for loading reference images, not for project import.

## Compatibility notes

- The loader requires `frames`, `layers`, and `settings` to be present.
- A UTF-8 BOM is stripped before JSON parsing.
- If a saved layer image fails to load, the loader falls back to a filled white canvas.
- The saved `canvas.backgroundColor` field is currently written as `null` for transparent projects and `#ffffff` otherwise, regardless of the color chosen when the project was first created.
