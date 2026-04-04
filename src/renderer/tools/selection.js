module.exports = {
  id: 'selection',
  saveStateOnStart: true,
  onStart(app, { coords }) {
    app.startSelectionInteraction(coords);
  },
  onDraw(app, { currentCoords, modifiers }) {
    app.updateSelectionInteraction(currentCoords, modifiers);
  },
  onStop(app) {
    app.finishSelectionInteraction();
  }
};
