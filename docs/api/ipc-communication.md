# IPC Communication

## Overview

WASRTK uses Electron's Inter-Process Communication (IPC) system to enable communication between the main process and renderer process. This document details the IPC patterns, message types, and handlers used throughout the application.

## IPC Architecture

### Process Separation
```
┌─────────────────┐    IPC Messages    ┌─────────────────┐
│   Main Process  │ ◄────────────────► │ Renderer Process│
│   (main.js)     │                    │ (renderer.js)   │
└─────────────────┘                    └─────────────────┘
```

### Communication Flow
1. **Main Process**: Handles system-level operations (file I/O, dialogs)
2. **Renderer Process**: Handles UI and drawing operations
3. **IPC Bridge**: Enables secure communication between processes

## Main Process IPC Handlers

### File Operations

#### Save File Handler
```javascript
ipcMain.handle('save-file', async (event, { filePath, data }) => {
    try {
        await fs.promises.writeFile(filePath, data);
        return { success: true };
    } catch (error) {
        console.error('Save file error:', error);
        return { success: false, error: error.message };
    }
});
```

#### Read File Handler
```javascript
ipcMain.handle('read-file', async (event, filePath) => {
    try {
        const data = await fs.promises.readFile(filePath);
        return { success: true, data };
    } catch (error) {
        console.error('Read file error:', error);
        return { success: false, error: error.message };
    }
});
```

#### Read Binary File Handler
```javascript
ipcMain.handle('read-binary-file', async (event, filePath) => {
    try {
        const data = await fs.promises.readFile(filePath);
        return { success: true, data };
    } catch (error) {
        console.error('Read binary file error:', error);
        return { success: false, error: error.message };
    }
});
```

### Screen Capture IPC Handlers

#### Get Screen Sources
```javascript
ipcMain.handle('get-screen-sources', async () => {
    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 150, height: 150 }
        });
        return sources.map(source => ({
            id: source.id,
            name: source.name,
            thumbnail: source.thumbnail.toDataURL(),
            display_id: source.display_id,
            appIcon: source.appIcon ? source.appIcon.toDataURL() : null
        }));
    } catch (error) {
        console.error('Error getting screen sources:', error);
        throw error;
    }
});
```

## Renderer Process IPC Listeners

### File Operation Listeners

#### Open Reference Image
```javascript
ipcRenderer.on('open-reference-image', async (event, filePath) => {
    try {
        const result = await ipcRenderer.invoke('read-binary-file', filePath);
        if (!result.success) {
            throw new Error(result.error);
        }

        const blob = new Blob([result.data]);
        await loadReferenceFromBlob(blob);
    } catch (error) {
        console.error('Failed to open reference image:', error);
        alert('Failed to open reference image: ' + error.message);
    }
});
```

#### Save Project
```javascript
ipcRenderer.on('save-project', async (event, filePath) => {
    try {
        await saveProject(filePath);
        console.log('Project saved successfully');
    } catch (error) {
        console.error('Failed to save project:', error);
        alert('Failed to save project: ' + error.message);
    }
});
```

#### Load Project
```javascript
ipcRenderer.on('load-project', async (event, filePath) => {
    try {
        await loadProject(filePath);
        console.log('Project loaded successfully');
    } catch (error) {
        console.error('Failed to load project:', error);
        alert('Failed to load project: ' + error.message);
    }
});
```

### Animation Listeners

#### Add Frame
```javascript
ipcRenderer.on('add-frame', () => {
    addFrame();
});
```

#### Duplicate Frame
```javascript
ipcRenderer.on('duplicate-frame', () => {
    duplicateFrame();
});
```

#### Delete Frame
```javascript
ipcRenderer.on('delete-frame', () => {
    deleteFrame();
});
```

#### Play Animation
```javascript
ipcRenderer.on('play-animation', () => {
    playAnimation();
});
```

#### Stop Animation
```javascript
ipcRenderer.on('stop-animation', () => {
    stopAnimation();
});
```

### Tool Listeners

#### Select Tool
```javascript
ipcRenderer.on('select-tool', (event, tool) => {
    selectTool(tool);
});
```

### Layer Listeners

#### Move Layer Up
```javascript
ipcRenderer.on('move-layer-up', () => {
    moveLayerUp();
});
```

#### Move Layer Down
```javascript
ipcRenderer.on('move-layer-down', () => {
    moveLayerDown();
});
```

#### Flatten Layer
```javascript
ipcRenderer.on('flatten-layer', () => {
    flattenLayer();
});
```

### Reference Listeners

#### Reset Reference
```javascript
ipcRenderer.on('reset-reference', () => {
    if (referenceImage && referenceVisible) {
        resetReferencePosition();
    }
});
```

#### Toggle Antialiasing
```javascript
ipcRenderer.on('toggle-antialiasing', () => {
    antialiasingEnabled = !antialiasingEnabled;
    document.getElementById('antialiasingEnabled').checked = antialiasingEnabled;
    updateAllCanvasSmoothing();
    renderCurrentFrame();
    updateStatusBar();
});
```

### Edit Listeners

#### Undo
```javascript
ipcRenderer.on('undo', () => {
    undo();
});
```

#### Redo
```javascript
ipcRenderer.on('redo', () => {
    redo();
});
```

## Error Handling

### Standard Error Response
```javascript
// Main process handler
ipcMain.handle('operation', async (event, data) => {
    try {
        const result = await performOperation(data);
        return { success: true, data: result };
    } catch (error) {
        console.error('Operation failed:', error);
        return { success: false, error: error.message };
    }
});

// Renderer process usage
const result = await ipcRenderer.invoke('operation', data);
if (!result.success) {
    throw new Error(result.error);
}
```

## Security Considerations

### Input Validation
- **File paths**: Validate and sanitize file paths
- **Data types**: Ensure correct data types for all parameters
- **Size limits**: Enforce reasonable limits on data sizes
- **Permission checks**: Verify appropriate permissions for operations

### Error Handling
- **Graceful degradation**: Handle errors without crashing
- **User feedback**: Provide clear error messages
- **Logging**: Log errors for debugging
- **Recovery**: Attempt to recover from errors when possible

This IPC communication system provides secure and efficient communication between the main and renderer processes. 