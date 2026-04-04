# Drawing Tools

WASRTK currently loads tool modules from `src/renderer/tools/` and exposes seven tools in the main UI.

## Available tools

### Pen

- Freehand drawing
- Uses a temporary stroke canvas while dragging
- Commits to the active layer on mouse up
- Supports brush size, opacity, antialiasing, and circle/square brush shapes

### Line

- Draws a straight line between drag start and end
- Shows a live preview on the overlay canvas
- Uses the current color, opacity, size, antialiasing, and brush shape

### Rectangle

- Draws a rectangle from drag start to end
- Uses overlay preview until commit
- Uses current color, opacity, and size

### Circle

- Draws an ellipse based on drag bounds
- Uses overlay preview until commit
- Uses current color, opacity, and size

### Fill

- Flood fills the active layer
- Uses the current color
- Uses the `fillTolerance` slider from `0` to `255`

### Eraser

- Draws through a temporary stroke canvas and commits with `destination-out`
- Supports brush size, antialiasing, and circle/square brush shapes

### Selection

- Drag to create a rectangular selection on the active layer
- Hold `Shift` while dragging to constrain to a square marquee
- Drag inside an existing selection to move the selected pixels
- Copy/Cut/Paste selected pixels with standard clipboard shortcuts
- Nudge selected pixels with arrow keys (`Shift+Arrow` = 10px step)
- Uses a dashed overlay outline for feedback

## Shared behavior

- Tools that modify pixels save undo state on start.
- Shape tools preview on `overlayCanvas`.
- Pen and eraser show a live cursor-sized preview near the pointer.
- Drawing targets the active layer of the current frame.
- Locked layers are skipped when committing strokes.

## Brush controls

- Brush size: `1` to `50`
- Brush shape: `circle` or `square`
- Opacity: `0%` to `100%`
- Antialiasing: on or off

Brush shape is currently relevant to:

- Pen
- Line
- Eraser

## Pixel-perfect mode

When antialiasing is disabled:

- Pointer coordinates are rounded to integer pixels
- Pen and eraser stamp pixel-perfect brush shapes
- Line drawing uses a pixel-perfect point list rather than smoothed canvas strokes

## Tool loading contract

Each tool module exports an object with at least:

```js
{
  id: 'tool-id'
}
```

Optional hooks used by the editor include:

- `saveStateOnStart`
- `isShapeTool`
- `onStart(app, payload)`
- `onDraw(app, payload)`
- `onStop(app, payload)`
- `drawPoint(app, payload)`
- `drawLine(app, payload)`

## Current limitations

- Selection currently supports move only (no scale/rotate/transform handles yet).
