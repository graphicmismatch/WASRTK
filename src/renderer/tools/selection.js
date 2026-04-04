module.exports = {
  id: 'selection',
  saveStateOnStart: true,
  onStart(app, { coords }) {
    app.startSelectionInteraction(coords);
  },
  onDraw(app, { currentCoords }) {
    app.updateSelectionInteraction(currentCoords);
  },
  onStop(app) {
    app.finishSelectionInteraction();
  }
};
