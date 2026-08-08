const { ipcRenderer } = require('electron');
const reference = require('./reference');
const { clampNumber } = require('./math-utils');
const { SELECTION_MODES, ZOOM_MIN, ZOOM_MAX } = require('./constants');

// DOM event wiring, moved verbatim from wasrtk.js's setupEventListeners
// (originally one 464-line function; split here into one registrar per
// comment section it used to have). Every call here either goes through
// an existing public WASRTK method (`app.<method>()`, the same duck-typed
// surface tools/reference code use) or, for the handful of settings that
// are still raw wasrtk.js module globals with no owning module of their
// own yet, through `env` -- a closure-accessor object built once in the
// WASRTK constructor:
//   getSelectedPalette/setSelectedPalette
//   setFillTolerance, setFillContiguous, setFillSampleAllLayers
//   setSelectionMode, setSelectionAntialias, setSelectionFeather
//   setPressureSensitivityEnabled, setPressureAffectsSize, setPressureAffectsFlow
//   setAntialiasingEnabled
//   getIsDraggingReference/setIsDraggingReference
//   getLastMousePos/setLastMousePos
//   getIsDrawing
//   getCurrentTool
//   getZoom/setZoom
//   setOnionSkinningEnabled, setOnionSkinningRange
//   setFps
//   getIsPanning/setIsPanning
//   getPanStartPos/setPanStartPos
//   getPanStartScroll/setPanStartScroll
//   getActiveSelection (read-only -- the nudge handler mutates the
//                        selection object's x/y in place, never reassigns
//                        the activeSelection variable itself)
//   getSelectionInteraction/setSelectionInteraction
//   mainCanvas
function bindToolAndColorEvents(app, env) {
    // Tool selection
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            app.selectTool(e.target.closest('.tool-btn').dataset.tool);
        });
    });

    // Color picker
    document.getElementById('colorPicker').addEventListener('change', (e) => {
        app.setColor(e.target.value);
    });

    const paletteSelect = document.getElementById('paletteSelect');
    paletteSelect.addEventListener('change', (e) => {
        env.setSelectedPalette(e.target.value);
        app.renderPalettePresets(env.getSelectedPalette());
    });

    const presetsContainer = document.getElementById('colorPresets');
    presetsContainer.addEventListener('click', (e) => {
        const preset = e.target.closest('.color-preset');
        if (!preset) {
            return;
        }
        app.setColor(preset.dataset.color);
        document.getElementById('colorPicker').value = preset.dataset.color;
    });

    document.getElementById('openPaletteEditorBtn').addEventListener('click', async () => {
        await ipcRenderer.invoke('open-palette-editor-window');
    });
}

