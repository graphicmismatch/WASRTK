module.exports = {
  id: 'fill',
  saveStateOnStart: false,
  onStart(app, { coords }) {
    app.drawPoint(coords.x, coords.y, false);
  },
  drawPoint(app, { ctx, coords, useStrokeCtx }) {
    if (useStrokeCtx) {
      return;
    }

    app.saveState();
    const changedPixels = app.floodFill(ctx, coords.x, coords.y, app.getCurrentColor());
    if (changedPixels === 0) {
      app.discardLastUndoState();
    }
  }
};
