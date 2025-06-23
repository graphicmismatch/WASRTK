# Main Process Implementation

## Overview

The main process (`main.js`) is the core of the Electron application, responsible for managing the application lifecycle, system-level operations, and inter-process communication. It runs in a Node.js environment with access to system APIs.

## Process Structure

### Entry Point
```javascript
const { app, BrowserWindow, Menu, ipcMain, dialog, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
```

### Application Lifecycle
```javascript
app.whenReady().then(() => {
    createWindow();
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
```

## Window Management

### Window Creation
```javascript
function createWindow() {
    const windowOptions = {
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            webSecurity: false,
            allowRunningInsecureContent: true
        },
        titleBarStyle: 'default',
        show: false
    };

    // Add icon if it exists
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    if (fs.existsSync(iconPath)) {
        windowOptions.icon = iconPath;
    }

    mainWindow = new BrowserWindow(windowOptions);
    mainWindow.loadFile('index.html');
}
```

### Window Configuration
- **Initial Size**: 1400x900 pixels
- **Minimum Size**: 256x256 pixels
- **Node Integration**: Enabled for direct Node.js access
- **Context Isolation**: Disabled for simplified IPC
- **Web Security**: Disabled for local file access

### Window Event Handling
```javascript
// Show window when ready to prevent visual flash
mainWindow.once('ready-to-show', () => {
    mainWindow.show();
});

// Handle window closed
mainWindow.on('closed', () => {
    mainWindow = null;
});
```

## Menu System

### Menu Template Structure
```javascript
const template = [
    {
        label: 'File',
        submenu: [
            {
                label: 'New Project',
                accelerator: 'CmdOrCtrl+N',
                click: () => {
                    mainWindow.webContents.send('new-project');
                }
            },
            // ... more menu items
        ]
    },
    // ... more menu categories
];
```

### Menu Categories

#### File Menu
- **New Project** (Ctrl/Cmd+N): Create new project
- **Open Reference Image** (Ctrl/Cmd+Shift+R): Open reference image files
- **Load Project** (Ctrl/Cmd+Shift+O): Load .wasrtk project files
- **Save Project** (Ctrl/Cmd+S): Save project as .wasrtk file
- **Save Animation** (Ctrl/Cmd+Shift+S): Save animation (PNG Sequence, GIF Animation)
- **Exit** (Ctrl/Cmd+Q): Quit application

#### Edit Menu
- **Undo** (Ctrl/Cmd+Z): Undo last action
- **Redo** (Ctrl/Cmd+Y): Redo last action

#### View Menu
- **Reload**: Reload application
- **Force Reload**: Force reload application
- **Toggle Developer Tools**: Show/hide DevTools
- **Zoom Controls**: Zoom in/out/reset
- **Full Screen**: Toggle full screen

#### Animation Menu
- **Add Frame** (F): Add new frame
- **Duplicate Frame** (D): Duplicate current frame
- **Delete Frame** (Delete): Delete current frame
- **Play Animation** (Space): Start animation
- **Stop Animation** (Escape): Stop animation

#### Layers Menu
- **Move Layer Up** (Ctrl/Cmd+Up): Move layer up
- **Move Layer Down** (Ctrl/Cmd+Down): Move layer down
- **Flatten Layer** (Ctrl/Cmd+E): Flatten current layer

#### Reference Menu
- **Reset Reference Position** (Ctrl/Cmd+R): Reset reference
- **Toggle Antialiasing** (Ctrl/Cmd+A): Toggle antialiasing

#### Tools Menu
- **Pen Tool**: Select pen tool
- **Line Tool**: Select line tool
- **Rectangle Tool**: Select rectangle tool
- **Circle Tool**: Select circle tool
- **Fill Tool**: Select fill tool
- **Eraser Tool**: Select eraser tool
- **Selection Tool**: Select selection tool

### Platform-Specific Menus
```javascript
// Add help menu for macOS
if (process.platform === 'darwin') {
    template.push({
        label: 'Help',
        submenu: [
            {
                label: 'About WASRTK',
                click: () => {
                    dialog.showMessageBox(mainWindow, {
                        type: 'info',
                        title: 'About WASRTK',
                        message: 'WASRTK',
                        detail: 'A simple pixel art and animation tool built with Electron.'
                    });
                }
            }
        ]
    });
}
```

## IPC Handlers

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

#### Fallback Screen Sources
```javascript
ipcMain.handle('get-screen-sources-fallback', async () => {
    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
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
        console.error('Error getting screen sources (fallback):', error);
        throw error;
    }
});
```

### File System IPC Handlers

#### Save File
```javascript
ipcMain.handle('save-file', async (event, { filePath, data }) => {
    if (filePath) {
        try {
            fs.writeFileSync(filePath, data);
            return { success: true, path: filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return { success: false, canceled: true };
});
```

#### Read File
```javascript
ipcMain.handle('read-file', async (event, filePath) => {
    try {
        const data = fs.readFileSync(filePath);
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
```

#### Read Binary File
```javascript
ipcMain.handle('read-binary-file', async (event, filePath) => {
    try {
        const data = fs.readFileSync(filePath);
        return { success: true, data: data.toString('base64') };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
```

## File System Operations

### File Dialog Operations

#### Open File Dialog
```javascript
const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp'] },
        { name: 'All Files', extensions: ['*'] }
    ]
});

if (!result.canceled && result.filePaths.length > 0) {
    mainWindow.webContents.send('open-reference-image', result.filePaths[0]);
}
```

#### Save File Dialog
```javascript
const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
        { name: 'PNG Sequence', extensions: ['png'] },
        { name: 'GIF Animation', extensions: ['gif'] },
        { name: 'WASRTK Project', extensions: ['wasrtk'] }
    ]
});

if (!result.canceled) {
    mainWindow.webContents.send('save-animation', result.filePath);
}
```

### Supported File Formats

#### Input Formats
- **Images**: PNG, JPG, JPEG, GIF, BMP

#### Output Formats
- **PNG Sequence**: Individual frame images
- **GIF Animation**: Animated GIF files
- **WASRTK Project**: Complete project data (.wasrtk files)

## Development Features

### Development Mode
```javascript
// Open DevTools in development
if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
}
```

### Error Handling
```javascript
// Global error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
```

## Performance Considerations

### Memory Management
- **Window Cleanup**: Proper disposal of window references
- **IPC Cleanup**: Automatic cleanup of IPC handlers
- **File Handle Management**: Proper file handle closure

### Security Considerations
- **Permission Validation**: Strict permission checking
- **File Path Validation**: Sanitization of file paths
- **IPC Message Validation**: Validation of IPC messages

This main process implementation provides the foundation for WASRTK's system-level operations and user interface.