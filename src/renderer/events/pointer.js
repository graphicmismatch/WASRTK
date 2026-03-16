function registerPointerEvents(target, handlers) {
  target.addEventListener('mousedown', handlers.onMouseDown);
  target.addEventListener('mousemove', handlers.onMouseMove);
  target.addEventListener('mouseup', handlers.onMouseUp);
  target.addEventListener('mouseleave', handlers.onMouseLeave);

  return () => {
    target.removeEventListener('mousedown', handlers.onMouseDown);
    target.removeEventListener('mousemove', handlers.onMouseMove);
    target.removeEventListener('mouseup', handlers.onMouseUp);
    target.removeEventListener('mouseleave', handlers.onMouseLeave);
  };
}

module.exports = {
  registerPointerEvents
};
