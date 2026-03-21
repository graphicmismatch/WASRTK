# Renderer Process Implementation

The renderer owns nearly all editor behavior.

## Bootstrap

`renderer.js` calls `bootstrap()` from `src/renderer/index.js`.

On `DOMContentLoaded`:

1. `new WASRTK()` is created
2. Theme sync is initialized

## Main controller

`src/renderer/wasrtk.js` is the core application class.

Its constructor:

1. Loads tools dynamically
2. Initializes undo/redo stacks
3. Initializes canvas state
4. Creates the initial frame and layer
5. Registers DOM event listeners
6. Registers IPC listeners
7. Updates the UI and brush preview
8. Resets zoom

## Canvas model

There are two on-screen canvases:

- `mainCanvas`: composited current frame, onion skinning, and reference image
- `overlayCanvas`: previews for shapes and in-progress strokes

Additional off-screen canvases are created for:

- each frame layer
- temporary pen/eraser stroke compositing
- export rendering
- timeline previews

## Rendering order

`renderCurrentFrame()` draws in this order:

1. Clear main canvas
2. Draw visible layers of the current frame
3. Draw onion skinning if enabled
4. Draw the reference image if present and visible

Locked layers render at reduced alpha in the editor and thumbnail previews.

## Drawing implementation

### Pen and eraser

- Start by creating `strokeCanvas`
- Draw continuously during pointer movement
- Commit on stop into the active layer canvas

Eraser commits with `destination-out`.

### Shape tools

- Record drag start
- Draw live shape preview on `overlayCanvas`
- Commit the final shape on mouse up

### Fill

- Runs immediately on click
- Uses the current tolerance value

## Frame and layer implementation

### Frames

- Stored in `frames[]`
- Each frame contains a full `layers[]` array with raster canvases
- Timeline thumbnails are rebuilt from frame data on each UI refresh

### Layers

- Layer metadata is also tracked in the top-level `layers[]` array
- Add/remove/reorder operations mutate both the shared metadata array and every frame’s layer list

## Undo and redo

Two stack types are used:

- draw snapshots with `ImageData`
- structure snapshots with cloned canvases and selection state

Structure snapshots are used for frame and layer operations because array shape changes cannot be represented by a single `ImageData` payload.

## Project I/O

### Save

The renderer serializes project data with helpers from `project-io.js` and writes it through the `save-file` IPC handler.

### Load

The renderer reads the project file, validates it, rebuilds canvases for each saved layer, restores settings, and refreshes the UI.

## Export

`src/renderer/exporters.js` provides:

- visible-layer compositing
- PNG sequence export
- GIF export via `gif.js`

The renderer handles composition and encoding setup; the main process only writes the resulting files.

## Reference workflows

### Image references

- Loaded from a local file picker or a path delivered from the menu
- Displayed in the reference preview panel
- Rendered over the main canvas with adjustable position, opacity, and scale

### Screen capture references

- Source list fetched through IPC
- Capture stream opened with `navigator.mediaDevices.getUserMedia(...)`
- Sampled on an interval and turned into PNG blobs
- Existing placement and zoom are preserved when the user has manually adjusted the reference

## Theme sync

`src/renderer/theme.js` applies theme tokens as CSS custom properties.

Both the main editor and theme window listen for `theme-config-updated`, so theme changes propagate live without reopening either window.
