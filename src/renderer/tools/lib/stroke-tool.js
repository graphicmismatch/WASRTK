// Shared body for the freehand stroke tools (pen, eraser): both draw into
// a temporary stroke layer via drawPoint/drawLine and commit it on
// release. They differ in the color passed to the brush (pen uses the
// active color, eraser always erases with an opaque color under
// destination-out) and in the commitStrokeLayer composite mode.
//
// Only pen supports the shift-click "straight line" anchor (click once,
// shift-click again to draw a straight segment from the last point,
// ctrl/cmd to angle-snap) -- eraser never calls the anchor methods, so
// that branch is opt-in via `supportsStraightLine` rather than shared
// unconditionally.
function createStrokeTool({ id, getColor, commitOptions = {}, supportsStraightLine = false }) {
  function drawStrokeSegment(app, currentCoords, lastMousePos) {
    if (lastMousePos) {
      app.drawLine(lastMousePos.x, lastMousePos.y, currentCoords.x, currentCoords.y, true);
      return;
    }

    app.drawPoint(currentCoords.x, currentCoords.y, true);
  }

  return {
    id,
    saveStateOnStart: true,
    onStart(app, { coords, modifiers }) {
      app.createStrokeLayer();

      if (supportsStraightLine) {
        const anchor = modifiers?.straightLine ? app.getPenLastDrawnPoint() : null;
        app.setPenLineAnchor(anchor);

        if (anchor) {
          const endPoint = modifiers?.snapAngle ? app.getAngleSnappedEndPoint(anchor, coords) : coords;
          app.drawLine(anchor.x, anchor.y, endPoint.x, endPoint.y, true);
          return;
        }

        app.clearPenLineAnchor();
      }

      app.drawPoint(coords.x, coords.y, true);
    },
    onDraw(app, { currentCoords, lastMousePos, modifiers }) {
      if (supportsStraightLine) {
        const anchor = modifiers?.straightLine ? app.getPenLineAnchor() : null;
        if (anchor) {
          const endPoint = modifiers?.snapAngle ? app.getAngleSnappedEndPoint(anchor, currentCoords) : currentCoords;
          app.clearStrokeLayer();
          app.drawLine(anchor.x, anchor.y, endPoint.x, endPoint.y, true);
          return;
        }
      }

      drawStrokeSegment(app, currentCoords, lastMousePos);
    },
    onStop(app, { lastMousePos, modifiers }) {
      if (supportsStraightLine) {
        const anchor = app.getPenLineAnchor();
        if (anchor && lastMousePos) {
          const endPoint = modifiers?.snapAngle ? app.getAngleSnappedEndPoint(anchor, lastMousePos) : lastMousePos;
          app.setPenLastDrawnPoint(endPoint);
        } else if (lastMousePos) {
          app.setPenLastDrawnPoint(lastMousePos);
        }

        app.clearPenLineAnchor();
      }

      app.commitStrokeLayer(commitOptions);
    },
    drawPoint(app, { ctx, coords }) {
      ctx.globalCompositeOperation = 'source-over';
      app.drawBrushStamp(ctx, coords.x, coords.y, { color: getColor(app) });
    },
    drawLine(app, { ctx, x1, y1, x2, y2 }) {
      ctx.globalCompositeOperation = 'source-over';
      app.drawBrushLine(ctx, x1, y1, x2, y2, { color: getColor(app) });
    }
  };
}

module.exports = { createStrokeTool };