function bindBrushAndFillEvents(app, env) {
    // Brush size
    document.getElementById('brushSizeSlider').addEventListener('input', (e) => {
        app.setBrushSize(parseInt(e.target.value));
    });

    // Opacity control
    document.getElementById('opacitySlider').addEventListener('input', (e) => {
        app.setOpacity(parseInt(e.target.value));
    });

    // Fill tolerance control
    document.getElementById('fillToleranceSlider').addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        env.setFillTolerance(value);
        document.getElementById('fillToleranceValue').textContent = value;
    });
    document.getElementById('fillContiguous').addEventListener('change', (e) => {
        env.setFillContiguous(e.target.checked);
    });
    document.getElementById('fillSampleAllLayers').addEventListener('change', (e) => {
        env.setFillSampleAllLayers(e.target.checked);
    });
    document.getElementById('selectionModeSelect').addEventListener('change', (e) => {
        env.setSelectionMode(SELECTION_MODES.includes(e.target.value) ? e.target.value : 'rectangle');
        app.updateSelectionHint();
        app.selectTool(env.getCurrentTool());
    });
    document.getElementById('selectionAntialias').addEventListener('change', (e) => {
        env.setSelectionAntialias(e.target.checked);
    });
    document.getElementById('selectionFeatherSlider').addEventListener('input', (e) => {
        const value = clampNumber(parseInt(e.target.value, 10), 0, 0, 10);
        env.setSelectionFeather(value);
        document.getElementById('selectionFeatherValue').textContent = `${value}px`;
    });

    document.getElementById('brushShapeSelect').addEventListener('change', (e) => {
        app.setBrushShape(e.target.value);
    });
    document.getElementById('brushPresetSelect').addEventListener('change', (e) => {
        app.setBrushPreset(e.target.value);
    });
    document.getElementById('brushFlowSlider').addEventListener('input', (e) => {
        app.setBrushFlow(parseInt(e.target.value, 10));
    });
    document.getElementById('brushSpacingSlider').addEventListener('input', (e) => {
        app.setBrushSpacing(parseInt(e.target.value, 10));
    });
    document.getElementById('pressureSensitivityEnabled').addEventListener('change', (e) => {
        env.setPressureSensitivityEnabled(e.target.checked);
        app.updateStatusBar();
    });
    document.getElementById('pressureAffectsSize').addEventListener('change', (e) => {
        env.setPressureAffectsSize(e.target.checked);
        app.updateStatusBar();
    });
    document.getElementById('pressureAffectsFlow').addEventListener('change', (e) => {
        env.setPressureAffectsFlow(e.target.checked);
        app.updateStatusBar();
    });

    // Antialiasing toggle
    document.getElementById('antialiasingEnabled').addEventListener('change', (e) => {
        env.setAntialiasingEnabled(e.target.checked);
        app.updateAllCanvasSmoothing();
        app.updateBrushPreview();
        app.renderCurrentFrame();
        app.updateStatusBar();
    });
}

function bindCanvasPointerEvents(app, env) {
    const mainCanvas = env.mainCanvas;
    const api = app.getReferenceApi();

    const downEventName = window.PointerEvent ? 'pointerdown' : 'mousedown';
    const moveEventName = window.PointerEvent ? 'pointermove' : 'mousemove';
    const upEventName = window.PointerEvent ? 'pointerup' : 'mouseup';
    const leaveEventName = window.PointerEvent ? 'pointerleave' : 'mouseleave';

    mainCanvas.addEventListener(downEventName, (e) => {
        // Only respond to left mouse button (button 0)
        if (e.button !== 0) return;

        // Check if we're dragging reference image (Ctrl/Cmd + click)
        if ((e.ctrlKey || e.metaKey) && api.getImage() && api.isVisible()) {
            const mousePos = app.screenToCanvas(e.clientX, e.clientY);
            const scaledWidth = api.getImage().width * api.getScale();
            const scaledHeight = api.getImage().height * api.getScale();

            // Check if mouse is over reference image
            if (mousePos.x >= api.getX() && mousePos.x <= api.getX() + scaledWidth &&
                mousePos.y >= api.getY() && mousePos.y <= api.getY() + scaledHeight) {
                env.setIsDraggingReference(true);
                env.setLastMousePos(mousePos);
                app.canvasWrapper.classList.add('dragging-reference');
                e.preventDefault();
                return;
            }
        }

        mainCanvas.setPointerCapture?.(e.pointerId);
        app.startDrawing(e);
    });

    const handleCanvasInteractionMove = (e) => {
        // Handle reference image dragging
        if (env.getIsDraggingReference() && api.getImage() && api.isVisible()) {
            const mousePos = app.screenToCanvas(e.clientX, e.clientY);
            const lastMousePos = env.getLastMousePos();
            if (lastMousePos) {
                api.setPosition(api.getX() + (mousePos.x - lastMousePos.x), api.getY() + (mousePos.y - lastMousePos.y));
                env.setLastMousePos(mousePos);
                api.setUserModified(true); // Mark as user modified
                app.updateReferencePreview();
                app.renderCurrentFrame();
            }
            return;
        }

        app.updateEyedropperZoomPreview(e);
        app.updatePolygonHoverPreview(e);

        app.draw(e);
    };

    mainCanvas.addEventListener(moveEventName, handleCanvasInteractionMove);
    document.addEventListener(moveEventName, (e) => {
        if (!env.getIsDrawing() && !env.getIsDraggingReference()) {
            return;
        }

        if (e.target === mainCanvas) {
            return;
        }

        handleCanvasInteractionMove(e);
    });

    mainCanvas.addEventListener(upEventName, (e) => {
        if (env.getIsDraggingReference()) {
            env.setIsDraggingReference(false);
            env.setLastMousePos(null);
            app.canvasWrapper.classList.remove('dragging-reference');
            return;
        }
        mainCanvas.releasePointerCapture?.(e.pointerId);
        app.stopDrawing(e);
    });

    document.addEventListener(upEventName, (e) => {
        if (e.button !== 0) {
            return;
        }

        if (e.target === mainCanvas) {
            return;
        }

        if (env.getIsDraggingReference()) {
            env.setIsDraggingReference(false);
            env.setLastMousePos(null);
            app.canvasWrapper.classList.remove('dragging-reference');
            return;
        }

        mainCanvas.releasePointerCapture?.(e.pointerId);
        app.stopDrawing(e);
    });

    mainCanvas.addEventListener(leaveEventName, (e) => {
        if (env.getIsDraggingReference()) {
            env.setIsDraggingReference(false);
            env.setLastMousePos(null);
            app.canvasWrapper.classList.remove('dragging-reference');
            return;
        }
    });

    // Mouse position tracking
    mainCanvas.addEventListener(moveEventName, (e) => {
        const pixelCoords = app.screenToCanvas(e.clientX, e.clientY);
        document.getElementById('mousePosition').textContent = `${pixelCoords.x}, ${pixelCoords.y}`;
        app.updateBrushSizePreview(e.clientX, e.clientY);
        app.updateEyedropperZoomPreview(e);
    });

    // Hide brush preview when mouse leaves canvas
    mainCanvas.addEventListener(leaveEventName, () => {
        app.hideBrushSizePreview();
        app.hideEyedropperZoomPreview();
    });
}

