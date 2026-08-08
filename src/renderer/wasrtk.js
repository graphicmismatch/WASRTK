const { ipcRenderer } = require('electron');
const path = require('path');
const { getMimeType: resolveMimeType, saveAsPngSequence, saveAsGif, drawVisibleLayersToContext } = require('./exporters');
const { parseProjectJson, validateProjectData, buildProjectData, serializeProjectData, buildFramesFromProject, normalizeProjectSettings } = require('./project-io');
const { clampNumber } = require('./math-utils');
const { loadTools } = require('./tools');
const reference = require('./reference');
const { dedupeColors, hexToRgb, rgbToHex } = require('./color-utils');
const brushEngine = require('./brush-engine');
const { createHistory } = require('./history');
const { createSelectionManager } = require('./selection-manager');
const { createZoomController } = require('./zoom');
const { createStatusBar } = require('./status-bar');
const { createPaletteUI } = require('./palette-ui');
const { createFrameManager } = require('./frame-manager');
const { createLayerManager } = require('./layer-manager');
const { bindAppEvents } = require('./event-bindings');
const { createCanvasEngine } = require('./canvas-engine');
const { createBrushSettings } = require('./brush-settings');

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
let selectionAntialias = true;
let selectionFeather = 0;
let penLastDrawnPoint = null;
let penLineAnchor = null;
let currentStrokeSeed = 0;

// Panning state
let isPanning = false;
let panStartPos = { x: 0, y: 0 };
let panStartScroll = { left: 0, top: 0 };

// Project settings
let hasTransparentBackground = false; // Track if project has transparent background
let projectBackgroundColor = '#ffffff';

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

// Creates a plain canvas of the given size (no smoothing/fill applied).
// Shared by every call site that hands a bare `(width, height) => canvas`
// factory to project-io/exporters helpers.
function createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

// Creates a layer-sized canvas, optionally smoothing-configured and
// pre-filled. `transparent: true` leaves the canvas blank (a fresh canvas
// already starts fully transparent, so this is a no-op paint used mainly
// for symmetry); `transparent: false` fills it with backgroundColor.
function createLayerCanvas({ width, height, transparent = true, backgroundColor = '#ffffff', applySmoothing } = {}) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (applySmoothing) {
        applySmoothing(ctx);
    }
    if (transparent) {
        ctx.clearRect(0, 0, width, height);
    } else {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
    }
    return { canvas, ctx };
}

