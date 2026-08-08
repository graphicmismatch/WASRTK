const { setReferenceToggleIcon } = require('../settings');

// Syncs the <img id="referenceImage"> preview + zoom controls to a newly
// loaded reference. `forceVisible` (default true) also unhides the preview
// element — callers that only refresh image content without changing
// visibility (periodic screen-share ticks) pass `forceVisible: false` so a
// hidden reference stays hidden.
function syncReferenceUI(dataUrl, scale, { forceVisible = true } = {}) {
  const uiImage = document.getElementById('referenceImage');
  uiImage.src = dataUrl;
  if (forceVisible) {
    uiImage.style.display = 'block';
  }
  uiImage.style.transform = 'scale(1)';

  const zoomSlider = document.getElementById('referenceZoom');
  zoomSlider.value = Math.round(scale * 100);
  document.getElementById('referenceZoomValue').value = Math.round(scale * 100);
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
        setReferenceToggleIcon(true);
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

      syncReferenceUI(e.target.result, api.getScale(), { forceVisible: false });

      app.updateReferencePreview();
      app.renderCurrentFrame();
      app.updateStatusBar();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(blob);
}

// Sets a freshly loaded (not merely refreshed) reference image: resets
// position/scale to defaults and always forces the reference visible,
// unlike loadReferenceFromBlob/updateReferenceImageOnly above, which
// preserve or conditionally touch visibility for their own callers
// (screen-share ticks, drag-and-drop of a new file over an existing one).
function setLoadedReferenceImage(app, api, img, dataUrl) {
  api.setImage(img);
  api.setPosition((api.getCanvasWidth() - img.width) / 2, (api.getCanvasHeight() - img.height) / 2);
  api.setScale(1.0);

  syncReferenceUI(dataUrl, api.getScale());

  api.setVisible(true);
  setReferenceToggleIcon(true);

  app.updateReferencePreview();
  app.renderCurrentFrame();
  app.updateStatusBar();
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
        setLoadedReferenceImage(app, app.getReferenceApi(), img, event.target.result);
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
  updateReferenceImageOnly,
  setLoadedReferenceImage,
  syncReferenceUI
};