function bindTimelineAndPlaybackEvents(app, env) {
    // Timeline events
    document.getElementById('addFrameBtn').addEventListener('click', () => app.addFrame());
    document.getElementById('duplicateFrameBtn').addEventListener('click', () => app.duplicateFrame());
    document.getElementById('moveFrameLeftBtn').addEventListener('click', () => app.moveFrameLeft());
    document.getElementById('moveFrameRightBtn').addEventListener('click', () => app.moveFrameRight());
    document.getElementById('deleteFrameBtn').addEventListener('click', () => app.deleteFrame());

    // Animation controls
    document.getElementById('playPauseBtn').addEventListener('click', () => app.toggleAnimation());

    // FPS control
    document.getElementById('fpsSlider').addEventListener('input', (e) => {
        env.setFps(parseInt(e.target.value));
        document.getElementById('fpsValue').textContent = e.target.value;
    });
}

function bindZoomEvents(app, env) {
    // Zoom controls
    document.getElementById('zoomInBtn').addEventListener('click', () => app.zoomIn());
    document.getElementById('zoomOutBtn').addEventListener('click', () => app.zoomOut());
    document.getElementById('resetZoomBtn').addEventListener('click', () => app.resetZoom());

    // Zoom slider
    document.getElementById('zoomSlider').addEventListener('input', (e) => {
        const zoomPercentage = parseInt(e.target.value);
        env.setZoom(zoomPercentage / 100);
        app.updateZoom();
    });

    // Zoom input
    document.getElementById('zoomInput').addEventListener('input', (e) => {
        const zoomPercentage = parseInt(e.target.value);
        if (zoomPercentage >= ZOOM_MIN * 100 && zoomPercentage <= ZOOM_MAX * 100) {
            env.setZoom(zoomPercentage / 100);
            app.updateZoom();
        }
    });

    // Handle Enter key on zoom input
    document.getElementById('zoomInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.target.blur(); // Remove focus
        }
    });

    // Mouse wheel zoom (Ctrl/Cmd + scroll). mainCanvas is nested inside
    // .canvas-wrapper, so one listener here covers both the canvas and
    // the wrapper's margin -- a second listener on mainCanvas would fire
    // twice per wheel notch via event bubbling.
    app.canvasWrapper.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -1 : 1;
            const zoomFactor = delta > 0 ? 1.1 : 0.9;

            app.zoomAtPoint(zoomFactor, e.clientX, e.clientY);
        }
    });
}

