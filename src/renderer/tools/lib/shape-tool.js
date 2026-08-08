// Shared body for the shape tools (rectangle, circle, line): all three
// clear the overlay on start, redraw a live preview on move, and commit
// the shape on release. They differ only in the shape id passed to
// app.drawShapePreview/app.commitShape and in whether the shift-key
// "keepSquare" modifier applies -- line has no square concept, so it must
// never thread a keepSquare option through (that omission is the current,
// intentional behavior, not an oversight to "fix").
function createShapeTool({ id, keepSquare = false }) {
  const shapeOptions = (modifiers) => (keepSquare ? { keepSquare: Boolean(modifiers?.keepSquare) } : undefined);

  return {
    id,
    saveStateOnStart: true,
    isShapeTool: true,
    onStart(app) {
      app.clearOverlay();
    },
    onDraw(app, { startShape, currentCoords, modifiers }) {
      app.clearOverlay();
      app.drawShapePreview(startShape, currentCoords, id, shapeOptions(modifiers));
    },
    onStop(app, { startShape, lastMousePos, modifiers }) {
      if (startShape && lastMousePos) {
        app.commitShape(startShape, lastMousePos, id, shapeOptions(modifiers));
        app.clearOverlay();
      }
    }
  };
}

module.exports = { createShapeTool };
