# Renderer Process Implementation

## Overview

The renderer process (`renderer.js`) is the heart of the WASRTK application, handling all user interactions, drawing operations, animation playback, and UI management. It implements a comprehensive pixel art and animation system with multiple layers, frames, and drawing tools.

## Core Architecture

### WASRTK Class Structure

The main application logic is encapsulated in the `WASRTK` class:

```javascript
class WASRTK {
    constructor() {
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
}
```

### Global State Variables

```javascript
// Drawing state
let currentTool = 'pen';
let currentColor = '#000000';
let currentOpacity = 1.0;
let brushSize = 1;
let isDrawing = false;
let antialiasingEnabled = true;
let fillTolerance = 0;

// Animation state
let currentFrame = 0;
let frames = [];
let isAnimating = false;
let fps = 12;
let onionSkinningEnabled = false;
let onionSkinningRange = 3;

// Layer state
let currentLayer = 0;
let layers = [];

// Reference image state
let referenceImage = null;
let referenceVisible = false;
let referenceOpacity = 0.5;
let referenceX = 0;
let referenceY = 0;
let referenceScale = 1.0;
let isDraggingReference = false;
let userModifiedReference = false;

// View state
let zoom = 1;
let lastMousePos = null;
let isPanning = false;
let panStartPos = { x: 0, y: 0 };
let panStartScroll = { left: 0, top: 0 };
```

## Canvas System

### Canvas Initialization

```javascript
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
```

### Canvas Elements

- **Main Canvas**: Primary drawing surface
- **Overlay Canvas**: Preview and temporary drawing
- **Layer Canvases**: Individual layer drawing surfaces
- **Stroke Canvas**: Temporary stroke compositing

### Coordinate System

```javascript
// Helper function to convert screen coordinates to canvas coordinates
screenToCanvas(screenX, screenY) {
    const rect = mainCanvas.getBoundingClientRect();
    const canvasX = (screenX - rect.left) / zoom;
    const canvasY = (screenY - rect.top) / zoom;
    return this.roundToPixel(canvasX, canvasY);
}

// Helper function to round coordinates for pixel-perfect drawing
roundToPixel(x, y) {
    return {
        x: Math.round(x),
        y: Math.round(y)
    };
}
```

### Antialiasing Management

```javascript
// Helper function to apply image smoothing based on antialiasing setting
applyImageSmoothing(ctx) {
    if (antialiasingEnabled) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.mozImageSmoothingEnabled = true;
        ctx.webkitImageSmoothingEnabled = true;
        ctx.msImageSmoothingEnabled = true;
    } else {
        ctx.imageSmoothingEnabled = false;
        ctx.imageSmoothingQuality = 'low';
        ctx.mozImageSmoothingEnabled = false;
        ctx.webkitImageSmoothingEnabled = false;
        ctx.msImageSmoothingEnabled = false;
    }
}
```

## Drawing Engine

### Drawing Event Handling

```javascript
startDrawing(e) {
    if (isDrawing) return;
    
    isDrawing = true;
    const pos = this.screenToCanvas(e.clientX, e.clientY);
    lastMousePos = pos;
    
    // Create stroke canvas for this drawing session
    strokeCanvas = document.createElement('canvas');
    strokeCanvas.width = mainCanvas.width;
    strokeCanvas.height = mainCanvas.height;
    strokeCtx = strokeCanvas.getContext('2d');
    this.applyImageSmoothing(strokeCtx);
    
    // Start drawing based on current tool
    if (currentTool === 'pen' || currentTool === 'eraser') {
        this.drawPoint(pos.x, pos.y, true);
    }
}

draw(e) {
    if (!isDrawing) return;
    
    const pos = this.screenToCanvas(e.clientX, e.clientY);
    
    if (currentTool === 'pen' || currentTool === 'eraser') {
        this.drawLine(lastMousePos.x, lastMousePos.y, pos.x, pos.y, true);
    } else {
        this.drawShapePreview(lastMousePos, pos, currentTool);
    }
    
    lastMousePos = pos;
}

stopDrawing() {
    if (!isDrawing) return;
    
    isDrawing = false;
    
    // Commit the stroke to the current layer
    if (strokeCanvas) {
        const currentLayerCanvas = frames[currentFrame].layers[currentLayer].canvas;
        const currentLayerCtx = currentLayerCanvas.getContext('2d');
        currentLayerCtx.drawImage(strokeCanvas, 0, 0);
        
        // Save state for undo/redo
        this.saveState();
        
        // Clear stroke canvas
        strokeCanvas = null;
        strokeCtx = null;
        
        // Redraw the main canvas
        this.renderCurrentFrame();
    }
}
```

