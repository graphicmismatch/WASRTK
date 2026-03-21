# Timeline System

The timeline is a frame-based animation strip rendered from the `frames` array in `src/renderer/wasrtk.js`.

## Frame model

Each frame contains:

- `id`
- `name`
- `timestamp`
- `layers[]`

Each layer inside a frame stores its own raster canvas.

## Supported actions

- Add frame
- Duplicate current frame
- Delete current frame
- Select a frame
- Move the current frame left or right
- Drag and drop frames to reorder
- Play and pause animation

## Frame creation behavior

### Add frame

- Creates a new frame with one canvas per existing layer
- Uses the current canvas dimensions
- Initializes the background layer based on transparency mode

### Duplicate frame

- Clones every layer canvas from the current frame
- Preserves layer visibility and lock flags stored in each frame layer object

### Delete frame

- Disabled when only one frame remains
- Reindexes frame IDs and names after removal

## Reordering

The timeline UI uses native drag-and-drop.

On drop:

1. A structure snapshot is pushed to undo history.
2. The frame is moved in the `frames` array.
3. IDs and names are reindexed.
4. The current frame selection follows the moved frame.

## Playback

- Playback only starts when there is more than one frame.
- Frame delay is derived from the FPS slider: `1000 / fps`.
- Playback advances by repeatedly calling `setTimeout(...)` and selecting the next frame modulo the frame count.

## Onion skinning

When enabled:

- Previous frames are drawn with alpha `0.3 / distance`
- Next frames are drawn with alpha `0.2 / distance`
- Visible layers only are composited

The range slider supports values from `1` to `10`.

## Timeline preview rendering

Each frame thumbnail is built by:

1. Creating a small preview canvas
2. Filling a dark background
3. Drawing visible layers scaled to the preview size

Locked layers are currently previewed with reduced alpha, matching main-canvas rendering.
