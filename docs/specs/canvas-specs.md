# Canvas Specifications

## Overview

The WASRTK canvas system is built on HTML5 Canvas technology, providing a powerful 2D drawing surface optimized for pixel art and animation creation. This document outlines the technical specifications, limitations, and performance characteristics of the canvas implementation.

## Canvas Architecture

### Multi-Canvas System
WASRTK uses a multi-canvas architecture for optimal performance and functionality:

```javascript
// Canvas hierarchy
const mainCanvas = document.getElementById('mainCanvas');        // Primary display
const overlayCanvas = document.getElementById('overlayCanvas');  // Preview layer
const strokeCanvas = document.createElement('canvas');          // Temporary strokes
const layerCanvases = [];                                      // Individual layers
```

### Canvas Types and Purposes

#### 1. Main Canvas
- **Purpose**: Primary display surface
- **Content**: Composited final image
- **Updates**: On every frame change or layer modification
- **Performance**: Critical for smooth interaction

#### 2. Overlay Canvas
- **Purpose**: Preview and temporary drawing
- **Content**: Shape previews, brush previews
- **Updates**: Real-time during drawing
- **Performance**: High-frequency updates

#### 3. Stroke Canvas
- **Purpose**: Temporary stroke compositing
- **Content**: Current drawing stroke
- **Updates**: During pen tool usage
- **Performance**: Per-stroke creation/destruction

#### 4. Layer Canvases
- **Purpose**: Individual layer content
- **Content**: Layer-specific drawings
- **Updates**: When layer is modified
- **Performance**: Cached until modified

## Size Specifications

### Canvas Dimensions

#### Default Canvas Size
- **Width**: 800 pixels
- **Height**: 600 pixels
- **Aspect Ratio**: 4:3
- **Total Pixels**: 480,000 pixels

#### Minimum Canvas Size
- **Width**: 1 pixel
- **Height**: 1 pixel
- **Use Case**: Minimal testing scenarios

#### Maximum Canvas Size
- **Width**: 4096 pixels
- **Height**: 4096 pixels
- **Total Pixels**: 16,777,216 pixels
- **Memory Usage**: ~67MB (RGBA format)

#### Recommended Canvas Sizes
| Size | Width | Height | Pixels | Memory | Use Case |
|------|-------|--------|--------|--------|----------|
| Small | 320 | 240 | 76,800 | ~3MB | Icons, small sprites |
| Medium | 256 | 256 | 65,536 | ~6MB | Standard animations |
| Large | 1920 | 1080 | 2,073,600 | ~83MB | HD content |
| Extra Large | 4096 | 4096 | 16,777,216 | ~67MB | High-res textures |

### Memory Calculations

#### Per-Pixel Memory Usage
```javascript
// RGBA format (4 bytes per pixel)
const bytesPerPixel = 4;
const memoryUsage = width * height * bytesPerPixel;

// Example calculations
const smallCanvas = 320 * 240 * 4;    // 307,200 bytes (~300KB)
const mediumCanvas = 256 * 256 * 4;   // 262,144 bytes (~256KB)
const largeCanvas = 1920 * 1080 * 4;  // 8,294,400 bytes (~8.3MB)
const maxCanvas = 4096 * 4096 * 4;    // 67,108,864 bytes (~67MB)
```

#### Layer Memory Impact
```javascript
// Memory usage per layer
const layerMemory = canvasWidth * canvasHeight * 4;

// Total project memory (approximate)
const totalMemory = layerMemory * numberOfLayers * numberOfFrames;
```

## Performance Specifications

### Rendering Performance

#### Frame Rate Targets
- **Target FPS**: 60 FPS
- **Minimum FPS**: 30 FPS
- **Animation FPS**: 1-60 FPS (user configurable)

#### Canvas Update Performance
```javascript
// Performance benchmarks (approximate)
const performanceMetrics = {
    smallCanvas: {
        clearTime: '< 1ms',
        drawTime: '< 5ms',
        compositeTime: '< 2ms'
    },
    mediumCanvas: {
        clearTime: '1-2ms',
        drawTime: '5-10ms',
        compositeTime: '2-5ms'
    },
    largeCanvas: {
        clearTime: '2-5ms',
        drawTime: '10-20ms',
        compositeTime: '5-10ms'
    },
    maxCanvas: {
        clearTime: '5-10ms',
        drawTime: '20-50ms',
        compositeTime: '10-20ms'
    }
};
```

### Memory Performance

#### Memory Allocation
- **Initial Allocation**: Canvas size * 4 bytes
- **Dynamic Allocation**: As needed for temporary canvases
- **Garbage Collection**: Automatic cleanup of temporary canvases

#### Memory Optimization
```javascript
// Canvas pooling for temporary canvases
const canvasPool = {
    small: [],    // 320x240
    medium: [],   // 256x256
    large: [],    // 1920x1080
    custom: []    // Other sizes
};

// Reuse canvases to reduce allocation overhead
const getCanvas = (width, height) => {
    const pool = getPoolForSize(width, height);
    return pool.length > 0 ? pool.pop() : createCanvas(width, height);
};

const returnCanvas = (canvas) => {
    const pool = getPoolForSize(canvas.width, canvas.height);
    pool.push(canvas);
};
```

