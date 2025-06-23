# Drawing Tools

## Overview

WASRTK provides a comprehensive set of drawing tools designed specifically for pixel art creation. Each tool is optimized for both pixel-perfect drawing and smooth artistic work, with configurable settings and real-time preview capabilities.

## Available Tools

### 1. Pen Tool
**Shortcut**: Click pen icon  
**Description**: Primary drawing tool for freehand pixel art creation

#### Features
- **Pixel-perfect drawing**: Each click places exactly one pixel
- **Brush size support**: Configurable brush sizes from 1 to 50 pixels
- **Opacity control**: Adjustable transparency for layering effects
- **Antialiasing toggle**: Switch between smooth and pixel-perfect drawing

#### Implementation
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

### 2. Line Tool
**Shortcut**: Click line icon  
**Description**: Draw straight lines between two points

#### Features
- **Pixel-perfect lines**: Bresenham's algorithm for precise line drawing
- **Smooth lines**: Antialiased lines for artistic work
- **Brush size support**: Variable line thickness
- **Real-time preview**: See line before committing

#### Implementation
```javascript
drawLine(x1, y1, x2, y2, useStrokeCtx = false) {
    const ctx = useStrokeCtx ? strokeCtx : mainCtx;
    const color = currentTool === 'eraser' ? '#ffffff' : currentColor;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.globalAlpha = currentOpacity;
    
    if (antialiasingEnabled) {
        // Smooth line drawing
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    } else {
        // Pixel-perfect line drawing
        this.drawPixelPerfectLineWithFillRect(ctx, x1, y1, x2, y2);
    }
    
    ctx.globalAlpha = 1.0;
}
```

#### Pixel-Perfect Line Algorithm
```javascript
drawPixelPerfectLineWithFillRect(ctx, x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    
    let x = x1;
    let y = y1;
    
    while (true) {
        // Draw pixel at current position
        if (brushSize === 1) {
            ctx.fillRect(x, y, 1, 1);
        } else {
            const halfSize = Math.floor(brushSize / 2);
            ctx.fillRect(x - halfSize, y - halfSize, brushSize, brushSize);
        }
        
        if (x === x2 && y === y2) break;
        
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x += sx;
        }
        if (e2 < dx) {
            err += dx;
            y += sy;
        }
    }
}
```

### 3. Rectangle Tool
**Shortcut**: Click rectangle icon  
**Description**: Draw rectangular shapes with configurable fill options

#### Features
- **Outline mode**: Draw only the border
- **Fill mode**: Fill the entire rectangle
- **Real-time preview**: See shape before committing
- **Snap to grid**: Optional grid alignment

#### Implementation
```javascript
drawShapePreview(start, end, tool) {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    const color = currentTool === 'eraser' ? '#ffffff' : currentColor;
    overlayCtx.strokeStyle = color;
    overlayCtx.lineWidth = 1;
    overlayCtx.globalAlpha = currentOpacity;
    
    if (tool === 'rectangle') {
        const width = end.x - start.x;
        const height = end.y - start.y;
        overlayCtx.strokeRect(start.x, start.y, width, height);
    }
    
    overlayCtx.globalAlpha = 1.0;
}

commitShape(start, end, tool) {
    const ctx = frames[currentFrame].layers[currentLayer].canvas.getContext('2d');
    const color = currentTool === 'eraser' ? '#ffffff' : currentColor;
    
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = brushSize;
    ctx.globalAlpha = currentOpacity;
    
    if (tool === 'rectangle') {
        const width = end.x - start.x;
        const height = end.y - start.y;
        
        if (brushSize > 1) {
            // Fill rectangle for thick borders
        ctx.fillRect(start.x, start.y, width, height);
        } else {
            // Outline rectangle for thin borders
            ctx.strokeRect(start.x, start.y, width, height);
        }
    }
    
    ctx.globalAlpha = 1.0;
}
```

### 4. Circle Tool
**Shortcut**: Click circle icon  
**Description**: Draw circular and elliptical shapes

#### Features
- **Perfect circles**: Maintain aspect ratio when drawing
- **Ellipses**: Free-form elliptical shapes
- **Pixel-perfect rendering**: Optimized circle drawing algorithm
- **Real-time preview**: See shape before committing

#### Implementation
```javascript
drawShapePreview(start, end, tool) {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    const color = currentTool === 'eraser' ? '#ffffff' : currentColor;
    overlayCtx.strokeStyle = color;
    overlayCtx.lineWidth = 1;
    overlayCtx.globalAlpha = currentOpacity;
    
    if (tool === 'circle') {
        const radiusX = Math.abs(end.x - start.x) / 2;
        const radiusY = Math.abs(end.y - start.y) / 2;
        const centerX = start.x + (end.x - start.x) / 2;
        const centerY = start.y + (end.y - start.y) / 2;
        
    overlayCtx.beginPath();
        overlayCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    overlayCtx.stroke();
}

    overlayCtx.globalAlpha = 1.0;
}
```

