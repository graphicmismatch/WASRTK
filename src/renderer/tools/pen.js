module.exports = {
  id: 'pen',
  saveStateOnStart: true,
  onStart(app, { coords, modifiers }) {
    app.createStrokeLayer();

    const anchor = modifiers?.straightLine ? app.getPenLastDrawnPoint() : null;
    app.setPenLineAnchor(anchor);

    if (anchor) {
      const endPoint = modifiers?.snapAngle ? app.getAngleSnappedEndPoint(anchor, coords) : coords;
      app.drawLine(anchor.x, anchor.y, endPoint.x, endPoint.y, true);
      return;
    }

    app.clearPenLineAnchor();
    app.drawPoint(coords.x, coords.y, true);
  },
  onDraw(app, { currentCoords, lastMousePos, modifiers }) {
    const anchor = modifiers?.straightLine ? app.getPenLineAnchor() : null;
    if (anchor) {
      const endPoint = modifiers?.snapAngle ? app.getAngleSnappedEndPoint(anchor, currentCoords) : currentCoords;
      app.clearStrokeLayer();
      app.drawLine(anchor.x, anchor.y, endPoint.x, endPoint.y, true);
      return;
    }

    if (lastMousePos) {
      app.drawLine(lastMousePos.x, lastMousePos.y, currentCoords.x, currentCoords.y, true);
      return;
    }

    app.drawPoint(currentCoords.x, currentCoords.y, true);
  },
  onStop(app, { lastMousePos, modifiers }) {
    const anchor = app.getPenLineAnchor();
    if (anchor && lastMousePos) {
      const endPoint = modifiers?.snapAngle ? app.getAngleSnappedEndPoint(anchor, lastMousePos) : lastMousePos;
      app.setPenLastDrawnPoint(endPoint);
    } else if (lastMousePos) {
      app.setPenLastDrawnPoint(lastMousePos);
    }

    app.clearPenLineAnchor();
    app.commitStrokeLayer();
  },
  drawPoint(app, { ctx, coords }) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = app.getCurrentColor();

    const isSquareBrush = app.getBrushShape() === 'square';

    if (!app.isAntialiasingEnabled()) {
      app.drawPixelPerfectBrushStamp(ctx, coords.x, coords.y, app.getBrushSize(), app.getBrushShape());
      return;
    }

    if (isSquareBrush) {
      const size = app.getBrushSize();
      const offset = size / 2;
      ctx.fillRect(coords.x - offset, coords.y - offset, size, size);
      return;
    }

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

    const isSquareBrush = app.getBrushShape() === 'square';

    if (!app.isAntialiasingEnabled()) {
      const points = app.getPixelPerfectLinePoints(x1, y1, x2, y2);

      points.forEach(({ x, y }) => {
        app.drawPixelPerfectBrushStamp(ctx, x, y, app.getBrushSize(), app.getBrushShape());
      });
      return;
    }

    if (isSquareBrush) {
      const size = app.getBrushSize();
      const offset = size / 2;
      const points = app.getInterpolatedStrokePoints(x1, y1, x2, y2, Math.max(0.5, size / 4));

      points.forEach(({ x, y }) => {
        ctx.fillRect(x - offset, y - offset, size, size);
      });
      return;
    }

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
