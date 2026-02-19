# Freeform Builder

A freeform 3D builder application using WebGL and Three.js. Create, manipulate, and arrange 3D shapes in your browser.

![Freeform Builder](assets/preview.png)

## Features

- 🎨 **Add Shapes**: Create cubes, spheres, cylinders, and cones
- 🖱️ **Interactive Controls**: Drag to move objects, orbit camera, zoom and pan
- 🎯 **Selection System**: Click to select, delete to remove
- 🌈 **Random Colors**: Randomize colors of all objects
- ⚡ **Real-time Rendering**: Smooth 60fps WebGL rendering

## Live Demo

Open `index.html` in a modern web browser or serve it with a local server.

## Getting Started

### Option 1: Direct Open
Simply open `index.html` in your browser.

### Option 2: Local Server
```bash
# Using npm
npm start

# Or using Python
python -m http.server 8000

# Or using Node.js serve
npx serve .
```

Then navigate to `http://localhost:8000` (or the port shown).

## Controls

| Action | Control |
|--------|---------|
| Add Shapes | Use the toolbar buttons |
| Select Object | Left click on object |
| Move Object | Drag selected object |
| Orbit Camera | Right click + drag |
| Zoom | Scroll wheel |
| Pan | Right click + drag (when not selecting) |
| Delete Selected | Press `Delete` or use toolbar button |
| Clear All | Use "Clear All" button |

## Technologies

- [Three.js](https://threejs.org/) - 3D WebGL library
- ES6 Modules - Modern JavaScript
- CSS3 - Styling and UI

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

MIT License - feel free to use this project for any purpose!

---

Created by [EBZ333](https://github.com/EBZ333)
