# WASRTK Quick Start

This guide walks through the current workflow implemented in the repo.

## 1. Install and run

```bash
git clone https://github.com/graphicmismatch/WASRTK.git
cd WASRTK
npm install
npm start
```

If you want DevTools on launch, run `npm run dev`.

## 2. Create a project

1. Start the app.
2. Open `File > New Project` or press `Ctrl/Cmd+N`.
3. Set width and height.
4. Choose a background color or enable `Transparent Background`.
5. Click `Create`.

Notes:

- The new project dialog allows sizes from `1` to `4096` pixels in each dimension.
- The canvas opens at `256x256` by default.

## 3. Draw on the canvas

Available tools in the current UI:

- Pen
- Line
- Rectangle
- Circle
- Fill
- Eraser

Key controls:

- Brush size: `1` to `50`
- Brush shape: `circle` or `square` for pen, line, and eraser
- Opacity: `0%` to `100%`
- Fill tolerance: `0` to `255`
- Antialiasing toggle for smooth vs pixel-perfect drawing

Canvas navigation:

- `Ctrl/Cmd + mouse wheel` zooms around the pointer
- Middle mouse drag pans the canvas
- The zoom controls support `10%` to `2000%`

## 4. Build an animation

Timeline actions:

- Add frame: toolbar button or `F`
- Duplicate frame: toolbar button or `D`
- Delete frame: toolbar button or `Delete`
- Reorder frames: drag thumbnails or use the arrow buttons
- Play/pause: toolbar button or `Space`

Playback:

- FPS is adjustable from `1` to `60`
- Onion skinning can be enabled with a range from `1` to `10`

## 5. Use layers

- Add layers with the `+` button
- Toggle visibility with the eye icon
- Select the active layer from the layer list
- Move layers up or down with the arrow buttons
- Flatten the current layer into the one below it

Notes:

- Each frame contains its own raster canvas for every layer.
- Visibility changes are propagated across all frames.

## 6. Add reference material

Reference options:

- Load an image from disk
- Capture a screen or window

Reference controls:

- Opacity: `0%` to `100%`
- Zoom: `10%` to `500%`
- Click the preview to re-center on a point
- `Ctrl/Cmd + click` and drag on the canvas to move the reference
- `Ctrl/Cmd + R` resets the reference position

When screen capture is active, the reference image is refreshed on an interval while preserving manual placement and scale changes.

## 7. Save your work

Project save/load:

- Save project: `Ctrl/Cmd+S`
- Load project: `Ctrl/Cmd+Shift+O`
- Project files use the `.wasrtk` extension

Export:

- Save animation: `Ctrl/Cmd+Shift+S`
- Supported exports are PNG sequence and GIF

PNG sequence export writes files like `name-0001.png`, `name-0002.png`, and so on.

## 8. Customize the theme

Open `View > Theme Settings` or press `Ctrl/Cmd+Alt+T`.

The theme window lets you:

- Change the app color tokens
- Reset to the bundled default theme
- Edit and save the raw JSON theme file

The theme config is stored in the Electron user data directory as `theme.json`.
