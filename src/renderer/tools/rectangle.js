module.exports = {
  id: 'rectangle',
  saveStateOnStart: true,
  isShapeTool: true,
  onStart(app) {
    app.clearOverlay();
  },
  onDraw(app, { startShape, currentCoords, modifiers }) {
    app.clearOverlay();
    app.drawShapePreview(startShape, currentCoords, 'rectangle', {
      keepSquare: Boolean(modifiers?.keepSquare)
    });
  },
  onStop(app, { startShape, lastMousePos, modifiers }) {
    if (startShape && lastMousePos) {
      app.commitShape(startShape, lastMousePos, 'rectangle', {
        keepSquare: Boolean(modifiers?.keepSquare)
      });
      app.clearOverlay();
    }
  }
};
