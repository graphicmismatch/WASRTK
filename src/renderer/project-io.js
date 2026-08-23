const { clampNumber } = require('./math-utils');
const { BRUSH_PRESETS, SELECTION_MODES, BLEND_MODES, ZOOM_MIN, ZOOM_MAX } = require('./constants');

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

// Shared by both layer lists below (frame.layers and the top-level
// metadata layers) -- group-only fields (collapsed, memberCount) are only
// included for group entries, keeping plain-layer JSON unchanged from
// before groups existed.
function serializeLayerGroupFields(layer) {
  const type = layer.type === 'group' ? 'group' : 'layer';
  if (type !== 'group') return { type };
  return { type, collapsed: layer.collapsed || false, memberCount: layer.memberCount || 0 };
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
        ...serializeLayerGroupFields(layer),
        visible: layer.visible,
        locked: layer.locked,
        opacity: layer.opacity ?? 1,
        blendMode: layer.blendMode || 'source-over',
        alphaLocked: layer.alphaLocked || false,
        clipToBelow: layer.clipToBelow || false,
        data: layer.canvas.toDataURL('image/png')
      }))
    })),
    layers: layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      ...serializeLayerGroupFields(layer),
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity ?? 1,
      blendMode: layer.blendMode || 'source-over',
      alphaLocked: layer.alphaLocked || false,
      clipToBelow: layer.clipToBelow || false
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
        type: layerData.type === 'group' ? 'group' : 'layer',
        visible: layerData.visible,
        locked: layerData.locked,
        opacity: clampNumber(layerData.opacity, 1, 0, 1),
        blendMode: BLEND_MODES.some((mode) => mode.value === layerData.blendMode) ? layerData.blendMode : 'source-over',
        alphaLocked: layerData.alphaLocked || false,
        clipToBelow: layerData.clipToBelow || false,
        ...(layerData.type === 'group'
          ? { collapsed: layerData.collapsed || false, memberCount: Math.max(0, Math.round(Number(layerData.memberCount) || 0)) }
          : {}),
        canvas
      });
    }

    builtFrames.push(frame);
  }

  return builtFrames;
}

function normalizeProjectSettings(settings = {}) {
  return {
    fps: Math.round(clampNumber(settings.fps, 12, 1, 60)),
    onionSkinningEnabled: settings.onionSkinningEnabled || false,
    onionSkinningRange: Math.round(clampNumber(settings.onionSkinningRange, 3, 1, 10)),
    referenceOpacity: clampNumber(settings.referenceOpacity, 0.5, 0, 1),
    referenceVisible: settings.referenceVisible || false,
    antialiasingEnabled: settings.antialiasingEnabled !== undefined ? settings.antialiasingEnabled : true,
    currentTool: settings.currentTool || 'pen',
    currentColor: settings.currentColor || '#000000',
    currentOpacity: clampNumber(settings.currentOpacity, 1, 0, 1),
    brushSize: Math.round(clampNumber(settings.brushSize, 1, 1, 100)),
    brushShape: settings.brushShape === 'square' ? 'square' : 'circle',
    brushPreset: BRUSH_PRESETS.includes(settings.brushPreset) ? settings.brushPreset : 'hard-round',
    brushFlow: clampNumber(settings.brushFlow, 1, 0.01, 1),
    brushSpacing: clampNumber(settings.brushSpacing, 0.25, 0.01, 1),
    pressureSensitivityEnabled: settings.pressureSensitivityEnabled !== undefined ? settings.pressureSensitivityEnabled : true,
    pressureAffectsSize: settings.pressureAffectsSize !== undefined ? settings.pressureAffectsSize : true,
    pressureAffectsFlow: settings.pressureAffectsFlow !== undefined ? settings.pressureAffectsFlow : true,
    selectionMode: SELECTION_MODES.includes(settings.selectionMode) ? settings.selectionMode : 'rectangle',
    selectionAntialias: settings.selectionAntialias !== undefined ? settings.selectionAntialias : true,
    selectionFeather: Math.round(clampNumber(settings.selectionFeather, 0, 0, 10)),
    fillTolerance: Math.round(clampNumber(settings.fillTolerance, 0, 0, 255)),
    fillContiguous: settings.fillContiguous !== undefined ? settings.fillContiguous : true,
    fillSampleAllLayers: settings.fillSampleAllLayers || false,
    zoom: clampNumber(settings.zoom, 1, ZOOM_MIN, ZOOM_MAX)
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