### Drawing Tools Implementation

#### Pen Tool
```javascript
drawPoint(x, y, useStrokeCtx = false) {
    const ctx = useStrokeCtx ? strokeCtx : mainCtx;
    const color = currentTool === 'eraser' ? '#ffffff' : currentColor;
    
    ctx.fillStyle = color;
    ctx.globalAlpha = currentOpacity;
    
    if (brushSize === 1) {
        ctx.fillRect(x, y, 1, 1);
    } else {
        const halfSize = Math.floor(brushSize / 2);
        ctx.fillRect(x - halfSize, y - halfSize, brushSize, brushSize);
    }
    
    ctx.globalAlpha = 1.0;
}
```

#### Line Tool
```javascript
drawLine(x1, y1, x2, y2, useStrokeCtx = false) {
    const ctx = useStrokeCtx ? strokeCtx : mainCtx;
    const color = currentTool === 'eraser' ? '#ffffff' : currentColor;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.globalAlpha = currentOpacity;
    
    if (antialiasingEnabled) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    } else {
        this.drawPixelPerfectLineWithFillRect(ctx, x1, y1, x2, y2);
    }
    
    ctx.globalAlpha = 1.0;
}
```

#### Fill Tool
```javascript
floodFill(ctx, startX, startY, fillColor) {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const data = imageData.data;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    
    const startPos = (startY * width + startX) * 4;
    const startR = data[startPos];
    const startG = data[startPos + 1];
    const startB = data[startPos + 2];
    
    const colorDistance = (r1, g1, b1, r2, g2, b2) => {
        return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
    };
    
    const stack = [[startX, startY]];
    
    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const pos = (y * width + x) * 4;
        
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        const r = data[pos];
        const g = data[pos + 1];
        const b = data[pos + 2];
        
        if (colorDistance(r, g, b, startR, startG, startB) > fillTolerance) continue;
        
        data[pos] = fillColor.r;
        data[pos + 1] = fillColor.g;
        data[pos + 2] = fillColor.b;
        data[pos + 3] = fillColor.a;
        
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    
    ctx.putImageData(imageData, 0, 0);
}
```

## Animation System

### Frame Management

```javascript
addFrame() {
    const newFrame = {
        id: frames.length,
        name: `Frame ${frames.length + 1}`,
        layers: [],
        timestamp: Date.now()
    };
    
    // Clone layers from current frame
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
        
        const newLayerCtx = newLayer.canvas.getContext('2d');
        this.applyImageSmoothing(newLayerCtx);
        newLayerCtx.drawImage(layer.canvas, 0, 0);
        
        newFrame.layers.push(newLayer);
    });
    
    frames.push(newFrame);
    currentFrame = frames.length - 1;
    this.updateTimeline();
    this.renderCurrentFrame();
}
```

### Animation Playback

```javascript
playAnimation() {
    if (isAnimating) return;
    
    isAnimating = true;
    document.getElementById('playBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'inline-block';
    this.animate();
}

stopAnimation() {
    isAnimating = false;
    document.getElementById('playBtn').style.display = 'inline-block';
    document.getElementById('stopBtn').style.display = 'none';
}

animate() {
    if (!isAnimating) return;
    
    this.renderCurrentFrame();
    currentFrame = (currentFrame + 1) % frames.length;
    
    setTimeout(() => {
        if (isAnimating) {
            this.animate();
        }
    }, 1000 / fps);
}
```

## Layer System

### Layer Management

```javascript
addLayer() {
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
        const layerCtx = layerCanvas.getContext('2d');
        this.applyImageSmoothing(layerCtx);
        
        frame.layers.push({
            id: newLayer.id,
            name: newLayer.name,
            visible: newLayer.visible,
            locked: newLayer.locked,
            canvas: layerCanvas
        });
    });
    
    currentLayer = layers.length - 1;
    this.updateLayerList();
    this.renderCurrentFrame();
}
```

## Reference Image System

### Reference Image Loading

