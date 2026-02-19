# Freeform Builder — Game Design Document

## Core Concept

A freeform building sandbox where players sketch structures by dragging walls, automatically generating floors, and shaping architecture through direct manipulation. The focus is on fluid control, instant feedback, and expressive building, inspired by the feel of Tiny Glade but centered more on flexible systems than visual polish.

---

## Core Design Philosophy

- **Draw, don't assemble** — Sketch structures naturally rather than placing prefab pieces
- **Everything remains editable** — Nothing is permanently baked; all elements can be modified
- **Minimal friction between idea and result** — Ideas should become reality instantly
- **Soft constraints instead of rigid rules** — Guide players, don't restrict them
- **Prioritize clarity and responsiveness over realism** — Feel good first, look real second

---

## Environment & Presentation

### Setting
- Flat or slightly uneven terrain only
- No decorative elements required initially
- Neutral colors to keep focus on building

### Visual Direction
- Simple geometry
- Basic lighting (directional + ambient)
- Clear contrast between:
  - Walls
  - Floors
  - Roofs

---

## Camera System

### Modes

#### 1. 3D Orbit Mode (Default)
- Rotate around scene
- Zoom in/out
- Slight tilt for depth

#### 2. Top-Down / 2D Mode (Toggle)
- Orthographic-style view
- Camera positioned directly above
- Used for:
  - Drawing walls
  - Editing floor shapes

### Behavior
- Smooth transition between modes
- Optional suggestion to switch to 2D when drawing
- Designed to improve precision without forcing mode changes

---

## Interior Visibility System

### Goal
Allow clear viewing and editing of interiors without manual micromanagement.

### Roof and Upper Floor Auto-Hide
- Roofs fade or hide when camera gets close or enters structure
- Upper floors above camera height fade out

### Manual Visibility Toggles
- Toggle roof visibility
- Toggle upper floor visibility

### Section View (Cutaway)
- Horizontal cut plane hides everything above it
- Adjustable height via drag or scroll

### Wall Transparency
- Walls between camera and selection fade or become transparent

### Focus Mode (Optional)
- Selected area stays fully visible
- Surrounding geometry fades slightly

---

## Core Systems

### Wall Drawing System

#### Creation
- Click and drag to draw wall segments on terrain
- Walls form connected chains (open or closed)

#### Snapping
- Angle snapping (0°, 45°, 90°)
- Endpoint snapping to nearby geometry
- Toggle:
  - Freeform mode
  - Assisted snapping mode

#### Editing
- Drag endpoints
- Insert points along walls
- Move entire segments

### Automatic Floor Generation

#### Bottom Floor
- Automatically generated inside closed wall loops
- Updates in real time

#### Behavior
- Supports irregular and concave shapes
- Always conforms to wall layout

### Upper Floor System

#### Creation
- Select enclosed walls → add upper floor

#### Behavior
- Generated at wall height
- Becomes independent after creation
- Fully editable

### Floor Editing System

#### Expand (Union Behavior)
- Drag edges outward
- Creates overhangs and extensions

#### Cut (Difference Behavior)
- Draw shapes to remove sections

#### Interaction
- Uses same gesture language as wall drawing
- Includes visual preview

### Roof System

#### Placement
- Applied to upper floors

#### Types
- Flat
- Gabled
- Sloped

#### Controls
- Height
- Pitch
- Overhang

### Doors and Windows

#### Placement
- Click on wall

#### Behavior
- Aligns to wall surface automatically

#### Interaction
- Drag along wall
- Resize with handles

### Additional Systems

#### Structural Elements
- Railings on exposed edges
- Columns
- Stairs between floors

#### Editing Tools
- Adjust wall height
- Duplicate floors
- Delete elements

---

## UI / UX Layer

### Core Principles
- Minimal interface
- Direct manipulation first
- UI supports interaction, not replaces it

### Global Controls
- Undo / Redo
- Delete selected
- Delete all (reset scene)
- Save / Load (later phase)

### Mode Controls
- Build mode (walls)
- Edit mode
- Add mode (doors, windows, roofs)

### Toggles
- Snapping on/off
- 2D / 3D camera
- Roof visibility
- Upper floor visibility
- Section view

### Section Controls
- Section height slider (active in section mode)

### Contextual UI
Appears on selection:
- Wall height
- Roof settings
- Floor edit options

### Visual Feedback
- Highlight hovered elements
- Editable handles
- Ghost previews

---

## Interaction Flow

### Core Loop
1. Draw walls
2. Floor appears automatically
3. Add upper floor
4. Modify floor shape
5. Add roof
6. Place doors and windows
7. Adjust structure

### Interaction Style
- Click
- Drag
- Immediate visual response

---

## Design Notes & Clarifications

### Platform & Distribution
- **Web-only** — Runs in browser
- No plans for desktop/mobile unless desired later

### Save / Load
- **Timing**: Early Phase 2
- **Implementation**: Simple data object stored in localStorage
- **Optional**: Copy/paste text save string
- **Scope**: "Save your build and load it later" — no complex formats

