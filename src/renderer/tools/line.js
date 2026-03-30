module.exports = {
  id: 'line',
  saveStateOnStart: true,
  isShapeTool: true,
  onStart(app) {
    app.clearOverlay();
  },
  onDraw(app, { startShape, currentCoords }) {
    app.clearOverlay();
    app.drawShapePreview(startShape, currentCoords, 'line');
  },
  onStop(app, { startShape, lastMousePos }) {
    if (startShape && lastMousePos) {
      app.commitShape(startShape, lastMousePos, 'line');
      app.clearOverlay();
    }
  },
};
