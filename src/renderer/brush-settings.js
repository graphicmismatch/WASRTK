const { rgbToHex } = require('./color-utils');
const { clampNumber } = require('./math-utils');
const { BRUSH_PRESETS } = require('./constants');

// Color/brush settings and their live cursor-overlay UI, moved verbatim
// from wasrtk.js: the brush size/shape/preset/flow/spacing/opacity
// setters, the two cursor-lens overlays they keep in sync (the canvas
// brush-size preview and the eyedropper zoom-pick lens), pressure-adjusted
// size/flow helpers, and the brush swatch preview canvas. These were kept
// together (rather than split into separate settings vs. UI modules)
// because the setters call straight into the UI refreshers they affect
// (setBrushSize -> updateBrushPreview/refreshBrushPreviewFromCursor).
//
// This factory takes the live WASRTK instance directly (not a pure
// accessor object), same as canvas-engine.js and event-bindings.js --
// `app` covers every cross-module call (updateStatusBar,
// applyImageSmoothing, screenToCanvas, drawBrushStamp, `app.canvasWrapper`).
// `env` is reserved for raw wasrtk.js module globals with no owning
// module yet, built once in the WASRTK constructor:
//   getCurrentColor/setCurrentColor
//   getCurrentTool
//   getBrushSize/setBrushSize, getBrushShape/setBrushShape,
//   getBrushPreset/setBrushPreset, getBrushFlow/setBrushFlow,
//   setBrushSpacing
//   getCurrentOpacity/setCurrentOpacity
//   getPressureSensitivityEnabled, getPressureAffectsSize,
//   getPressureAffectsFlow, getCurrentInputPressure
//   getZoom
//   getStrokeCanvas  -- a getter, not a captured reference: createStrokeLayer/
//                       commitStrokeLayer/clearStrokeLayer (still directly
//                       on WASRTK) reassign strokeCanvas outright
//   mainCanvas, mainCtx, overlayCanvas, overlayCtx
function createBrushSettings(app, env) {
    function setColor(color) {
        env.setCurrentColor(color);
        updateBrushPreview();
        app.updateStatusBar();

        // Update canvas brush preview if currently visible
        const brushPreview = document.getElementById('canvasBrushPreview');
        if (brushPreview.style.display !== 'none' && env.getCurrentTool() === 'pen') {
            brushPreview.style.backgroundColor = env.getCurrentColor();
            brushPreview.style.borderColor = env.getCurrentColor();
        }
    }

    function getColorAtCanvasPosition(x, y) {
        const sampleX = clampNumber(Math.round(x), 0, 0, env.mainCanvas.width - 1);
        const sampleY = clampNumber(Math.round(y), 0, 0, env.mainCanvas.height - 1);
        const pixel = env.mainCtx.getImageData(sampleX, sampleY, 1, 1).data;
        return rgbToHex(pixel[0], pixel[1], pixel[2]);
    }

    function pickColorAt(x, y) {
        const pickedColor = getColorAtCanvasPosition(x, y);
        setColor(pickedColor);
        document.getElementById('colorPicker').value = pickedColor;
        return pickedColor;
    }

    function updateEyedropperZoomPreview(e) {
        if (env.getCurrentTool() !== 'eyedropper') {
            hideEyedropperZoomPreview();
            return;
        }

        const lens = document.getElementById('eyedropperZoomLens');
        const zoomCanvas = document.getElementById('eyedropperZoomCanvas');
        const zoomLabel = document.getElementById('eyedropperZoomLabel');
        if (!lens || !zoomCanvas || !zoomLabel) {
            return;
        }

        const coords = app.screenToCanvas(e.clientX, e.clientY);
        const liveHoverColor = getColorAtCanvasPosition(coords.x, coords.y);
        const zoomCtx = zoomCanvas.getContext('2d');
        const sampleSize = 11;
        const halfSize = Math.floor(sampleSize / 2);
        const sampleX = clampNumber(Math.round(coords.x) - halfSize, 0, 0, env.mainCanvas.width - sampleSize);
        const sampleY = clampNumber(Math.round(coords.y) - halfSize, 0, 0, env.mainCanvas.height - sampleSize);

        zoomCtx.save();
        zoomCtx.imageSmoothingEnabled = false;
        zoomCtx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
        zoomCtx.drawImage(env.mainCanvas, sampleX, sampleY, sampleSize, sampleSize, 0, 0, zoomCanvas.width, zoomCanvas.height);

        const center = zoomCanvas.width / 2;
        zoomCtx.strokeStyle = '#ff3366';
        zoomCtx.lineWidth = 1;
        zoomCtx.beginPath();
        zoomCtx.moveTo(center, 0);
        zoomCtx.lineTo(center, zoomCanvas.height);
        zoomCtx.moveTo(0, center);
        zoomCtx.lineTo(zoomCanvas.width, center);
        zoomCtx.stroke();
        zoomCtx.restore();

        const wrapperRect = app.canvasWrapper.getBoundingClientRect();
        const lensOffsetX = 20;
        const lensOffsetY = 20;
        let left = e.clientX - wrapperRect.left + lensOffsetX;
        let top = e.clientY - wrapperRect.top + lensOffsetY;
        const maxLeft = wrapperRect.width - lens.offsetWidth - 4;
        const maxTop = wrapperRect.height - lens.offsetHeight - 4;
        left = clampNumber(left, 4, 4, maxLeft);
        top = clampNumber(top, 4, 4, maxTop);

        lens.style.left = `${left}px`;
        lens.style.top = `${top}px`;
        lens.hidden = false;
        zoomLabel.textContent = liveHoverColor;
    }

    function hideEyedropperZoomPreview() {
        const lens = document.getElementById('eyedropperZoomLens');
        if (lens) {
            lens.hidden = true;
        }
    }

    // Re-dispatches a synthetic mousemove at the canvas brush preview's
    // current position so it redraws with up-to-date brush settings, but
    // only while it is actually visible over the canvas.
    function refreshBrushPreviewFromCursor() {
        const brushPreview = document.getElementById('canvasBrushPreview');
        if (brushPreview.style.display !== 'none' && (env.getCurrentTool() === 'pen' || env.getCurrentTool() === 'eraser')) {
            const event = new MouseEvent('mousemove', {
                clientX: parseInt(brushPreview.style.left) || 0,
                clientY: parseInt(brushPreview.style.top) || 0
            });
            env.mainCanvas.dispatchEvent(event);
        }
    }

    // `silent` skips the preview/status-bar/cursor refresh -- used by
    // loadProject, which already performs an equivalent refresh once for
    // the whole loaded project instead of once per setting.
    function setBrushSize(size, { silent = false } = {}) {
        env.setBrushSize(size);
        document.getElementById('brushSizeValue').textContent = size + 'px';
        if (silent) {
            return;
        }
        updateBrushPreview();
        app.updateStatusBar();
        refreshBrushPreviewFromCursor();
    }

    function setBrushShape(shape, { silent = false } = {}) {
        env.setBrushShape(shape === 'square' ? 'square' : 'circle');
        document.getElementById('brushShapeSelect').value = env.getBrushShape();
        if (silent) {
            return;
        }
        updateBrushPreview();
        refreshBrushPreviewFromCursor();
    }

    function setBrushPreset(preset, { silent = false } = {}) {
        env.setBrushPreset(BRUSH_PRESETS.includes(preset) ? preset : 'hard-round');
        document.getElementById('brushPresetSelect').value = env.getBrushPreset();
        if (silent) {
            return;
        }
        updateBrushPreview();
        app.updateStatusBar();
    }

    function setBrushFlow(flowPercent) {
        const normalized = Math.max(1, Math.min(100, Number(flowPercent) || 100));
        env.setBrushFlow(normalized / 100);
        document.getElementById('brushFlowSlider').value = normalized;
        document.getElementById('brushFlowValue').textContent = `${normalized}%`;
        updateBrushPreview();
        app.updateStatusBar();
    }

    function setBrushSpacing(spacingPercent) {
        const normalized = Math.max(1, Math.min(100, Number(spacingPercent) || 25));
        env.setBrushSpacing(normalized / 100);
        document.getElementById('brushSpacingSlider').value = normalized;
        document.getElementById('brushSpacingValue').textContent = `${normalized}%`;
        app.updateStatusBar();
    }

    function setOpacity(opacity) {
        env.setCurrentOpacity(opacity / 100);
        updateBrushPreview();
        app.updateStatusBar();
        // Update opacity value in UI
        document.getElementById('opacityValue').textContent = `${opacity}%`;
        // Update canvas brush preview if currently visible
        const brushPreview = document.getElementById('canvasBrushPreview');
        if (brushPreview.style.display !== 'none' && env.getCurrentTool() === 'pen') {
            brushPreview.style.opacity = opacity / 100;
        }
    }

    function updateBrushPreview() {
        const previewCanvas = document.getElementById('brushPreview');
        const ctx = previewCanvas.getContext('2d');

        // Clear the preview
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

        // Set background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

        // Draw grid pattern
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        for (let i = 0; i <= previewCanvas.width; i += 5) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, previewCanvas.height);
            ctx.stroke();
        }
        for (let i = 0; i <= previewCanvas.height; i += 5) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(previewCanvas.width, i);
            ctx.stroke();
        }

        app.applyImageSmoothing(ctx);

        // Draw brush preview
        ctx.globalAlpha = env.getCurrentOpacity();
        const centerX = previewCanvas.width / 2;
        const centerY = previewCanvas.height / 2;
        app.drawBrushStamp(ctx, centerX, centerY, { color: env.getCurrentColor() });
    }

    function getEventPressure(event) {
        if (!env.getPressureSensitivityEnabled()) {
            return 1;
        }

        if (!event) {
            return 1;
        }

        if (typeof event.pressure === 'number' && event.pressure > 0) {
            return Math.max(0.05, Math.min(1, event.pressure));
        }

        return 1;
    }

    function getPressureAdjustedBrushSize() {
        if (!env.getPressureSensitivityEnabled() || !env.getPressureAffectsSize()) {
            return env.getBrushSize();
        }
        return Math.max(1, env.getBrushSize() * Math.max(0.1, env.getCurrentInputPressure()));
    }

    function getPressureAdjustedFlow() {
        if (!env.getPressureSensitivityEnabled() || !env.getPressureAffectsFlow()) {
            return env.getBrushFlow();
        }
        return Math.max(0.02, env.getBrushFlow() * Math.max(0.05, env.getCurrentInputPressure()));
    }

    function updateBrushSizePreview(screenX, screenY) {
        const brushPreview = document.getElementById('canvasBrushPreview');

        // Only show preview for pen and eraser tools
        if (env.getCurrentTool() !== 'pen' && env.getCurrentTool() !== 'eraser') {
            brushPreview.style.display = 'none';
            return;
        }

        // Position relative to the viewport (screen coordinates)
        brushPreview.style.position = 'fixed';
        brushPreview.style.left = screenX + 'px';
        brushPreview.style.top = screenY + 'px';
        brushPreview.style.transform = 'translate(-50%, -50%)';
        brushPreview.style.display = 'block';

        // Update brush preview style based on brush size and tool
        if (env.getBrushSize() === 1) {
            brushPreview.classList.add('pixel');
            brushPreview.style.width = '2px';
            brushPreview.style.height = '2px';
            brushPreview.style.borderRadius = '0';
        } else {
            brushPreview.classList.remove('pixel');
            const size = Math.max(2, env.getBrushSize() * env.getZoom()); // Ensure minimum 2px size for visibility
            brushPreview.style.width = size + 'px';
            brushPreview.style.height = size + 'px';
            const squarePreview = env.getBrushPreset() === 'pixel' || env.getBrushShape() === 'square';
            brushPreview.style.borderRadius = squarePreview ? '0' : '50%';
        }

        // Set the preview color based on tool
        if (env.getCurrentTool() === 'pen') {
            brushPreview.style.backgroundColor = env.getCurrentColor();
            brushPreview.style.borderColor = env.getCurrentColor();
        } else if (env.getCurrentTool() === 'eraser') {
            brushPreview.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            brushPreview.style.borderColor = '#ffffff';
        }
    }

    function hideBrushSizePreview() {
        const brushPreview = document.getElementById('canvasBrushPreview');
        brushPreview.style.display = 'none';
    }

    // Shows the in-progress stroke on the overlay canvas
    function showStrokePreview() {
        const strokeCanvas = env.getStrokeCanvas();
        if (strokeCanvas && env.overlayCanvas) {
            const ctx = env.overlayCtx;
            ctx.clearRect(0, 0, env.overlayCanvas.width, env.overlayCanvas.height);
            ctx.save();
            ctx.globalAlpha = env.getCurrentOpacity();
            ctx.drawImage(strokeCanvas, 0, 0);
            ctx.restore();
        }
    }

    return {
        setColor,
        getColorAtCanvasPosition,
        pickColorAt,
        updateEyedropperZoomPreview,
        hideEyedropperZoomPreview,
        refreshBrushPreviewFromCursor,
        setBrushSize,
        setBrushShape,
        setBrushPreset,
        setBrushFlow,
        setBrushSpacing,
        setOpacity,
        updateBrushPreview,
        getEventPressure,
        getPressureAdjustedBrushSize,
        getPressureAdjustedFlow,
        updateBrushSizePreview,
        hideBrushSizePreview,
        showStrokePreview
    };
}

module.exports = { createBrushSettings };
