function syncReferenceUI(dataUrl, scale) {
  const uiImage = document.getElementById('referenceImage');
  uiImage.src = dataUrl;
  uiImage.style.display = 'block';
  uiImage.style.transform = 'scale(1)';

  const zoomSlider = document.getElementById('referenceZoom');
  zoomSlider.value = Math.round(scale * 100);
  document.getElementById('referenceZoomValue').textContent = `${Math.round(scale * 100)}%`;
}

function loadReferenceFromBlob(app, api, blob, sourceName) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      api.setImage(img);
      api.setPosition((api.getCanvasWidth() - img.width) / 2, (api.getCanvasHeight() - img.height) / 2);
      api.setScale(1.0);

      syncReferenceUI(e.target.result, api.getScale());

      if (!api.isVisible()) {
        api.setVisible(true);
        document.getElementById('toggleReferenceBtn').innerHTML = '<i class="fas fa-eye-slash"></i>';
      }

      app.updateReferencePreview();
      app.renderCurrentFrame();
      app.updateStatusBar();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(blob);
}

function updateReferenceImageOnly(app, api, blob) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const currentX = api.getX();
      const currentY = api.getY();
      const currentScale = api.getScale();
      const currentVisible = api.isVisible();

      api.setImage(img);
      api.setPosition(currentX, currentY);
      api.setScale(currentScale);
      api.setVisible(currentVisible);

      const uiImage = document.getElementById('referenceImage');
      uiImage.src = e.target.result;
      uiImage.style.transform = 'scale(1)';

      const zoomSlider = document.getElementById('referenceZoom');
      zoomSlider.value = Math.round(api.getScale() * 100);
      document.getElementById('referenceZoomValue').textContent = `${Math.round(api.getScale() * 100)}%`;

      app.updateReferencePreview();
      app.renderCurrentFrame();
      app.updateStatusBar();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(blob);
}

function loadReferenceImage(app) {
  if (app.hasReferenceSource()) {
    app.clearReferenceImage();
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        app.setLoadedReferenceImage(img, event.target.result);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

module.exports = {
  loadReferenceImage,
  loadReferenceFromBlob,
  updateReferenceImageOnly
};
