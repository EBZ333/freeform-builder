# Freeform Builder

A freeform building sandbox where players sketch structures by dragging walls, automatically generating floors, and shaping architecture through direct manipulation.

![Phase 1](assets/preview.png)

## Core Philosophy

- **Draw, don't assemble** — Sketch structures naturally
- **Everything remains editable** — Nothing is permanently baked
- **Minimal friction between idea and result** — Instant feedback
- **Soft constraints instead of rigid rules** — Guide, don't restrict
- **Clarity and responsiveness over realism** — Feel good first

## Current Phase: Phase 1 — Basic Building

### Implemented Systems
- ✅ Terrain (flat ground with grid)
- ✅ Camera (3D orbit + 2D top-down toggle)
- ✅ Wall drawing (click + drag)
- ✅ Basic snapping (0°, 45°, 90° angles, endpoint snapping)
- ✅ Closed loop detection (naive implementation)
- ✅ Automatic floor generation

### Player Capabilities
- Draw building outlines by dragging walls
- Create straight or angled walls with angle snapping
- Use top-down mode for precision work
- Floors generate automatically inside closed walls

## Quick Start

```bash
# Run with Python
python3 -m http.server 8080

# Or with Node
npx serve .

# Or simply open index.html in a browser
```

Then navigate to `http://localhost:8080`

## Controls

| Action | Input |
|--------|-------|
| Draw Wall | Left Click + Drag |
| Orbit Camera | Right Click + Drag |
| Pan | Middle Click + Drag |
| Zoom | Scroll Wheel |
| Toggle 2D/3D | UI Button |
| Toggle Snapping | UI Checkbox |
| Clear All | UI Button |

## Architecture

### Tech Stack
- **Three.js** — 3D rendering
- **ES6 Modules** — Modern JavaScript
- **Vanilla CSS** — Styling

### Project Structure
```
freeform-builder/
├── index.html          # Entry point
├── GDD.md              # Full game design document
├── README.md           # This file
├── src/
│   ├── main.js         # Main application
│   └── style.css       # Styles
└── assets/             # Images, models, etc.
```

## Development Phases

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 | Basic Building (walls, floors, camera) | 🚧 In Progress |
| Phase 2 | Editing and Iteration | 📋 Planned |
| Phase 3 | Vertical Building + Visibility | 📋 Planned |
| Phase 4 | Floor Sculpting | 📋 Planned |
| Phase 5 | Doors, Windows, Section View | 📋 Planned |
| Phase 6 | Stairs, Railings, Columns | 📋 Planned |
| Phase 7 | Polish and Refinement | 📋 Planned |

See [GDD.md](GDD.md) for full design document.

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

MIT License

---

Created by [EBZ333](https://github.com/EBZ333)
