const { ipcRenderer } = require('electron');

function startScreenShare(app, api) {
  if (app.screenCaptureInterval) {
    app.stopScreenShare();
    app.clearReferenceImage();
  } else if (api.getImage()) {
    app.clearReferenceImage();
  }

  ipcRenderer
    .invoke('get-screen-sources')
    .then((sources) => {
      if (sources.length === 0) {
        alert('No screen sources found. Please check your system permissions.');
        return;
      }
      showScreenShareModal(app, sources);
    })
    .catch((err) => {
      console.error('Error getting screen sources:', err);
      tryFallbackScreenCapture(app);
    });
}

function tryFallbackScreenCapture(app) {
  ipcRenderer
    .invoke('get-screen-sources-fallback')
    .then((sources) => {
      if (sources.length > 0) {
        showScreenShareModal(app, sources);
      } else {
        alert(
          'Screen capture is not available. Please check your system permissions and try again.'
        );
      }
    })
    .catch((err) => {
      console.error('Fallback also failed:', err);
      alert('Screen capture is not supported on this system or requires additional permissions.');
    });
}

function showScreenShareModal(app, sources) {
  const modal = document.createElement('div');
  modal.className = 'modal show';
  modal.id = 'screenShareModal';
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content screen-share-modal';
  const title = document.createElement('h2');
  title.textContent = 'Select Screen or Window';
  const sourcesContainer = document.createElement('div');
  sourcesContainer.className = 'screen-sources';
  sources.forEach((source) => {
    const sourceItem = document.createElement('div');
    sourceItem.className = 'screen-source-item';
    sourceItem.innerHTML = `\n      <img src="${source.thumbnail}" alt="${source.name}" class="source-thumbnail">\n      <div class="source-info">\n        <span class="source-name">${source.name}</span>\n        <span class="source-type">${source.id.includes('screen') ? 'Screen' : 'Window'}</span>\n      </div>\n    `;
    sourceItem.addEventListener('click', () => {
      selectScreenSource(app, source);
      hideScreenShareModal(app);
    });
    sourcesContainer.appendChild(sourceItem);
  });
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => hideScreenShareModal(app));
  modalContent.appendChild(title);
  modalContent.appendChild(sourcesContainer);
  modalContent.appendChild(cancelBtn);
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
}

function hideScreenShareModal(app) {
  const modal = document.getElementById('screenShareModal');
  if (modal) modal.remove();
  if (!app.screenCaptureInterval) {
    document.getElementById('screenShareBtn').innerHTML = '<i class="fas fa-desktop"></i>';
    document.getElementById('screenShareBtn').title = 'Share Screen/Window';
    document.getElementById('screenShareBtn').classList.remove('active');
  }
}

function selectScreenSource(app, source) {
  navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          minWidth: 800,
          maxWidth: 1920,
          minHeight: 600,
          maxHeight: 1080,
        },
      },
    })
    .then((stream) => {
      setupScreenShareStream(app, stream, source.name);
    })
    .catch((err) => {
      console.error('Error accessing screen:', err);
      tryAlternativeScreenCapture(app, source);
    });
}

function tryAlternativeScreenCapture(app, source) {
  navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: source.id } },
    })
    .then((stream) => {
      setupScreenShareStream(app, stream, source.name);
    })
    .catch((err) => {
      console.error('Alternative capture also failed:', err);
      alert('Screen capture failed. Please check your system permissions and try again.');
    });
}

function setupScreenShareStream(app, stream, sourceName) {
  const video = document.createElement('video');
  video.srcObject = stream;
  video.autoplay = true;
  video.muted = true;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  video.onloadedmetadata = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    startFrameCapture(app, video, canvas, ctx, sourceName);
  };
  video.onerror = (err) => {
    console.error('Video error:', err);
    alert('Error setting up video stream. Please try again.');
  };
}

function startFrameCapture(app, video, canvas, ctx, sourceName) {
  const captureInterval = setInterval(() => {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      try {
        ctx.drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) return;
          if (!app.getReferenceApi().getImage()) {
            app.getReferenceApi().setVisible(true);
            document.getElementById('toggleReferenceBtn').innerHTML =
              '<i class="fas fa-eye-slash"></i>';
          }
          if (
            app.getReferenceApi().isVisible() &&
            (!app.getReferenceApi().getImage() || !app.getReferenceApi().getUserModified())
          ) {
            app.loadReferenceFromBlob(blob, sourceName);
          } else if (
            app.getReferenceApi().isVisible() &&
            app.getReferenceApi().getImage() &&
            app.getReferenceApi().getUserModified()
          ) {
            app.updateReferenceImageOnly(blob);
          }
        }, 'image/png');
      } catch (err) {
        console.error('Frame capture error:', err);
      }
    }
  }, 200);

  app.screenCaptureInterval = captureInterval;
  document.getElementById('screenShareBtn').innerHTML = '<i class="fas fa-stop"></i>';
  document.getElementById('screenShareBtn').title = 'Stop Screen Share';
  document.getElementById('screenShareBtn').classList.add('active');
  document.getElementById('screenShareBtn').onclick = () => stopScreenShare(app);
}

function stopScreenShare(app) {
  if (app.screenCaptureInterval) {
    clearInterval(app.screenCaptureInterval);
    app.screenCaptureInterval = null;
  }
  document.getElementById('screenShareBtn').innerHTML = '<i class="fas fa-desktop"></i>';
  document.getElementById('screenShareBtn').title = 'Share Screen/Window';
  document.getElementById('screenShareBtn').classList.remove('active');
}

module.exports = {
  hideScreenShareModal,
  selectScreenSource,
  setupScreenShareStream,
  showScreenShareModal,
  startFrameCapture,
  startScreenShare,
  stopScreenShare,
  tryAlternativeScreenCapture,
  tryFallbackScreenCapture,
};
