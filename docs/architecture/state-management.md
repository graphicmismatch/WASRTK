# State Management

WASRTK does not use an external state library. The editor keeps mutable state in module-level variables inside `src/renderer/wasrtk.js` and updates the UI imperatively.

## Core renderer state

### Tool and brush state

- `currentTool`
- `currentColor`
- `currentOpacity`
- `brushSize`
- `brushShape`
- `antialiasingEnabled`
- `fillTolerance`

### Animation state

- `frames`
- `layers`
- `currentFrame`
- `currentLayer`
- `fps`
- `isAnimating`
- `onionSkinningEnabled`
- `onionSkinningRange`

### Reference state

- `referenceImage`
- `referenceVisible`
- `referenceOpacity`
- `referenceX`
- `referenceY`
- `referenceScale`
- `userModifiedReference`
- `screenCaptureInterval` on the app instance

### Canvas interaction state

- `zoom`
- `isDrawing`
- `lastMousePos`
- `isDraggingReference`
- `isPanning`
- `panStartPos`
- `panStartScroll`
- `draggedFrameIndex`

### Project state

- `hasTransparentBackground`

## Data structures

### Frame

```js
{
  id,
  name,
  timestamp,
  layers: [
    {
      id,
      name,
      visible,
      locked,
      canvas
    }
  ]
}
```

### Layer metadata

The top-level `layers` array stores per-layer metadata shared across frames:

```js
{
  (id, name, visible, locked);
}
```

Each frame also stores its own raster canvas for that same layer position.

## Update model

State changes usually follow this pattern:

1. Mutate the relevant variable or array.
2. Re-render the main canvas if raster output changed.
3. Refresh affected UI pieces such as timeline, layer list, brush preview, zoom controls, or status bar.

There is no centralized reducer or event bus in the renderer.

## Undo and redo

Undo history uses two stacks:

- `undoStack`
- `redoStack`

Two state record types are used:

- `draw`: stores `ImageData` for one frame/layer canvas
- `structure`: stores cloned frame canvases plus layer metadata and selection indices

That split keeps drawing undo cheaper than full-structure snapshots while still supporting frame/layer operations.

## Persistence boundaries

Saved project files include:

- canvas dimensions and transparency flag
- frames and layers
- per-layer PNG data URLs
- editor settings such as tool, color, opacity, brush size, zoom, FPS, onion skinning, and reference visibility/opacity

Saved project files do not include:

- active reference image pixels
- live capture source state
- theme configuration

## Tradeoffs

Advantages:

- Very direct to debug
- Easy for small features to hook into existing state
- Low abstraction cost

Costs:

- `wasrtk.js` carries a lot of responsibility
- State mutations and UI updates can drift apart if a method forgets a refresh step
- Shared mutable globals make larger refactors harder