```javascript
async openFile(filePath) {
    try {
        const result = await ipcRenderer.invoke('read-binary-file', filePath);
        if (!result.success) {
            throw new Error(result.error);
        }

        const blob = new Blob([result.data]);
        await this.loadReferenceFromBlob(blob);
    } catch (error) {
        console.error('Failed to open file:', error);
        alert('Failed to open file: ' + error.message);
    }
}

async loadReferenceFromBlob(blob, sourceName = null) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    
    img.onload = () => {
        referenceImage = img;
        referenceVisible = true;
        referenceOpacity = 0.5;
        referenceScale = 1.0;
        referenceX = 0;
        referenceY = 0;
        userModifiedReference = false;
        
        this.updateReferenceControls();
        this.renderCurrentFrame();
    };
    
    img.onerror = () => {
        console.error('Failed to load reference image');
        alert('Failed to load reference image. Please check the file format.');
    };
    
    img.src = url;
}
```

## Undo/Redo System

### State Management

```javascript
saveState() {
    const state = {
        frames: this.cloneFrames(frames),
        currentFrame: currentFrame,
        currentLayer: currentLayer
    };
    this.undoStack.push(state);
    this.redoStack = [];
    
    // Limit undo stack size
    if (this.undoStack.length > 50) {
        this.undoStack.shift();
    }
}

undo() {
    if (this.undoStack.length === 0) return;
    
    const currentState = {
        frames: this.cloneFrames(frames),
        currentFrame: currentFrame,
        currentLayer: currentLayer
    };
    
    this.redoStack.push(currentState);
    
    const previousState = this.undoStack.pop();
    frames = this.cloneFrames(previousState.frames);
    currentFrame = previousState.currentFrame;
    currentLayer = previousState.currentLayer;
    
    this.updateTimeline();
    this.updateLayerList();
    this.renderCurrentFrame();
    this.updateUndoRedoButtons();
}

redo() {
    if (this.redoStack.length === 0) return;
    
    const currentState = {
        frames: this.cloneFrames(frames),
        currentFrame: currentFrame,
        currentLayer: currentLayer
    };
    
    this.undoStack.push(currentState);
    
    const nextState = this.redoStack.pop();
    frames = this.cloneFrames(nextState.frames);
    currentFrame = nextState.currentFrame;
    currentLayer = nextState.currentLayer;
    
    this.updateTimeline();
    this.updateLayerList();
    this.renderCurrentFrame();
    this.updateUndoRedoButtons();
}
```

## Export System

### PNG Sequence Export

```javascript
async saveAsPngSequence(filePath) {
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, '.png');

    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const frameNumber = (i + 1).toString().padStart(4, '0');
        const framePath = path.join(dir, `${baseName}-${frameNumber}.png`);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = mainCanvas.width;
        tempCanvas.height = mainCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        // Clear to transparent background
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);

        // Draw visible layers
        frame.layers.forEach(layer => {
            if (layer.visible && !layer.locked) {
                tempCtx.drawImage(layer.canvas, 0, 0);
            }
        });

        const dataUrl = tempCanvas.toDataURL('image/png');
        const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');

        const result = await ipcRenderer.invoke('save-file', {
            filePath: framePath,
            data: buffer
        });

        if (!result.success) {
            throw new Error(result.error || `Failed to save frame ${frameNumber}.`);
        }
    }
}
```

### GIF Animation Export

```javascript
saveAsGif(filePath) {
    const gif = new GIF({
        workers: 2,
        quality: 10,
        width: mainCanvas.width,
        height: mainCanvas.height,
        workerScript: './node_modules/gif.js/dist/gif.worker.js',
        transparent: null,
        background: null,
        dither: false
    });

    // Add frames to GIF
    frames.forEach((frame, index) => {
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = mainCanvas.width;
        frameCanvas.height = mainCanvas.height;
        const frameCtx = frameCanvas.getContext('2d');
        
        // Clear to transparent background
        frameCtx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
        
        // Draw visible layers
        frame.layers.forEach(layer => {
            if (layer.visible && !layer.locked) {
                frameCtx.drawImage(layer.canvas, 0, 0);
            }
        });
        
        // Add frame with timing
        const frameDelay = 1000 / fps;
        gif.addFrame(frameCanvas, { delay: frameDelay });
    });

    // Generate and save GIF
    gif.on('finished', (blob) => {
        const arrayBuffer = blob.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
    });

    gif.render();
}
```

This renderer process implementation provides the complete frontend functionality for WASRTK's pixel art and animation system. 