## Technical Capabilities

### Drawing Operations

#### Supported Operations
- **Point Drawing**: Single pixel placement
- **Line Drawing**: Bresenham's algorithm
- **Shape Drawing**: Rectangles, circles, ellipses
- **Flood Fill**: Stack-based algorithm
- **Image Drawing**: Full image compositing

#### Drawing Modes
```javascript
const drawingModes = {
    pixelPerfect: {
        antialiasing: false,
        smoothing: false,
        precision: 'pixel'
    },
    smooth: {
        antialiasing: true,
        smoothing: true,
        precision: 'subpixel'
    }
};
```

### Compositing Operations

#### Blend Modes
- **Normal**: Standard alpha blending
- **Multiply**: Color multiplication
- **Screen**: Color screening
- **Overlay**: Overlay blending
- **Destination-Out**: Eraser mode

#### Alpha Handling
```javascript
// Alpha blending calculations
const blendPixels = (source, destination, alpha) => {
    return {
        r: source.r * alpha + destination.r * (1 - alpha),
        g: source.g * alpha + destination.g * (1 - alpha),
        b: source.b * alpha + destination.b * (1 - alpha),
        a: source.a * alpha + destination.a * (1 - alpha)
    };
};
```

## Coordinate System

### Pixel Coordinates
- **Origin**: Top-left corner (0, 0)
- **X-axis**: Left to right (increasing)
- **Y-axis**: Top to bottom (increasing)
- **Precision**: Integer pixel coordinates

### Coordinate Conversion
```javascript
// Screen to canvas coordinate conversion
const screenToCanvas = (screenX, screenY) => {
    const rect = canvas.getBoundingClientRect();
    const canvasX = (screenX - rect.left) / zoom;
    const canvasY = (screenY - rect.top) / zoom;
    return {
        x: Math.round(canvasX),
        y: Math.round(canvasY)
    };
};
```

### Zoom and Pan
- **Zoom Range**: 0.1x to 10x
- **Zoom Center**: Mouse position or canvas center
- **Pan Support**: Scroll-based navigation
- **Zoom Precision**: 0.1x increments

## Color Specifications

### Color Format
- **Format**: RGBA (Red, Green, Blue, Alpha)
- **Bit Depth**: 8 bits per channel (32-bit total)
- **Color Space**: sRGB
- **Alpha Range**: 0.0 (transparent) to 1.0 (opaque)

### Color Operations
```javascript
// Color conversion utilities
const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};

const rgbToHex = (r, g, b) => {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};
```

## Image Data Handling

### ImageData Operations
```javascript
// Get pixel data from canvas
const imageData = ctx.getImageData(0, 0, width, height);
const pixels = imageData.data;

// Access individual pixel
const getPixel = (x, y) => {
    const index = (y * width + x) * 4;
    return {
        r: pixels[index],
        g: pixels[index + 1],
        b: pixels[index + 2],
        a: pixels[index + 3]
    };
};

// Set individual pixel
const setPixel = (x, y, r, g, b, a) => {
    const index = (y * width + x) * 4;
    pixels[index] = r;
    pixels[index + 1] = g;
    pixels[index + 2] = b;
    pixels[index + 3] = a;
};
```

### Performance Considerations
- **ImageData Access**: Direct pixel manipulation
- **Memory Usage**: 4 bytes per pixel
- **Update Frequency**: Batch operations recommended
- **Garbage Collection**: Automatic cleanup

## Limitations and Constraints

### Browser Limitations
- **Maximum Canvas Size**: Varies by browser (typically 4096x4096)
- **Memory Limits**: Browser-dependent heap size
- **Performance**: Hardware acceleration dependent
- **Compatibility**: Modern browsers required

### Application Limitations
- **Layer Count**: Practical limit of 50+ layers
- **Frame Count**: Memory-dependent (1000+ frames possible)
- **Brush Size**: Maximum 50x50 pixels
- **Zoom Level**: 0.1x to 10x range

### Performance Constraints
- **Rendering**: CPU-intensive for large canvases
- **Memory**: High memory usage for large projects
- **Updates**: Frequent redraws can impact performance
- **Animation**: Frame rate limited by rendering performance

## Optimization Strategies

### Rendering Optimization
- **Dirty Region Tracking**: Only redraw changed areas
- **Layer Caching**: Cache rendered layer states
- **Canvas Pooling**: Reuse temporary canvases
- **Batch Operations**: Group related drawing operations

### Memory Optimization
- **Canvas Cleanup**: Proper disposal of temporary canvases
- **State Compression**: Efficient undo/redo storage
- **Lazy Loading**: Load data on demand
- **Garbage Collection**: Minimize memory leaks

### Performance Monitoring
```javascript
// Performance monitoring utilities
const measurePerformance = (operation) => {
    const start = performance.now();
    operation();
    const end = performance.now();
    return end - start;
};

const logPerformance = (operation, time) => {
    console.log(`${operation}: ${time.toFixed(2)}ms`);
};
```

This canvas specification provides the technical foundation for WASRTK's drawing and animation capabilities. 