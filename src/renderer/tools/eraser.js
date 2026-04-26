module.exports = {
  id: 'eraser',
  saveStateOnStart: true,
  onStart(app, { coords }) {
    app.createStrokeLayer();
    app.drawPoint(coords.x, coords.y, true);
  },
  onDraw(app, { currentCoords, lastMousePos }) {
    if (lastMousePos) {
      app.drawLine(lastMousePos.x, lastMousePos.y, currentCoords.x, currentCoords.y, true);
      return;
    }

    app.drawPoint(currentCoords.x, currentCoords.y, true);
  },
  onStop(app) {
    app.commitStrokeLayer({
      compositeOperation: 'destination-out'
    });
  },
  drawPoint(app, { ctx, coords }) {
    ctx.globalCompositeOperation = 'source-over';
    app.drawBrushStamp(ctx, coords.x, coords.y, { color: 'rgba(0,0,0,1)' });
  },
  drawLine(app, { ctx, x1, y1, x2, y2 }) {
    ctx.globalCompositeOperation = 'source-over';
    app.drawBrushLine(ctx, x1, y1, x2, y2, { color: 'rgba(0,0,0,1)' });
  }
};
