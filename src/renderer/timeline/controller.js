function createTimelineController(impl) {
  return {
    addFrame: (...args) => impl.addFrame(...args),
    duplicateFrame: (...args) => impl.duplicateFrame(...args),
    deleteFrame: (...args) => impl.deleteFrame(...args),
    selectFrame: (...args) => impl.selectFrame(...args),
    renderCurrentFrame: (...args) => impl.renderCurrentFrame(...args),
    updateTimeline: (...args) => impl.updateTimeline(...args)
  };
}

module.exports = {
  createTimelineController
};
