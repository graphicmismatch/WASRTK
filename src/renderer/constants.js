// Shared renderer constants that would otherwise be re-declared in multiple
// modules (project-io.js's validation vs. the UI/behavior code that owns
// each setting).

const BRUSH_PRESETS = ['hard-round', 'soft-round', 'pixel', 'textured'];

const SELECTION_MODES = ['rectangle', 'magic-wand', 'lasso', 'polygon'];

// Layer blend modes. `value` is used directly as ctx.globalCompositeOperation
// (native canvas 2D compositing -- no custom blend math needed); 'source-over'
// doubles as both the "Normal" blend and the canvas default.
const BLEND_MODES = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Color' },
  { value: 'luminosity', label: 'Luminosity' }
];

// 10%-2000% zoom range, expressed as a canvas-scale multiplier (1 = 100%).
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 20;

module.exports = {
  BRUSH_PRESETS,
  SELECTION_MODES,
  BLEND_MODES,
  ZOOM_MIN,
  ZOOM_MAX
};