// Initialize the application
class WASRTK {
    constructor() {
        // Built once: screen-capture.js polls getReferenceApi() several
        // times per tick, and its accessors are closures over module
        // globals, so a single cached instance stays correct forever.
        this._referenceApi = this.buildReferenceApi();
        this.canvasWrapper = document.querySelector('.canvas-wrapper');
        this.tools = loadTools();
        this._zoom = createZoomController({
            getZoom: () => zoom,
            setZoom: (value) => { zoom = value; },
            mainCanvas,
            overlayCanvas,
            canvasWrapper: this.canvasWrapper,
            clampNumber,
            refreshBrushPreviewFromCursor: () => this.refreshBrushPreviewFromCursor()
        });
        this._statusBar = createStatusBar({
            getCurrentTool: () => currentTool,
            getCurrentColor: () => currentColor,
            getPressureSensitivityEnabled: () => pressureSensitivityEnabled,
            getCurrentInputPressure: () => currentInputPressure,
            getBrushSize: () => brushSize,
            getBrushPreset: () => brushPreset,
            getBrushFlow: () => brushFlow,
            getBrushSpacing: () => brushSpacing,
            getCurrentFrame: () => currentFrame,
            getFrames: () => frames,
            mainCanvas,
            getLayers: () => layers,
            getCurrentLayer: () => currentLayer,
            getAntialiasingEnabled: () => antialiasingEnabled,
            getReferenceImage: () => referenceImage,
            getReferenceVisible: () => referenceVisible,
            getReferenceScale: () => referenceScale
        });
        this._paletteUI = createPaletteUI({
            colorPalettes: COLOR_PALETTES,
            builtinPaletteIds: BUILTIN_PALETTE_IDS,
            getSelectedPalette: () => selectedPalette,
            setSelectedPalette: (value) => { selectedPalette = value; },
            dedupeColors,
            ipcRenderer
        });
        this._frameManager = createFrameManager({
            getFrames: () => frames,
            getCurrentFrame: () => currentFrame,
            setCurrentFrame: (value) => { currentFrame = value; },
            getLayers: () => layers,
            getActiveSelection: () => activeSelection,
            getDraggedFrameIndex: () => draggedFrameIndex,
            setDraggedFrameIndex: (value) => { draggedFrameIndex = value; },
            getIsAnimating: () => isAnimating,
            setIsAnimating: (value) => { isAnimating = value; },
            getOnionSkinningEnabled: () => onionSkinningEnabled,
            getOnionSkinningRange: () => onionSkinningRange,
            getReferenceImage: () => referenceImage,
            getReferenceVisible: () => referenceVisible,
            getReferenceOpacity: () => referenceOpacity,
            getReferenceX: () => referenceX,
            getReferenceY: () => referenceY,
            getReferenceScale: () => referenceScale,
            getHasTransparentBackground: () => hasTransparentBackground,
            getProjectBackgroundColor: () => projectBackgroundColor,
            mainCanvas,
            mainCtx,
            createLayerCanvas,
            drawVisibleLayersToContext,
            applyImageSmoothing: (ctx) => this.applyImageSmoothing(ctx),
            clearSelection: () => this.clearSelection(),
            saveStructureState: () => this.saveStructureState(),
            updateStatusBar: () => this.updateStatusBar()
        });
        this._layerManager = createLayerManager({
            getFrames: () => frames,
            getLayers: () => layers,
            getCurrentLayer: () => currentLayer,
            setCurrentLayer: (value) => { currentLayer = value; },
            getActiveSelection: () => activeSelection,
            mainCanvas,
            createLayerCanvas,
            applyImageSmoothing: (ctx) => this.applyImageSmoothing(ctx),
            getLayerContext: (layer) => this.getLayerContext(layer),
            clearSelection: () => this.clearSelection(),
            saveStructureState: () => this.saveStructureState(),
            renderCurrentFrame: () => this.renderCurrentFrame(),
            updateStatusBar: () => this.updateStatusBar()
        });
        this._canvasEngine = createCanvasEngine(this, {
            getIsDrawing: () => isDrawing,
            setIsDrawing: (value) => { isDrawing = value; },
            setCurrentStrokeSeed: (value) => { currentStrokeSeed = value; },
            setCurrentInputPressure: (value) => { currentInputPressure = value; },
            getLastMousePos: () => lastMousePos,
            setLastMousePos: (value) => { lastMousePos = value; },
            getCurrentTool: () => currentTool,
            getCurrentColor: () => currentColor,
            getBrushSize: () => brushSize,
            getCurrentOpacity: () => currentOpacity,
            getAntialiasingEnabled: () => antialiasingEnabled,
            getStrokeCtx: () => strokeCtx,
            getFillSampleAllLayers: () => fillSampleAllLayers,
            getFillContiguous: () => fillContiguous,
            getFillTolerance: () => fillTolerance,
            getFrames: () => frames,
            getCurrentFrame: () => currentFrame,
            mainCanvas,
            overlayCtx,
            createCanvas
        });
        this._brushSettings = createBrushSettings(this, {
            getCurrentColor: () => currentColor,
            setCurrentColor: (value) => { currentColor = value; },
            getCurrentTool: () => currentTool,
            getBrushSize: () => brushSize,
            setBrushSize: (value) => { brushSize = value; },
            getBrushShape: () => brushShape,
            setBrushShape: (value) => { brushShape = value; },
            getBrushPreset: () => brushPreset,
            setBrushPreset: (value) => { brushPreset = value; },
            getBrushFlow: () => brushFlow,
            setBrushFlow: (value) => { brushFlow = value; },
            setBrushSpacing: (value) => { brushSpacing = value; },
            getCurrentOpacity: () => currentOpacity,
            setCurrentOpacity: (value) => { currentOpacity = value; },
            getPressureSensitivityEnabled: () => pressureSensitivityEnabled,
            getPressureAffectsSize: () => pressureAffectsSize,
            getPressureAffectsFlow: () => pressureAffectsFlow,
            getCurrentInputPressure: () => currentInputPressure,
            getZoom: () => zoom,
            getStrokeCanvas: () => strokeCanvas,
            mainCanvas,
            mainCtx,
            overlayCanvas,
            overlayCtx
        });
        // Undo/redo stacks live inside the history module's closure; the
        // env object hands it accessor closures over the module globals it
        // restores (frames/layers/current indices) plus the exact
        // post-restore refresh sequence undo/redo always ran.
        this._history = createHistory({
            getFrames: () => frames,
            setFrames: (value) => { frames = value; },
            getLayers: () => layers,
            setLayers: (value) => { layers = value; },
            getCurrentFrame: () => currentFrame,
            setCurrentFrame: (value) => { currentFrame = value; },
            getCurrentLayer: () => currentLayer,
            setCurrentLayer: (value) => { currentLayer = value; },
            getActiveLayerContext: () => this.getActiveLayerContext(),
            createCanvas,
            onAfterRestore: () => {
                this.renderCurrentFrame();
                this.updateUI();
            }
        });
        // Selection subsystem. The selection state stays in the module
        // globals (event handlers and frame/layer ops here read them
        // directly); the manager reaches them through these accessors.
        this._selection = createSelectionManager({
            mainCanvas,
            overlayCtx,
            get activeSelection() { return activeSelection; },
            set activeSelection(value) { activeSelection = value; },
            get selectionInteraction() { return selectionInteraction; },
            set selectionInteraction(value) { selectionInteraction = value; },
            get selectionClipboard() { return selectionClipboard; },
            set selectionClipboard(value) { selectionClipboard = value; },
            getSelectionMode: () => selectionMode,
            getSelectionAntialias: () => selectionAntialias,
            getSelectionFeather: () => selectionFeather,
            getFillTolerance: () => fillTolerance,
            getActiveLayerContext: () => this.getActiveLayerContext(),
            clearOverlay: () => this.clearOverlay(),
            applyImageSmoothing: (ctx) => this.applyImageSmoothing(ctx),
            saveState: () => this.saveState(),
            renderCurrentFrame: () => this.renderCurrentFrame()
        });
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
        return this._referenceApi;
    }

