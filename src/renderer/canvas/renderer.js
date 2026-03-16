function createCanvasRenderer(impl) {
  return {
    initializeCanvas: (...args) => impl.initializeCanvas(...args),
    draw: (...args) => impl.draw(...args),
    drawPoint: (...args) => impl.drawPoint(...args),
    drawLine: (...args) => impl.drawLine(...args),
    renderCurrentFrame: (...args) => impl.renderCurrentFrame(...args),
    updateZoom: (...args) => impl.updateZoom(...args)
  };
}

module.exports = {
  createCanvasRenderer
};