#### Pixel-Perfect Circle Algorithm
```javascript
drawPixelPerfectCircleWithFillRect(ctx, cx, cy, rx, ry) {
    const points = [];
    
    // Generate circle points using midpoint circle algorithm
    let x = rx;
    let y = 0;
    let err = 0;
    
    while (x >= y) {
        points.push([cx + x, cy + y]);
        points.push([cx + y, cy + x]);
        points.push([cx - y, cy + x]);
        points.push([cx - x, cy + y]);
        points.push([cx - x, cy - y]);
        points.push([cx - y, cy - x]);
        points.push([cx + y, cy - x]);
        points.push([cx + x, cy - y]);
        
        if (err <= 0) {
            y += 1;
            err += 2 * y + 1;
        }
        if (err > 0) {
            x -= 1;
            err -= 2 * x + 1;
        }
    }
    
    // Draw points
    points.forEach(([x, y]) => {
        if (brushSize === 1) {
            ctx.fillRect(x, y, 1, 1);
        } else {
            const halfSize = Math.floor(brushSize / 2);
            ctx.fillRect(x - halfSize, y - halfSize, brushSize, brushSize);
        }
    });
}
```

### 5. Fill Tool
**Shortcut**: Click fill icon  
**Description**: Flood fill areas with color or transparency

#### Features
- **Color tolerance**: Adjustable tolerance for similar colors
- **Transparency support**: Fill with transparent areas
- **Boundary detection**: Smart boundary recognition
- **Performance optimized**: Efficient flood fill algorithm

#### Implementation
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

### 6. Eraser Tool
**Shortcut**: Click eraser icon  
**Description**: Remove pixels and create transparent areas

#### Features
- **Transparency creation**: Erase to transparent background
- **Brush size support**: Variable eraser size
- **Opacity control**: Partial erasing for blending
- **Same algorithms**: Uses pen tool algorithms with white color

#### Implementation
The eraser tool uses the same drawing algorithms as the pen tool but with white color (`#ffffff`) to simulate erasing:

```javascript
// In drawPoint function
const color = currentTool === 'eraser' ? '#ffffff' : currentColor;
```

## Tool Settings

### Brush Size
**Range**: 1-50 pixels  
**Default**: 1 pixel  
**Control**: Slider in tools panel

#### Size Categories
- **1px**: Pixel-perfect drawing
- **2-5px**: Small details and outlines
- **6-15px**: Medium strokes and fills
- **16-50px**: Large areas and backgrounds

### Opacity
**Range**: 0-100%  
**Default**: 100%  
**Control**: Slider in tools panel

#### Opacity Effects
- **100%**: Full opacity, solid colors
- **50-99%**: Semi-transparent for layering
- **1-49%**: Very transparent for subtle effects
- **0%**: Completely transparent (no effect)

### Antialiasing
**Toggle**: Checkbox in tools panel  
**Default**: Enabled

#### Effects
- **Enabled**: Smooth, anti-aliased drawing
- **Disabled**: Pixel-perfect, sharp edges

### Fill Tolerance
**Range**: 0-255  
**Default**: 0  
**Control**: Slider (visible only for fill tool)

#### Tolerance Levels
- **0**: Exact color match
- **1-25**: Very similar colors
- **26-100**: Similar colors
- **101-255**: Broad color matching

## Tool Selection

### Visual Feedback
- **Active tool**: Highlighted button with accent color
- **Tool preview**: Brush size preview on canvas
- **Status bar**: Current tool name displayed
- **Cursor changes**: Visual cursor feedback

## Performance Optimizations

### Drawing Optimizations
- **Stroke compositing**: Temporary canvas for smooth drawing
- **Efficient algorithms**: Optimized line and circle drawing
- **Minimal redraws**: Only update changed areas
- **Memory management**: Proper canvas cleanup

### Tool Switching
- **Instant switching**: No delay when changing tools
- **State preservation**: Tool settings maintained
- **Preview updates**: Immediate visual feedback
- **Memory efficient**: No unnecessary object creation

## Best Practices

### Pixel Art Techniques
1. **Start with outlines**: Use line tool for clean edges
2. **Fill large areas**: Use fill tool for backgrounds
3. **Add details**: Use pen tool for fine details
4. **Clean up**: Use eraser for corrections
5. **Layer organization**: Use layers for complex artwork

### Tool Selection
1. **Choose appropriate brush size**: Match tool to detail level
2. **Use opacity for effects**: Create depth and shading
3. **Toggle antialiasing**: Use for smooth vs pixel-perfect work
4. **Adjust fill tolerance**: Match tolerance to artwork style

### Performance Tips
1. **Use appropriate canvas size**: Larger canvases use more memory
2. **Limit layer count**: Too many layers impact performance
3. **Regular saves**: Save work frequently
4. **Clean up unused layers**: Remove unnecessary layers

This comprehensive drawing tools system provides everything needed for professional pixel art creation. 