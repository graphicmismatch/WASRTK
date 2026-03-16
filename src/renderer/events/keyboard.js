function registerKeyboardEvents(onKeyDown) {
  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}

module.exports = {
  registerKeyboardEvents
};
