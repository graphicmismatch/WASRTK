function setPanelVisibility(element, visible) {
  element.style.display = visible ? '' : 'none';
}

function togglePanelVisibility(element) {
  const isHidden = element.style.display === 'none';
  setPanelVisibility(element, isHidden);
}

module.exports = {
  setPanelVisibility,
  togglePanelVisibility
};
