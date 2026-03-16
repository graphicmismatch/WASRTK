module.exports = {
  id: 'pen',
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
    app.commitStrokeLayer();
  },
  drawPoint(app, { ctx, coords }) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = app.getCurrentColor();

    if (app.getBrushSize() === 1) {
      ctx.fillRect(coords.x, coords.y, 1, 1);
      return;
    }

    ctx.beginPath();
    ctx.arc(coords.x, coords.y, app.getBrushSize() / 2, 0, Math.PI * 2);
    ctx.fill();
  },
  drawLine(app, { ctx, x1, y1, x2, y2 }) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = app.getCurrentColor();
    ctx.lineWidth = app.getBrushSize();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
};
