module.exports = {
  id: 'circle',
  saveStateOnStart: true,
  isShapeTool: true,
  onStart(app) {
    app.clearOverlay();
  },
  onDraw(app, { startShape, currentCoords }) {
    app.clearOverlay();
    app.drawShapePreview(startShape, currentCoords, 'circle');
  },
  onStop(app, { startShape, lastMousePos }) {
    if (startShape && lastMousePos) {
      app.commitShape(startShape, lastMousePos, 'circle');
      app.clearOverlay();
    }
  },
};
