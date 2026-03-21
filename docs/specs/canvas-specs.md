# Canvas Specifications

This page documents the current limits and behaviors enforced by the UI and renderer.

## Default canvas

- Width: `256`
- Height: `256`
- Background: white unless `Transparent Background` is enabled

## New project limits

The modal currently allows:

- minimum width: `1`
- maximum width: `4096`
- minimum height: `1`
- maximum height: `4096`

These limits are enforced by the HTML number inputs.

## On-screen canvases

- `mainCanvas` is the composited working surface
- `overlayCanvas` is used for previews and in-progress edits

Both canvases always share the same dimensions.

## Layer canvases

- Every frame contains one off-screen canvas per layer
- New layer canvases match the current project dimensions
- New frames create fresh layer canvases matching the shared layer list

## Zoom

- UI slider/input range: `10%` to `2000%`
- Internal zoom clamp: `0.1` to `20`
- Wheel zoom is centered around the pointer location

## Reference preview limits

- Reference opacity range: `0%` to `100%`
- Reference zoom range: `10%` to `500%`

Reference preview positioning is independent of editor zoom.

## Brush-related limits

- Brush size range: `1` to `50`
- Fill tolerance range: `0` to `255`
- FPS range: `1` to `60`
- Onion skin range: `1` to `10`

## Rendering notes

- Antialiasing can be toggled globally.
- With antialiasing disabled, coordinates are rounded to pixels and drawing tools switch to pixel-perfect stamping/line logic.
- The main render pass composites visible layers first, then onion skins, then the reference image.

## Persistence notes

- Canvas width and height are saved in `.wasrtk` project files.
- Transparent-background mode is saved.
- The chosen non-transparent background color is not currently round-tripped as a first-class project setting.
