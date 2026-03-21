
function repositionReferenceFromPreview(event, app, api) {
  const image = api.getImage();
  const previewImage = document.getElementById('referenceImage');
  if (!image || !api.isVisible() || previewImage.style.display === 'none') return;

  const rect = previewImage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const clickX = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
  const clickY = Math.max(0, Math.min(event.clientY - rect.top, rect.height));

  const imagePointX = (clickX / rect.width) * image.width;
  const imagePointY = (clickY / rect.height) * image.height;
  const scale = api.getScale();

  api.setPosition(
    (api.getCanvasWidth() / 2) - (imagePointX * scale),
    (api.getCanvasHeight() / 2) - (imagePointY * scale)
  );
  api.setUserModified(true);
  app.updateReferencePreview();
  app.renderCurrentFrame();
}

function updateViewportIndicator(api, previewImage) {
  const indicator = document.getElementById('referenceViewportIndicator');
  const image = api.getImage();
  if (!indicator || !image || !api.isVisible() || previewImage.style.display === 'none') {
    if (indicator) indicator.style.display = 'none';
    return;
  }

  const containerRect = document.getElementById('referenceScrollContainer').getBoundingClientRect();
  const imageRect = previewImage.getBoundingClientRect();
  if (!containerRect.width || !containerRect.height || !imageRect.width || !imageRect.height) {
    indicator.style.display = 'none';
    return;
  }

  const scale = api.getScale();
  if (!scale) {
    indicator.style.display = 'none';
    return;
  }

  const imageLeft = api.getX();
  const imageTop = api.getY();
  const imageRight = imageLeft + (image.width * scale);
  const imageBottom = imageTop + (image.height * scale);
  const canvasLeft = 0;
  const canvasTop = 0;
  const canvasRight = api.getCanvasWidth();
  const canvasBottom = api.getCanvasHeight();

  const visibleLeft = Math.max(canvasLeft, imageLeft);
  const visibleTop = Math.max(canvasTop, imageTop);
  const visibleRight = Math.min(canvasRight, imageRight);
  const visibleBottom = Math.min(canvasBottom, imageBottom);

  if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) {
    indicator.style.display = 'none';
    return;
  }

  const imageDisplayLeft = imageRect.left - containerRect.left;
  const imageDisplayTop = imageRect.top - containerRect.top;
  const rawLeft = imageDisplayLeft + (((visibleLeft - imageLeft) / (image.width * scale)) * imageRect.width);
  const rawTop = imageDisplayTop + (((visibleTop - imageTop) / (image.height * scale)) * imageRect.height);
  const rawRight = rawLeft + (((visibleRight - visibleLeft) / (image.width * scale)) * imageRect.width);
  const rawBottom = rawTop + (((visibleBottom - visibleTop) / (image.height * scale)) * imageRect.height);

  const clampedLeft = Math.max(0, Math.min(rawLeft, containerRect.width));
  const clampedTop = Math.max(0, Math.min(rawTop, containerRect.height));
  const clampedRight = Math.max(0, Math.min(rawRight, containerRect.width));
  const clampedBottom = Math.max(0, Math.min(rawBottom, containerRect.height));

  if (clampedRight <= clampedLeft || clampedBottom <= clampedTop) {
    indicator.style.display = 'none';
    return;
  }

  indicator.style.display = 'block';
  indicator.style.left = `${clampedLeft}px`;
  indicator.style.top = `${clampedTop}px`;
  indicator.style.width = `${Math.max(clampedRight - clampedLeft, 2)}px`;
  indicator.style.height = `${Math.max(clampedBottom - clampedTop, 2)}px`;
}

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
  document.getElementById('referenceScrollContainer').addEventListener('click', (e) => {
    repositionReferenceFromPreview(e, app, api);
  });
}

function toggleReference(app, api) {
  api.setVisible(!api.isVisible());
  document.getElementById('toggleReferenceBtn').innerHTML = api.isVisible()
    ? '<i class="fas fa-eye-slash"></i>'
    : '<i class="fas fa-eye"></i>';
  app.updateReferencePreview();
  app.renderCurrentFrame();
  app.updateStatusBar();
}

function resetReferencePosition(app, api, canvas) {
  const image = api.getImage();
  if (!image) return;

  const scaledWidth = image.width * api.getScale();
  const scaledHeight = image.height * api.getScale();

  api.setPosition((canvas.width - scaledWidth) / 2, (canvas.height - scaledHeight) / 2);
  api.setUserModified(true);
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
  document.getElementById('referenceViewportIndicator').style.display = 'none';

  const zoomSlider = document.getElementById('referenceZoom');
  zoomSlider.value = 100;
  document.getElementById('referenceZoomValue').textContent = '100%';

  document.getElementById('toggleReferenceBtn').innerHTML = '<i class="fas fa-eye"></i>';

  app.renderCurrentFrame();
  app.updateStatusBar();
}

function updateReferencePreview(api) {
  const uiImage = document.getElementById('referenceImage');
  const indicator = document.getElementById('referenceViewportIndicator');
  const image = api.getImage();
  if (!image || !api.isVisible()) {
    if (indicator) indicator.style.display = 'none';
    return;
  }

  const zoomPercentage = Math.round(api.getScale() * 100);
  const zoomSlider = document.getElementById('referenceZoom');

  zoomSlider.value = zoomPercentage;
  document.getElementById('referenceZoomValue').textContent = `${zoomPercentage}%`;
  uiImage.style.transform = `scale(${api.getScale()})`;
  uiImage.style.maxWidth = '100%';
  uiImage.style.maxHeight = '100%';
  uiImage.style.objectFit = 'contain';

  updateViewportIndicator(api, uiImage);
}

module.exports = {
  bindReferenceSettingsEvents,
  toggleReference,
  resetReferencePosition,
  clearReferenceImage,
  updateReferencePreview
};
