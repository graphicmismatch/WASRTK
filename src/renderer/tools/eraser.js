module.exports = {
  id: 'eraser',
  saveStateOnStart: true,
  onStart(app, { coords }) {
    app.drawPoint(coords.x, coords.y, false);
  },
  onDraw(app, { currentCoords, lastMousePos }) {
    if (lastMousePos) {
      app.drawLine(lastMousePos.x, lastMousePos.y, currentCoords.x, currentCoords.y, false);
      return;
    }

    app.drawPoint(currentCoords.x, currentCoords.y, false);
  },
  drawPoint(app, { ctx, coords }) {
    ctx.globalCompositeOperation = 'destination-out';

    if (app.getBrushSize() === 1) {
      ctx.clearRect(coords.x, coords.y, 1, 1);
      return;
    }

    ctx.beginPath();
    ctx.arc(coords.x, coords.y, app.getBrushSize() / 2, 0, Math.PI * 2);
    ctx.fill();
  },
  drawLine(app, { ctx, x1, y1, x2, y2 }) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = app.getBrushSize();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
};