function bindLayerEvents(app) {
    // Layer controls
    document.getElementById('addLayerBtn').addEventListener('click', () => app.addLayer());
    document.getElementById('deleteLayerBtn').addEventListener('click', () => app.deleteLayer());
    document.getElementById('moveLayerUpBtn').addEventListener('click', () => app.moveLayerUp());
    document.getElementById('moveLayerDownBtn').addEventListener('click', () => app.moveLayerDown());
    document.getElementById('flattenLayerBtn').addEventListener('click', () => app.flattenLayer());
    document.getElementById('applyTransformBtn').addEventListener('click', () => app.applySelectedTransformAction());
}

function bindOnionSkinningEvents(app, env) {
    document.getElementById('onionSkinningEnabled').addEventListener('change', (e) => {
        env.setOnionSkinningEnabled(e.target.checked);
        app.renderCurrentFrame();
    });

    document.getElementById('onionSkinningRange').addEventListener('input', (e) => {
        env.setOnionSkinningRange(parseInt(e.target.value));
        document.getElementById('onionSkinningValue').textContent = e.target.value;
        app.renderCurrentFrame();
    });
}

function bindReferenceEvents(app) {
    document.getElementById('loadReferenceBtn').addEventListener('click', () => app.loadReferenceImage());
    document.getElementById('screenShareBtn').addEventListener('click', () => app.startScreenShare());
    reference.bindReferenceSettingsEvents(app, app.getReferenceApi());
}

function bindModalEvents(app) {
    document.getElementById('createProjectBtn').addEventListener('click', () => app.createNewProject());
    document.getElementById('cancelNewProjectBtn').addEventListener('click', () => app.hideModal('newProjectModal'));

    // Transparent background checkbox interaction
    document.getElementById('transparentBackground').addEventListener('change', (e) => {
        const backgroundColorInput = document.getElementById('backgroundColor');
        backgroundColorInput.disabled = e.target.checked;
        if (e.target.checked) {
            backgroundColorInput.style.opacity = '0.5';
        } else {
            backgroundColorInput.style.opacity = '1';
        }
    });
}

function bindUndoRedoEvents(app) {
    document.getElementById('undoBtn').addEventListener('click', () => app.undo());
    document.getElementById('redoBtn').addEventListener('click', () => app.redo());
}

function bindPanningEvents(app, env) {
    // Panning with middle mouse button
    const canvasWrapper = app.canvasWrapper;

    canvasWrapper.addEventListener('mousedown', (e) => {
        if (e.button === 1) { // Middle mouse button
            env.setIsPanning(true);
            env.setPanStartPos({ x: e.clientX, y: e.clientY });
            env.setPanStartScroll({ left: canvasWrapper.scrollLeft, top: canvasWrapper.scrollTop });
            canvasWrapper.classList.add('panning');
            e.preventDefault();
        }
    });

    canvasWrapper.addEventListener('mousemove', (e) => {
        if (env.getIsPanning()) {
            const panStartPos = env.getPanStartPos();
            const panStartScroll = env.getPanStartScroll();
            const dx = e.clientX - panStartPos.x;
            const dy = e.clientY - panStartPos.y;
            canvasWrapper.scrollLeft = panStartScroll.left - dx;
            canvasWrapper.scrollTop = panStartScroll.top - dy;
            e.preventDefault();
        }
    });

    canvasWrapper.addEventListener('mouseup', (e) => {
        if (e.button === 1 && env.getIsPanning()) {
            env.setIsPanning(false);
            canvasWrapper.classList.remove('panning');
            e.preventDefault();
        }
    });

    canvasWrapper.addEventListener('mouseleave', () => {
        if (env.getIsPanning()) {
            env.setIsPanning(false);
            canvasWrapper.classList.remove('panning');
        }
    });
}

