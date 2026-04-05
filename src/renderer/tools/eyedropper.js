module.exports = {
  id: 'eyedropper',
  onStart(app, { coords }) {
    app.pickColorAt(coords.x, coords.y);
  },
  onDraw(app, { currentCoords }) {
    app.pickColorAt(currentCoords.x, currentCoords.y);
  },
  onStop() {}
};
