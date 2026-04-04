# Keyboard Shortcuts

This page documents shortcuts that are actually wired in the current repository, either through the Electron menu or explicit renderer listeners.

## File

- `Ctrl/Cmd+N`: New project
- `Ctrl/Cmd+Shift+R`: Open reference image through the File menu
- `Ctrl/Cmd+Shift+O`: Load project
- `Ctrl/Cmd+S`: Save project
- `Ctrl/Cmd+Shift+S`: Save animation
- `Ctrl+Q` on Windows/Linux, `Cmd+Q` on macOS: Exit

## Edit

- `Ctrl/Cmd+Z`: Undo
- `Ctrl/Cmd+Y`: Redo

## Tools

- `1`: Pen
- `2`: Line
- `3`: Rectangle
- `4`: Circle
- `5`: Fill
- `6`: Eraser
- `7`: Selection

## View

- `Ctrl/Cmd+Alt+T`: Open Theme Settings

Standard Electron view roles are also present for reload, force reload, DevTools, and window zoom.

## Animation

- `F`: Add frame
- `D`: Duplicate frame
- `Delete`: Delete frame
- `Space`: Toggle playback
- `Escape`: Menu accelerator for the Stop Animation action

Note: in the current renderer implementation, both `Play Animation` and `Stop Animation` are routed to the same toggle method.

## Layers

- `Ctrl/Cmd+Up`: Move layer up
- `Ctrl/Cmd+Down`: Move layer down
- `Ctrl/Cmd+E`: Flatten current layer into the one below it

## Reference and canvas

- `Ctrl/Cmd+R`: Reset reference position
- `Ctrl/Cmd+A`: Toggle antialiasing
- `Ctrl/Cmd + mouse wheel`: Zoom in or out at the pointer
- Middle mouse drag: Pan the canvas
- `Ctrl/Cmd + click` on the canvas: Drag the active reference image

## Not currently wired

- Advanced selection transforms (scale/rotate) do not have keyboard shortcuts yet.
