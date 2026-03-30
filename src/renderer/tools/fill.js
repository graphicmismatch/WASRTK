module.exports = {
  id: 'fill',
  saveStateOnStart: true,
  onStart(app, { coords }) {
    app.drawPoint(coords.x, coords.y, false);
  },
  drawPoint(app, { ctx, coords, useStrokeCtx }) {
    if (!useStrokeCtx) {
      app.floodFill(ctx, coords.x, coords.y, app.getCurrentColor());
    }
  },
};