    buildReferenceApi() {
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

    // Resolves the current frame/layer/context triple used by most
    // draw/selection/history operations. Returns null when there is no
    // active layer to draw on, or (unless allowLocked) when it is locked.
    getActiveLayerContext({ allowLocked = false } = {}) {
        const frame = frames[currentFrame];
        if (!frame) {
            return null;
        }
        const layer = frame.layers[currentLayer];
        if (!layer || (!allowLocked && layer.locked)) {
            return null;
        }
        const ctx = this.getLayerContext(layer);
        return { frame, layer, ctx };
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
        const { canvas: initialLayerCanvas } = createLayerCanvas({
            width: mainCanvas.width,
            height: mainCanvas.height,
            transparent: hasTransparentBackground,
            backgroundColor: projectBackgroundColor,
            applySmoothing: (ctx) => this.applyImageSmoothing(ctx)
        });
        const initialLayer = {
            id: 0,
            name: 'Background',
            visible: true,
            locked: false,
            canvas: initialLayerCanvas
        };

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
        this._paletteUI.initializePaletteUI();
    }

    refreshPaletteSelect() {
        this._paletteUI.refreshPaletteSelect();
    }

    async loadCustomPalettesFromConfig() {
        await this._paletteUI.loadCustomPalettesFromConfig();
    }

    mergeCustomPalettes(customPalettes) {
        this._paletteUI.mergeCustomPalettes(customPalettes);
    }

    renderPalettePresets(paletteId) {
        this._paletteUI.renderPalettePresets(paletteId);
    }

    setupEventListeners() {
        bindAppEvents(this, {
            getSelectedPalette: () => selectedPalette,
            setSelectedPalette: (value) => { selectedPalette = value; },
            setFillTolerance: (value) => { fillTolerance = value; },
            setFillContiguous: (value) => { fillContiguous = value; },
            setFillSampleAllLayers: (value) => { fillSampleAllLayers = value; },
            setSelectionMode: (value) => { selectionMode = value; },
            setSelectionAntialias: (value) => { selectionAntialias = value; },
            setSelectionFeather: (value) => { selectionFeather = value; },
            setPressureSensitivityEnabled: (value) => { pressureSensitivityEnabled = value; },
            setPressureAffectsSize: (value) => { pressureAffectsSize = value; },
            setPressureAffectsFlow: (value) => { pressureAffectsFlow = value; },
            setAntialiasingEnabled: (value) => { antialiasingEnabled = value; },
            getIsDraggingReference: () => isDraggingReference,
            setIsDraggingReference: (value) => { isDraggingReference = value; },
            getLastMousePos: () => lastMousePos,
            setLastMousePos: (value) => { lastMousePos = value; },
            getIsDrawing: () => isDrawing,
            getCurrentTool: () => currentTool,
            getZoom: () => zoom,
            setZoom: (value) => { zoom = value; },
            setOnionSkinningEnabled: (value) => { onionSkinningEnabled = value; },
            setOnionSkinningRange: (value) => { onionSkinningRange = value; },
            setFps: (value) => { fps = value; },
            getIsPanning: () => isPanning,
            setIsPanning: (value) => { isPanning = value; },
            getPanStartPos: () => panStartPos,
            setPanStartPos: (value) => { panStartPos = value; },
            getPanStartScroll: () => panStartScroll,
            setPanStartScroll: (value) => { panStartScroll = value; },
            getActiveSelection: () => activeSelection,
            getSelectionInteraction: () => selectionInteraction,
            setSelectionInteraction: (value) => { selectionInteraction = value; },
            mainCanvas
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
        if (tool === 'fill' || (tool === 'selection' && selectionMode === 'magic-wand')) {
            toleranceSection.style.display = 'block';
        } else {
            toleranceSection.style.display = 'none';
        }
        document.querySelectorAll('.fill-only-option').forEach((option) => {
            option.style.display = tool === 'fill' ? 'flex' : 'none';
        });

        const selectionModeSection = document.getElementById('selectionModeSection');
        selectionModeSection.style.display = tool === 'selection' ? 'flex' : 'none';
        this.updateSelectionHint();

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
                this.clearSelection({ commitDetached: false });
            }
        }
        
        this.updateStatusBar();
    }

    updateSelectionHint() {
        const hint = document.getElementById('selectionHint');
        if (!hint) {
            return;
        }

        const hints = {
            rectangle: 'Drag to create a rectangular selection. Drag inside a selection to move it; Enter commits, Escape cancels.',
            'magic-wand': 'Click a color region to select it. Adjust Tolerance above; Enter commits detached pixels, Escape cancels.',
            lasso: 'Drag to draw a freeform selection. Release to finish; Enter commits detached pixels, Escape cancels.',
            polygon: 'Click to add polygon points. Press Enter or click near the first point to finish; Escape cancels.'
        };
        hint.textContent = hints[selectionMode] || hints.rectangle;
    }

    setColor(color) {
        this._brushSettings.setColor(color);
    }

    pickColorAt(x, y) {
        return this._brushSettings.pickColorAt(x, y);
    }

    updateEyedropperZoomPreview(e) {
        this._brushSettings.updateEyedropperZoomPreview(e);
    }

    hideEyedropperZoomPreview() {
        this._brushSettings.hideEyedropperZoomPreview();
    }

    // Re-dispatches a synthetic mousemove at the canvas brush preview's
    // current position so it redraws with up-to-date brush settings, but
    // only while it is actually visible over the canvas.
    refreshBrushPreviewFromCursor() {
        this._brushSettings.refreshBrushPreviewFromCursor();
    }

    // `silent` skips the preview/status-bar/cursor refresh -- used by
    // loadProject, which already performs an equivalent refresh once for
    // the whole loaded project instead of once per setting.
    setBrushSize(size, options = {}) {
        this._brushSettings.setBrushSize(size, options);
    }

    setBrushShape(shape, options = {}) {
        this._brushSettings.setBrushShape(shape, options);
    }

    setBrushPreset(preset, options = {}) {
        this._brushSettings.setBrushPreset(preset, options);
    }

    setBrushFlow(flowPercent) {
        this._brushSettings.setBrushFlow(flowPercent);
    }

    setBrushSpacing(spacingPercent) {
        this._brushSettings.setBrushSpacing(spacingPercent);
    }

    setOpacity(opacity) {
        this._brushSettings.setOpacity(opacity);
    }

    updateBrushPreview() {
        this._brushSettings.updateBrushPreview();
    }

    applySelectedTransformAction() {
        const action = document.getElementById('transformActionSelect')?.value;
        const angle = 12 * (Math.PI / 180);
        const actions = {
            'flip-horizontal': { flipX: true },
            'flip-vertical': { flipY: true },
            'rotate-90': { rotate90: true },
            'scale-up': { scaleX: 1.25, scaleY: 1.25 },
            'scale-down': { scaleX: 0.8, scaleY: 0.8 },
            'skew-x': { skewX: angle },
            'skew-y': { skewY: angle }
        };
        this.applyTransformAction(actions[action] || actions['flip-horizontal']);
    }

    // Selection subsystem delegators (bodies live in selection-manager.js;
    // see the constructor for the env it closes over).
    startSelectionInteraction(coords) {
        return this._selection.startSelectionInteraction(coords);
    }

    updateSelectionInteraction(coords, options) {
        return this._selection.updateSelectionInteraction(coords, options);
    }

    finishSelectionInteraction() {
        return this._selection.finishSelectionInteraction();
    }

    clearSelection(options) {
        return this._selection.clearSelection(options);
    }

    commitDetachedSelection() {
        return this._selection.commitDetachedSelection();
    }

    copySelectionToClipboard(options) {
        return this._selection.copySelectionToClipboard(options);
    }

    pasteSelectionFromClipboard() {
        return this._selection.pasteSelectionFromClipboard();
    }

    createLassoSelectionFromPoints(points) {
        return this._selection.createLassoSelectionFromPoints(points);
    }

    detachSelectionFromLayer() {
        return this._selection.detachSelectionFromLayer();
    }

    clampSelectionPosition(selection, x, y) {
        return this._selection.clampSelectionPosition(selection, x, y);
    }

    drawSelectionOutline(bounds, options) {
        return this._selection.drawSelectionOutline(bounds, options);
    }

    drawLassoPreview(points, currentPoint) {
        return this._selection.drawLassoPreview(points, currentPoint);
    }

    applyTransformAction(options) {
        return this._selection.applyTransformAction(options);
    }

    getEventPressure(event) {
        return this._brushSettings.getEventPressure(event);
    }

    getPressureAdjustedBrushSize() {
        return this._brushSettings.getPressureAdjustedBrushSize();
    }

    getPressureAdjustedFlow() {
        return this._brushSettings.getPressureAdjustedFlow();
    }

    updatePolygonHoverPreview(event) {
        if (selectionInteraction?.mode !== 'polygon') {
            return;
        }

        const hoverCoords = this.screenToCanvas(event.clientX, event.clientY);
        this.drawLassoPreview(selectionInteraction.points || [], hoverCoords);
    }

    // Drawing methods
    startDrawing(e) {
        this._canvasEngine.startDrawing(e);
    }

    draw(e) {
        this._canvasEngine.draw(e);
    }

    stopDrawing(e) {
        this._canvasEngine.stopDrawing(e);
    }

    // Resolves the stroke-preview layer or the active unlocked layer as the
    // drawing context, and wraps `draw(ctx, useStrokeLayer)` with the
    // save/smoothing/alpha/restore + stroke-preview-or-render tail shared
    // by drawPoint and drawLine's antialiased path. No-ops if there is no
    // context to draw on.
    withDrawContext(useStrokeCtx, draw) {
        this._canvasEngine.withDrawContext(useStrokeCtx, draw);
    }

    drawPoint(x, y, useStrokeCtx = false) {
        this._canvasEngine.drawPoint(x, y, useStrokeCtx);
    }

    floodFill(ctx, startX, startY, fillColor) {
        return this._canvasEngine.floodFill(ctx, startX, startY, fillColor);
    }

    getMergedVisibleLayersImageData() {
        return this._canvasEngine.getMergedVisibleLayersImageData();
    }

    drawLine(x1, y1, x2, y2, useStrokeCtx = false) {
        this._canvasEngine.drawLine(x1, y1, x2, y2, useStrokeCtx);
    }

    getConstrainedShapeEndPoint(start, end, { keepSquare = false, tool } = {}) {
        return this._canvasEngine.getConstrainedShapeEndPoint(start, end, { keepSquare, tool });
    }

    // Shared path-building for the shape tools: opens a path on `ctx` and
    // adds the line/rect/ellipse geometry for `tool` between startCoords
    // and endCoords. Stroke/dash/fill settings are the caller's
    // responsibility -- drawShapePreview and commitShape's antialiased
    // branch configure those differently before calling this.
    buildShapePath(ctx, startCoords, endCoords, tool) {
        this._canvasEngine.buildShapePath(ctx, startCoords, endCoords, tool);
    }

    drawShapePreview(start, end, tool, { keepSquare = false } = {}) {
        this._canvasEngine.drawShapePreview(start, end, tool, { keepSquare });
    }

    commitShape(start, end, tool, { keepSquare = false } = {}) {
        this._canvasEngine.commitShape(start, end, tool, { keepSquare });
    }
    
    // Assembles the option snapshot the brush-engine rasterizers take in
    // place of reading the module globals directly: current color (or an
    // explicit override), pressure-adjusted size/flow, and the raw
    // preset/shape/spacing/antialias/stroke-seed settings.
    getBrushRenderOptions({ color = currentColor } = {}) {
        return {
            color,
            size: this.getPressureAdjustedBrushSize(),
            flow: this.getPressureAdjustedFlow(),
            preset: brushPreset,
            shape: brushShape,
            spacing: brushSpacing,
            antialias: antialiasingEnabled,
            strokeSeed: currentStrokeSeed
        };
    }

    drawBrushStamp(ctx, x, y, { color = currentColor } = {}) {
        brushEngine.drawBrushStamp(ctx, x, y, this.getBrushRenderOptions({ color }));
    }

    drawBrushLine(ctx, x1, y1, x2, y2, { color = currentColor } = {}) {
        brushEngine.drawBrushLine(ctx, x1, y1, x2, y2, this.getBrushRenderOptions({ color }));
    }

    drawPixelPerfectLineWithFillRect(ctx, x1, y1, x2, y2) {
        brushEngine.drawPixelPerfectLineWithFillRect(ctx, x1, y1, x2, y2, brushSize, brushShape);
    }

    drawPixelPerfectCircleWithFillRect(ctx, cx, cy, rx, ry) {
        brushEngine.drawPixelPerfectCircleWithFillRect(ctx, cx, cy, rx, ry, brushSize);
    }

    // Frame methods
    addFrame() {
        this._frameManager.addFrame();
    }

    duplicateFrame() {
        this._frameManager.duplicateFrame();
    }

    deleteFrame() {
        this._frameManager.deleteFrame();
    }

    reindexFrames() {
        this._frameManager.reindexFrames();
    }

    moveFrame(fromIndex, toIndex) {
        this._frameManager.moveFrame(fromIndex, toIndex);
    }

    moveFrameLeft() {
        this._frameManager.moveFrameLeft();
    }

    moveFrameRight() {
        this._frameManager.moveFrameRight();
    }

    selectFrame(frameIndex) {
        this._frameManager.selectFrame(frameIndex);
    }

    toggleAnimation() {
        this._frameManager.toggleAnimation();
    }

    animate() {
        this._frameManager.animate();
    }

    renderCurrentFrame() {
        this._frameManager.renderCurrentFrame();
    }

    drawOnionSkinning() {
        this._frameManager.drawOnionSkinning();
    }

    drawFrameAsOnionSkin(frame, alpha) {
        this._frameManager.drawFrameAsOnionSkin(frame, alpha);
    }

    // Layer methods
    addLayer() {
        this._layerManager.addLayer();
    }

    deleteLayer() {
        this._layerManager.deleteLayer();
    }

    moveLayerUp() {
        this._layerManager.moveLayerUp();
    }

    moveLayerDown() {
        this._layerManager.moveLayerDown();
    }

    flattenLayer() {
        this._layerManager.flattenLayer();
    }

    // UI update methods
    updateTimeline() {
        this._frameManager.updateTimeline();
    }

    updateLayerList() {
        this._layerManager.updateLayerList();
    }

    selectLayer(layerIndex) {
        this._layerManager.selectLayer(layerIndex);
    }

    toggleLayerVisibility(layerIndex) {
        this._layerManager.toggleLayerVisibility(layerIndex);
    }

    updateStatusBar() {
        this._statusBar.updateStatusBar();
    }

    // Zoom methods
    zoomIn() {
        this._zoom.zoomIn();
    }

    zoomOut() {
        this._zoom.zoomOut();
    }

    zoomAtPoint(zoomFactor, mouseX, mouseY) {
        this._zoom.zoomAtPoint(zoomFactor, mouseX, mouseY);
    }

    resetZoom() {
        this._zoom.resetZoom();
    }

    updateZoom() {
        this._zoom.updateZoom();
    }

    // Reference image methods
    loadReferenceImage() {
        reference.loadReferenceImage(this);
    }

    hasReferenceSource() {
        return reference.hasReferenceSource(this, this.getReferenceApi());
    }

    setLoadedReferenceImage(img, dataUrl) {
        reference.setLoadedReferenceImage(this, this.getReferenceApi(), img, dataUrl);
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
        projectBackgroundColor = backgroundColor;
        
        this.updateTransparentBackgroundClass();
        
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
                    backgroundColor: hasTransparentBackground ? null : projectBackgroundColor,
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
                    selectionMode,
                    selectionAntialias,
                    selectionFeather,
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
            createCanvas
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
            createCanvas,
            GIF
        });
    }

    // History methods (thin delegators over the history module; the
    // undo/redo stacks live in its closure -- see the constructor).
    saveState() {
        this._history.saveState();
    }

    discardLastUndoState() {
        this._history.discardLastUndoState();
    }

    saveStructureState() {
        this._history.saveStructureState();
    }

    undo() {
        this._history.undo();
    }

    redo() {
        this._history.redo();
    }

    updateUndoRedoButtons() {
        this._history.updateUndoRedoButtons();
    }

    startScreenShare() {
        reference.startScreenShare(this, this.getReferenceApi());
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
        this._brushSettings.updateBrushSizePreview(screenX, screenY);
    }

    hideBrushSizePreview() {
        this._brushSettings.hideBrushSizePreview();
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
        this._brushSettings.showStrokePreview();
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
                projectBackgroundColor = projectData.canvas.backgroundColor || '#ffffff';
            }

            frames = await buildFramesFromProject({
                projectData,
                width: mainCanvas.width,
                height: mainCanvas.height,
                createCanvas,
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
            selectionMode = settings.selectionMode;
            selectionAntialias = settings.selectionAntialias;
            selectionFeather = settings.selectionFeather;
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
            document.getElementById('transparentBackground').checked = hasTransparentBackground;
            document.getElementById('backgroundColor').value = projectBackgroundColor;
            document.getElementById('transparentBackground').dispatchEvent(new Event('change'));
            this.updateTransparentBackgroundClass();
            document.getElementById('colorPicker').value = currentColor;
            document.getElementById('brushSizeSlider').value = brushSize;
            this.setBrushSize(brushSize, { silent: true });
            this.setBrushShape(brushShape, { silent: true });
            this.setBrushPreset(brushPreset, { silent: true });
            document.getElementById('brushFlowSlider').value = Math.round(brushFlow * 100);
            document.getElementById('brushFlowValue').textContent = `${Math.round(brushFlow * 100)}%`;
            document.getElementById('brushSpacingSlider').value = Math.round(brushSpacing * 100);
            document.getElementById('brushSpacingValue').textContent = `${Math.round(brushSpacing * 100)}%`;
            document.getElementById('pressureSensitivityEnabled').checked = pressureSensitivityEnabled;
            document.getElementById('pressureAffectsSize').checked = pressureAffectsSize;
            document.getElementById('pressureAffectsFlow').checked = pressureAffectsFlow;
            document.getElementById('selectionModeSelect').value = selectionMode;
            document.getElementById('selectionAntialias').checked = selectionAntialias;
            document.getElementById('selectionFeatherSlider').value = selectionFeather;
            document.getElementById('selectionFeatherValue').textContent = `${selectionFeather}px`;
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
        const canvasWrapper = this.canvasWrapper;
        if (hasTransparentBackground) {
            canvasWrapper.classList.add('transparent-bg');
        } else {
            canvasWrapper.classList.remove('transparent-bg');
        }
    }
}

module.exports = { WASRTK };
