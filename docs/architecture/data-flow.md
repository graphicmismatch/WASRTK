# Data Flow

## 1. App startup

1. `main.js` waits for `app.whenReady()`.
2. The main BrowserWindow is created and `index.html` is loaded.
3. IPC handlers and the application menu are registered.
4. `renderer.js` calls `bootstrap()`.
5. `src/renderer/index.js` instantiates `new WASRTK()` on `DOMContentLoaded`.
6. Theme sync loads saved colors and applies CSS variables.

## 2. Drawing flow

1. Pointer input is converted from screen space to canvas space.
2. The active tool is resolved from the tool registry.
3. If the tool requests it, the current layer state is pushed to undo history.
4. Pen and eraser strokes are drawn onto a temporary stroke canvas.
5. On release, the stroke canvas is composited into the active frame layer.
6. The main canvas is re-rendered from the frame’s visible layers.

Shape tools follow the same start/draw/stop lifecycle, but preview on the overlay canvas until commit.

## 3. Frame and layer flow

Frame operations update the `frames` array and then refresh:

- current frame selection
- canvas render
- timeline thumbnails
- status bar

Layer operations update both:

- the top-level `layers` metadata array
- every frame’s `layers[]` collection

That duplication keeps layer visibility and ordering consistent across the entire animation.

## 4. Project save/load flow

### Save

1. The renderer gathers frame, layer, canvas, and settings state.
2. `project-io.js` converts each layer canvas to a PNG data URL.
3. The JSON string is sent to `ipcRenderer.invoke('save-file', ...)`.
4. The main process writes the file to disk.

### Load

1. The renderer requests the file through `ipcRenderer.invoke('read-file', ...)`.
2. JSON is parsed and validated.
3. Canvas dimensions and project settings are restored.
4. Each saved layer image is drawn into a newly created in-memory canvas.
5. The editor re-renders and repopulates the timeline and layer list.

## 5. Export flow

### PNG sequence

1. For each frame, the renderer composites visible layers into a temporary canvas.
2. The canvas is encoded as PNG.
3. The buffer is saved through the `save-file` IPC channel.

### GIF

1. Each frame is composited into a temporary canvas.
2. `gif.js` receives the frame with a delay derived from FPS.
3. When rendering finishes, the blob is converted to a buffer.
4. The main process writes the GIF via `save-file`.

## 6. Reference image flow

### File reference

1. The renderer opens a file picker or receives a path from the menu.
2. The file is read as base64 through `read-binary-file`.
3. The data is converted to a Blob, then to an Image.
4. The reference image is centered, shown in the preview, and rendered over the canvas.

### Screen capture reference

1. The renderer asks the main process for desktop/window sources.
2. The user picks a source in a modal.
3. `getUserMedia` starts a desktop capture stream.
4. Frames are sampled roughly every `200ms`.
5. Each sample updates the reference image while preserving user positioning and scale when possible.

## 7. Theme flow

1. On startup, renderer windows call `load-theme-config`.
2. CSS custom properties are applied from the returned theme object.
3. Saving or resetting theme settings triggers `theme-config-updated`.
4. The main editor and theme window both update immediately.
