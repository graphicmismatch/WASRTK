# WASRTK Architecture Overview

## Introduction

WASRTK is a pixel art and animation tool built with Electron, providing a desktop application experience for creating and editing pixel art animations.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Application                     │
├─────────────────────────────────────────────────────────────┤
│  Main Process (main.js)           │  Renderer Process       │
│  ┌─────────────────────────────┐  │  ┌─────────────────────┐ │
│  │ • Window Management         │  │  │ • UI Components     │ │
│  │ • Menu System               │  │  │ • Canvas Rendering  │ │
│  │ • File System Operations    │  │  │ • Event Handling    │ │
│  │ • IPC Communication         │  │  │ • State Management  │ │
│  │ • Screen Capture            │  │  │ • Animation Engine  │ │
│  └─────────────────────────────┘  │  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### Main Process (`main.js`)
- **Window Management**: Creates and manages the Electron browser window
- **Menu System**: Handles application menus and keyboard shortcuts
- **File Operations**: Manages file I/O through IPC handlers
- **Screen Capture**: Provides desktop/window capture functionality

### Renderer Process (`renderer.js`)
- **Canvas Management**: Handles main and overlay canvases
- **Drawing Engine**: Implements various drawing tools and algorithms
- **Animation System**: Manages frame-based animation
- **Layer System**: Handles multiple drawing layers
- **State Management**: Maintains application state and undo/redo

### User Interface (`index.html`, `styles.css`)
- **Tool Panel**: Drawing tools and brush settings
- **Color Panel**: Color picker and presets
- **Layer Panel**: Layer management interface
- **Timeline Panel**: Frame management and onion skinning
- **Canvas Area**: Main drawing workspace

## Key Features Architecture

### Multi-Layer System
- Each frame contains multiple layers
- Layers can be reordered, hidden, or locked
- Background layer is always present

### Frame-Based Animation
- Frames are stored as arrays of layer canvases
- Onion skinning shows previous/next frames
- Animation playback with configurable FPS

### Drawing Tools
- Pen, Line, Rectangle, Circle, Fill, Eraser tools
- Configurable brush size and opacity
- Antialiasing toggle for smooth vs pixel-perfect drawing

## Design Patterns

### Event-Driven Architecture
User interactions trigger events that are handled by appropriate components.

### Observer Pattern
The UI updates automatically when state changes through update methods.

### Command Pattern (Undo/Redo)
Drawing operations are wrapped in commands that can be undone/redone.

## Data Flow

### User Input Flow
```
User Action → Event Listener → State Update → UI Update → Canvas Redraw
```

### File Operations Flow
```
Menu Action → IPC Message → Main Process → File System → IPC Response → Renderer Update
```

## Performance Optimizations

### Canvas Management
- Separate canvases for main content and overlay
- Efficient coordinate conversion
- Minimal redraw operations

### Memory Management
- Canvas cloning for undo/redo
- Proper cleanup of event listeners
- Efficient image data handling

## Extensibility

The architecture supports easy extension through:
1. **New Tools**: Add new drawing tools by implementing tool logic
2. **File Formats**: Extend file support through new IPC handlers
3. **UI Components**: Add new panels and controls
4. **Animation Features**: Extend animation capabilities

For detailed implementation information, see:
- **[Main Process](./../implementation/main-process.md)**
- **[Renderer Process](./../implementation/renderer-process.md)**
- **[Component Architecture](./components.md)**
- **[Data Flow](./data-flow.md)**
- **[State Management](./state-management.md)** 