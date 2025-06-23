# File Formats

## Overview

WASRTK supports various file formats for importing reference images and exporting pixel art animations. This document details the supported formats, their specifications, and usage guidelines.

## Supported Formats

### Image Import Formats

#### PNG (Portable Network Graphics)
- **Extension**: `.png`
- **Support**: Full support for import and export
- **Features**: Lossless compression, transparency support, 8-bit and 24-bit color depth
- **Use Cases**: Reference images, final artwork, sprites with transparency

#### JPEG (Joint Photographic Experts Group)
- **Extension**: `.jpg`, `.jpeg`
- **Support**: Import only (no export)
- **Features**: Lossy compression, no transparency support, 24-bit color depth
- **Use Cases**: Reference images, photographs, backgrounds

#### GIF (Graphics Interchange Format)
- **Extension**: `.gif`
- **Support**: Import only (no export)
- **Features**: Lossless compression, limited transparency, 8-bit color palette
- **Use Cases**: Reference images, simple animations

#### BMP (Bitmap)
- **Extension**: `.bmp`
- **Support**: Import only (no export)
- **Features**: Uncompressed or RLE compression, no transparency, various color depths
- **Use Cases**: Reference images, legacy format support

### Animation Export Formats

#### PNG Sequence
- **Extension**: `.png` (multiple files)
- **Support**: Export only
- **Features**: Individual PNG files for each frame, lossless quality, transparency support
- **Naming**: `filename-0001.png`, `filename-0002.png`
- **Use Cases**: High-quality animation export, frame-by-frame editing

#### GIF Animation
- **Extension**: `.gif`
- **Support**: Export only
- **Features**: Single file containing all frames, lossless compression, 256 colors maximum
- **Use Cases**: Web animations, social media, simple animations

### Project Format

#### WASRTK Project File
- **Extension**: `.wasrtk`
- **Support**: Save and load
- **Features**: JSON-based format, complete project state, frame data and layer information
- **Use Cases**: Project backup, collaboration, version control

## Import Process

### Reference Image Import

#### Supported Formats
```javascript
const supportedFormats = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/bmp'
];
```

#### Import Implementation
```javascript
async function loadReferenceFromBlob(blob) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    
    img.onload = () => {
        referenceImage = img;
        referenceVisible = true;
        referenceOpacity = 0.5;
        referenceScale = 1.0;
        referenceX = 0;
        referenceY = 0;
        
        updateReferenceControls();
        renderCurrentFrame();
    };
    
    img.onerror = () => {
        console.error('Failed to load reference image');
        alert('Failed to load reference image. Please check the file format.');
    };
    
    img.src = url;
}
```

#### File Size Limits
- **Maximum size**: 10MB per file
- **Recommended size**: Under 5MB for optimal performance
- **Resolution limits**: 4096x4096 pixels maximum

## Export Process

### PNG Sequence Export

#### Implementation
```javascript
async function saveAsPngSequence(filePath) {
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

#### Implementation
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

### Project File Export

#### Implementation
```javascript
async function saveProject(filePath) {
    const projectData = {
        version: '1.0.0',
        metadata: {
            name: path.basename(filePath, '.wasrtk'),
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            canvas: {
                width: mainCanvas.width,
                height: mainCanvas.height
            }
        },
        settings: {
            fps: fps,
            currentTool: currentTool,
            brushSize: brushSize,
            opacity: currentOpacity,
            antialiasing: antialiasingEnabled
        },
        frames: frames.map(frame => ({
            id: frame.id,
            name: frame.name,
            layers: frame.layers.map(layer => ({
                id: layer.id,
                name: layer.name,
                visible: layer.visible,
                locked: layer.locked,
                data: layer.canvas.toDataURL()
            }))
        })),
        reference: referenceImage ? {
            data: referenceImage.src,
            visible: referenceVisible,
            opacity: referenceOpacity,
            scale: referenceScale,
            x: referenceX,
            y: referenceY
        } : null
    };

    const jsonString = JSON.stringify(projectData, null, 2);
    const buffer = Buffer.from(jsonString, 'utf8');

    const result = await ipcRenderer.invoke('save-file', {
        filePath: filePath,
        data: buffer
    });

    if (!result.success) {
        throw new Error(result.error || 'Failed to save project.');
    }
}
```

## Format Specifications

### PNG Specification
- **Color depth**: 8-bit (indexed) or 24-bit (RGB)
- **Transparency**: Alpha channel support
- **Compression**: Deflate algorithm
- **Metadata**: Text chunks, color profile

### GIF Specification
- **Color depth**: 8-bit (256 colors)
- **Transparency**: Single color transparency
- **Compression**: LZW algorithm
- **Animation**: Multiple frames with timing

### JPEG Specification
- **Color depth**: 24-bit (RGB)
- **Transparency**: Not supported
- **Compression**: Lossy DCT algorithm
- **Quality**: 0-100 (configurable)

## Performance Considerations

### Import Performance
- **Large files**: May cause UI freezing
- **Memory usage**: Images loaded into memory
- **Processing time**: Depends on file size and format

### Export Performance
- **PNG sequence**: Faster for individual frames
- **GIF creation**: Slower due to compression
- **Memory usage**: Temporary canvases created

### Optimization Tips
1. **Resize images**: Scale down large reference images
2. **Use appropriate formats**: PNG for quality, JPEG for size
3. **Limit frame count**: For GIF export
4. **Optimize canvas size**: Smaller canvases process faster

## Error Handling

### Common Errors
- **Unsupported format**: Show format list
- **File too large**: Suggest resizing
- **Corrupted file**: Suggest re-download
- **Permission denied**: Check file permissions

## Best Practices

### Import Best Practices
1. **Use appropriate formats**: PNG for transparency, JPEG for photos
2. **Optimize file sizes**: Compress before importing
3. **Check resolution**: Ensure appropriate size for canvas
4. **Backup originals**: Keep original files safe

### Export Best Practices
1. **Choose format wisely**: PNG for quality, GIF for web
2. **Consider file size**: Balance quality vs size
3. **Test compatibility**: Verify files work in target applications
4. **Use descriptive names**: Include project info in filenames

This comprehensive file format support enables flexible import and export workflows for pixel art creation. 