const { ipcRenderer } = require('electron');
const path = require('path');
const { getMimeType: resolveMimeType, saveAsPngSequence, saveAsGif } = require('./exporters');
const { parseProjectJson, validateProjectData, buildProjectData, serializeProjectData, buildFramesFromProject, normalizeProjectSettings } = require('./project-io');
const { loadTools } = require('./tools');
const reference = require('./reference');

// Global variables
let currentTool = 'pen';
let currentColor = '#000000';
let currentOpacity = 1.0; // Alpha channel support
let brushSize = 1;
let brushShape = 'circle';
let brushPreset = 'hard-round';
let brushFlow = 1;
let brushSpacing = 0.25;
let pressureSensitivityEnabled = true;
let pressureAffectsSize = true;
let pressureAffectsFlow = true;
let currentInputPressure = 1;
let isDrawing = false;
let currentFrame = 0;
let currentLayer = 0;
let frames = [];
let layers = [];
let isAnimating = false;
let fps = 12;
let onionSkinningEnabled = false;
let onionSkinningRange = 3;
let referenceImage = null;
let referenceVisible = false;
let referenceOpacity = 0.5;
let referenceX = 0;
let referenceY = 0;
let referenceScale = 1.0;
let isDraggingReference = false;
let userModifiedReference = false; // Track if user has manually adjusted reference
let zoom = 1;
let lastMousePos = null; // Store last mouse position for line interpolation
let antialiasingEnabled = true; // Global antialiasing toggle
let fillTolerance = 0; // Tolerance for flood fill
let fillContiguous = true;
let fillSampleAllLayers = false;
let draggedFrameIndex = null;
let selectedPalette = 'lospec-journey';
let activeSelection = null;
let selectionInteraction = null;
let selectionClipboard = null;
let selectionMode = 'rectangle';
let penLastDrawnPoint = null;
let penLineAnchor = null;

// Panning state
let isPanning = false;
let panStartPos = { x: 0, y: 0 };
let panStartScroll = { left: 0, top: 0 };

// Project settings
let hasTransparentBackground = false; // Track if project has transparent background

// Canvas elements
const mainCanvas = document.getElementById('mainCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const mainCtx = mainCanvas.getContext('2d');
const overlayCtx = overlayCanvas.getContext('2d');

const COLOR_PALETTES = {
    'lospec-journey': {
        label: 'Journey (Default)',
        colors: ['#3b1725', '#73172d', '#b4202a', '#df3e23', '#fa6a0a', '#ffd541', '#fffc40', '#d6f264', '#59c135', '#14a02e', '#1a7a3e', '#24523b', '#143464', '#285cc4', '#249fde', '#20d6c7', '#ffffff', '#8b93af', '#4a5462', '#141013']
    },
    grayscale: {
        label: 'Grayscale',
        colors: ['#000000', '#1f1f1f', '#3f3f3f', '#5f5f5f', '#7f7f7f', '#9f9f9f', '#bfbfbf', '#dfdfdf', '#ffffff']
    },
    cga: {
        label: 'CGA Inspired',
        colors: ['#000000', '#550000', '#aa0000', '#ff5555', '#00aa00', '#55ff55', '#aa5500', '#ffff55', '#0000aa', '#5555ff', '#aa00aa', '#ff55ff', '#00aaaa', '#55ffff', '#aaaaaa', '#ffffff']
    },
    pastel: {
        label: 'Pastel',
        colors: ['#f8b195', '#f67280', '#c06c84', '#6c5b7b', '#355c7d', '#99b898', '#feceab', '#ff847c', '#e84a5f', '#2a363b']
    }
};
const BUILTIN_PALETTE_IDS = new Set(Object.keys(COLOR_PALETTES));

let strokeCanvas = null;
let strokeCtx = null;

function normalizeHexColor(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const cleaned = value.trim().replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{3}$/.test(cleaned)) {
        return `#${cleaned.split('').map((c) => c + c).join('')}`;
    }
    if (/^[0-9a-f]{6}$/.test(cleaned)) {
        return `#${cleaned}`;
    }

    return null;
}

