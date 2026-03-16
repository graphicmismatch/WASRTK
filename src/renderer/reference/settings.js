function bindReferenceSettingsEvents(app, api) {
  document.getElementById('toggleReferenceBtn').addEventListener('click', () => app.toggleReference());
  document.getElementById('resetReferenceBtn').addEventListener('click', () => {
    if (api.getImage() && api.isVisible()) {
      app.resetReferencePosition();
    }
  });
  document.getElementById('clearReferenceBtn').addEventListener('click', () => app.clearReferenceImage());
  document.getElementById('referenceOpacity').addEventListener('input', (e) => {
    api.setOpacity(parseInt(e.target.value, 10) / 100);
    document.getElementById('referenceOpacityValue').textContent = `${e.target.value}%`;
    app.renderCurrentFrame();
  });
  document.getElementById('referenceZoom').addEventListener('input', (e) => {
    const zoomPercentage = parseInt(e.target.value, 10);
    api.setScale(zoomPercentage / 100);
    api.setUserModified(true);
    document.getElementById('referenceZoomValue').textContent = `${zoomPercentage}%`;
    app.updateReferencePreview();
    app.renderCurrentFrame();
  });
}

function toggleReference(app, api) {
  api.setVisible(!api.isVisible());
  document.getElementById('toggleReferenceBtn').innerHTML = api.isVisible()
    ? '<i class="fas fa-eye-slash"></i>'
    : '<i class="fas fa-eye"></i>';
  app.renderCurrentFrame();
  app.updateStatusBar();
}

function resetReferencePosition(app, api, canvas) {
  const image = api.getImage();
  if (!image) return;

  api.setPosition((canvas.width - image.width) / 2, (canvas.height - image.height) / 2);
  api.setScale(1.0);
  api.setUserModified(false);
  app.updateReferencePreview();
  app.renderCurrentFrame();
}

function clearReferenceImage(app, api) {
  if (app.screenCaptureInterval) {
    app.stopScreenShare();
  }

  api.clear();

  const uiImage = document.getElementById('referenceImage');
  uiImage.src = '';
  uiImage.style.display = 'none';
  uiImage.style.transform = 'scale(1)';

  const zoomSlider = document.getElementById('referenceZoom');
  zoomSlider.value = 100;
  document.getElementById('referenceZoomValue').textContent = '100%';

  document.getElementById('toggleReferenceBtn').innerHTML = '<i class="fas fa-eye"></i>';

  app.renderCurrentFrame();
  app.updateStatusBar();
}

function updateReferencePreview(api) {
  const image = api.getImage();
  if (!image) return;

  const uiImage = document.getElementById('referenceImage');
  const zoomPercentage = Math.round(api.getScale() * 100);
  const zoomSlider = document.getElementById('referenceZoom');

  zoomSlider.value = zoomPercentage;
  document.getElementById('referenceZoomValue').textContent = `${zoomPercentage}%`;
  uiImage.style.transform = `scale(${api.getScale()})`;
  uiImage.style.maxWidth = '100%';
  uiImage.style.maxHeight = '100%';
  uiImage.style.objectFit = 'contain';
}

module.exports = {
  bindReferenceSettingsEvents,
  toggleReference,
  resetReferencePosition,
  clearReferenceImage,
  updateReferencePreview
};
