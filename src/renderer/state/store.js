function createInitialRendererState() {
  return {
    currentTool: 'pen',
    currentColor: '#000000',
    currentOpacity: 1,
    brushSize: 1,
    currentFrame: 0,
    currentLayer: 0,
    isAnimating: false,
    fps: 12,
    onionSkinningEnabled: false,
    onionSkinningRange: 3,
    zoom: 1,
    antialiasingEnabled: true,
    fillTolerance: 0,
    hasTransparentBackground: false
  };
}

module.exports = {
  createInitialRendererState
};