### Performance Targets
- Don't define strict limits
- Optimize only when lag appears
- Rough expectation: A few hundred walls should be fine
- **Decision**: No optimization planning yet

### Undo / Redo
- Add in Phase 2
- Basic stack tracking actions (add wall, delete wall, etc.)
- No perfect edge-case handling required

### Multiplayer / Sharing
- Not part of this project
- No online features, no collaboration

### Export / Import
- Not necessary unless personally desired later
- Screenshots only if anything

### Wall Drawing Specifications
- **Thickness**: Extruded walls (keep current implementation)
- **Minimum Length**: ~0.2 units
- **Snapping**: Strong pull to 0°/90°, softer pull to 45°

### Floor Generation Scope (Phase 1)
- **Supports**: Multiple separate buildings
- **Not Needed**: Holes/courtyards
- Keep loop detection simple

### Wall Editing
- Move entirely to Phase 2
- Phase 1: Drawing only

### Visual Feedback (Phase 1)
- **Include**: Preview line while drawing, clear snap indication
- **Skip**: Measurements, labels, numbers

### Starting State
- Empty scene with hint: "Click and drag to draw walls"

### Height Control
- Fixed wall height in Phase 1
- Adjustable height comes later

### Technical Direction
- **Geometry**: One mesh per wall, don't optimize yet
- **Loop Detection**: Basic, works for simple closed shapes
- **Camera**: Add simple smoothing between 3D/2D modes

---

## Development Phases

### Phase 1 — Basic Building

**Goal**: Core drawing loop with clear feedback and automatic floor generation.

**Systems:**
- Terrain (flat ground with grid)
- Camera (3D orbit + 2D top-down toggle with smooth transition)
- Wall drawing (click + drag)
- Basic snapping (strong 0°/90°, soft 45°, endpoint snapping)
- Closed loop detection (**multiple loops supported**)
- Automatic floors (generated inside all closed wall loops, real-time updates)
- Visual feedback (preview line, snap indicator, color changes)

**Player Can:**
- Click and drag to draw walls
- Create clean shapes with snapping
- **Make multiple separate building outlines** (each gets its own floor)
- **Draw freely (overlapping/crossing walls allowed)**
- **Delete individual walls** (click + Delete key)
- **Cancel current draw** with Escape key
- Automatically get floors inside closed shapes
- Switch between 3D and top-down view smoothly
- See clear feedback while drawing

**Player Cannot:**
- Edit wall positions after placing
- Build multiple floors
- Add doors/windows
- Modify floor shapes
- Save/load

**Result:** Functional drawing sandbox with immediate visual feedback

**Wall Specs:**
- Thickness: 0.15 units (extruded)
- Height: Fixed at 2.5 units
- Minimum length: 0.2 units
- Snap distance: 0.5 units

**Visual Feedback Details:**
- Ghost wall: Cyan (#4fc3f7) default, shifts toward white/green when snapping
- Preview line shows current drag
- Snap indicator appears at snap points
- Endpoint dot visible while drawing
- Starting point highlights when about to close a loop

**Performance:**
- Floor updates happen immediately (no debounce)
- Optimize only if visible lag occurs

---

### Phase 2 — Editing, Save/Load, and Iteration

**Goal**: Make buildings editable and persistent.

**Systems:**
- Move wall points (basic editing)
- Undo/redo stack (basic action tracking)
- Simple save/load (localStorage, optional text export)
- Dynamic floor updates when walls change
- Snapping toggle in UI

**Player Can:**
- Draw something
- Fix mistakes with undo/redo
- Modify wall positions after placing
- Come back to it later (save/load)

**Result:** Flexible, non-destructive building with persistence

---

### Phase 3 — Vertical Building + Visibility Basics

**Systems:**
- Upper floors
- Height control
- Basic roof system
- Roof auto-hide when camera is close

**Player Capability:**
- Create multi-level buildings
- Adjust vertical scale
- Begin seeing interiors through automatic visibility

**Result:** Usable multi-level structures

---

### Phase 4 — Floor Sculpting + Interior Clarity

**Systems:**
- Expand and cut tools
- Shape previews
- Wall transparency when obstructing

**Player Capability:**
- Create balconies and openings
- Shape floors beyond wall boundaries
- Work inside buildings without obstruction

**Result:** Advanced spatial control

---

### Phase 5 — Architectural Features + Full Visibility Control

**Systems:**
- Doors and windows
- Manual visibility toggles
- Section view system

**Player Capability:**
- Add functional elements
- Precisely view interiors using cutaway
- Control visibility manually when needed

**Result:** Readable and editable buildings

---

### Phase 6 — Structure & Connectivity

**Systems:**
- Stairs
- Railings
- Columns
- Improved visibility behavior (smarter fading)

**Player Capability:**
- Connect floors logically
- Improve structure readability
- Work efficiently in complex builds

**Result:** More complete architectural forms

---

### Phase 7 — Polish and Refinement

**Systems:**
- Materials/colors
- Lighting improvements
- Smooth transitions
- Focus mode (optional)

**Player Capability:**
- Customize appearance
- Improve clarity and presentation

**Result:** Cohesive sandbox experience
