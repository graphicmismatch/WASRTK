// Shared renderer constants that would otherwise be re-declared in multiple
// modules (project-io.js's validation vs. the UI/behavior code that owns
// each setting).

const BRUSH_PRESETS = ['hard-round', 'soft-round', 'pixel', 'textured'];

const SELECTION_MODES = ['rectangle', 'magic-wand', 'lasso', 'polygon'];

// 10%-2000% zoom range, expressed as a canvas-scale multiplier (1 = 100%).
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 20;

module.exports = {
  BRUSH_PRESETS,
  SELECTION_MODES,
  ZOOM_MIN,
  ZOOM_MAX
};
