# 🚀 Quick Start Guide - WASRTK

Get started with WASRTK in minutes! This guide will walk you through creating your first pixel art animation.

## 📋 Prerequisites

- Node.js (version 16 or higher)
- npm (comes with Node.js)

## 🚀 Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/wasrtk.git
   cd wasrtk
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the application:**
   ```bash
   npm start
   ```

## 🎨 First Steps

### 1. Create a New Project
- Press `Ctrl/Cmd + N` or go to **File → New Project**
- Set your canvas dimensions (default: 256x256, max: 4096x4096)
- Choose a background color
- Click **Create**

### 2. Choose Your Tools
- **Pen Tool**: Freehand drawing with smooth or pixel-perfect lines
- **Brush Tool**: Smooth drawing with configurable brush size
- **Line Tool**: Straight lines
- **Rectangle Tool**: Rectangles and squares
- **Circle Tool**: Circles and ellipses
- **Fill Tool**: Flood fill areas with adjustable tolerance
- **Eraser Tool**: Erase pixels
- **Eyedropper Tool**: Pick colors from the canvas

### 3. Adjust Your Brush
- Use the **Brush Size** slider (1-50px)
- Pick colors from the **Color Picker** or **Color Presets** (64 colors)
- Adjust **Opacity** (0-100%)
- Toggle **Antialiasing** for smooth vs pixel-perfect drawing

## 🎬 Animation Basics

### Creating Frames
- Click the **+** button in the timeline or press **F**
- Each frame represents one moment in your animation
- Use **D** to duplicate the current frame
- Use **Delete** to remove unwanted frames

### Onion Skinning
- Enable **Onion Skinning** to see previous/next frames
- Adjust the **Range** to control how many frames are visible
- This helps maintain consistency across frames

### Playing Your Animation
- Press **Space** to play
- Press **Escape** to stop
- Adjust **FPS** (frames per second) for playback speed

## 🖼️ Reference Images

### Loading References
- Click the **Image** button to load a reference image
- Use **Screen Share** to capture desktop/window content
- Adjust **Opacity** to make the reference more or less visible
- Use **Zoom** to scale the reference image

### Working with References
- **Ctrl/Cmd + Click** to drag the reference image
- **Ctrl/Cmd + R** to reset the reference position
- Toggle visibility with the **Eye** button

## 🎨 Layer System

### Managing Layers
- Use the **+** button to add new layers
- Click the **Eye** icon to show/hide layers
- Use **Up/Down** arrows to reorder layers
- **Flatten** layers to merge them

### Layer Best Practices
- Keep line art and colors on separate layers
- Use background layers for reference
- Layer locking is supported in the data structure (UI toggle coming soon)

## 🖱️ Canvas Navigation

### Zooming
- **Ctrl/Cmd + Mouse Wheel**: Zoom in/out (10%-2000%)
- **Zoom Slider**: Quick zoom adjustment
- **Zoom Input**: Precise zoom percentage
- **Reset Zoom**: Return to 100%

### Panning
- **Middle Mouse Button**: Pan around the canvas
- The canvas automatically centers on startup

## 💡 Pro Tips

### Drawing Tips
- **Use Layers**: Separate line art, colors, and effects
- **Save Often**: Use Ctrl/Cmd + S regularly
- **Reference Images**: Perfect for rotoscoping and tracing
- **Antialiasing**: Toggle based on your art style
- **Fill Tolerance**: Adjust for more or less precise flood filling

### Animation Tips
- **Start Simple**: Begin with keyframes, add in-betweens
- **Onion Skinning**: Essential for smooth animations
- **Consistent FPS**: Stick to 12, 24, or 30 FPS
- **Frame Management**: Use descriptive frame names

### Performance Tips
- **Canvas Size**: Smaller canvases = faster performance
- **Layer Count**: Fewer layers = better performance
- **Zoom Level**: Lower zoom = faster rendering
- **Frame Count**: More frames = more memory usage

## 🆘 Troubleshooting

### Common Issues
- **Blurry Drawing**: Toggle antialiasing off for pixel-perfect mode
- **Slow Performance**: Reduce canvas size or layer count
- **Brush Preview Offset**: Check zoom level and canvas position
- **Animation Lag**: Lower FPS or reduce frame count
- **Reference Not Loading**: Check file format (PNG, JPG, GIF, BMP supported)

### Getting Help
- Check the main README for detailed documentation
- Review keyboard shortcuts for quick access
- Experiment with different tools and settings
- Use reference images for complex drawings

---

**Happy Drawing! 🎨✨** 