function dedupeColors(colors) {
    const uniqueColors = [];
    const seen = new Set();
    colors.forEach((color) => {
        const normalized = normalizeHexColor(color);
        if (!normalized || seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        uniqueColors.push(normalized);
    });
    return uniqueColors;
}

// Initialize the application
class WASRTK {
    constructor() {
        this.tools = loadTools();
        this.undoStack = [];
        this.redoStack = [];
        this.initializeCanvas();
        this.initializeFrames();
        this.initializeLayers();
        this.initializePaletteUI();
        this.loadCustomPalettesFromConfig();
        this.setupEventListeners();
        this.setupIPCListeners();
        this.updateUI();
        this.updateBrushPreview();
        this.resetZoom();
    }

    getCurrentToolConfig() {
        return this.tools[currentTool];
    }

    getReferenceApi() {
        return {
            getImage: () => referenceImage,
            setImage: (image) => { referenceImage = image; },
            isVisible: () => referenceVisible,
            setVisible: (visible) => { referenceVisible = visible; },
            getOpacity: () => referenceOpacity,
            setOpacity: (opacity) => { referenceOpacity = opacity; },
            getX: () => referenceX,
            getY: () => referenceY,
            setPosition: (x, y) => { referenceX = x; referenceY = y; },
            getScale: () => referenceScale,
            setScale: (scale) => { referenceScale = scale; },
            getUserModified: () => userModifiedReference,
            setUserModified: (modified) => { userModifiedReference = modified; },
            getCanvasWidth: () => mainCanvas.width,
            getCanvasHeight: () => mainCanvas.height,
            clear: () => {
                referenceImage = null;
                referenceVisible = false;
                referenceOpacity = 0.5;
                referenceX = 0;
                referenceY = 0;
                referenceScale = 1.0;
                userModifiedReference = false;
            }
        };
    }

    getCurrentColor() {
        return currentColor;
    }

    getBrushSize() {
        return brushSize;
    }

    getBrushShape() {
        return brushShape;
    }

    getBrushPreset() {
        return brushPreset;
    }

    getPenLastDrawnPoint() {
        return penLastDrawnPoint;
    }

    setPenLastDrawnPoint(point) {
        if (!point) {
            penLastDrawnPoint = null;
            return;
        }

        penLastDrawnPoint = { x: point.x, y: point.y };
    }

    getPenLineAnchor() {
        return penLineAnchor;
    }

    setPenLineAnchor(point) {
        if (!point) {
            penLineAnchor = null;
            return;
        }

        penLineAnchor = { x: point.x, y: point.y };
    }

    clearPenLineAnchor() {
        penLineAnchor = null;
    }

    getAngleSnappedEndPoint(start, end) {
        if (!start || !end) {
            return end;
        }

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.hypot(dx, dy);
        if (distance === 0) {
            return { x: start.x, y: start.y };
        }

        const step = Math.PI / 4;
        const angle = Math.atan2(dy, dx);
        const snappedAngle = Math.round(angle / step) * step;

        return {
            x: start.x + Math.cos(snappedAngle) * distance,
            y: start.y + Math.sin(snappedAngle) * distance
        };
    }

    isAntialiasingEnabled() {
        return antialiasingEnabled;
    }

    clearOverlay() {
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }

    createStrokeLayer() {
        strokeCanvas = document.createElement('canvas');
        strokeCanvas.width = mainCanvas.width;
        strokeCanvas.height = mainCanvas.height;
        strokeCtx = strokeCanvas.getContext('2d');
        this.applyImageSmoothing(strokeCtx);
    }

    commitStrokeLayer({ compositeOperation = 'source-over' } = {}) {
        if (!strokeCanvas || !strokeCtx) {
            return;
        }

        const frame = frames[currentFrame];
        const layer = frame.layers[currentLayer];
        if (layer && !layer.locked) {
            const ctx = this.getLayerContext(layer);
            ctx.save();
            ctx.globalAlpha = currentOpacity;
            ctx.globalCompositeOperation = compositeOperation;
            ctx.drawImage(strokeCanvas, 0, 0);
            ctx.restore();
        }

        strokeCanvas = null;
        strokeCtx = null;
        this.clearOverlay();
        this.renderCurrentFrame();
    }

    clearStrokeLayer() {
        if (!strokeCtx || !strokeCanvas) {
            return;
        }

        strokeCtx.clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
        this.clearOverlay();
    }

    // Helper function to convert screen coordinates to canvas coordinates
    screenToCanvas(screenX, screenY) {
        const rect = mainCanvas.getBoundingClientRect();
        const canvasX = (screenX - rect.left) / zoom;
        const canvasY = (screenY - rect.top) / zoom;

        if (antialiasingEnabled) {
            return { x: canvasX, y: canvasY };
        }

        return this.roundToPixel(canvasX, canvasY);
    }

    // Helper function to round coordinates for pixel-perfect drawing
    roundToPixel(x, y) {
        return {
            x: Math.round(x),
            y: Math.round(y)
        };
    }

    // Helper function to apply image smoothing based on antialiasing setting
    applyImageSmoothing(ctx) {
        if (antialiasingEnabled) {
            // Enable smoothing for smooth drawing
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.mozImageSmoothingEnabled = true;
            ctx.webkitImageSmoothingEnabled = true;
            ctx.msImageSmoothingEnabled = true;
        } else {
            // Disable smoothing for pixel-perfect drawing
            ctx.imageSmoothingEnabled = false;
            ctx.imageSmoothingQuality = 'low';
            ctx.mozImageSmoothingEnabled = false;
            ctx.webkitImageSmoothingEnabled = false;
            ctx.msImageSmoothingEnabled = false;
        }
    }

    getLayerContext(layer) {
        if (!layer || !layer.canvas) {
            return null;
        }

        if (!layer.ctx || layer.ctx.canvas !== layer.canvas) {
            layer.ctx = layer.canvas.getContext('2d');
            this.applyImageSmoothing(layer.ctx);
        }

        return layer.ctx;
    }

    // Helper function to update smoothing on all canvases
    updateAllCanvasSmoothing() {
        this.applyImageSmoothing(mainCtx);
        this.applyImageSmoothing(overlayCtx);
        
        // Update all layer canvases
        frames.forEach(frame => {
            frame.layers.forEach(layer => {
                const layerCtx = this.getLayerContext(layer);
                this.applyImageSmoothing(layerCtx);
            });
        });
    }

    initializeCanvas() {
        // Set canvas size
        mainCanvas.width = 256;
        mainCanvas.height = 256;
        overlayCanvas.width = 256;
        overlayCanvas.height = 256;

        // Set initial background
        mainCtx.fillStyle = '#ffffff';
        mainCtx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);

        // Apply initial smoothing settings
        this.updateAllCanvasSmoothing();
    }

    initializeFrames() {
        // Create initial frame
        const initialFrame = {
            id: 0,
            name: 'Frame 1',
            layers: [],
            timestamp: Date.now()
        };

        // Create initial layer for the frame
        const initialLayer = {
            id: 0,
            name: 'Background',
            visible: true,
            locked: false,
            canvas: document.createElement('canvas')
        };
        initialLayer.canvas.width = mainCanvas.width;
        initialLayer.canvas.height = mainCanvas.height;
        const layerCtx = this.getLayerContext(initialLayer);
        
        // Apply smoothing settings
        this.applyImageSmoothing(layerCtx);
        
        // Set background based on transparent background setting
        if (hasTransparentBackground) {
            // Clear canvas for transparent background
            layerCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        } else {
            // Set solid background color
            layerCtx.fillStyle = '#ffffff';
            layerCtx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
        }

        initialFrame.layers.push(initialLayer);
        frames.push(initialFrame);
        this.renderCurrentFrame();
    }

    initializeLayers() {
        layers = [
            { id: 0, name: 'Background', visible: true, locked: false }
        ];
        this.updateLayerList();
    }

    initializePaletteUI() {
        const paletteSelect = document.getElementById('paletteSelect');
        if (!paletteSelect) {
            return;
        }

        this.refreshPaletteSelect();

        if (!COLOR_PALETTES[selectedPalette]) {
            selectedPalette = 'lospec-journey';
        }
        paletteSelect.value = selectedPalette;
        this.renderPalettePresets(selectedPalette);
    }

    refreshPaletteSelect() {
        const paletteSelect = document.getElementById('paletteSelect');
        if (!paletteSelect) {
            return;
        }

        paletteSelect.innerHTML = '';
        Object.entries(COLOR_PALETTES).forEach(([id, palette]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = palette.label;
            paletteSelect.append(option);
        });
    }

    async loadCustomPalettesFromConfig() {
        const payload = await ipcRenderer.invoke('load-palettes-config');
        this.mergeCustomPalettes(payload.palettes || {});
    }

    mergeCustomPalettes(customPalettes) {
        Object.entries(COLOR_PALETTES).forEach(([id]) => {
            if (!BUILTIN_PALETTE_IDS.has(id)) {
                delete COLOR_PALETTES[id];
            }
        });

        Object.entries(customPalettes).forEach(([id, palette]) => {
            if (!palette || !palette.label || !Array.isArray(palette.colors)) {
                return;
            }
            const colors = dedupeColors(palette.colors);
            if (!colors.length) {
                return;
            }
            COLOR_PALETTES[id] = {
                label: String(palette.label),
                colors
            };
        });

        this.refreshPaletteSelect();
        if (!COLOR_PALETTES[selectedPalette]) {
            selectedPalette = 'lospec-journey';
        }
        document.getElementById('paletteSelect').value = selectedPalette;
        this.renderPalettePresets(selectedPalette);
    }

    renderPalettePresets(paletteId) {
        const palette = COLOR_PALETTES[paletteId] || COLOR_PALETTES['lospec-journey'];
        const presetsContainer = document.getElementById('colorPresets');
        if (!presetsContainer) {
            return;
        }

        presetsContainer.innerHTML = '';
        palette.colors.forEach((color) => {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'color-preset';
            swatch.style.background = color;
            swatch.dataset.color = color;
            swatch.title = color;
            presetsContainer.append(swatch);
        });
    }

    setupEventListeners() {
        // Tool selection
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.selectTool(e.target.closest('.tool-btn').dataset.tool);
            });
        });

        // Color picker
        document.getElementById('colorPicker').addEventListener('change', (e) => {
            this.setColor(e.target.value);
        });

        const paletteSelect = document.getElementById('paletteSelect');
        paletteSelect.addEventListener('change', (e) => {
            selectedPalette = e.target.value;
            this.renderPalettePresets(selectedPalette);
        });

        const presetsContainer = document.getElementById('colorPresets');
        presetsContainer.addEventListener('click', (e) => {
            const preset = e.target.closest('.color-preset');
            if (!preset) {
                return;
            }
            this.setColor(preset.dataset.color);
            document.getElementById('colorPicker').value = preset.dataset.color;
        });

        document.getElementById('openPaletteEditorBtn').addEventListener('click', async () => {
            await ipcRenderer.invoke('open-palette-editor-window');
        });

        // Brush size
        document.getElementById('brushSizeSlider').addEventListener('input', (e) => {
            this.setBrushSize(parseInt(e.target.value));
        });

        // Opacity control
        document.getElementById('opacitySlider').addEventListener('input', (e) => {
            this.setOpacity(parseInt(e.target.value));
        });

        // Fill tolerance control
        document.getElementById('fillToleranceSlider').addEventListener('input', (e) => {
            fillTolerance = parseInt(e.target.value);
            document.getElementById('fillToleranceValue').textContent = fillTolerance;
        });
        document.getElementById('fillContiguous').addEventListener('change', (e) => {
            fillContiguous = e.target.checked;
        });
        document.getElementById('fillSampleAllLayers').addEventListener('change', (e) => {
            fillSampleAllLayers = e.target.checked;
        });
        document.getElementById('selectionModeSelect').addEventListener('change', (e) => {
            if (e.target.value === 'magic-wand' || e.target.value === 'lasso') {
                selectionMode = e.target.value;
                return;
            }
            selectionMode = 'rectangle';
        });

        document.getElementById('brushShapeSelect').addEventListener('change', (e) => {
            this.setBrushShape(e.target.value);
        });
        document.getElementById('brushPresetSelect').addEventListener('change', (e) => {
            this.setBrushPreset(e.target.value);
        });
        document.getElementById('brushFlowSlider').addEventListener('input', (e) => {
            this.setBrushFlow(parseInt(e.target.value, 10));
        });
        document.getElementById('brushSpacingSlider').addEventListener('input', (e) => {
            this.setBrushSpacing(parseInt(e.target.value, 10));
        });
        document.getElementById('pressureSensitivityEnabled').addEventListener('change', (e) => {
            pressureSensitivityEnabled = e.target.checked;
            this.updateStatusBar();
        });
        document.getElementById('pressureAffectsSize').addEventListener('change', (e) => {
            pressureAffectsSize = e.target.checked;
            this.updateStatusBar();
        });
        document.getElementById('pressureAffectsFlow').addEventListener('change', (e) => {
            pressureAffectsFlow = e.target.checked;
            this.updateStatusBar();
        });

        // Antialiasing toggle
        document.getElementById('antialiasingEnabled').addEventListener('change', (e) => {
            antialiasingEnabled = e.target.checked;
            this.updateAllCanvasSmoothing();
            this.updateBrushPreview();
            this.renderCurrentFrame();
            this.updateStatusBar();
        });

        // Canvas events
        mainCanvas.addEventListener('mousedown', (e) => {
            // Only respond to left mouse button (button 0)
            if (e.button !== 0) return;
            
            // Check if we're dragging reference image (Ctrl/Cmd + click)
            if ((e.ctrlKey || e.metaKey) && referenceImage && referenceVisible) {
                const mousePos = this.screenToCanvas(e.clientX, e.clientY);
                const scaledWidth = referenceImage.width * referenceScale;
                const scaledHeight = referenceImage.height * referenceScale;
                
                // Check if mouse is over reference image
                if (mousePos.x >= referenceX && mousePos.x <= referenceX + scaledWidth &&
                    mousePos.y >= referenceY && mousePos.y <= referenceY + scaledHeight) {
                    isDraggingReference = true;
                    lastMousePos = mousePos;
                    document.querySelector('.canvas-wrapper').classList.add('dragging-reference');
                    e.preventDefault();
                    return;
                }
            }
            
            this.startDrawing(e);
        });
        
        const handleCanvasInteractionMove = (e) => {
            // Handle reference image dragging
            if (isDraggingReference && referenceImage && referenceVisible) {
                const mousePos = this.screenToCanvas(e.clientX, e.clientY);
                if (lastMousePos) {
                    referenceX += mousePos.x - lastMousePos.x;
                    referenceY += mousePos.y - lastMousePos.y;
                    lastMousePos = mousePos;
                    userModifiedReference = true; // Mark as user modified
                    this.updateReferencePreview();
                    this.renderCurrentFrame();
                }
                return;
            }

            this.updateEyedropperZoomPreview(e);
            
            this.draw(e);
        };

        mainCanvas.addEventListener('mousemove', handleCanvasInteractionMove);
        document.addEventListener('mousemove', (e) => {
            if (!isDrawing && !isDraggingReference) {
                return;
            }

            if (e.target === mainCanvas) {
                return;
            }

            handleCanvasInteractionMove(e);
        });
        
        mainCanvas.addEventListener('mouseup', (e) => {
            if (isDraggingReference) {
                isDraggingReference = false;
                lastMousePos = null;
                document.querySelector('.canvas-wrapper').classList.remove('dragging-reference');
                return;
            }
            this.stopDrawing(e);
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button !== 0) {
                return;
            }

            if (e.target === mainCanvas) {
                return;
            }

            if (isDraggingReference) {
                isDraggingReference = false;
                lastMousePos = null;
                document.querySelector('.canvas-wrapper').classList.remove('dragging-reference');
                return;
            }

            this.stopDrawing(e);
        });
        
        mainCanvas.addEventListener('mouseleave', (e) => {
            if (isDraggingReference) {
                isDraggingReference = false;
                lastMousePos = null;
                document.querySelector('.canvas-wrapper').classList.remove('dragging-reference');
                return;
            }
        });

        // Mouse position tracking
        mainCanvas.addEventListener('mousemove', (e) => {
            const pixelCoords = this.screenToCanvas(e.clientX, e.clientY);
            document.getElementById('mousePosition').textContent = `${pixelCoords.x}, ${pixelCoords.y}`;
            this.updateBrushSizePreview(e.clientX, e.clientY);
            this.updateEyedropperZoomPreview(e);
        });

        // Hide brush preview when mouse leaves canvas
        mainCanvas.addEventListener('mouseleave', () => {
            this.hideBrushSizePreview();
            this.hideEyedropperZoomPreview();
        });

        // Timeline events
        document.getElementById('addFrameBtn').addEventListener('click', () => this.addFrame());
        document.getElementById('duplicateFrameBtn').addEventListener('click', () => this.duplicateFrame());
        document.getElementById('moveFrameLeftBtn').addEventListener('click', () => this.moveFrameLeft());
        document.getElementById('moveFrameRightBtn').addEventListener('click', () => this.moveFrameRight());
        document.getElementById('deleteFrameBtn').addEventListener('click', () => this.deleteFrame());

        // Animation controls
        document.getElementById('playPauseBtn').addEventListener('click', () => this.toggleAnimation());

        // FPS control
        document.getElementById('fpsSlider').addEventListener('input', (e) => {
            document.getElementById('fpsValue').textContent = e.target.value;
        });

        // Zoom controls
        document.getElementById('zoomInBtn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOutBtn').addEventListener('click', () => this.zoomOut());
        document.getElementById('resetZoomBtn').addEventListener('click', () => this.resetZoom());
        
        // Zoom slider
        document.getElementById('zoomSlider').addEventListener('input', (e) => {
            const zoomPercentage = parseInt(e.target.value);
            zoom = zoomPercentage / 100;
            this.updateZoom();
        });
        
        // Zoom input
        document.getElementById('zoomInput').addEventListener('input', (e) => {
            const zoomPercentage = parseInt(e.target.value);
            if (zoomPercentage >= 10 && zoomPercentage <= 2000) {
                zoom = zoomPercentage / 100;
                this.updateZoom();
            }
        });
        
        // Handle Enter key on zoom input
        document.getElementById('zoomInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.target.blur(); // Remove focus
            }
        });

        // Layer controls
        document.getElementById('addLayerBtn').addEventListener('click', () => this.addLayer());
        document.getElementById('deleteLayerBtn').addEventListener('click', () => this.deleteLayer());
        document.getElementById('moveLayerUpBtn').addEventListener('click', () => this.moveLayerUp());
        document.getElementById('moveLayerDownBtn').addEventListener('click', () => this.moveLayerDown());
        document.getElementById('flattenLayerBtn').addEventListener('click', () => this.flattenLayer());
        document.getElementById('flipHorizontalBtn').addEventListener('click', () => this.applyTransformAction({ flipX: true }));
        document.getElementById('flipVerticalBtn').addEventListener('click', () => this.applyTransformAction({ flipY: true }));
        document.getElementById('rotate90Btn').addEventListener('click', () => this.applyTransformAction({ rotate90: true }));
        document.getElementById('scaleUpBtn').addEventListener('click', () => this.applyTransformAction({ scaleX: 1.25, scaleY: 1.25 }));
        document.getElementById('scaleDownBtn').addEventListener('click', () => this.applyTransformAction({ scaleX: 0.8, scaleY: 0.8 }));
        document.getElementById('skewXBtn').addEventListener('click', () => this.applyTransformAction({ skewX: 12 * (Math.PI / 180) }));
        document.getElementById('skewYBtn').addEventListener('click', () => this.applyTransformAction({ skewY: 12 * (Math.PI / 180) }));

        // Onion skinning
        document.getElementById('onionSkinningEnabled').addEventListener('change', (e) => {
            onionSkinningEnabled = e.target.checked;
            this.renderCurrentFrame();
        });

        document.getElementById('onionSkinningRange').addEventListener('input', (e) => {
            onionSkinningRange = parseInt(e.target.value);
            document.getElementById('onionSkinningValue').textContent = e.target.value;
            this.renderCurrentFrame();
        });

        // Reference image
        document.getElementById('loadReferenceBtn').addEventListener('click', () => this.loadReferenceImage());
        document.getElementById('screenShareBtn').addEventListener('click', () => this.startScreenShare());
        reference.bindReferenceSettingsEvents(this, this.getReferenceApi());

        // Modal events
        document.getElementById('createProjectBtn').addEventListener('click', () => this.createNewProject());
        document.getElementById('cancelNewProjectBtn').addEventListener('click', () => this.hideModal('newProjectModal'));

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

        // Mouse wheel zoom (Ctrl/Cmd + scroll)
        mainCanvas.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -1 : 1;
                const zoomFactor = delta > 0 ? 1.1 : 0.9;
                
                this.zoomAtPoint(zoomFactor, e.clientX, e.clientY);
            }
        });

        const canvasWrapper = document.querySelector('.canvas-wrapper');

        // Also add wheel listener to canvas wrapper for better coverage
        canvasWrapper.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -1 : 1;
                const zoomFactor = delta > 0 ? 1.1 : 0.9;
                
                this.zoomAtPoint(zoomFactor, e.clientX, e.clientY);
            }
        });


        // Undo/Redo buttons
        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.redo());

        // Panning with middle mouse button
        canvasWrapper.addEventListener('mousedown', (e) => {
            if (e.button === 1) { // Middle mouse button
                isPanning = true;
                panStartPos = { x: e.clientX, y: e.clientY };
                panStartScroll = { left: canvasWrapper.scrollLeft, top: canvasWrapper.scrollTop };
                canvasWrapper.classList.add('panning');
                e.preventDefault();
            }
        });

        canvasWrapper.addEventListener('mousemove', (e) => {
            if (isPanning) {
                const dx = e.clientX - panStartPos.x;
                const dy = e.clientY - panStartPos.y;
                canvasWrapper.scrollLeft = panStartScroll.left - dx;
                canvasWrapper.scrollTop = panStartScroll.top - dy;
                e.preventDefault();
            }
        });

        canvasWrapper.addEventListener('mouseup', (e) => {
            if (e.button === 1 && isPanning) {
                isPanning = false;
                canvasWrapper.classList.remove('panning');
                e.preventDefault();
            }
        });

        canvasWrapper.addEventListener('mouseleave', () => {
            if (isPanning) {
                isPanning = false;
                canvasWrapper.classList.remove('panning');
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && activeSelection) {
                e.preventDefault();
                this.copySelectionToClipboard();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && activeSelection) {
                e.preventDefault();
                this.copySelectionToClipboard({ cut: true });
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                e.preventDefault();
                this.pasteSelectionFromClipboard();
                return;
            }

            if ((e.key === 'Delete' || e.key === 'Backspace') && activeSelection) {
                e.preventDefault();
                this.copySelectionToClipboard({ cut: true });
                return;
            }

            if (e.key === 'Enter' && activeSelection?.detached) {
                e.preventDefault();
                this.commitDetachedSelection();
                this.clearSelection();
                return;
            }

            if (e.key === 'Escape' && activeSelection) {
                e.preventDefault();
                this.clearSelection();
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
                this.detachSelectionFromLayer();
                activeSelection.x = Math.max(0, Math.min(mainCanvas.width - activeSelection.width, activeSelection.x + (nudge.x * step)));
                activeSelection.y = Math.max(0, Math.min(mainCanvas.height - activeSelection.height, activeSelection.y + (nudge.y * step)));
                this.drawSelectionOutline(activeSelection, { showPreview: true });
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
                this.selectTool(toolByShortcut[e.key]);
                return;
            }

            // Prevent default behavior for certain keys
            if (e.key === ' ') {
                e.preventDefault(); // Prevent page scroll
                this.toggleAnimation();
            }
        });
    }

    setupIPCListeners() {
        // Menu events
        ipcRenderer.on('new-project', () => this.showModal('newProjectModal'));
        ipcRenderer.on('open-reference-image', (event, filePath) => this.openFile(filePath));
        ipcRenderer.on('load-project', (event, filePath) => this.loadProject(filePath));
        ipcRenderer.on('save-project', (event, filePath) => this.saveProject(filePath));
        ipcRenderer.on('save-animation', (event, filePath) => this.saveAnimation(filePath));
        ipcRenderer.on('add-frame', () => this.addFrame());
        ipcRenderer.on('duplicate-frame', () => this.duplicateFrame());
        ipcRenderer.on('delete-frame', () => this.deleteFrame());
        ipcRenderer.on('play-animation', () => this.toggleAnimation());
        ipcRenderer.on('stop-animation', () => this.toggleAnimation());
        ipcRenderer.on('select-tool', (event, tool) => this.selectTool(tool));
        ipcRenderer.on('undo', () => this.undo());
        ipcRenderer.on('redo', () => this.redo());
        ipcRenderer.on('move-layer-up', () => this.moveLayerUp());
        ipcRenderer.on('move-layer-down', () => this.moveLayerDown());
        ipcRenderer.on('flatten-layer', () => this.flattenLayer());
        ipcRenderer.on('reset-reference', () => {
            if (referenceImage && referenceVisible) {
                this.resetReferencePosition();
            }
        });
        ipcRenderer.on('toggle-antialiasing', () => {
            antialiasingEnabled = !antialiasingEnabled;
            document.getElementById('antialiasingEnabled').checked = antialiasingEnabled;
            this.updateAllCanvasSmoothing();
            this.renderCurrentFrame();
            this.updateStatusBar();
        });
        ipcRenderer.on('palette-config-updated', (event, payload) => {
            this.mergeCustomPalettes(payload.palettes || {});
        });
    }

    // Tool methods
    selectTool(tool) {
        currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const toolButton = document.querySelector(`[data-tool="${tool}"]`);
        if (toolButton) {
            toolButton.classList.add('active');
        }
        
        // Show/hide fill tolerance slider
        const toleranceSection = document.getElementById('fillToleranceSection');
        if (tool === 'fill') {
            toleranceSection.style.display = 'block';
        } else {
            toleranceSection.style.display = 'none';
        }

        const selectionModeSection = document.getElementById('selectionModeSection');
        selectionModeSection.style.display = tool === 'selection' ? 'flex' : 'none';

        const brushShapeControl = document.querySelector('.brush-shape-control');
        const brushShapeTools = ['pen', 'line', 'eraser'];
        brushShapeControl.style.display = brushShapeTools.includes(tool) ? 'flex' : 'none';

        const brushPresetControl = document.querySelector('.brush-preset-control');
        const brushPresetTools = ['pen', 'eraser'];
        brushPresetControl.style.display = brushPresetTools.includes(tool) ? 'flex' : 'none';

        document.querySelectorAll('.brush-advanced-control').forEach((control) => {
            control.style.display = brushPresetTools.includes(tool) ? 'grid' : 'none';
        });
        const pressureControls = document.querySelector('.pressure-controls');
        pressureControls.style.display = brushPresetTools.includes(tool) ? 'flex' : 'none';
        
        // Hide brush preview if switching away from pen/eraser
        if (tool !== 'pen' && tool !== 'eraser') {
            this.hideBrushSizePreview();
        }

        if (tool !== 'eyedropper') {
            this.hideEyedropperZoomPreview();
        }

        if (tool !== 'selection') {
            selectionInteraction = null;
            if (activeSelection) {
                activeSelection = null;
                this.clearOverlay();
            }
        }
        
        this.updateStatusBar();
    }

    setColor(color) {
        currentColor = color;
        this.updateBrushPreview();
        this.updateStatusBar();
        
        // Update canvas brush preview if currently visible
        const brushPreview = document.getElementById('canvasBrushPreview');
        if (brushPreview.style.display !== 'none' && currentTool === 'pen') {
            brushPreview.style.backgroundColor = currentColor;
            brushPreview.style.borderColor = currentColor;
        }
    }

    getColorAtCanvasPosition(x, y) {
        const sampleX = Math.max(0, Math.min(mainCanvas.width - 1, Math.round(x)));
        const sampleY = Math.max(0, Math.min(mainCanvas.height - 1, Math.round(y)));
        const pixel = mainCtx.getImageData(sampleX, sampleY, 1, 1).data;
        return `#${[pixel[0], pixel[1], pixel[2]].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
    }

    pickColorAt(x, y) {
        const pickedColor = this.getColorAtCanvasPosition(x, y);
        this.setColor(pickedColor);
        document.getElementById('colorPicker').value = pickedColor;
        return pickedColor;
    }

    updateEyedropperZoomPreview(e) {
        if (currentTool !== 'eyedropper') {
            this.hideEyedropperZoomPreview();
            return;
        }

        const lens = document.getElementById('eyedropperZoomLens');
        const zoomCanvas = document.getElementById('eyedropperZoomCanvas');
        const zoomLabel = document.getElementById('eyedropperZoomLabel');
        if (!lens || !zoomCanvas || !zoomLabel) {
            return;
        }

        const coords = this.screenToCanvas(e.clientX, e.clientY);
        const liveHoverColor = this.getColorAtCanvasPosition(coords.x, coords.y);
        const zoomCtx = zoomCanvas.getContext('2d');
        const sampleSize = 11;
        const halfSize = Math.floor(sampleSize / 2);
        const sampleX = Math.max(0, Math.min(mainCanvas.width - sampleSize, Math.round(coords.x) - halfSize));
        const sampleY = Math.max(0, Math.min(mainCanvas.height - sampleSize, Math.round(coords.y) - halfSize));

        zoomCtx.save();
        zoomCtx.imageSmoothingEnabled = false;
        zoomCtx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
        zoomCtx.drawImage(mainCanvas, sampleX, sampleY, sampleSize, sampleSize, 0, 0, zoomCanvas.width, zoomCanvas.height);

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

        const wrapperRect = document.querySelector('.canvas-wrapper').getBoundingClientRect();
        const lensOffsetX = 20;
        const lensOffsetY = 20;
        let left = e.clientX - wrapperRect.left + lensOffsetX;
        let top = e.clientY - wrapperRect.top + lensOffsetY;
        const maxLeft = wrapperRect.width - lens.offsetWidth - 4;
        const maxTop = wrapperRect.height - lens.offsetHeight - 4;
        left = Math.max(4, Math.min(maxLeft, left));
        top = Math.max(4, Math.min(maxTop, top));

        lens.style.left = `${left}px`;
        lens.style.top = `${top}px`;
        lens.hidden = false;
        zoomLabel.textContent = liveHoverColor;
    }

    hideEyedropperZoomPreview() {
        const lens = document.getElementById('eyedropperZoomLens');
        if (lens) {
            lens.hidden = true;
        }
    }

    setBrushSize(size) {
        brushSize = size;
        document.getElementById('brushSizeValue').textContent = size + 'px';
        this.updateBrushPreview();
        this.updateStatusBar();
        
        // Update brush size preview if currently visible
        const brushPreview = document.getElementById('canvasBrushPreview');
        if (brushPreview.style.display !== 'none' && (currentTool === 'pen' || currentTool === 'eraser')) {
            // Trigger a mouse move event to update the brush preview
            const event = new MouseEvent('mousemove', {
                clientX: parseInt(brushPreview.style.left) || 0,
                clientY: parseInt(brushPreview.style.top) || 0
            });
            mainCanvas.dispatchEvent(event);
        }
    }

    setBrushShape(shape) {
        brushShape = shape === 'square' ? 'square' : 'circle';
        document.getElementById('brushShapeSelect').value = brushShape;
        this.updateBrushPreview();

        const brushPreview = document.getElementById('canvasBrushPreview');
        if (brushPreview.style.display !== 'none' && (currentTool === 'pen' || currentTool === 'eraser')) {
            const event = new MouseEvent('mousemove', {
                clientX: parseInt(brushPreview.style.left) || 0,
                clientY: parseInt(brushPreview.style.top) || 0
            });
            mainCanvas.dispatchEvent(event);
        }
    }

    setBrushPreset(preset) {
        const supportedPresets = new Set(['hard-round', 'soft-round', 'pixel', 'textured']);
        brushPreset = supportedPresets.has(preset) ? preset : 'hard-round';
        document.getElementById('brushPresetSelect').value = brushPreset;
        this.updateBrushPreview();
        this.updateStatusBar();
    }

    setBrushFlow(flowPercent) {
        const normalized = Math.max(1, Math.min(100, Number(flowPercent) || 100));
        brushFlow = normalized / 100;
        document.getElementById('brushFlowSlider').value = normalized;
        document.getElementById('brushFlowValue').textContent = `${normalized}%`;
        this.updateBrushPreview();
        this.updateStatusBar();
    }

    setBrushSpacing(spacingPercent) {
        const normalized = Math.max(1, Math.min(100, Number(spacingPercent) || 25));
        brushSpacing = normalized / 100;
        document.getElementById('brushSpacingSlider').value = normalized;
        document.getElementById('brushSpacingValue').textContent = `${normalized}%`;
        this.updateStatusBar();
    }

    setOpacity(opacity) {
        currentOpacity = opacity / 100;
        this.updateBrushPreview();
        this.updateStatusBar();
        // Update opacity value in UI
        document.getElementById('opacityValue').textContent = `${opacity}%`;
        // Update canvas brush preview if currently visible
        const brushPreview = document.getElementById('canvasBrushPreview');
        if (brushPreview.style.display !== 'none' && currentTool === 'pen') {
            brushPreview.style.opacity = opacity / 100;
        }
    }

    updateBrushPreview() {
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
        
        this.applyImageSmoothing(ctx);

        // Draw brush preview
        ctx.globalAlpha = currentOpacity;
        const centerX = previewCanvas.width / 2;
        const centerY = previewCanvas.height / 2;
        this.drawBrushStamp(ctx, centerX, centerY, { color: currentColor });
        
    }

    normalizeSelectionBounds(start, end, { keepSquare = false } = {}) {
        let endX = end.x;
        let endY = end.y;

        if (keepSquare) {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const side = Math.max(Math.abs(dx), Math.abs(dy));
            endX = start.x + side * Math.sign(dx || 1);
            endY = start.y + side * Math.sign(dy || 1);
        }

        const x = Math.min(start.x, endX);
        const y = Math.min(start.y, endY);
        const width = Math.abs(endX - start.x);
        const height = Math.abs(endY - start.y);
        return {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height)
        };
    }

    drawSelectionOutline(bounds, { showPreview = false } = {}) {
        this.clearOverlay();
        if (showPreview && bounds.imageData) {
            overlayCtx.putImageData(bounds.imageData, bounds.x, bounds.y);
        }
        overlayCtx.save();
        overlayCtx.strokeStyle = '#1f9eff';
        overlayCtx.setLineDash([5, 3]);
        overlayCtx.lineWidth = 1;
        overlayCtx.strokeRect(bounds.x + 0.5, bounds.y + 0.5, bounds.width, bounds.height);
        overlayCtx.restore();
    }

    drawLassoPreview(points, currentPoint) {
        this.clearOverlay();
        if (!points || points.length === 0) {
            return;
        }

        overlayCtx.save();
        overlayCtx.strokeStyle = '#1f9eff';
        overlayCtx.setLineDash([5, 3]);
        overlayCtx.lineWidth = 1;
        overlayCtx.beginPath();
        overlayCtx.moveTo(points[0].x + 0.5, points[0].y + 0.5);
        points.forEach((point, index) => {
            if (index === 0) {
                return;
            }
            overlayCtx.lineTo(point.x + 0.5, point.y + 0.5);
        });
        if (currentPoint) {
            overlayCtx.lineTo(currentPoint.x + 0.5, currentPoint.y + 0.5);
        }
        overlayCtx.stroke();
        overlayCtx.restore();
    }

    createLassoSelectionFromPoints(points) {
        if (!points || points.length < 3) {
            activeSelection = null;
            this.clearOverlay();
            return;
        }

        const frame = frames[currentFrame];
        const layer = frame.layers[currentLayer];
        if (!layer || layer.locked) {
            return;
        }

        const ctx = this.getLayerContext(layer);
        const source = ctx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
        const sourcePixels = source.data;

        const xs = points.map((point) => Math.round(point.x));
        const ys = points.map((point) => Math.round(point.y));
        const minX = Math.max(0, Math.min(...xs));
        const maxX = Math.min(mainCanvas.width - 1, Math.max(...xs));
        const minY = Math.max(0, Math.min(...ys));
        const maxY = Math.min(mainCanvas.height - 1, Math.max(...ys));

        if (maxX <= minX || maxY <= minY) {
            activeSelection = null;
            this.clearOverlay();
            return;
        }

        const width = (maxX - minX) + 1;
        const height = (maxY - minY) + 1;
        const selectedPixels = new Uint8ClampedArray(width * height * 4);

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = mainCanvas.width;
        maskCanvas.height = mainCanvas.height;
        const maskCtx = maskCanvas.getContext('2d');
        const path = new Path2D();
        path.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach((point) => path.lineTo(point.x, point.y));
        path.closePath();

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (!maskCtx.isPointInPath(path, x + 0.5, y + 0.5)) {
                    continue;
                }

                const sourcePos = (y * mainCanvas.width + x) * 4;
                const localPos = ((y - minY) * width + (x - minX)) * 4;
                selectedPixels[localPos] = sourcePixels[sourcePos];
                selectedPixels[localPos + 1] = sourcePixels[sourcePos + 1];
                selectedPixels[localPos + 2] = sourcePixels[sourcePos + 2];
                selectedPixels[localPos + 3] = sourcePixels[sourcePos + 3];
            }
        }

        activeSelection = {
            x: minX,
            y: minY,
            width,
            height,
            imageData: new ImageData(selectedPixels, width, height),
            originalX: minX,
            originalY: minY,
            detached: false,
            sourceSnapshot: null
        };

        this.drawSelectionOutline(activeSelection);
    }

    createMagicWandSelection(coords) {
        const frame = frames[currentFrame];
        const layer = frame.layers[currentLayer];
        if (!layer || layer.locked) {
            return;
        }

        const ctx = this.getLayerContext(layer);
        const imageData = ctx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
        const pixels = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const startX = Math.max(0, Math.min(width - 1, Math.round(coords.x)));
        const startY = Math.max(0, Math.min(height - 1, Math.round(coords.y)));
        const startPos = (startY * width + startX) * 4;

        const startR = pixels[startPos];
        const startG = pixels[startPos + 1];
        const startB = pixels[startPos + 2];
        const startA = pixels[startPos + 3];

        const colorDistance = (pos) => {
            const dr = pixels[pos] - startR;
            const dg = pixels[pos + 1] - startG;
            const db = pixels[pos + 2] - startB;
            const da = pixels[pos + 3] - startA;
            return Math.sqrt((dr * dr) + (dg * dg) + (db * db) + (da * da));
        };

        const visited = new Uint8Array(width * height);
        const stack = [[startX, startY]];
        const selected = [];
        let minX = width;
        let minY = height;
        let maxX = 0;
        let maxY = 0;

        while (stack.length > 0) {
            const [x, y] = stack.pop();
            if (x < 0 || x >= width || y < 0 || y >= height) {
                continue;
            }

            const idx = (y * width) + x;
            if (visited[idx]) {
                continue;
            }
            visited[idx] = 1;

            const pos = idx * 4;
            if (colorDistance(pos) > fillTolerance) {
                continue;
            }

            selected.push({ x, y, pos });
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);

            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }

        if (selected.length === 0) {
            activeSelection = null;
            this.clearOverlay();
            return;
        }

        const selectionWidth = (maxX - minX) + 1;
        const selectionHeight = (maxY - minY) + 1;
        const selectedPixels = new Uint8ClampedArray(selectionWidth * selectionHeight * 4);

        selected.forEach(({ x, y, pos }) => {
            const localX = x - minX;
            const localY = y - minY;
            const localPos = (localY * selectionWidth + localX) * 4;
            selectedPixels[localPos] = pixels[pos];
            selectedPixels[localPos + 1] = pixels[pos + 1];
            selectedPixels[localPos + 2] = pixels[pos + 2];
            selectedPixels[localPos + 3] = pixels[pos + 3];
        });

        activeSelection = {
            x: minX,
            y: minY,
            width: selectionWidth,
            height: selectionHeight,
            imageData: new ImageData(selectedPixels, selectionWidth, selectionHeight),
            originalX: minX,
            originalY: minY,
            detached: false,
            sourceSnapshot: null
        };

        this.drawSelectionOutline(activeSelection);
    }

    startSelectionInteraction(coords) {
        if (activeSelection &&
            coords.x >= activeSelection.x &&
            coords.x <= activeSelection.x + activeSelection.width &&
            coords.y >= activeSelection.y &&
            coords.y <= activeSelection.y + activeSelection.height) {
            this.detachSelectionFromLayer();
            selectionInteraction = {
                mode: 'move',
                start: coords,
                originalX: activeSelection.x,
                originalY: activeSelection.y
            };
            return;
        }

        if (selectionMode === 'magic-wand') {
            this.createMagicWandSelection(coords);
            selectionInteraction = null;
            return;
        }

        if (selectionMode === 'lasso') {
            activeSelection = null;
            selectionInteraction = {
                mode: 'lasso',
                points: [coords],
                current: coords
            };
            this.drawLassoPreview(selectionInteraction.points, coords);
            return;
        }

        activeSelection = null;
        selectionInteraction = {
            mode: 'select',
            start: coords,
            current: coords
        };
        this.drawSelectionOutline(this.normalizeSelectionBounds(coords, coords));
    }

    updateSelectionInteraction(coords, { keepSquare = false } = {}) {
        if (!selectionInteraction) {
            return;
        }

        if (selectionInteraction.mode === 'select') {
            selectionInteraction.current = coords;
            const bounds = this.normalizeSelectionBounds(selectionInteraction.start, coords, { keepSquare });
            this.drawSelectionOutline(bounds);
            return;
        }

        if (selectionInteraction.mode === 'lasso') {
            const lastPoint = selectionInteraction.points[selectionInteraction.points.length - 1];
            const distance = Math.hypot(coords.x - lastPoint.x, coords.y - lastPoint.y);
            if (distance >= 1) {
                selectionInteraction.points.push(coords);
            }
            selectionInteraction.current = coords;
            this.drawLassoPreview(selectionInteraction.points, coords);
            return;
        }

        if (selectionInteraction.mode === 'move' && activeSelection) {
            const dx = Math.round(coords.x - selectionInteraction.start.x);
            const dy = Math.round(coords.y - selectionInteraction.start.y);
            activeSelection.x = selectionInteraction.originalX + dx;
            activeSelection.y = selectionInteraction.originalY + dy;
            this.drawSelectionOutline(activeSelection, { showPreview: true });
        }
    }

    finishSelectionInteraction() {
        if (!selectionInteraction) {
            return;
        }

        const frame = frames[currentFrame];
        const layer = frame.layers[currentLayer];
        if (!layer || layer.locked) {
            selectionInteraction = null;
            return;
        }
        const ctx = this.getLayerContext(layer);

        if (selectionInteraction.mode === 'select') {
            const rawBounds = this.normalizeSelectionBounds(selectionInteraction.start, selectionInteraction.current);
            const bounds = {
                x: Math.max(0, rawBounds.x),
                y: Math.max(0, rawBounds.y),
                width: Math.min(mainCanvas.width - Math.max(0, rawBounds.x), rawBounds.width),
                height: Math.min(mainCanvas.height - Math.max(0, rawBounds.y), rawBounds.height)
            };
            if (bounds.width < 1 || bounds.height < 1) {
                activeSelection = null;
                this.clearOverlay();
            } else {
                const imageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
                activeSelection = {
                    ...bounds,
                    imageData,
                    originalX: bounds.x,
                    originalY: bounds.y,
                    detached: false,
                    sourceSnapshot: null
                };
                this.drawSelectionOutline(activeSelection);
            }
        } else if (selectionInteraction.mode === 'lasso') {
            this.createLassoSelectionFromPoints(selectionInteraction.points || []);
        } else if (selectionInteraction.mode === 'move' && activeSelection) {
            this.drawSelectionOutline(activeSelection, { showPreview: true });
        }

        selectionInteraction = null;
    }

    applySelectionMove(nextX, nextY, { saveState = true } = {}) {
        if (!activeSelection) {
            return;
        }

        const frame = frames[currentFrame];
        const layer = frame.layers[currentLayer];
        if (!layer || layer.locked) {
            return;
        }
        const ctx = this.getLayerContext(layer);
        const targetX = Math.max(0, Math.min(mainCanvas.width - activeSelection.width, Math.round(nextX)));
        const targetY = Math.max(0, Math.min(mainCanvas.height - activeSelection.height, Math.round(nextY)));

        if (targetX === activeSelection.originalX && targetY === activeSelection.originalY) {
            return;
        }

        if (saveState) {
            this.saveState();
        }

        ctx.clearRect(activeSelection.originalX, activeSelection.originalY, activeSelection.width, activeSelection.height);
        ctx.putImageData(activeSelection.imageData, targetX, targetY);
        activeSelection.x = targetX;
        activeSelection.y = targetY;
        activeSelection.originalX = targetX;
        activeSelection.originalY = targetY;
        this.drawSelectionOutline(activeSelection);
        this.renderCurrentFrame();
    }

    detachSelectionFromLayer() {
        if (!activeSelection || activeSelection.detached) {
            return;
        }
        const frame = frames[currentFrame];
        const layer = frame.layers[currentLayer];
        if (!layer || layer.locked) {
            return;
        }
        const ctx = this.getLayerContext(layer);
        activeSelection.sourceSnapshot = ctx.getImageData(activeSelection.originalX, activeSelection.originalY, activeSelection.width, activeSelection.height);
        ctx.clearRect(activeSelection.originalX, activeSelection.originalY, activeSelection.width, activeSelection.height);
        activeSelection.detached = true;
        this.renderCurrentFrame();
    }

    commitDetachedSelection() {
        if (!activeSelection || !activeSelection.detached) {
            return;
        }
        const frame = frames[currentFrame];
        const layer = frame.layers[currentLayer];
        if (!layer || layer.locked) {
            return;
        }
        const ctx = this.getLayerContext(layer);
        if (activeSelection.sourceSnapshot) {
            ctx.putImageData(activeSelection.sourceSnapshot, activeSelection.originalX, activeSelection.originalY);
        }
        this.saveState();
        ctx.clearRect(activeSelection.originalX, activeSelection.originalY, activeSelection.width, activeSelection.height);
        ctx.putImageData(activeSelection.imageData, activeSelection.x, activeSelection.y);
        activeSelection.originalX = activeSelection.x;
        activeSelection.originalY = activeSelection.y;
        activeSelection.detached = false;
        activeSelection.sourceSnapshot = null;
        this.drawSelectionOutline(activeSelection);
        this.renderCurrentFrame();
    }

    cancelDetachedSelection() {
        if (!activeSelection || !activeSelection.detached) {
            return;
        }
        const frame = frames[currentFrame];
        const layer = frame.layers[currentLayer];
        if (!layer || layer.locked) {
            return;
        }
        const ctx = this.getLayerContext(layer);
        if (activeSelection.sourceSnapshot) {
            ctx.putImageData(activeSelection.sourceSnapshot, activeSelection.originalX, activeSelection.originalY);
        }
        activeSelection.x = activeSelection.originalX;
        activeSelection.y = activeSelection.originalY;
        activeSelection.detached = false;
        activeSelection.sourceSnapshot = null;
        this.drawSelectionOutline(activeSelection);
        this.renderCurrentFrame();
    }

    clearSelection({ commitDetached = false } = {}) {
        if (activeSelection?.detached) {
            if (commitDetached) {
                this.commitDetachedSelection();
            } else {
                this.cancelDetachedSelection();
            }
        }
        activeSelection = null;
        selectionInteraction = null;
        this.clearOverlay();
    }

    copySelectionToClipboard({ cut = false } = {}) {
        if (!activeSelection) {
            return;
        }

        selectionClipboard = {
            width: activeSelection.width,
            height: activeSelection.height,
            imageData: new ImageData(new Uint8ClampedArray(activeSelection.imageData.data), activeSelection.width, activeSelection.height)
        };

        if (cut) {
            const frame = frames[currentFrame];
            const layer = frame.layers[currentLayer];
            if (!layer || layer.locked) {
                return;
            }
            this.saveState();
            const ctx = this.getLayerContext(layer);
            ctx.clearRect(activeSelection.originalX, activeSelection.originalY, activeSelection.width, activeSelection.height);
            this.renderCurrentFrame();
            this.clearSelection();
        }
    }

    pasteSelectionFromClipboard() {
        if (!selectionClipboard) {
            return;
        }
        const frame = frames[currentFrame];
        const layer = frame.layers[currentLayer];
        if (!layer || layer.locked) {
            return;
        }
        this.saveState();
        const ctx = this.getLayerContext(layer);
        const pasteX = activeSelection
            ? Math.max(0, Math.min(mainCanvas.width - selectionClipboard.width, activeSelection.x + 1))
            : 0;
        const pasteY = activeSelection
            ? Math.max(0, Math.min(mainCanvas.height - selectionClipboard.height, activeSelection.y + 1))
            : 0;
        ctx.putImageData(selectionClipboard.imageData, pasteX, pasteY);
        const refreshedData = ctx.getImageData(pasteX, pasteY, selectionClipboard.width, selectionClipboard.height);
        activeSelection = {
            x: pasteX,
            y: pasteY,
            width: selectionClipboard.width,
            height: selectionClipboard.height,
            imageData: refreshedData,
            originalX: pasteX,
            originalY: pasteY
        };
        this.drawSelectionOutline(activeSelection);
        this.renderCurrentFrame();
    }

    applyTransformAction({ flipX = false, flipY = false, rotate90 = false, scaleX = 1, scaleY = 1, skewX = 0, skewY = 0 } = {}) {
        if (activeSelection) {
            this.transformActiveSelection({ flipX, flipY, rotate90, scaleX, scaleY, skewX, skewY });
            return;
        }

        this.transformCurrentLayer({ flipX, flipY, rotate90, scaleX, scaleY, skewX, skewY });
    }

    buildTransformedImageData(sourceImageData, { flipX = false, flipY = false, rotate90 = false, scaleX = 1, scaleY = 1, skewX = 0, skewY = 0 } = {}) {
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = sourceImageData.width;
        sourceCanvas.height = sourceImageData.height;
        const sourceCtx = sourceCanvas.getContext('2d');
        sourceCtx.putImageData(sourceImageData, 0, 0);

        const outputCanvas = document.createElement('canvas');
        const swapAxes = Boolean(rotate90);
        const baseWidth = swapAxes ? sourceCanvas.height : sourceCanvas.width;
        const baseHeight = swapAxes ? sourceCanvas.width : sourceCanvas.height;
        const scaledWidth = Math.max(1, Math.round(baseWidth * Math.abs(scaleX)));
        const scaledHeight = Math.max(1, Math.round(baseHeight * Math.abs(scaleY)));
        const skewPadX = Math.ceil(Math.abs(Math.tan(skewX)) * scaledHeight);
        const skewPadY = Math.ceil(Math.abs(Math.tan(skewY)) * scaledWidth);
        outputCanvas.width = Math.max(1, scaledWidth + skewPadX);
        outputCanvas.height = Math.max(1, scaledHeight + skewPadY);
        const outCtx = outputCanvas.getContext('2d');
        this.applyImageSmoothing(outCtx);

        outCtx.save();
        outCtx.translate(outputCanvas.width / 2, outputCanvas.height / 2);
        outCtx.transform(1, Math.tan(skewY), Math.tan(skewX), 1, 0, 0);
        if (rotate90) {
            outCtx.rotate(Math.PI / 2);
        }
        outCtx.scale((flipX ? -1 : 1) * scaleX, (flipY ? -1 : 1) * scaleY);
        outCtx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
        outCtx.restore();

        return outCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
    }

    transformActiveSelection({ flipX = false, flipY = false, rotate90 = false, scaleX = 1, scaleY = 1, skewX = 0, skewY = 0 } = {}) {
        if (!activeSelection) {
            return;
        }

        if (!activeSelection.detached) {
            this.detachSelectionFromLayer();
        }

        activeSelection.imageData = this.buildTransformedImageData(activeSelection.imageData, { flipX, flipY, rotate90, scaleX, scaleY, skewX, skewY });
        activeSelection.width = activeSelection.imageData.width;
        activeSelection.height = activeSelection.imageData.height;

        activeSelection.x = Math.max(0, Math.min(mainCanvas.width - activeSelection.width, activeSelection.x));
        activeSelection.y = Math.max(0, Math.min(mainCanvas.height - activeSelection.height, activeSelection.y));
        activeSelection.originalX = Math.max(0, Math.min(mainCanvas.width - activeSelection.width, activeSelection.originalX));
        activeSelection.originalY = Math.max(0, Math.min(mainCanvas.height - activeSelection.height, activeSelection.originalY));

        this.drawSelectionOutline(activeSelection, { showPreview: true });
    }

    transformCurrentLayer({ flipX = false, flipY = false, rotate90 = false, scaleX = 1, scaleY = 1, skewX = 0, skewY = 0 } = {}) {
        const frame = frames[currentFrame];
        const layer = frame.layers[currentLayer];
        if (!layer || layer.locked) {
            return;
        }

        this.saveState();

        const ctx = this.getLayerContext(layer);
        const sourceImageData = ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
        const transformed = this.buildTransformedImageData(sourceImageData, { flipX, flipY, rotate90, scaleX, scaleY, skewX, skewY });

        ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);

        const offsetX = Math.max(0, Math.floor((layer.canvas.width - transformed.width) / 2));
        const offsetY = Math.max(0, Math.floor((layer.canvas.height - transformed.height) / 2));
        ctx.putImageData(transformed, offsetX, offsetY);

        this.renderCurrentFrame();
    }

    getEventPressure(event) {
        if (!pressureSensitivityEnabled) {
            return 1;
        }

        if (!event) {
            return 1;
        }

        if (typeof event.pressure === 'number' && event.pressure > 0) {
            return Math.max(0.05, Math.min(1, event.pressure));
        }

        if (event.pointerType === 'mouse' || event.buttons) {
            return 1;
        }

        return 1;
    }

    getPressureAdjustedBrushSize() {
        if (!pressureSensitivityEnabled || !pressureAffectsSize) {
            return brushSize;
        }
        return Math.max(1, brushSize * Math.max(0.1, currentInputPressure));
    }

    getPressureAdjustedFlow() {
        if (!pressureSensitivityEnabled || !pressureAffectsFlow) {
            return brushFlow;
        }
        return Math.max(0.02, brushFlow * Math.max(0.05, currentInputPressure));
    }

    // Drawing methods
    startDrawing(e) {
        const tool = this.getCurrentToolConfig();

        if (tool?.saveStateOnStart) {
            this.saveState();
        }

        isDrawing = true;
        currentInputPressure = this.getEventPressure(e);
        const coords = this.screenToCanvas(e.clientX, e.clientY);
        lastMousePos = coords; // Initialize last position
        this.startShape = coords; // For shape tools
        tool?.onStart?.(this, {
            coords,
            modifiers: {
                keepSquare: e.shiftKey,
                straightLine: e.shiftKey,
                snapAngle: e.shiftKey && (e.ctrlKey || e.metaKey)
            }
        });
    }

    draw(e) {
        if (!isDrawing) return;
        currentInputPressure = this.getEventPressure(e);
        const currentCoords = this.screenToCanvas(e.clientX, e.clientY);
        const tool = this.getCurrentToolConfig();

        tool?.onDraw?.(this, {
            currentCoords,
            lastMousePos,
            startShape: this.startShape,
            modifiers: {
                keepSquare: e.shiftKey,
                straightLine: e.shiftKey,
                snapAngle: e.shiftKey && (e.ctrlKey || e.metaKey)
            }
        });

        lastMousePos = currentCoords;
    }

    stopDrawing(e) {
        if (!isDrawing) return;
        isDrawing = false;
        currentInputPressure = 1;
        const tool = this.getCurrentToolConfig();
        tool?.onStop?.(this, {
            startShape: this.startShape,
            lastMousePos,
            modifiers: {
                keepSquare: Boolean(e?.shiftKey),
                straightLine: Boolean(e?.shiftKey),
                snapAngle: Boolean(e?.shiftKey && (e?.ctrlKey || e?.metaKey))
            }
        });

        lastMousePos = null;
        this.startShape = null;
    }

    drawPoint(x, y, useStrokeCtx = false) {
        const useStrokeLayer = useStrokeCtx && strokeCtx && (currentTool === "pen" || currentTool === "eraser");
        const ctx = useStrokeLayer ? strokeCtx : (() => {
            const frame = frames[currentFrame];
            const layer = frame.layers[currentLayer];
            if (!layer || layer.locked) return null;
            return this.getLayerContext(layer);
        })();
        if (!ctx) return;
        ctx.save();
        this.applyImageSmoothing(ctx);
        ctx.globalAlpha = useStrokeLayer ? 1.0 : currentOpacity;
        const coords = antialiasingEnabled ? { x, y } : this.roundToPixel(x, y);
        const tool = this.getCurrentToolConfig();
        tool?.drawPoint?.(this, { ctx, coords, useStrokeCtx });
        ctx.restore();
        if (useStrokeLayer) {
            this.showStrokePreview();
        } else {
            this.renderCurrentFrame();
        }
    }

    floodFill(ctx, startX, startY, fillColor) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const safeStartX = Math.max(0, Math.min(width - 1, Math.round(startX)));
        const safeStartY = Math.max(0, Math.min(height - 1, Math.round(startY)));

        if (!Number.isFinite(safeStartX) || !Number.isFinite(safeStartY)) {
            return;
        }

        const targetImageData = ctx.getImageData(0, 0, width, height);
        const targetPixels = targetImageData.data;
        const samplePixels = fillSampleAllLayers ? this.getMergedVisibleLayersImageData().data : targetPixels;

        const startPos = (safeStartY * width + safeStartX) * 4;
        const startR = samplePixels[startPos];
        const startG = samplePixels[startPos + 1];
        const startB = samplePixels[startPos + 2];

        const fillR = parseInt(fillColor.substr(1, 2), 16);
        const fillG = parseInt(fillColor.substr(3, 2), 16);
        const fillB = parseInt(fillColor.substr(5, 2), 16);

        if (!fillSampleAllLayers && startR === fillR && startG === fillG && startB === fillB) {
            return;
        }

        const colorDistance = (index) => {
            const r = samplePixels[index];
            const g = samplePixels[index + 1];
            const b = samplePixels[index + 2];
            return Math.sqrt(
                Math.pow(r - startR, 2) +
                Math.pow(g - startG, 2) +
                Math.pow(b - startB, 2)
            );
        };

        const pixelsToFill = [];

        if (fillContiguous) {
            const stack = [[safeStartX, safeStartY]];
            const visited = new Set();

            while (stack.length) {
                const [x, y] = stack.pop();
                if (x < 0 || x >= width || y < 0 || y >= height) {
                    continue;
                }

                const pos = (y * width + x) * 4;
                if (visited.has(pos)) {
                    continue;
                }

                visited.add(pos);
                if (colorDistance(pos) > fillTolerance) {
                    continue;
                }

                pixelsToFill.push(pos);
                stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
            }
        } else {
            for (let pos = 0; pos < samplePixels.length; pos += 4) {
                if (colorDistance(pos) <= fillTolerance) {
                    pixelsToFill.push(pos);
                }
            }
        }

        pixelsToFill.forEach((pos) => {
            targetPixels[pos] = fillR;
            targetPixels[pos + 1] = fillG;
            targetPixels[pos + 2] = fillB;
            targetPixels[pos + 3] = 255;
        });

        ctx.putImageData(targetImageData, 0, 0);
    }

    getMergedVisibleLayersImageData() {
        const frame = frames[currentFrame];
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = mainCanvas.width;
        tempCanvas.height = mainCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        this.applyImageSmoothing(tempCtx);

        frame.layers.forEach((layer) => {
            if (!layer.visible) {
                return;
            }
            tempCtx.drawImage(layer.canvas, 0, 0);
        });

        return tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    }

    drawLine(x1, y1, x2, y2, useStrokeCtx = false) {
        const useStrokeLayer = useStrokeCtx && strokeCtx && (currentTool === "pen" || currentTool === "eraser");
        if (antialiasingEnabled) {
            const ctx = useStrokeLayer ? strokeCtx : (() => {
                const frame = frames[currentFrame];
                const layer = frame.layers[currentLayer];
                if (!layer || layer.locked) return null;
                return this.getLayerContext(layer);
            })();
            if (!ctx) return;
            ctx.save();
            this.applyImageSmoothing(ctx);
            ctx.globalAlpha = useStrokeLayer ? 1.0 : currentOpacity;
            const tool = this.getCurrentToolConfig();
            tool?.drawLine?.(this, { ctx, x1, y1, x2, y2, useStrokeCtx });
            ctx.restore();
            if (useStrokeLayer) {
                this.showStrokePreview();
            } else {
                this.renderCurrentFrame();
            }
        } else {
            let dx = Math.abs(x2 - x1);
            let dy = Math.abs(y2 - y1);
            let sx = x1 < x2 ? 1 : -1;
            let sy = y1 < y2 ? 1 : -1;
            let err = dx - dy;
            let x = x1;
            let y = y1;
            while (true) {
                this.drawPoint(x, y, useStrokeCtx);
                if (x === x2 && y === y2) break;
                let e2 = 2 * err;
                if (e2 > -dy) { err -= dy; x += sx; }
                if (e2 < dx) { err += dx; y += sy; }
            }
            if (useStrokeLayer) {
                this.showStrokePreview();
            } else {
                this.renderCurrentFrame();
            }
        }
    }

    getConstrainedShapeEndPoint(start, end, { keepSquare = false, tool } = {}) {
        if (!keepSquare || (tool !== 'rectangle' && tool !== 'circle')) {
            return end;
        }

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        const fallbackSignX = dy === 0 ? 1 : Math.sign(dy);
        const fallbackSignY = dx === 0 ? 1 : Math.sign(dx);
        const signX = dx === 0 ? fallbackSignX : Math.sign(dx);
        const signY = dy === 0 ? fallbackSignY : Math.sign(dy);

        return {
            x: start.x + (size * signX),
            y: start.y + (size * signY)
        };
    }

    drawShapePreview(start, end, tool, { keepSquare = false } = {}) {
        overlayCtx.save();
        this.applyImageSmoothing(overlayCtx);
        
        const startCoords = antialiasingEnabled ? start : this.roundToPixel(start.x, start.y);
        const constrainedEnd = this.getConstrainedShapeEndPoint(startCoords, end, { keepSquare, tool });
        const endCoords = antialiasingEnabled ? constrainedEnd : this.roundToPixel(constrainedEnd.x, constrainedEnd.y);
        
        overlayCtx.strokeStyle = currentColor;
        overlayCtx.lineWidth = brushSize;
        overlayCtx.globalAlpha = currentOpacity;
        overlayCtx.setLineDash([4, 4]);
        overlayCtx.lineCap = 'round';
        overlayCtx.lineJoin = tool === 'rectangle' ? 'miter' : 'round';
        overlayCtx.beginPath();
        
        if (tool === "line") {
            overlayCtx.moveTo(startCoords.x, startCoords.y);
            overlayCtx.lineTo(endCoords.x, endCoords.y);
        } else if (tool === "rectangle") {
            const halfBrush = brushSize / 2;
            const x = Math.min(startCoords.x, endCoords.x) + halfBrush;
            const y = Math.min(startCoords.y, endCoords.y) + halfBrush;
            const width = Math.abs(startCoords.x - endCoords.x) - brushSize;
            const height = Math.abs(startCoords.y - endCoords.y) - brushSize;
            if (width > 0 && height > 0) {
                overlayCtx.rect(x, y, width, height);
            }
        } else if (tool === "circle") {
            const rx = (endCoords.x - startCoords.x) / 2;
            const ry = (endCoords.y - startCoords.y) / 2;
            const cx = startCoords.x + rx;
            const cy = startCoords.y + ry;
            const halfBrush = brushSize / 2;
            const adjustedRx = Math.max(0, Math.abs(rx) - halfBrush);
            const adjustedRy = Math.max(0, Math.abs(ry) - halfBrush);
            if (adjustedRx > 0 && adjustedRy > 0) {
                overlayCtx.ellipse(cx, cy, adjustedRx, adjustedRy, 0, 0, 2 * Math.PI);
            }
        }
        
        overlayCtx.stroke();
        overlayCtx.restore();
    }

    commitShape(start, end, tool, { keepSquare = false } = {}) {
        const frame = frames[currentFrame];
        const layer = frame.layers[currentLayer];
        if (!layer || layer.locked) return;
        
        const ctx = this.getLayerContext(layer);
        
        if (antialiasingEnabled) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            const startCoords = start;
            const endCoords = this.getConstrainedShapeEndPoint(start, end, { keepSquare, tool });
            ctx.strokeStyle = currentColor;
            ctx.lineWidth = brushSize;
            ctx.globalAlpha = currentOpacity;
            ctx.lineCap = 'round';
            ctx.lineJoin = tool === 'rectangle' ? 'miter' : 'round';
            ctx.beginPath();

            if (tool === "line") {
                ctx.moveTo(startCoords.x, startCoords.y);
                ctx.lineTo(endCoords.x, endCoords.y);
            } else if (tool === "rectangle") {
                const halfBrush = brushSize / 2;
                const x = Math.min(startCoords.x, endCoords.x) + halfBrush;
                const y = Math.min(startCoords.y, endCoords.y) + halfBrush;
                const width = Math.abs(startCoords.x - endCoords.x) - brushSize;
                const height = Math.abs(startCoords.y - endCoords.y) - brushSize;
                if (width > 0 && height > 0) {
                    ctx.rect(x, y, width, height);
                }
            } else if (tool === "circle") {
                const rx = (endCoords.x - startCoords.x) / 2;
                const ry = (endCoords.y - startCoords.y) / 2;
                const cx = startCoords.x + rx;
                const cy = startCoords.y + ry;
                const halfBrush = brushSize / 2;
                const adjustedRx = Math.max(0, Math.abs(rx) - halfBrush);
                const adjustedRy = Math.max(0, Math.abs(ry) - halfBrush);
                if (adjustedRx > 0 && adjustedRy > 0) {
                    ctx.ellipse(cx, cy, adjustedRx, adjustedRy, 0, 0, 2 * Math.PI);
                }
            }
            ctx.stroke();
        } else {
            ctx.imageSmoothingEnabled = false;
            
            const startCoords = this.roundToPixel(start.x, start.y);
            const constrainedEnd = this.getConstrainedShapeEndPoint(startCoords, end, { keepSquare, tool });
            const endCoords = this.roundToPixel(constrainedEnd.x, constrainedEnd.y);
            
            ctx.fillStyle = currentColor;
            ctx.strokeStyle = currentColor;
            ctx.globalAlpha = currentOpacity;
            
            if (tool === "line") {
                this.drawPixelPerfectLineWithFillRect(ctx, startCoords.x, startCoords.y, endCoords.x, endCoords.y);
            } else if (tool === "rectangle") {
                const x = Math.min(startCoords.x, endCoords.x);
                const y = Math.min(startCoords.y, endCoords.y);
                const width = Math.abs(endCoords.x - startCoords.x);
                const height = Math.abs(endCoords.y - startCoords.y);
                const bs = Math.round(brushSize);
                if (bs <= 0) return;

                if (bs * 2 > width || bs * 2 > height) {
                    ctx.fillRect(x, y, width, height);
                } else {
                    ctx.fillRect(x, y, width, bs);
                    ctx.fillRect(x, y + height - bs, width, bs);
                    ctx.fillRect(x, y + bs, bs, height - 2 * bs);
                    ctx.fillRect(x + width - bs, y + bs, bs, height - 2 * bs);
                }
            } else if (tool === "circle") {
                const rx = (endCoords.x - startCoords.x) / 2;
                const ry = (endCoords.y - startCoords.y) / 2;
                const cx = startCoords.x + rx;
                const cy = startCoords.y + ry;
                this.drawPixelPerfectCircleWithFillRect(ctx, cx, cy, rx, ry);
            }
        }
        
        this.renderCurrentFrame();
    }
    
    getInterpolatedStrokePoints(x1, y1, x2, y2, spacing = 1) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const distance = Math.hypot(dx, dy);
        const stepDistance = Math.max(0.25, spacing);
        const steps = Math.max(1, Math.ceil(distance / stepDistance));
        const points = [];

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            points.push({
                x: x1 + dx * t,
                y: y1 + dy * t
            });
        }

        return points;
    }

    getPixelPerfectLinePoints(x1, y1, x2, y2) {
        let startX = Math.round(x1);
        let startY = Math.round(y1);
        const endX = Math.round(x2);
        const endY = Math.round(y2);
        const points = [];
        const dx = Math.abs(endX - startX);
        const dy = Math.abs(endY - startY);
        const sx = startX < endX ? 1 : -1;
        const sy = startY < endY ? 1 : -1;
        let err = dx - dy;

        while (true) {
            points.push({ x: startX, y: startY });

            if (startX === endX && startY === endY) {
                return points;
            }

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                startX += sx;
            }
            if (e2 < dx) {
                err += dx;
                startY += sy;
            }
        }
    }

    drawPixelPerfectBrushStamp(ctx, centerX, centerY, size, shape = 'square') {
        const stampSize = Math.max(1, Math.round(size));
        const stampCenterX = Math.round(centerX);
        const stampCenterY = Math.round(centerY);
        const offset = Math.floor(stampSize / 2);

        if (shape !== 'circle' || stampSize === 1) {
            ctx.fillRect(stampCenterX - offset, stampCenterY - offset, stampSize, stampSize);
            return;
        }

        const radius = stampSize / 2;

        for (let y = 0; y < stampSize; y++) {
            for (let x = 0; x < stampSize; x++) {
                const pixelCenterX = x - offset + 0.5;
                const pixelCenterY = y - offset + 0.5;
                if ((pixelCenterX * pixelCenterX) + (pixelCenterY * pixelCenterY) <= radius * radius) {
                    ctx.fillRect(stampCenterX - offset + x, stampCenterY - offset + y, 1, 1);
                }
            }
        }
    }

    drawBrushStamp(ctx, x, y, { color = currentColor } = {}) {
        const usePixelPreset = brushPreset === 'pixel';
        const shape = usePixelPreset ? 'square' : brushShape;
        const size = Math.max(1, this.getPressureAdjustedBrushSize());
        const isSquare = shape === 'square';
        const originalAlpha = ctx.globalAlpha;
        const baseAlpha = originalAlpha * this.getPressureAdjustedFlow();
        ctx.globalAlpha = baseAlpha;

        if (usePixelPreset || !antialiasingEnabled) {
            ctx.fillStyle = color;
            this.drawPixelPerfectBrushStamp(ctx, x, y, size, shape);
            ctx.globalAlpha = originalAlpha;
            return;
        }

        if (brushPreset === 'soft-round' && !isSquare) {
            const radius = Math.max(0.5, size / 2);
            const parsedColor = normalizeHexColor(color) || '#000000';
            const rgb = {
                r: parseInt(parsedColor.slice(1, 3), 16),
                g: parseInt(parsedColor.slice(3, 5), 16),
                b: parseInt(parsedColor.slice(5, 7), 16)
            };
            const gradient = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
            gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`);
            gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = originalAlpha;
            return;
        }

        if (brushPreset === 'textured') {
            ctx.fillStyle = color;
            const scatterCount = Math.max(8, Math.round(size * 2));
            for (let i = 0; i < scatterCount; i++) {
                const angle = ((i * 97) % 360) * (Math.PI / 180);
                const radius = (Math.sin((x + y + i) * 12.9898) * 0.5 + 0.5) * (size / 2);
                const dotX = x + Math.cos(angle) * radius;
                const dotY = y + Math.sin(angle) * radius;
                const dotSize = Math.max(1, Math.round(size / 6));
                ctx.globalAlpha = baseAlpha * (0.35 + ((i % 7) / 10));
                ctx.fillRect(Math.round(dotX), Math.round(dotY), dotSize, dotSize);
            }
            ctx.globalAlpha = originalAlpha;
            return;
        }

        ctx.fillStyle = color;
        if (isSquare) {
            const offset = size / 2;
            ctx.fillRect(x - offset, y - offset, size, size);
            ctx.globalAlpha = originalAlpha;
            return;
        }

        if (size === 1) {
            ctx.fillRect(x, y, 1, 1);
            ctx.globalAlpha = originalAlpha;
            return;
        }

        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = originalAlpha;
    }

    drawBrushLine(ctx, x1, y1, x2, y2, { color = currentColor } = {}) {
        const usePixelPreset = brushPreset === 'pixel';
        const shape = usePixelPreset ? 'square' : brushShape;
        const adjustedSize = this.getPressureAdjustedBrushSize();
        const stampSpacing = Math.max(0.25, adjustedSize * brushSpacing);

        if (usePixelPreset || !antialiasingEnabled) {
            const points = this.getPixelPerfectLinePoints(x1, y1, x2, y2);
            ctx.fillStyle = color;
            points.forEach(({ x, y }) => {
                this.drawPixelPerfectBrushStamp(ctx, x, y, adjustedSize, shape);
            });
            return;
        }

        if (brushPreset === 'soft-round' || brushPreset === 'textured' || shape === 'square') {
            const points = this.getInterpolatedStrokePoints(x1, y1, x2, y2, stampSpacing);
            points.forEach(({ x, y }) => {
                this.drawBrushStamp(ctx, x, y, { color });
            });
            return;
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = adjustedSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    drawPixelPerfectLineWithFillRect(ctx, x1, y1, x2, y2) {
        const points = this.getPixelPerfectLinePoints(x1, y1, x2, y2);

        points.forEach(({ x, y }) => {
            this.drawPixelPerfectBrushStamp(ctx, x, y, brushSize, brushShape);
        });
    }
    
    drawPixelPerfectCircleWithFillRect(ctx, cx, cy, rx, ry) {
        rx = Math.round(Math.abs(rx));
        ry = Math.round(Math.abs(ry));
        const thickness = Math.round(brushSize);

        if (thickness <= 0 || (rx === 0 && ry === 0)) return;

        const outer_rx = rx;
        const outer_ry = ry;
        
        const isFilled = thickness >= outer_rx || thickness >= outer_ry;
        
        const inner_rx = isFilled ? 0 : outer_rx - thickness;
        const inner_ry = isFilled ? 0 : outer_ry - thickness;

        const outer_rx_sq = outer_rx * outer_rx;
        const outer_ry_sq = outer_ry * outer_ry;
        const inner_rx_sq = inner_rx * inner_rx;
        const inner_ry_sq = inner_ry * inner_ry;

        const cx_round = Math.round(cx);
        const cy_round = Math.round(cy);

        const outer_limit = outer_rx_sq * outer_ry_sq;
        const inner_limit = inner_rx_sq * inner_ry_sq;

        for (let y = -outer_ry; y <= outer_ry; y++) {
            for (let x = -outer_rx; x <= outer_rx; x++) {
                const x_sq = x * x;
                const y_sq = y * y;

                if (x_sq * outer_ry_sq + y_sq * outer_rx_sq <= outer_limit) {
                    if (isFilled) {
                        ctx.fillRect(cx_round + x, cy_round + y, 1, 1);
                    } else {
                        if (inner_limit === 0 || x_sq * inner_ry_sq + y_sq * inner_rx_sq > inner_limit) {
                            ctx.fillRect(cx_round + x, cy_round + y, 1, 1);
                        }
                    }
                }
            }
        }
    }

    // Frame methods
    addFrame() {
        if (activeSelection) this.clearSelection();
        const newFrame = {
            id: frames.length,
            name: `Frame ${frames.length + 1}`,
            layers: [],
            timestamp: Date.now()
        };
        // Create empty layers matching the global layers array
        layers.forEach(layerTemplate => {
            const newLayer = {
                id: layerTemplate.id,
                name: layerTemplate.name,
                visible: layerTemplate.visible,
                locked: layerTemplate.locked,
                canvas: document.createElement('canvas')
            };
            newLayer.canvas.width = mainCanvas.width;
            newLayer.canvas.height = mainCanvas.height;
            const ctx = this.getLayerContext(newLayer);
            this.applyImageSmoothing(ctx);
            // Optionally fill background for background layer
            if (newLayer.id === 0) {
                if (hasTransparentBackground) {
                    // Clear canvas for transparent background
                    ctx.clearRect(0, 0, newLayer.canvas.width, newLayer.canvas.height);
                } else {
                    // Set solid background color
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, newLayer.canvas.width, newLayer.canvas.height);
                }
            }
            newFrame.layers.push(newLayer);
        });
        frames.push(newFrame);
        this.selectFrame(frames.length - 1);
        this.updateTimeline();
    }

    duplicateFrame() {
        if (activeSelection) this.clearSelection();
        if (frames.length === 0) return;
        
        const duplicatedFrame = {
            id: frames.length,
            name: `Frame ${frames.length + 1}`,
            layers: [],
            timestamp: Date.now()
        };

        frames[currentFrame].layers.forEach(layer => {
            const newLayer = {
                id: layer.id,
                name: layer.name,
                visible: layer.visible,
                locked: layer.locked,
                canvas: document.createElement('canvas')
            };
            newLayer.canvas.width = mainCanvas.width;
            newLayer.canvas.height = mainCanvas.height;
            const ctx = this.getLayerContext(newLayer);
            
            // Disable image smoothing for pixel-perfect rendering
            this.applyImageSmoothing(ctx);
            
            ctx.drawImage(layer.canvas, 0, 0);
            duplicatedFrame.layers.push(newLayer);
        });

        frames.push(duplicatedFrame);
        this.selectFrame(frames.length - 1);
        this.updateTimeline();
    }

    deleteFrame() {
        if (activeSelection) this.clearSelection();
        if (frames.length <= 1) return;
        
        frames.splice(currentFrame, 1);
        this.reindexFrames();
        
        if (currentFrame >= frames.length) {
            currentFrame = frames.length - 1;
        }
        
        this.selectFrame(currentFrame);
        this.updateTimeline();
    }

    reindexFrames() {
        frames.forEach((frame, index) => {
            frame.id = index;
            frame.name = `Frame ${index + 1}`;
        });
    }

    moveFrame(fromIndex, toIndex) {
        if (activeSelection) this.clearSelection();
        if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= frames.length || toIndex >= frames.length) {
            return;
        }

        this.saveStructureState();

        const [movedFrame] = frames.splice(fromIndex, 1);
        frames.splice(toIndex, 0, movedFrame);
        this.reindexFrames();
        currentFrame = toIndex;
        this.renderCurrentFrame();
        this.updateTimeline();
        this.updateStatusBar();
    }

    moveFrameLeft() {
        if (currentFrame <= 0) return;
        this.moveFrame(currentFrame, currentFrame - 1);
    }

    moveFrameRight() {
        if (currentFrame >= frames.length - 1) return;
        this.moveFrame(currentFrame, currentFrame + 1);
    }

    selectFrame(frameIndex) {
        if (activeSelection) {
            this.clearSelection();
        }
        currentFrame = frameIndex;
        this.renderCurrentFrame();
        this.updateTimeline();
        this.updateStatusBar();
    }

    // Animation methods
    toggleAnimation() {
        if (frames.length <= 1) return;
        
        if (isAnimating) {
            // Stop animation
            isAnimating = false;
            const playPauseBtn = document.getElementById('playPauseBtn');
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            playPauseBtn.title = 'Play Animation (Space)';
        } else {
            // Start animation
            isAnimating = true;
            const playPauseBtn = document.getElementById('playPauseBtn');
            playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            playPauseBtn.title = 'Pause Animation (Space)';
            this.animate();
        }
    }

    stopAnimation() {
        // This function is no longer used - replaced by toggleAnimation
    }

    animate() {
        if (!isAnimating) return;
        
        const fps = parseInt(document.getElementById('fpsSlider').value);
        const frameDelay = 1000 / fps;
        
        setTimeout(() => {
            if (!isAnimating) return;
            
            currentFrame = (currentFrame + 1) % frames.length;
            this.selectFrame(currentFrame);
            this.animate();
        }, frameDelay);
    }

    // Rendering methods
    renderCurrentFrame() {
        // Clear main canvas
        mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        // Apply smoothing settings to main canvas context
        this.applyImageSmoothing(mainCtx);
        if (frames.length === 0) return;
        const frame = frames[currentFrame];
        // Draw layers of the current frame first
        frame.layers.forEach(layer => {
            if (layer.visible) {
                mainCtx.globalAlpha = layer.locked ? 0.5 : 1.0;
                mainCtx.drawImage(layer.canvas, 0, 0);
            }
        });
        // Then, draw onion skinning on top
        if (onionSkinningEnabled) {
            this.drawOnionSkinning();
        }
        if (referenceImage && referenceVisible) {
            mainCtx.globalAlpha = referenceOpacity;
            const scaledWidth = referenceImage.width * referenceScale;
            const scaledHeight = referenceImage.height * referenceScale;
            mainCtx.drawImage(referenceImage, referenceX, referenceY, scaledWidth, scaledHeight);
        }
        mainCtx.globalAlpha = 1.0;
        // --- Live update timeline after every frame render ---
        this.updateTimeline();
    }

    drawOnionSkinning() {
        const range = onionSkinningRange;
        const currentIndex = currentFrame;
        
        // Draw previous frames
        for (let i = 1; i <= range; i++) {
            const frameIndex = currentIndex - i;
            if (frameIndex >= 0) {
                this.drawFrameAsOnionSkin(frames[frameIndex], 0.3 / i);
            }
        }
        
        // Draw next frames
        for (let i = 1; i <= range; i++) {
            const frameIndex = currentIndex + i;
            if (frameIndex < frames.length) {
                this.drawFrameAsOnionSkin(frames[frameIndex], 0.2 / i);
            }
        }
    }

    drawFrameAsOnionSkin(frame, alpha) {
        mainCtx.globalAlpha = alpha;
        frame.layers.forEach(layer => {
            if (layer.visible) {
                mainCtx.drawImage(layer.canvas, 0, 0);
            }
        });
    }

    // Layer methods
    addLayer() {
        if (activeSelection) this.clearSelection();
        this.saveStructureState(); // Save state for undo
        const newLayer = {
            id: layers.length,
            name: `Layer ${layers.length + 1}`,
            visible: true,
            locked: false
        };
        
        layers.push(newLayer);
        
        // Add layer to all frames
        frames.forEach(frame => {
            const layerCanvas = document.createElement('canvas');
            layerCanvas.width = mainCanvas.width;
            layerCanvas.height = mainCanvas.height;
            const ctx = layerCanvas.getContext('2d');
            
            // Disable image smoothing for pixel-perfect rendering
            this.applyImageSmoothing(ctx);
            
            ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
            
            frame.layers.push({
                id: newLayer.id,
                name: newLayer.name,
                visible: newLayer.visible,
                locked: newLayer.locked,
                canvas: layerCanvas
            });
        });
        
        this.updateLayerList();
        this.renderCurrentFrame();
    }

    deleteLayer() {
        if (activeSelection) this.clearSelection();
        if (layers.length <= 1) return;
        
        this.saveStructureState(); // Save state for undo
        
        layers.splice(currentLayer, 1);
        
        // Remove layer from all frames
        frames.forEach(frame => {
            frame.layers.splice(currentLayer, 1);
        });
        
        if (currentLayer >= layers.length) {
            currentLayer = layers.length - 1;
        }
        
        this.updateLayerList();
        this.renderCurrentFrame();
    }

    moveLayerUp() {
        if (activeSelection) this.clearSelection();
        if (currentLayer >= layers.length - 1) return;

        this.saveStructureState(); // Save state for undo

        // Swap with layer above
        [layers[currentLayer], layers[currentLayer + 1]] = [layers[currentLayer + 1], layers[currentLayer]];

        // Swap in each frame's layer array
        frames.forEach(frame => {
            [frame.layers[currentLayer], frame.layers[currentLayer + 1]] = [frame.layers[currentLayer + 1], frame.layers[currentLayer]];
        });

        currentLayer++;
        this.updateLayerList();
        this.renderCurrentFrame();
    }

    moveLayerDown() {
        if (activeSelection) this.clearSelection();
        if (currentLayer <= 0) return;

        this.saveStructureState(); // Save state for undo

        // Swap with layer below
        [layers[currentLayer], layers[currentLayer - 1]] = [layers[currentLayer - 1], layers[currentLayer]];

        // Swap in each frame's layer array
        frames.forEach(frame => {
            [frame.layers[currentLayer], frame.layers[currentLayer - 1]] = [frame.layers[currentLayer - 1], frame.layers[currentLayer]];
        });

        currentLayer--;
        this.updateLayerList();
        this.renderCurrentFrame();
    }

    flattenLayer() {
        if (activeSelection) this.clearSelection();
        if (currentLayer <= 0) {
            alert("Cannot flatten the bottom layer.");
            return;
        }

        this.saveStructureState(); // Save state for undo

        const layerToFlattenIndex = currentLayer;
        const layerBelowIndex = currentLayer - 1;

        // Merge layer in each frame
        frames.forEach(frame => {
            const layerToFlatten = frame.layers[layerToFlattenIndex];
            const layerBelow = frame.layers[layerBelowIndex];
            
            const ctxBelow = this.getLayerContext(layerBelow);
            ctxBelow.drawImage(layerToFlatten.canvas, 0, 0);
        });

        // Remove the flattened layer from global list
        layers.splice(layerToFlattenIndex, 1);
        
        // Remove flattened layer from each frame
        frames.forEach(frame => {
            frame.layers.splice(layerToFlattenIndex, 1);
        });

        currentLayer--;
        this.updateLayerList();
        this.renderCurrentFrame();
    }

    // UI update methods
    updateTimeline() {
        const timeline = document.getElementById('timeline');
        timeline.innerHTML = '';
        frames.forEach((frame, index) => {
            const frameElement = document.createElement('div');
            frameElement.className = `frame-item ${index === currentFrame ? 'active' : ''}`;
            frameElement.dataset.frame = index;
            frameElement.draggable = true;
            frameElement.addEventListener('dragstart', (event) => {
                draggedFrameIndex = index;
                frameElement.classList.add('dragging');
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(index));
                }
            });
            frameElement.addEventListener('dragend', () => {
                draggedFrameIndex = null;
                frameElement.classList.remove('dragging');
                timeline.querySelectorAll('.frame-item').forEach((item) => item.classList.remove('drag-over'));
            });
            frameElement.addEventListener('dragover', (event) => {
                if (draggedFrameIndex === null || draggedFrameIndex === index) {
                    return;
                }
                event.preventDefault();
                frameElement.classList.add('drag-over');
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = 'move';
                }
            });
            frameElement.addEventListener('dragleave', () => {
                frameElement.classList.remove('drag-over');
            });
            frameElement.addEventListener('drop', (event) => {
                event.preventDefault();
                frameElement.classList.remove('drag-over');
                if (draggedFrameIndex === null || draggedFrameIndex === index) {
                    return;
                }
                this.moveFrame(draggedFrameIndex, index);
            });
            // Create a canvas for the preview
            const previewCanvas = document.createElement('canvas');
            previewCanvas.width = 50;
            previewCanvas.height = 40;
            const previewCtx = previewCanvas.getContext('2d');
            
            // Fill with background color
            previewCtx.fillStyle = '#222';
            previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
            // Composite all visible layers, scaled to fit
            const scaleX = previewCanvas.width / mainCanvas.width;
            const scaleY = previewCanvas.height / mainCanvas.height;
            frame.layers.forEach(layer => {
                if (layer.visible) {
                    previewCtx.save();
                    previewCtx.globalAlpha = layer.locked ? 0.5 : 1.0;
                    previewCtx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
                    previewCtx.drawImage(layer.canvas, 0, 0);
                    previewCtx.setTransform(1, 0, 0, 1, 0, 0);
                    previewCtx.restore();
                }
            });
            // Add the preview canvas to the frame preview div
            const previewDiv = document.createElement('div');
            previewDiv.className = 'frame-preview';
            previewDiv.appendChild(previewCanvas);
            // Add frame number
            const numberSpan = document.createElement('span');
            numberSpan.className = 'frame-number';
            numberSpan.textContent = (index + 1).toString();
            frameElement.appendChild(previewDiv);
            frameElement.appendChild(numberSpan);
            frameElement.addEventListener('click', () => this.selectFrame(index));
            timeline.appendChild(frameElement);
        });
    }

    updateLayerList() {
        const layerList = document.getElementById('layerList');
        layerList.innerHTML = '';
        
        layers.forEach((layer, index) => {
            const layerElement = document.createElement('div');
            layerElement.className = `layer-item ${index === currentLayer ? 'active' : ''}`;
            layerElement.dataset.layer = index;
            
            layerElement.innerHTML = `
                <div class="layer-info">
                    <span class="layer-name">${layer.name}</span>
                    ${index === currentLayer ? '<i class="fas fa-pencil-alt layer-indicator"></i>' : ''}
                </div>
                <div class="layer-visibility">
                    <i class="fas fa-${layer.visible ? 'eye' : 'eye-slash'}"></i>
                </div>
            `;

            const visibilityToggle = layerElement.querySelector('.layer-visibility');
            visibilityToggle.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent layer selection when toggling visibility
                this.toggleLayerVisibility(index);
            });
            
            layerElement.addEventListener('click', () => this.selectLayer(index));
            layerList.prepend(layerElement);
        });
    }

    selectLayer(layerIndex) {
        if (activeSelection) {
            this.clearSelection();
        }
        currentLayer = layerIndex;
        this.renderCurrentFrame();
        this.updateLayerList();
        this.updateStatusBar();
    }

    toggleLayerVisibility(layerIndex) {
        this.saveStructureState(); // Save for undo

        const layer_template = layers[layerIndex];
        layer_template.visible = !layer_template.visible;

        // Propagate visibility change to all frames
        frames.forEach(frame => {
            const layer = frame.layers[layerIndex];
            if (layer) {
                layer.visible = layer_template.visible;
            }
        });

        this.updateLayerList();
        this.renderCurrentFrame();
    }

    updateStatusBar() {
        const toolNames = {
            pen: 'Pen Tool',
            line: 'Line Tool',
            rectangle: 'Rectangle Tool',
            circle: 'Circle Tool',
            fill: 'Fill Tool',
            eraser: 'Eraser Tool',
            selection: 'Selection Tool'
        };
        
        document.getElementById('currentTool').textContent = toolNames[currentTool] || 'Unknown Tool';
        document.getElementById('currentColor').textContent = `Color: ${currentColor}`;
        const pressureStatus = pressureSensitivityEnabled
            ? `pressure ${Math.round(currentInputPressure * 100)}%`
            : 'pressure off';
        document.getElementById('brushSize').textContent = `Size: ${brushSize}px (${brushPreset}, flow ${Math.round(brushFlow * 100)}%, spacing ${Math.round(brushSpacing * 100)}%, ${pressureStatus})`;
        document.getElementById('currentFrame').textContent = `Frame: ${currentFrame + 1}`;
        document.getElementById('totalFrames').textContent = `Total: ${frames.length}`;
        document.getElementById('canvasDimensions').textContent = `${mainCanvas.width}x${mainCanvas.height}`;
        
        // Add current layer information
        const currentLayerName = layers[currentLayer] ? layers[currentLayer].name : 'Unknown';
        const currentLayerInfo = `Layer: ${currentLayerName}`;
        const statusLeft = document.querySelector('.status-left');
        const existingLayerInfo = statusLeft.querySelector('#currentLayerInfo');
        if (existingLayerInfo) {
            existingLayerInfo.textContent = currentLayerInfo;
        } else {
            const layerInfo = document.createElement('span');
            layerInfo.id = 'currentLayerInfo';
            layerInfo.textContent = currentLayerInfo;
            statusLeft.appendChild(layerInfo);
        }
        
        // Add antialiasing status to status bar
        const antialiasingStatus = antialiasingEnabled ? 'AA: On' : 'AA: Off';
        const statusRight = document.querySelector('.status-right');
        const existingAAStatus = statusRight.querySelector('#antialiasingStatus');
        if (existingAAStatus) {
            existingAAStatus.textContent = antialiasingStatus;
        } else {
            const aaStatus = document.createElement('span');
            aaStatus.id = 'antialiasingStatus';
            aaStatus.textContent = antialiasingStatus;
            statusRight.appendChild(aaStatus);
        }
        
        // Add reference image status
        const existingRefStatus = statusRight.querySelector('#referenceStatus');
        if (existingRefStatus) {
            existingRefStatus.remove();
        }
        
        if (referenceImage && referenceVisible) {
            const refStatus = document.createElement('span');
            refStatus.id = 'referenceStatus';
            refStatus.textContent = `Ref: ${Math.round(referenceScale * 100)}%`;
            refStatus.title = 'Reference image loaded. Ctrl+click to drag, Ctrl+/- to scale, Ctrl+R to re-center without changing zoom';
            statusRight.appendChild(refStatus);
        }
    }

    // Zoom methods
    zoomIn() {
        zoom = Math.min(zoom * 1.2, 20); // 2000% max
        this.updateZoom();
    }

    zoomOut() {
        zoom = Math.max(zoom / 1.2, 0.1); // 10% min
        this.updateZoom();
    }

    zoomAtPoint(zoomFactor, mouseX, mouseY) {
        const canvasWrapper = document.querySelector('.canvas-wrapper');
        const rect = canvasWrapper.getBoundingClientRect();

        const mouseWrapperX = mouseX - rect.left;
        const mouseWrapperY = mouseY - rect.top;

        const scrollX = mouseWrapperX + canvasWrapper.scrollLeft;
        const scrollY = mouseWrapperY + canvasWrapper.scrollTop;

        const oldZoom = zoom;
        const newZoom = Math.max(0.1, Math.min(20, zoom * zoomFactor));

        if (newZoom === oldZoom) {
            return;
        }

        const canvasX = scrollX / oldZoom;
        const canvasY = scrollY / oldZoom;

        const newScrollX = canvasX * newZoom;
        const newScrollY = canvasY * newZoom;

        const newScrollLeft = newScrollX - mouseWrapperX;
        const newScrollTop = newScrollY - mouseWrapperY;

        zoom = newZoom;
        this.updateZoom();

        canvasWrapper.scrollLeft = newScrollLeft;
        canvasWrapper.scrollTop = newScrollTop;
    }

    resetZoom() {
        zoom = 1;
        this.updateZoom();
        const canvasWrapper = document.querySelector('.canvas-wrapper');
        const scaler = document.getElementById('canvas-scaler');
        canvasWrapper.scrollLeft = (scaler.offsetWidth - canvasWrapper.clientWidth) / 2;
        canvasWrapper.scrollTop = (scaler.offsetHeight - canvasWrapper.clientHeight) / 2;
    }

    updateZoom() {
        const scaler = document.getElementById('canvas-scaler');
        scaler.style.width = `${mainCanvas.width * zoom}px`;
        scaler.style.height = `${mainCanvas.height * zoom}px`;
        
        mainCanvas.style.transform = '';
        overlayCanvas.style.transform = '';
        
        // Update zoom input and slider
        const zoomPercentage = Math.round(zoom * 100);
        document.getElementById('zoomInput').value = zoomPercentage;
        document.getElementById('zoomSlider').value = zoomPercentage;
        
        // Update brush size preview to reflect new zoom level
        const brushPreview = document.getElementById('canvasBrushPreview');
        if (brushPreview.style.display !== 'none' && (currentTool === 'pen' || currentTool === 'eraser')) {
            // Trigger a mouse move event to update the brush preview
            const event = new MouseEvent('mousemove', {
                clientX: parseInt(brushPreview.style.left) || 0,
                clientY: parseInt(brushPreview.style.top) || 0
            });
            mainCanvas.dispatchEvent(event);
        }
    }

    // Reference image methods
    loadReferenceImage() {
        reference.loadReferenceImage(this);
    }

    hasReferenceSource() {
        return Boolean(referenceImage || this.screenCaptureInterval);
    }

    setLoadedReferenceImage(img, dataUrl) {
        referenceImage = img;
        referenceX = (mainCanvas.width - img.width) / 2;
        referenceY = (mainCanvas.height - img.height) / 2;
        referenceScale = 1.0;

        const uiImage = document.getElementById('referenceImage');
        uiImage.src = dataUrl;
        uiImage.style.display = 'block';
        uiImage.style.transform = 'scale(1)';

        const zoomSlider = document.getElementById('referenceZoom');
        zoomSlider.value = Math.round(referenceScale * 100);
        document.getElementById('referenceZoomValue').value = Math.round(referenceScale * 100);

        referenceVisible = true;
        document.getElementById('toggleReferenceBtn').innerHTML = '<i class="fas fa-eye-slash"></i>';

        this.updateReferencePreview();
        this.renderCurrentFrame();
        this.updateStatusBar();
    }

    toggleReference() {
        reference.toggleReference(this, this.getReferenceApi());
    }

    // Modal methods
    showModal(modalId) {
        document.getElementById(modalId).classList.add('show');
    }

    hideModal(modalId) {
        document.getElementById(modalId).classList.remove('show');
    }

    createNewProject() {
        const width = parseInt(document.getElementById('canvasWidth').value);
        const height = parseInt(document.getElementById('canvasHeight').value);
        const backgroundColor = document.getElementById('backgroundColor').value;
        const transparentBackground = document.getElementById('transparentBackground').checked;
        
        // Set global transparent background flag
        hasTransparentBackground = transparentBackground;
        
        // Update canvas wrapper class for transparency
        // this.updateTransparentBackgroundClass();
        
        // Resize canvases
        mainCanvas.width = width;
        mainCanvas.height = height;
        overlayCanvas.width = width;
        overlayCanvas.height = height;
        
        // Re-disable image smoothing after resize
        this.updateAllCanvasSmoothing();
        
        // Clear and set background
        if (transparentBackground) {
            // Clear canvas for transparent background
            mainCtx.clearRect(0, 0, width, height);
        } else {
            // Set solid background color
            mainCtx.fillStyle = backgroundColor;
            mainCtx.fillRect(0, 0, width, height);
        }
        
        // Reset frames and layers
        frames = [];
        layers = [];
        currentFrame = 0;
        currentLayer = 0;
        
        // Clear any existing reference when creating new project
        if (referenceImage || this.screenCaptureInterval) {
            this.clearReferenceImage();
        }
        
        this.initializeFrames();
        this.initializeLayers();
        
        this.hideModal('newProjectModal');
        this.updateStatusBar();
        this.renderCurrentFrame();
        this.resetZoom();
    }

    // File methods
    async openFile(filePath) {
        try {
            const fileExtension = path.extname(filePath).toLowerCase();
            
            // Check if it's a supported image format
            const supportedImageFormats = ['.png', '.jpg', '.jpeg', '.gif', '.bmp'];
            
            if (supportedImageFormats.includes(fileExtension)) {
                // Read the image file as binary data
                const result = await ipcRenderer.invoke('read-binary-file', filePath);
                
                if (!result.success) {
                    throw new Error(result.error || 'Failed to read image file.');
                }
                
                // Convert the base64 data to a blob
                const binaryString = atob(result.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: this.getMimeType(fileExtension) });
                
                // Load the image as a reference
                const fileName = path.basename(filePath);
                this.loadReferenceFromBlob(blob, fileName);
                
                console.log('Image loaded as reference:', filePath);
            } else {
                throw new Error(`Unsupported file format: ${fileExtension}. Supported formats: ${supportedImageFormats.join(', ')}`);
            }
        } catch (error) {
            console.error('Failed to open file:', error);
            alert(`Error opening file: ${error.message}`);
        }
    }

    getMimeType(fileExtension) {
        return resolveMimeType(fileExtension);
    }

    async saveAnimation(filePath) {
        const fileExtension = path.extname(filePath).toLowerCase();

        try {
            switch (fileExtension) {
                case '.png':
                    await this.saveAsPngSequence(filePath);
                    break;
                case '.gif':
                    await this.saveAsGif(filePath);
                    break;
                default:
                    throw new Error(`Unsupported file format: ${fileExtension}`);
            }
            alert(`File saved successfully to ${filePath}`);
        } catch (error) {
            console.error('Failed to save animation:', error);
            alert(`Error saving file: ${error.message}`);
        }
    }

    async saveProject(filePath) {
        try {
            if (!frames || frames.length === 0) {
                throw new Error('No frames to save. Please create at least one frame.');
            }

            const projectData = buildProjectData({
                frames,
                layers,
                canvas: {
                    width: mainCanvas.width,
                    height: mainCanvas.height,
                    backgroundColor: hasTransparentBackground ? null : '#ffffff',
                    transparentBackground: hasTransparentBackground,
                    author: 'WASRTK'
                },
                settings: {
                    fps,
                    onionSkinningEnabled,
                    onionSkinningRange,
                    referenceOpacity,
                    referenceVisible,
                    antialiasingEnabled,
                    currentTool,
                    currentColor,
                    currentOpacity,
                    brushSize,
                    brushShape,
                    brushPreset,
                    brushFlow,
                    brushSpacing,
                    pressureSensitivityEnabled,
                    pressureAffectsSize,
                    pressureAffectsFlow,
                    fillTolerance,
                    fillContiguous,
                    fillSampleAllLayers,
                    zoom
                }
            });

            const jsonData = serializeProjectData(projectData);

            const result = await ipcRenderer.invoke('save-file', {
                filePath,
                data: jsonData
            });

            if (!result.success) {
                throw new Error(result.error || 'Failed to save project file.');
            }

            console.log('Project saved successfully:', filePath);
        } catch (error) {
            console.error('Failed to save project:', error);
            alert(`Error saving project: ${error.message}`);
        }
    }

    async saveAsPngSequence(filePath) {
        await saveAsPngSequence({
            filePath,
            frames,
            width: mainCanvas.width,
            height: mainCanvas.height,
            invoke: ipcRenderer.invoke.bind(ipcRenderer),
            createCanvas: (width, height) => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                return canvas;
            }
        });
    }

    async saveAsGif(filePath) {
        return saveAsGif({
            filePath,
            frames,
            width: mainCanvas.width,
            height: mainCanvas.height,
            fps,
            invoke: ipcRenderer.invoke.bind(ipcRenderer),
            createCanvas: (width, height) => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                return canvas;
            },
            GIF
        });
    }

    // History methods
    saveState() {
        const frame = frames[currentFrame];
        if (!frame) return;
        const layer = frame.layers[currentLayer];
        if (!layer || layer.locked) return;

        const canvas = layer.canvas;
        const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);

        this.undoStack.push({
            type: 'draw',
            frameIndex: currentFrame,
            layerIndex: currentLayer,
            imageData: imageData
        });
        
        this.redoStack = [];
        this.updateUndoRedoButtons();
    }

    saveStructureState() {
        const framesCopy = this.cloneFrames(frames);
        
        this.undoStack.push({
            type: 'structure',
            frames: framesCopy,
            layers: JSON.parse(JSON.stringify(layers)),
            currentFrame: currentFrame,
            currentLayer: currentLayer
        });

        this.redoStack = [];
        this.updateUndoRedoButtons();
    }

    cloneFrames(framesToClone) {
        return framesToClone.map(frame => ({
            ...frame,
            layers: frame.layers.map(layer => {
                const canvas = document.createElement('canvas');
                canvas.width = layer.canvas.width;
                canvas.height = layer.canvas.height;
                canvas.getContext('2d').drawImage(layer.canvas, 0, 0);
                return { ...layer, canvas: canvas };
            })
        }));
    }

    undo() {
        if (this.undoStack.length === 0) return;

        const stateToRestore = this.undoStack.pop();

        if (stateToRestore.type === 'draw') {
            const frameToSave = frames[stateToRestore.frameIndex];
            const layerToSave = frameToSave.layers[stateToRestore.layerIndex];
            const canvasToSave = layerToSave.canvas;
            const ctxToSave = canvasToSave.getContext('2d');
            const currentStateForRedo = ctxToSave.getImageData(0, 0, canvasToSave.width, canvasToSave.height);

            this.redoStack.push({
                type: 'draw',
                frameIndex: stateToRestore.frameIndex,
                layerIndex: stateToRestore.layerIndex,
                imageData: currentStateForRedo
            });

            const frameToRestore = frames[stateToRestore.frameIndex];
            const layerToRestore = frameToRestore.layers[stateToRestore.layerIndex];
            const canvasToRestore = layerToRestore.canvas;
            const ctxToRestore = canvasToRestore.getContext('2d');
            ctxToRestore.putImageData(stateToRestore.imageData, 0, 0);
        } else if (stateToRestore.type === 'structure') {
            const currentStateForRedo = {
                type: 'structure',
                frames: this.cloneFrames(frames),
                layers: JSON.parse(JSON.stringify(layers)),
                currentFrame: currentFrame,
                currentLayer: currentLayer
            };
            this.redoStack.push(currentStateForRedo);

            frames = stateToRestore.frames;
            layers = stateToRestore.layers;
            currentFrame = Math.min(stateToRestore.currentFrame ?? currentFrame, frames.length - 1);
            currentLayer = stateToRestore.currentLayer;
        }

        this.renderCurrentFrame();
        this.updateUI();
    }

    redo() {
        if (this.redoStack.length === 0) return;

        const stateToRestore = this.redoStack.pop();

        if (stateToRestore.type === 'draw') {
            const frameToSave = frames[stateToRestore.frameIndex];
            const layerToSave = frameToSave.layers[stateToRestore.layerIndex];
            const canvasToSave = layerToSave.canvas;
            const ctxToSave = canvasToSave.getContext('2d');
            const currentStateForUndo = ctxToSave.getImageData(0, 0, canvasToSave.width, canvasToSave.height);
    
            this.undoStack.push({
                type: 'draw',
                frameIndex: stateToRestore.frameIndex,
                layerIndex: stateToRestore.layerIndex,
                imageData: currentStateForUndo
            });
    
            const frameToRestore = frames[stateToRestore.frameIndex];
            const layerToRestore = frameToRestore.layers[stateToRestore.layerIndex];
            const canvasToRestore = layerToRestore.canvas;
            const ctxToRestore = canvasToRestore.getContext('2d');
            ctxToRestore.putImageData(stateToRestore.imageData, 0, 0);
        } else if (stateToRestore.type === 'structure') {
            const currentStateForUndo = {
                type: 'structure',
                frames: this.cloneFrames(frames),
                layers: JSON.parse(JSON.stringify(layers)),
                currentFrame: currentFrame,
                currentLayer: currentLayer
            };
            this.undoStack.push(currentStateForUndo);
            
            frames = stateToRestore.frames;
            layers = stateToRestore.layers;
            currentFrame = Math.min(stateToRestore.currentFrame ?? currentFrame, frames.length - 1);
            currentLayer = stateToRestore.currentLayer;
        }

        this.renderCurrentFrame();
        this.updateUI();
    }

    updateUndoRedoButtons() {
        document.getElementById('undoBtn').disabled = this.undoStack.length === 0;
        document.getElementById('redoBtn').disabled = this.redoStack.length === 0;
    }

    startScreenShare() {
        reference.startScreenShare(this, this.getReferenceApi());
    }
    
    tryFallbackScreenCapture() {
        reference.tryFallbackScreenCapture(this);
    }
    
    showScreenShareModal(sources) {
        reference.showScreenShareModal(this, sources);
    }
    
    hideScreenShareModal() {
        reference.hideScreenShareModal(this);
    }
    
    selectScreenSource(source) {
        reference.selectScreenSource(this, source);
    }
    
    tryAlternativeScreenCapture(source) {
        reference.tryAlternativeScreenCapture(this, source);
    }
    
    setupScreenShareStream(stream, sourceName) {
        reference.setupScreenShareStream(this, stream, sourceName);
    }
    
    startFrameCapture(video, canvas, ctx, sourceName) {
        reference.startFrameCapture(this, video, canvas, ctx, sourceName);
    }
    
    updateReferenceImageOnly(blob) {
        reference.updateReferenceImageOnly(this, this.getReferenceApi(), blob);
    }
    
    loadReferenceFromBlob(blob, sourceName) {
        reference.loadReferenceFromBlob(this, this.getReferenceApi(), blob, sourceName);
    }
    
    stopScreenShare() {
        reference.stopScreenShare(this);
    }

    updateUI() {
        this.updateTimeline();
        this.updateLayerList();
        this.updateStatusBar();
        this.updateUndoRedoButtons();
    }

    updateBrushSizePreview(screenX, screenY) {
        const brushPreview = document.getElementById('canvasBrushPreview');
        
        // Only show preview for pen and eraser tools
        if (currentTool !== 'pen' && currentTool !== 'eraser') {
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
        if (brushSize === 1) {
            brushPreview.classList.add('pixel');
            brushPreview.style.width = '2px';
            brushPreview.style.height = '2px';
            brushPreview.style.borderRadius = '0';
        } else {
            brushPreview.classList.remove('pixel');
            const size = Math.max(2, brushSize * zoom); // Ensure minimum 2px size for visibility
            brushPreview.style.width = size + 'px';
            brushPreview.style.height = size + 'px';
            const squarePreview = brushPreset === 'pixel' || brushShape === 'square';
            brushPreview.style.borderRadius = squarePreview ? '0' : '50%';
        }
        
        // Set the preview color based on tool
        if (currentTool === 'pen') {
            brushPreview.style.backgroundColor = currentColor;
            brushPreview.style.borderColor = currentColor;
        } else if (currentTool === 'eraser') {
            brushPreview.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            brushPreview.style.borderColor = '#ffffff';
        }
    }

    hideBrushSizePreview() {
        const brushPreview = document.getElementById('canvasBrushPreview');
        brushPreview.style.display = 'none';
    }

    resetReferencePosition() {
        reference.resetReferencePosition(this, this.getReferenceApi(), mainCanvas);
    }

    clearReferenceImage() {
        reference.clearReferenceImage(this, this.getReferenceApi());
    }

    updateReferencePreview() {
        reference.updateReferencePreview(this.getReferenceApi());
    }

    // Helper to show the in-progress stroke on the overlay canvas
    showStrokePreview() {
        if (strokeCanvas && overlayCanvas) {
            const ctx = overlayCtx;
            ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            ctx.save();
            ctx.globalAlpha = currentOpacity;
            ctx.drawImage(strokeCanvas, 0, 0);
            ctx.restore();
        }
    }

    async loadProject(filePath) {
        try {
            const result = await ipcRenderer.invoke('read-file', filePath);
            if (!result.success) {
                throw new Error(result.error || 'Failed to read project file.');
            }

            const projectData = parseProjectJson(result.data);
            validateProjectData(projectData);

            frames = [];
            layers = [];
            currentFrame = 0;
            currentLayer = 0;

            if (referenceImage || this.screenCaptureInterval) {
                this.clearReferenceImage();
            }

            if (projectData.canvas) {
                mainCanvas.width = projectData.canvas.width;
                mainCanvas.height = projectData.canvas.height;
                overlayCanvas.width = projectData.canvas.width;
                overlayCanvas.height = projectData.canvas.height;
                hasTransparentBackground = projectData.canvas.transparentBackground || false;
            }

            frames = await buildFramesFromProject({
                projectData,
                width: mainCanvas.width,
                height: mainCanvas.height,
                createCanvas: (width, height) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    return canvas;
                },
                loadImageToCanvas: (canvas, dataUrl) => this.loadImageToCanvas(canvas, dataUrl),
                applyImageSmoothing: (ctx) => this.applyImageSmoothing(ctx),
                fillFallbackLayer: (canvas) => {
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
            });

            layers = projectData.layers.map((layerData) => ({
                id: layerData.id,
                name: layerData.name,
                visible: layerData.visible,
                locked: layerData.locked
            }));

            const settings = normalizeProjectSettings(projectData.settings);
            fps = settings.fps;
            onionSkinningEnabled = settings.onionSkinningEnabled;
            onionSkinningRange = settings.onionSkinningRange;
            referenceOpacity = settings.referenceOpacity;
            referenceVisible = settings.referenceVisible;
            antialiasingEnabled = settings.antialiasingEnabled;
            currentTool = settings.currentTool;
            currentColor = settings.currentColor;
            currentOpacity = settings.currentOpacity;
            brushSize = settings.brushSize;
            brushShape = settings.brushShape;
            brushPreset = settings.brushPreset;
            brushFlow = settings.brushFlow;
            brushSpacing = settings.brushSpacing;
            pressureSensitivityEnabled = settings.pressureSensitivityEnabled;
            pressureAffectsSize = settings.pressureAffectsSize;
            pressureAffectsFlow = settings.pressureAffectsFlow;
            fillTolerance = settings.fillTolerance;
            fillContiguous = settings.fillContiguous;
            fillSampleAllLayers = settings.fillSampleAllLayers;
            zoom = settings.zoom;

            this.updateAllCanvasSmoothing();
            this.renderCurrentFrame();
            this.updateTimeline();
            this.updateLayerList();
            this.updateUI();
            this.updateBrushPreview();
            this.updateZoom();
            this.updateStatusBar();

            document.getElementById('fpsSlider').value = fps;
            document.getElementById('fpsValue').textContent = fps;
            document.getElementById('onionSkinningEnabled').checked = onionSkinningEnabled;
            document.getElementById('onionSkinningRange').value = onionSkinningRange;
            document.getElementById('onionSkinningValue').textContent = onionSkinningRange;
            document.getElementById('referenceOpacity').value = referenceOpacity * 100;
            document.getElementById('referenceOpacityValue').value = Math.round(referenceOpacity * 100);
            document.getElementById('antialiasingEnabled').checked = antialiasingEnabled;
            document.getElementById('colorPicker').value = currentColor;
            document.getElementById('brushSizeSlider').value = brushSize;
            document.getElementById('brushSizeValue').textContent = brushSize + 'px';
            document.getElementById('brushShapeSelect').value = brushShape;
            document.getElementById('brushPresetSelect').value = brushPreset;
            document.getElementById('brushFlowSlider').value = Math.round(brushFlow * 100);
            document.getElementById('brushFlowValue').textContent = `${Math.round(brushFlow * 100)}%`;
            document.getElementById('brushSpacingSlider').value = Math.round(brushSpacing * 100);
            document.getElementById('brushSpacingValue').textContent = `${Math.round(brushSpacing * 100)}%`;
            document.getElementById('pressureSensitivityEnabled').checked = pressureSensitivityEnabled;
            document.getElementById('pressureAffectsSize').checked = pressureAffectsSize;
            document.getElementById('pressureAffectsFlow').checked = pressureAffectsFlow;
            document.getElementById('fillToleranceSlider').value = fillTolerance;
            document.getElementById('fillToleranceValue').textContent = fillTolerance;
            document.getElementById('fillContiguous').checked = fillContiguous;
            document.getElementById('fillSampleAllLayers').checked = fillSampleAllLayers;
            document.getElementById('opacitySlider').value = currentOpacity * 100;
            document.getElementById('opacityValue').textContent = Math.round(currentOpacity * 100) + '%';

            this.selectTool(currentTool);
            console.log('Project loaded successfully:', filePath);
        } catch (error) {
            console.error('Failed to load project:', error);
            alert(`Error loading project: ${error.message}`);
        }
    }

    // Helper method to load image data to canvas synchronously
    loadImageToCanvas(canvas, dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            img.onerror = () => {
                reject(new Error('Failed to load image data'));
            };
            img.src = dataUrl;
        });
    }

    updateTransparentBackgroundClass() {
        const canvasWrapper = document.querySelector('.canvas-wrapper');
        if (hasTransparentBackground) {
            canvasWrapper.classList.add('transparent-bg');
        } else {
            canvasWrapper.classList.remove('transparent-bg');
        }
    }
}

module.exports = { WASRTK };
