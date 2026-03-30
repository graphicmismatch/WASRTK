module.exports = {
  id: 'rectangle',
  saveStateOnStart: true,
  isShapeTool: true,
  onStart(app) {
    app.clearOverlay();
  },
  onDraw(app, { startShape, currentCoords }) {
    app.clearOverlay();
    app.drawShapePreview(startShape, currentCoords, 'rectangle');
  },
  onStop(app, { startShape, lastMousePos }) {
    if (startShape && lastMousePos) {
      app.commitShape(startShape, lastMousePos, 'rectangle');
      app.clearOverlay();
    }
  },
};