function bindKeyboardShortcuts(app, env) {
    document.addEventListener('keydown', (e) => {
        if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
            return;
        }

        const activeSelection = env.getActiveSelection();

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && activeSelection) {
            e.preventDefault();
            app.copySelectionToClipboard();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && activeSelection) {
            e.preventDefault();
            app.copySelectionToClipboard({ cut: true });
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            e.preventDefault();
            app.pasteSelectionFromClipboard();
            return;
        }

        if ((e.key === 'Delete' || e.key === 'Backspace') && activeSelection) {
            e.preventDefault();
            app.copySelectionToClipboard({ cut: true });
            return;
        }

        const selectionInteraction = env.getSelectionInteraction();

        if (e.key === 'Enter' && selectionInteraction?.mode === 'polygon') {
            e.preventDefault();
            app.createLassoSelectionFromPoints(selectionInteraction.points || []);
            env.setSelectionInteraction(null);
            return;
        }

        if (e.key === 'Enter' && activeSelection?.detached) {
            e.preventDefault();
            app.commitDetachedSelection();
            app.clearSelection();
            return;
        }

        if (e.key === 'Escape' && selectionInteraction?.mode === 'polygon') {
            e.preventDefault();
            env.setSelectionInteraction(null);
            app.clearOverlay();
            return;
        }

        if (e.key === 'Escape' && activeSelection) {
            e.preventDefault();
            app.clearSelection();
            return;
        }

        const nudgeMap = {
            ArrowUp: { x: 0, y: -1 },
            ArrowDown: { x: 0, y: 1 },
            ArrowLeft: { x: -1, y: 0 },
            ArrowRight: { x: 1, y: 0 }
        };
        if (activeSelection && nudgeMap[e.key]) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            const nudge = nudgeMap[e.key];
            app.detachSelectionFromLayer();
            const nudgedPosition = app.clampSelectionPosition(activeSelection, activeSelection.x + (nudge.x * step), activeSelection.y + (nudge.y * step));
            activeSelection.x = nudgedPosition.x;
            activeSelection.y = nudgedPosition.y;
            app.drawSelectionOutline(activeSelection, { showPreview: true });
            return;
        }

        const toolByShortcut = {
            '1': 'pen',
            '2': 'line',
            '3': 'rectangle',
            '4': 'circle',
            '5': 'fill',
            '6': 'eraser',
            '7': 'selection',
            '8': 'eyedropper'
        };
        if (toolByShortcut[e.key]) {
            app.selectTool(toolByShortcut[e.key]);
            return;
        }

        // Prevent default behavior for certain keys
        if (e.key === ' ') {
            e.preventDefault(); // Prevent page scroll
            app.toggleAnimation();
        }
    });
}

function bindAppEvents(app, env) {
    bindToolAndColorEvents(app, env);
    bindBrushAndFillEvents(app, env);
    bindCanvasPointerEvents(app, env);
    bindTimelineAndPlaybackEvents(app, env);
    bindZoomEvents(app, env);
    bindLayerEvents(app);
    bindOnionSkinningEvents(app, env);
    bindReferenceEvents(app);
    bindModalEvents(app);
    bindUndoRedoEvents(app);
    bindPanningEvents(app, env);
    bindKeyboardShortcuts(app, env);
}

module.exports = { bindAppEvents };
