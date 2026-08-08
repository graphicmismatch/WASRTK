const { createStrokeTool } = require('./lib/stroke-tool');

module.exports = createStrokeTool({
  id: 'pen',
  supportsStraightLine: true,
  getColor: (app) => app.getCurrentColor()
});
