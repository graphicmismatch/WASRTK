function parseProjectJson(rawData) {
  let jsonString = rawData;

  if (jsonString.charCodeAt(0) === 0xFEFF) {
    jsonString = jsonString.slice(1);
  }

  return JSON.parse(jsonString.trim());
}

function validateProjectData(projectData) {
  if (!projectData.frames || !projectData.layers || !projectData.settings) {
    throw new Error('Invalid project file format. Missing required fields: frames, layers, or settings.');
  }
}

function buildProjectData({
  frames,
  layers,
  canvas,
  settings,
  metadata = {
    author: 'WASRTK',
    description: 'WASRTK pixel art and animation project'
  }
}) {
  const now = new Date().toISOString();

  return {
    name: 'WASRTK Project',
    version: '1.0.0',
    canvas,
    frames: frames.map((frame) => ({
      id: frame.id,
      name: frame.name,
      timestamp: frame.timestamp,
      layers: frame.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        locked: layer.locked,
        data: layer.canvas.toDataURL('image/png')
      }))
    })),
    layers: layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      locked: layer.locked
    })),
    settings,
    metadata: {
      created: now,
      modified: now,
      ...metadata
    }
  };
}

function serializeProjectData(projectData) {
  const json = JSON.stringify(projectData, null, 2);
  JSON.parse(json);
  return json;
}

async function buildFramesFromProject({
  projectData,
  width,
  height,
  createCanvas,
  loadImageToCanvas,
  applyImageSmoothing,
  fillFallbackLayer
}) {
  const builtFrames = [];

  for (const frameData of projectData.frames) {
    const frame = {
      id: frameData.id,
      name: frameData.name,
      timestamp: frameData.timestamp,
      layers: []
    };

    for (const layerData of frameData.layers) {
      const canvas = createCanvas(width, height);

      if (layerData.data) {
        try {
          await loadImageToCanvas(canvas, layerData.data);
        } catch (_imageError) {
          fillFallbackLayer(canvas);
        }
      } else {
        fillFallbackLayer(canvas);
      }

      applyImageSmoothing(canvas.getContext('2d'));

      frame.layers.push({
        id: layerData.id,
        name: layerData.name,
        visible: layerData.visible,
        locked: layerData.locked,
        canvas
      });
    }

    builtFrames.push(frame);
  }

  return builtFrames;
}

function normalizeProjectSettings(settings = {}) {
  return {
    fps: settings.fps || 12,
    onionSkinningEnabled: settings.onionSkinningEnabled || false,
    onionSkinningRange: settings.onionSkinningRange || 3,
    referenceOpacity: settings.referenceOpacity || 0.5,
    referenceVisible: settings.referenceVisible || false,
    antialiasingEnabled: settings.antialiasingEnabled !== undefined ? settings.antialiasingEnabled : true,
    currentTool: settings.currentTool || 'pen',
    currentColor: settings.currentColor || '#000000',
    currentOpacity: settings.currentOpacity || 1.0,
    brushSize: settings.brushSize || 1,
    brushShape: settings.brushShape || 'circle',
    brushPreset: settings.brushPreset || 'hard-round',
    brushFlow: Number.isFinite(settings.brushFlow) ? settings.brushFlow : 1,
    brushSpacing: Number.isFinite(settings.brushSpacing) ? settings.brushSpacing : 0.25,
    fillTolerance: Number.isFinite(settings.fillTolerance) ? settings.fillTolerance : 0,
    fillContiguous: settings.fillContiguous !== undefined ? settings.fillContiguous : true,
    fillSampleAllLayers: settings.fillSampleAllLayers || false,
    zoom: settings.zoom || 1
  };
}

module.exports = {
  parseProjectJson,
  validateProjectData,
  buildProjectData,
  serializeProjectData,
  buildFramesFromProject,
  normalizeProjectSettings
};
