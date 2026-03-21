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
let draggedFrameIndex = null;

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

let strokeCanvas = null;
let strokeCtx = null;

// Initialize the application
class WASRTK {
    constructor() {
        this.tools = loadTools();
        this.undoStack = [];
        this.redoStack = [];
        this.initializeCanvas();
        this.initializeFrames();
        this.initializeLayers();
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

    commitStrokeLayer() {
        if (!strokeCanvas || !strokeCtx) {
            return;
        }

        const frame = frames[currentFrame];
        const layer = frame.layers[currentLayer];
        if (layer && !layer.locked) {
            const ctx = layer.canvas.getContext('2d');
            ctx.save();
            ctx.globalAlpha = currentOpacity;
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(strokeCanvas, 0, 0);
            ctx.restore();
        }

        strokeCanvas = null;
        strokeCtx = null;
        this.clearOverlay();
        this.renderCurrentFrame();
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

    // Helper function to update smoothing on all canvases
    updateAllCanvasSmoothing() {
        this.applyImageSmoothing(mainCtx);
        this.applyImageSmoothing(overlayCtx);
        
        // Update all layer canvases
        frames.forEach(frame => {
            frame.layers.forEach(layer => {
                const layerCtx = layer.canvas.getContext('2d');
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
        const layerCtx = initialLayer.canvas.getContext('2d');
        
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

        // Color presets
        document.querySelectorAll('.color-preset').forEach(preset => {
            preset.addEventListener('click', (e) => {
                this.setColor(e.target.dataset.color);
                document.getElementById('colorPicker').value = e.target.dataset.color;
            });
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

        document.getElementById('brushShapeSelect').addEventListener('change', (e) => {
            this.setBrushShape(e.target.value);
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
        
        mainCanvas.addEventListener('mousemove', (e) => {
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
            
            this.draw(e);
        });
        
        mainCanvas.addEventListener('mouseup', (e) => {
            if (isDraggingReference) {
                isDraggingReference = false;
                lastMousePos = null;
                document.querySelector('.canvas-wrapper').classList.remove('dragging-reference');
                return;
            }
            this.stopDrawing();
        });
        
        mainCanvas.addEventListener('mouseleave', (e) => {
            if (isDraggingReference) {
                isDraggingReference = false;
                lastMousePos = null;
                document.querySelector('.canvas-wrapper').classList.remove('dragging-reference');
                return;
            }
            this.stopDrawing();
        });

        // Mouse position tracking
        mainCanvas.addEventListener('mousemove', (e) => {
            const pixelCoords = this.screenToCanvas(e.clientX, e.clientY);
            document.getElementById('mousePosition').textContent = `${pixelCoords.x}, ${pixelCoords.y}`;
            this.updateBrushSizePreview(e.clientX, e.clientY);
        });

        // Hide brush preview when mouse leaves canvas
        mainCanvas.addEventListener('mouseleave', () => {
            this.hideBrushSizePreview();
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
    }

    // Tool methods
    selectTool(tool) {
        currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tool="${tool}"]`).classList.add('active');
        
        // Show/hide fill tolerance slider
        const toleranceSection = document.getElementById('fillToleranceSection');
        if (tool === 'fill') {
            toleranceSection.style.display = 'block';
        } else {
            toleranceSection.style.display = 'none';
        }
        
        // Hide brush preview if switching away from pen/eraser
        if (tool !== 'pen' && tool !== 'eraser') {
            this.hideBrushSizePreview();
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
        ctx.fillStyle = currentColor;
        ctx.globalAlpha = currentOpacity;
        const centerX = previewCanvas.width / 2;
        const centerY = previewCanvas.height / 2;
        
        if (brushSize === 1) {
            ctx.fillRect(Math.round(centerX), Math.round(centerY), 1, 1);
        } else if (brushShape === 'square') {
            const size = Math.round(brushSize);
            const offset = Math.floor(size / 2);
            ctx.fillRect(Math.round(centerX) - offset, Math.round(centerY) - offset, size, size);
        } else {
            ctx.beginPath();
            ctx.arc(centerX, centerY, brushSize / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
    }

    // Drawing methods
    startDrawing(e) {
        const tool = this.getCurrentToolConfig();

        if (tool?.saveStateOnStart) {
            this.saveState();
        }

        isDrawing = true;
        const coords = this.screenToCanvas(e.clientX, e.clientY);
        lastMousePos = coords; // Initialize last position
        this.startShape = coords; // For shape tools
        tool?.onStart?.(this, { coords });
    }

    draw(e) {
        if (!isDrawing) return;
        const currentCoords = this.screenToCanvas(e.clientX, e.clientY);
        const tool = this.getCurrentToolConfig();

        tool?.onDraw?.(this, {
            currentCoords,
            lastMousePos,
            startShape: this.startShape
        });

        lastMousePos = currentCoords;
    }

    stopDrawing() {
        if (!isDrawing) return;
        isDrawing = false;
        const tool = this.getCurrentToolConfig();
        tool?.onStop?.(this, { startShape: this.startShape, lastMousePos });

        lastMousePos = null;
        this.startShape = null;
    }

    drawPoint(x, y, useStrokeCtx = false) {
        // Only use strokeCtx for pen tool
        const ctx = (useStrokeCtx && currentTool === "pen" && strokeCtx) ? strokeCtx : (() => {
            const frame = frames[currentFrame];
            const layer = frame.layers[currentLayer];
            if (!layer || layer.locked) return null;
            return layer.canvas.getContext('2d');
        })();
        if (!ctx) return;
        ctx.save();
        this.applyImageSmoothing(ctx);
        ctx.globalAlpha = (useStrokeCtx && currentTool === "pen") ? 1.0 : currentOpacity;
        const coords = antialiasingEnabled ? { x, y } : this.roundToPixel(x, y);
        const tool = this.getCurrentToolConfig();
        tool?.drawPoint?.(this, { ctx, coords, useStrokeCtx });
        ctx.restore();
        if (useStrokeCtx && currentTool === "pen") {
            this.showStrokePreview();
        } else {
            this.renderCurrentFrame();
        }
    }

    floodFill(ctx, startX, startY, fillColor) {
        const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        const pixels = imageData.data;
        
        const startPos = (startY * ctx.canvas.width + startX) * 4;
        const startR = pixels[startPos];
        const startG = pixels[startPos + 1];
        const startB = pixels[startPos + 2];
        const startA = pixels[startPos + 3];
        
        const fillR = parseInt(fillColor.substr(1, 2), 16);
        const fillG = parseInt(fillColor.substr(3, 2), 16);
        const fillB = parseInt(fillColor.substr(5, 2), 16);
        
        if (startR === fillR && startG === fillG && startB === fillB) return;
        
        const colorDistance = (r1, g1, b1, r2, g2, b2) => {
            return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
        };
        
        const pixelsToFill = [];
        
        const stack = [[startX, startY]];
        const visited = new Set();
        
        while (stack.length) {
            const [x, y] = stack.pop();
            const pos = (y * ctx.canvas.width + x) * 4;
            
            if (x < 0 || x >= ctx.canvas.width || y < 0 || y >= ctx.canvas.height) continue;
            
            const r = pixels[pos];
            const g = pixels[pos + 1];
            const b = pixels[pos + 2];

            if (visited.has(pos) || colorDistance(r, g, b, startR, startG, startB) > fillTolerance) {
                continue;
            }

            pixelsToFill.push(pos);
            visited.add(pos);
            
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        
        pixelsToFill.forEach(pos => {
            pixels[pos] = fillR;
            pixels[pos + 1] = fillG;
            pixels[pos + 2] = fillB;
            pixels[pos + 3] = 255;
        });
        
        ctx.putImageData(imageData, 0, 0);
    }

    drawLine(x1, y1, x2, y2, useStrokeCtx = false) {
        // Only use strokeCtx for pen tool
        if (antialiasingEnabled) {
            const ctx = (useStrokeCtx && currentTool === "pen" && strokeCtx) ? strokeCtx : (() => {
                const frame = frames[currentFrame];
                const layer = frame.layers[currentLayer];
                if (!layer || layer.locked) return null;
                return layer.canvas.getContext('2d');
            })();
            if (!ctx) return;
            ctx.save();
            this.applyImageSmoothing(ctx);
            ctx.globalAlpha = (useStrokeCtx && currentTool === "pen") ? 1.0 : currentOpacity;
            const tool = this.getCurrentToolConfig();
            tool?.drawLine?.(this, { ctx, x1, y1, x2, y2, useStrokeCtx });
            ctx.restore();
            if (useStrokeCtx && currentTool === "pen") {
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
            if (useStrokeCtx && currentTool === "pen") {
                this.showStrokePreview();
            } else {
                this.renderCurrentFrame();
            }
        }
    }

    drawShapePreview(start, end, tool) {
        overlayCtx.save();
        this.applyImageSmoothing(overlayCtx);
        
        const startCoords = antialiasingEnabled ? start : this.roundToPixel(start.x, start.y);
        const endCoords = antialiasingEnabled ? end : this.roundToPixel(end.x, end.y);
        
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

    commitShape(start, end, tool) {
        const frame = frames[currentFrame];
        const layer = frame.layers[currentLayer];
        if (!layer || layer.locked) return;
        
        const ctx = layer.canvas.getContext('2d');
        
        if (antialiasingEnabled) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            const startCoords = start;
            const endCoords = end;
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
            const endCoords = this.roundToPixel(end.x, end.y);
            
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

    drawPixelPerfectLineWithFillRect(ctx, x1, y1, x2, y2) {
        const points = this.getPixelPerfectLinePoints(x1, y1, x2, y2);
        
        const size = Math.max(1, Math.round(brushSize));
        const offset = Math.floor(size / 2);

        points.forEach(({ x, y }) => {
            ctx.fillRect(x - offset, y - offset, size, size);
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
            const ctx = newLayer.canvas.getContext('2d');
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
            const ctx = newLayer.canvas.getContext('2d');
            
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
            
            const ctxBelow = layerBelow.canvas.getContext('2d');
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
        currentLayer = layerIndex;
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
            eraser: 'Eraser Tool'
        };
        
        document.getElementById('currentTool').textContent = toolNames[currentTool] || 'Unknown Tool';
        document.getElementById('currentColor').textContent = `Color: ${currentColor}`;
        document.getElementById('brushSize').textContent = `Size: ${brushSize}px`;
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
            brushPreview.style.borderRadius = brushShape === 'square' ? '0' : '50%';
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
