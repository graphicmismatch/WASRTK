# Timeline System

## Overview

The timeline system in WASRTK provides comprehensive frame-based animation capabilities, allowing users to create, manage, and play back pixel art animations. The system supports multiple frames, onion skinning, configurable playback speeds, and efficient frame management.

## Frame Management

### Frame Structure

Each frame in WASRTK contains:
- **Frame ID**: Unique identifier for the frame
- **Frame Name**: Human-readable name (e.g., "Frame 1")
- **Layers**: Array of layer canvases for the frame
- **Timestamp**: Creation timestamp for ordering

```javascript
const frame = {
    id: 0,
    name: 'Frame 1',
    layers: [
        {
            id: 0,
            name: 'Background',
            visible: true,
            locked: false,
            canvas: document.createElement('canvas')
        }
    ],
    timestamp: Date.now()
};
```

### Frame Operations

#### Adding Frames
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

**Shortcut**: `F` key or "Add Frame" button

#### Duplicating Frames
```javascript
duplicateFrame() {
    if (frames.length === 0) return;
    
    const frameToDuplicate = frames[currentFrame];
    const newFrame = {
        id: frames.length,
        name: `Frame ${frames.length + 1}`,
        layers: [],
        timestamp: Date.now()
    };
    
    frameToDuplicate.layers.forEach(layer => {
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

**Shortcut**: `D` key or "Duplicate Frame" button

#### Deleting Frames
```javascript
deleteFrame() {
    if (frames.length <= 1) return;
    
    frames.splice(currentFrame, 1);
    
    // Update frame IDs
    frames.forEach((frame, index) => {
        frame.id = index;
        frame.name = `Frame ${index + 1}`;
    });
    
    if (currentFrame >= frames.length) {
        currentFrame = frames.length - 1;
    }
    
    this.updateTimeline();
    this.renderCurrentFrame();
}
```

**Shortcut**: `Delete` key or "Delete Frame" button

### Timeline UI

The timeline displays all frames as thumbnails with frame numbers:

```javascript
updateTimeline() {
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';
    
    frames.forEach((frame, index) => {
        const frameElement = document.createElement('div');
        frameElement.className = `frame-item ${index === currentFrame ? 'active' : ''}`;
        frameElement.dataset.frame = index;
        
        // Create frame preview
        const preview = document.createElement('div');
        preview.className = 'frame-preview';
        
        // Generate thumbnail
        const thumbnailCanvas = document.createElement('canvas');
        thumbnailCanvas.width = 60;
        thumbnailCanvas.height = 45;
        const thumbnailCtx = thumbnailCanvas.getContext('2d');
        
        // Scale down the frame for thumbnail
        thumbnailCtx.drawImage(
            this.compositeFrame(frame),
            0, 0, thumbnailCanvas.width, thumbnailCanvas.height
        );
        
        preview.style.backgroundImage = `url(${thumbnailCanvas.toDataURL()})`;
        
        // Frame number
        const frameNumber = document.createElement('span');
        frameNumber.className = 'frame-number';
        frameNumber.textContent = index + 1;
        
        frameElement.appendChild(preview);
        frameElement.appendChild(frameNumber);
        
        // Click handler
        frameElement.addEventListener('click', () => this.selectFrame(index));
        
        timeline.appendChild(frameElement);
    });
}
```

## Animation Playback

### Playback Controls

#### Play Animation
```javascript
playAnimation() {
    if (isAnimating) return;
    
    isAnimating = true;
    document.getElementById('playBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'inline-block';
    this.animate();
}
```

**Shortcut**: `Space` key or play button

#### Stop Animation
```javascript
stopAnimation() {
    isAnimating = false;
    document.getElementById('playBtn').style.display = 'inline-block';
    document.getElementById('stopBtn').style.display = 'none';
}
```

**Shortcut**: `Escape` key or stop button

#### Animation Loop
```javascript
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

### Playback Settings

#### FPS Control
```javascript
// FPS slider event handler
document.getElementById('fpsSlider').addEventListener('input', (e) => {
    fps = parseInt(e.target.value);
    document.getElementById('fpsValue').textContent = fps;
});

// FPS range: 1-60 FPS
// Default: 12 FPS (standard for pixel art)
```

## Onion Skinning

### Onion Skin Implementation
```javascript
drawOnionSkinning() {
    if (!onionSkinningEnabled || frames.length <= 1) return;
    
    const currentFrameIndex = currentFrame;
    const range = onionSkinningRange;
    
    // Draw previous frames
    for (let i = 1; i <= range; i++) {
        const frameIndex = currentFrameIndex - i;
        if (frameIndex >= 0) {
            const alpha = 0.3 / i;
            this.drawFrameAsOnionSkin(frames[frameIndex], alpha);
        }
    }
    
    // Draw next frames
    for (let i = 1; i <= range; i++) {
        const frameIndex = currentFrameIndex + i;
        if (frameIndex < frames.length) {
            const alpha = 0.3 / i;
            this.drawFrameAsOnionSkin(frames[frameIndex], alpha);
        }
    }
}
```

### Onion Skin Settings
- **Enable/Disable**: Toggle onion skinning on/off
- **Range**: Number of frames to show (1-10)
- **Opacity**: Transparency of onion skin frames
- **Previous/Next**: Show previous, next, or both frame types

## Performance Optimization

### Frame Rendering
- **Thumbnail caching**: Pre-generated thumbnails for performance
- **Lazy loading**: Load frame data only when needed
- **Memory management**: Proper cleanup of unused frame data
- **Efficient compositing**: Optimized layer compositing algorithms

### Animation Performance
- **RequestAnimationFrame**: Smooth playback using browser timing
- **Frame skipping**: Skip frames if rendering falls behind
- **Memory pooling**: Reuse canvas objects to reduce allocation
- **Optimized drawing**: Minimize redraw operations

## Best Practices

### Animation Workflow
1. **Plan your animation**: Storyboard key frames first
2. **Use onion skinning**: Reference previous/next frames
3. **Maintain consistency**: Keep layer structure consistent across frames
4. **Test playback**: Regularly preview animation at target FPS
5. **Optimize frame count**: Use minimum frames needed for smooth motion

### Performance Tips
1. **Limit frame count**: More frames = more memory usage
2. **Use appropriate FPS**: 12 FPS is standard for pixel art
3. **Optimize canvas size**: Smaller canvases render faster
4. **Clean up unused frames**: Delete unnecessary frames

This timeline system provides everything needed for professional pixel art animation creation. 