function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

// Snaps a 1D dragged position (e.g. a selection's x or y) to the nearest of
// three landmarks along a `canvasSize`-long axis: the start edge (0), the
// end edge (canvasSize - size, so the dragged thing's far edge lands on
// canvasSize), and centered ((canvasSize - size) / 2). Returns the
// (possibly snapped) value plus, when snapped, the on-canvas position a
// caller would draw a smart-guide line at -- which is *not* the same as
// the snapped value for the end-edge and center cases (the guide marks the
// landmark itself: 0, canvasSize, or canvasSize / 2 -- not the dragged
// thing's top-left position once aligned to it).
function snapToAxisTargets(value, size, canvasSize, threshold) {
  const candidates = [
    { position: 0, guideLine: 0 },
    { position: canvasSize - size, guideLine: canvasSize },
    { position: (canvasSize - size) / 2, guideLine: canvasSize / 2 }
  ];

  for (const candidate of candidates) {
    if (Math.abs(value - candidate.position) <= threshold) {
      return { value: candidate.position, snapped: true, guideLine: candidate.guideLine };
    }
  }

  return { value, snapped: false, guideLine: null };
}

module.exports = {
  clampNumber,
  snapToAxisTargets
};
