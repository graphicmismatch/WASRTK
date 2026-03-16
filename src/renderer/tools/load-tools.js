const fs = require('fs');
const path = require('path');

function loadTools() {
  const toolsDir = __dirname;
  const toolFiles = fs
    .readdirSync(toolsDir)
    .filter((file) => file.endsWith('.js') && file !== 'index.js' && file !== 'load-tools.js');

  return toolFiles.reduce((registry, file) => {
    const tool = require(path.join(toolsDir, file));
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
