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
    app.drawBrushStamp(ctx, coords.x, coords.y, { color: app.getCurrentColor() });
  },
  drawLine(app, { ctx, x1, y1, x2, y2 }) {
    ctx.globalCompositeOperation = 'source-over';
    app.drawBrushLine(ctx, x1, y1, x2, y2, { color: app.getCurrentColor() });
  }
};
