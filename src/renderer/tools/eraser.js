const { createStrokeTool } = require('./lib/stroke-tool');

module.exports = createStrokeTool({
  id: 'eraser',
  getColor: () => 'rgba(0,0,0,1)',
  commitOptions: { compositeOperation: 'destination-out' }
});
