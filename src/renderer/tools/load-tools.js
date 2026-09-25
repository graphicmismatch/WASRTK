// Every tool module, listed explicitly rather than read from this folder at runtime, so a bundler (the web
// build) can see them. A new tool file needs a line here.
const TOOL_MODULES = {
  'circle.js': require('./circle'),
  'eraser.js': require('./eraser'),
  'eyedropper.js': require('./eyedropper'),
  'fill.js': require('./fill'),
  'line.js': require('./line'),
  'pen.js': require('./pen'),
  'rectangle.js': require('./rectangle'),
  'selection.js': require('./selection')
};

function loadTools() {
  return Object.entries(TOOL_MODULES).reduce((registry, [file, tool]) => {
    if (!tool || !tool.id) {
      throw new Error(`Tool file ${file} must export an object with an id.`);
    }

    registry[tool.id] = tool;
    return registry;
  }, {});
}

module.exports = {
  loadTools
};
