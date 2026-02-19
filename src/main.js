/**
 * Freeform Builder - Phase 1: Basic Building
 * 
 * Core systems:
 * - Wall drawing (click + drag)
 * - Snapping (strong cardinal, soft diagonal, endpoint)
 * - Floor generation (multiple closed loop detection)
 * - Camera modes (3D orbit + 2D top-down with smooth transition)
 * - Wall selection and deletion
 * - Visual feedback (snap color change, endpoint dot, loop closing)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    // Visual
    WALL_HEIGHT: 2.5,
    WALL_THICKNESS: 0.15,
    FLOOR_THICKNESS: 0.1,
    
    // Snapping
    SNAP_ANGLE_STEP: Math.PI / 4, // 45° base
    SNAP_DISTANCE: 0.5,
    SNAP_ANGLE_THRESHOLD: Math.PI / 12, // 15° for 45°
    SNAP_CARDINAL_THRESHOLD: Math.PI / 24, // 7.5° for 0°/90° (stronger snap)
    
    // Colors
    COLOR_WALL: 0x5a5a5a,
    COLOR_WALL_SELECTED: 0x7a9aca,
    COLOR_WALL_HOVER: 0x7a7a7a,
    COLOR_FLOOR: 0x4a4a4a,
    COLOR_GRID: 0x333333,
    COLOR_GROUND: 0x1a1a1a,
    COLOR_GHOST_DEFAULT: 0x4fc3f7,
    COLOR_GHOST_SNAP: 0x7fff7f, // Green-tint when snapping
    
    // Camera
    CAM_3D_POS: new THREE.Vector3(15, 12, 15),
    CAM_2D_POS: new THREE.Vector3(0, 30, 0),
};

// ============================================
// STATE MANAGEMENT
// ============================================

const state = {
    mode: 'wall', // 'wall' | 'edit'
    cameraMode: '3d', // '3d' | '2d'
    snapping: true,
    
    // Interaction
    isDrawing: false,
    dragStart: null,
    dragCurrent: null,
    isSnapping: false, // Track if currently snapping
    
    // Selection
    hoveredWall: null,
    selectedWall: null,
    
    // Data
    walls: [], // Array of wall objects
    floors: [], // Array of floor meshes
    wallSegments: [], // Array of {start: Vector3, end: Vector3, wallId}
};

// ============================================
// SCENE SETUP
// ============================================

const canvas = document.getElementById('gl-canvas');
const renderer = new THREE.WebGLRenderer({ 
    canvas, 
    antialias: true,
    alpha: false
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

// Camera
const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.copy(CONFIG.CAM_3D_POS);
camera.lookAt(0, 0, 0);

// Camera transition state
let cameraTransition = {
    active: false,
    startPos: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    startZoom: 1,
    targetZoom: 1,
    progress: 0,
    duration: 0.4 // seconds
};

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.05;

// ============================================
// LIGHTING
// ============================================

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 100;
dirLight.shadow.camera.left = -30;
dirLight.shadow.camera.right = 30;
dirLight.shadow.camera.top = 30;
dirLight.shadow.camera.bottom = -30;
scene.add(dirLight);

// ============================================
// TERRAIN & GRID
// ============================================

// Ground plane
const groundGeo = new THREE.PlaneGeometry(100, 100);
const groundMat = new THREE.MeshStandardMaterial({ 
    color: CONFIG.COLOR_GROUND,
    roughness: 0.9,
    metalness: 0.1
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Grid helper
const gridHelper = new THREE.GridHelper(100, 100, CONFIG.COLOR_GRID, CONFIG.COLOR_GRID);
gridHelper.material.opacity = 0.3;
gridHelper.material.transparent = true;
scene.add(gridHelper);

// Invisible plane for raycasting
const raycastPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// ============================================
// PREVIEW OBJECTS
// ============================================

// Ghost wall during drawing
const ghostWallGeo = new THREE.BoxGeometry(1, CONFIG.WALL_HEIGHT, CONFIG.WALL_THICKNESS);
const ghostWallMat = new THREE.MeshBasicMaterial({
    color: CONFIG.COLOR_GHOST_DEFAULT,
    transparent: true,
    opacity: 0.5,
    depthWrite: false
});
const ghostWall = new THREE.Mesh(ghostWallGeo, ghostWallMat);
ghostWall.visible = false;
ghostWall.position.y = CONFIG.WALL_HEIGHT / 2;
scene.add(ghostWall);

// Ghost line
const ghostLineGeo = new THREE.BufferGeometry();
const ghostLineMat = new THREE.LineBasicMaterial({ 
    color: CONFIG.COLOR_GHOST_DEFAULT,
    linewidth: 2
});
const ghostLine = new THREE.Line(ghostLineGeo, ghostLineMat);
ghostLine.visible = false;
scene.add(ghostLine);

// Snap indicator
const snapIndicatorGeo = new THREE.RingGeometry(0.15, 0.25, 32);
const snapIndicatorMat = new THREE.MeshBasicMaterial({ 
    color: CONFIG.COLOR_GHOST_DEFAULT,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
});
const snapIndicator = new THREE.Mesh(snapIndicatorGeo, snapIndicatorMat);
snapIndicator.rotation.x = -Math.PI / 2;
snapIndicator.visible = false;
scene.add(snapIndicator);

// Endpoint dot (follows cursor while drawing)
const endpointDotGeo = new THREE.SphereGeometry(0.12, 16, 16);
const endpointDotMat = new THREE.MeshBasicMaterial({ 
    color: CONFIG.COLOR_GHOST_DEFAULT,
    transparent: true,
    opacity: 0.8,
    depthWrite: false
});
const endpointDot = new THREE.Mesh(endpointDotGeo, endpointDotMat);
endpointDot.visible = false;
scene.add(endpointDot);

// Start point indicator (for loop closing)
const startPointGeo = new THREE.RingGeometry(0.2, 0.3, 32);
const startPointMat = new THREE.MeshBasicMaterial({ 
    color: 0xffff00,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide
});
const startPointIndicator = new THREE.Mesh(startPointGeo, startPointMat);
startPointIndicator.rotation.x = -Math.PI / 2;
startPointIndicator.visible = false;
scene.add(startPointIndicator);

// Selection highlight
const selectionBox = new THREE.BoxHelper();
selectionBox.material.depthTest = false;
selectionBox.material.transparent = true;
selectionBox.visible = false;
scene.add(selectionBox);

// ============================================
// WALL MANAGEMENT
// ============================================

function createWallMesh(start, end, id) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    const geometry = new THREE.BoxGeometry(length, CONFIG.WALL_HEIGHT, CONFIG.WALL_THICKNESS);
    const material = new THREE.MeshStandardMaterial({
        color: CONFIG.COLOR_WALL,
        roughness: 0.7,
        metalness: 0.2
    });
    
    const wall = new THREE.Mesh(geometry, material);
    wall.position.copy(center);
    wall.position.y = CONFIG.WALL_HEIGHT / 2;
    wall.lookAt(end);
    wall.castShadow = true;
    wall.receiveShadow = true;
    
    // Store data on the mesh
    wall.userData = {
        type: 'wall',
        start: start.clone(),
        end: end.clone(),
        id: id
    };
    
    return wall;
}

function addWall(start, end) {
    const id = Date.now() + Math.random();
    const wall = createWallMesh(start, end, id);
    scene.add(wall);
    
    state.walls.push(wall);
    state.wallSegments.push({ start: start.clone(), end: end.clone(), wallId: id });
    
    updateDebugPanel();
    regenerateAllFloors();
}

function deleteWall(wall) {
    if (!wall) return;
    
    // Remove from scene
    scene.remove(wall);
    
    // Clean up
    wall.geometry.dispose();
    wall.material.dispose();
    
    // Remove from arrays
    const wallIndex = state.walls.indexOf(wall);
    if (wallIndex > -1) {
        state.walls.splice(wallIndex, 1);
    }
    
    const segIndex = state.wallSegments.findIndex(s => s.wallId === wall.userData.id);
    if (segIndex > -1) {
        state.wallSegments.splice(segIndex, 1);
    }
    
    // Clear selection
    if (state.selectedWall === wall) {
        state.selectedWall = null;
        selectionBox.visible = false;
    }
    
    updateDebugPanel();
    regenerateAllFloors();
}

function selectWall(wall) {
    // Deselect previous
    if (state.selectedWall && state.selectedWall !== wall) {
        state.selectedWall.material.color.setHex(CONFIG.COLOR_WALL);
    }
    
    state.selectedWall = wall;
    
    if (wall) {
        wall.material.color.setHex(CONFIG.COLOR_WALL_SELECTED);
        selectionBox.setFromObject(wall);
        selectionBox.visible = true;
    } else {
        selectionBox.visible = false;
    }
}

// ============================================
// FLOOR GENERATION (MULTIPLE LOOPS)
// ============================================

function getVertexKey(v) {
    return `${v.x.toFixed(3)},${v.z.toFixed(3)}`;
}

function findAllClosedLoops() {
    if (state.wallSegments.length < 2) return [];
    
    // Build graph
    const vertices = new Map();
    const edges = [];
    
    state.wallSegments.forEach(seg => {
        const k1 = getVertexKey(seg.start);
        const k2 = getVertexKey(seg.end);
        
        if (!vertices.has(k1)) vertices.set(k1, seg.start.clone());
        if (!vertices.has(k2)) vertices.set(k2, seg.end.clone());
        
        edges.push([k1, k2]);
    });
    
    // Build adjacency
    const adj = new Map();
    vertices.forEach((_, key) => adj.set(key, []));
    
    edges.forEach(([k1, k2]) => {
        adj.get(k1).push(k2);
        adj.get(k2).push(k1);
    });
    
    const foundLoops = [];
    const processedStarts = new Set();
    
    // Find smallest cycle from each vertex
    vertices.forEach((_, startKey) => {
        if (processedStarts.has(startKey)) return;
        
        const queue = [[startKey, [startKey], new Set([startKey])]];
        
        while (queue.length > 0) {
            const [current, path, visited] = queue.shift();
            
            const neighbors = adj.get(current);
            for (const neighbor of neighbors) {
                if (path.length > 2 && neighbor === startKey) {
                    // Found a cycle
                    const loop = [...path];
                    foundLoops.push(loop);
                    
                    // Mark all vertices in this loop as processed
                    loop.forEach(k => processedStarts.add(k));
                    return; // Found smallest cycle from this start
                }
                
                if (!visited.has(neighbor) && path.length < 15) {
                    const newPath = [...path, neighbor];
                    const newVisited = new Set(visited);
                    newVisited.add(neighbor);
                    queue.push([neighbor, newPath, newVisited]);
                }
            }
        }
    });
    
    return foundLoops;
}

function generateFloorFromLoop(loopKeys) {
    if (!loopKeys || loopKeys.length < 3) return null;
    
    const vertices = new Map();
    state.wallSegments.forEach(seg => {
        const k1 = getVertexKey(seg.start);
        const k2 = getVertexKey(seg.end);
        vertices.set(k1, seg.start);
        vertices.set(k2, seg.end);
    });
    
    const points = loopKeys.map(key => vertices.get(key));
    if (points.some(p => !p)) return null;
    
    // Create shape
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    
    for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, points[i].z);
    }
    shape.closePath();
    
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshStandardMaterial({
        color: CONFIG.COLOR_FLOOR,
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    
    const floor = new THREE.Mesh(geometry, material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = CONFIG.FLOOR_THICKNESS / 2;
    floor.receiveShadow = true;
    floor.userData = { type: 'floor' };
    
    return floor;
}

function clearFloors() {
    state.floors.forEach(floor => {
        scene.remove(floor);
        floor.geometry.dispose();
        floor.material.dispose();
    });
    state.floors = [];
}

function regenerateAllFloors() {
    clearFloors();
    
    const loops = findAllClosedLoops();
    
    loops.forEach(loop => {
        const floor = generateFloorFromLoop(loop);
        if (floor) {
            scene.add(floor);
            state.floors.push(floor);
        }
    });
    
    updateDebugPanel();
}

// ============================================
// SNAPPING SYSTEM
// ============================================

function snapPoint(point, referencePoint) {
    if (!state.snapping) {
        state.isSnapping = false;
        return point.clone();
    }
    
    let snapped = point.clone();
    let didSnap = false;
    
    // Angle snapping relative to reference point
    if (referencePoint) {
        const direction = new THREE.Vector3().subVectors(point, referencePoint);
        const angle = Math.atan2(direction.z, direction.x);
        const distance = direction.length();
        
        // Find nearest snap angle (multiples of 45°)
        const snapAngle = Math.round(angle / CONFIG.SNAP_ANGLE_STEP) * CONFIG.SNAP_ANGLE_STEP;
        const angleDiff = Math.abs(angle - snapAngle);
        
        // Check if cardinal (0°, 90°, 180°, 270°)
        const cardinalAngle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
        const isCardinal = Math.abs(snapAngle - cardinalAngle) < 0.001;
        
        const threshold = isCardinal ? CONFIG.SNAP_CARDINAL_THRESHOLD : CONFIG.SNAP_ANGLE_THRESHOLD;
        
        if (angleDiff < threshold || angleDiff > Math.PI * 2 - threshold) {
            snapped.x = referencePoint.x + Math.cos(snapAngle) * distance;
            snapped.z = referencePoint.z + Math.sin(snapAngle) * distance;
            didSnap = true;
        }
    }
    
    // Endpoint snapping
    const snapCandidates = [];
    state.wallSegments.forEach(seg => {
        snapCandidates.push(seg.start, seg.end);
    });
    
    for (const candidate of snapCandidates) {
        const dist = Math.sqrt(
            Math.pow(snapped.x - candidate.x, 2) + 
            Math.pow(snapped.z - candidate.z, 2)
        );
        
        if (dist < CONFIG.SNAP_DISTANCE) {
            snapped.x = candidate.x;
            snapped.z = candidate.z;
            didSnap = true;
            break;
        }
    }
    
    state.isSnapping = didSnap;
    return snapped;
}

function updateGhostVisuals(length) {
    // Color change when snapping
    if (state.isSnapping) {
        ghostWall.material.color.setHex(CONFIG.COLOR_GHOST_SNAP);
        ghostLine.material.color.setHex(CONFIG.COLOR_GHOST_SNAP);
        snapIndicator.material.color.setHex(CONFIG.COLOR_GHOST_SNAP);
        endpointDot.material.color.setHex(CONFIG.COLOR_GHOST_SNAP);
    } else {
        ghostWall.material.color.setHex(CONFIG.COLOR_GHOST_DEFAULT);
        ghostLine.material.color.setHex(CONFIG.COLOR_GHOST_DEFAULT);
        snapIndicator.material.color.setHex(CONFIG.COLOR_GHOST_DEFAULT);
        endpointDot.material.color.setHex(CONFIG.COLOR_GHOST_DEFAULT);
    }
}

// ============================================
// RAYCASTING
// ============================================

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function getGroundIntersection(clientX, clientY) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(raycastPlane, intersectPoint);
    
    return intersectPoint;
}

function getWallIntersection(clientX, clientY) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(state.walls);
    
    return intersects.length > 0 ? intersects[0].object : null;
}

// ============================================
// INTERACTION HANDLERS
// ============================================

function onMouseDown(event) {
    if (event.button !== 0) return;
    if (event.target.closest('#toolbar')) return;
    
    if (state.mode === 'wall') {
        const point = getGroundIntersection(event.clientX, event.clientY);
        if (point) {
            state.isDrawing = true;
            state.dragStart = snapPoint(point, null);
            state.dragCurrent = state.dragStart.clone();
            controls.enabled = false;
            
            // Show start point indicator
            startPointIndicator.position.set(state.dragStart.x, 0.05, state.dragStart.z);
            startPointIndicator.visible = true;
            
            ghostWall.visible = true;
            ghostLine.visible = true;
            endpointDot.visible = true;
        }
    } else if (state.mode === 'edit') {
        // Click to select wall
        const wall = getWallIntersection(event.clientX, event.clientY);
        selectWall(wall);
    }
}

function onMouseMove(event) {
    const point = getGroundIntersection(event.clientX, event.clientY);
    
    if (state.isDrawing && state.dragStart && point) {
        state.dragCurrent = snapPoint(point, state.dragStart);
        
        const direction = new THREE.Vector3().subVectors(state.dragCurrent, state.dragStart);
        const length = direction.length();
        const center = new THREE.Vector3().addVectors(state.dragStart, state.dragCurrent).multiplyScalar(0.5);
        
        updateGhostVisuals(length);
        
        if (length > 0.01) {
            ghostWall.scale.set(length, 1, 1);
            ghostWall.position.copy(center);
            ghostWall.position.y = CONFIG.WALL_HEIGHT / 2;
            ghostWall.lookAt(state.dragCurrent);
            ghostWall.visible = true;
            
            // Ghost line
            const positions = new Float32Array([
                state.dragStart.x, 0.05, state.dragStart.z,
                state.dragCurrent.x, 0.05, state.dragCurrent.z
            ]);
            ghostLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            ghostLine.visible = true;
            
            // Endpoint dot
            endpointDot.position.set(state.dragCurrent.x, 0.1, state.dragCurrent.z);
            endpointDot.visible = true;
            
            // Snap indicator
            if (state.snapping) {
                snapIndicator.position.set(state.dragCurrent.x, 0.06, state.dragCurrent.z);
                snapIndicator.visible = state.isSnapping;
            }
            
            // Check if near start point (loop closing feedback)
            const distToStart = state.dragCurrent.distanceTo(state.dragStart);
            if (distToStart < CONFIG.SNAP_DISTANCE && length > 1.0) {
                startPointIndicator.material.color.setHex(0x00ff00);
                startPointIndicator.scale.set(1.5, 1.5, 1.5);
            } else {
                startPointIndicator.material.color.setHex(0xffff00);
                startPointIndicator.scale.set(1, 1, 1);
            }
        } else {
            ghostWall.visible = false;
            ghostLine.visible = false;
        }
    } else if (state.mode === 'edit') {
        // Hover effect
        const wall = getWallIntersection(event.clientX, event.clientY);
        
        if (state.hoveredWall && state.hoveredWall !== state.selectedWall) {
            state.hoveredWall.material.color.setHex(CONFIG.COLOR_WALL);
        }
        
        state.hoveredWall = wall;
        
        if (wall && wall !== state.selectedWall) {
            wall.material.color.setHex(CONFIG.COLOR_WALL_HOVER);
        }
    }
}

function onMouseUp(event) {
    if (state.isDrawing) {
        state.isDrawing = false;
        controls.enabled = true;
        
        ghostWall.visible = false;
        ghostLine.visible = false;
        snapIndicator.visible = false;
        endpointDot.visible = false;
        startPointIndicator.visible = false;
        
        if (state.dragStart && state.dragCurrent) {
            const length = state.dragStart.distanceTo(state.dragCurrent);
            if (length > 0.2) {
                addWall(state.dragStart, state.dragCurrent);
            }
        }
        
        state.dragStart = null;
        state.dragCurrent = null;
        state.isSnapping = false;
    }
}

function onKeyDown(event) {
    // Escape cancels current draw
    if (event.key === 'Escape') {
        if (state.isDrawing) {
            state.isDrawing = false;
            controls.enabled = true;
            
            ghostWall.visible = false;
            ghostLine.visible = false;
            snapIndicator.visible = false;
            endpointDot.visible = false;
            startPointIndicator.visible = false;
            
            state.dragStart = null;
            state.dragCurrent = null;
            state.isSnapping = false;
        }
        return;
    }
    
    // Delete removes selected wall
    if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.selectedWall) {
            deleteWall(state.selectedWall);
        }
    }
}

// ============================================
// CAMERA MODES
// ============================================

function setCameraMode(mode) {
    if (state.cameraMode === mode) return;
    
    state.cameraMode = mode;
    
    cameraTransition.active = true;
    cameraTransition.startPos.copy(camera.position);
    cameraTransition.startZoom = camera.zoom;
    cameraTransition.progress = 0;
    
    if (mode === '2d') {
        cameraTransition.targetPos.copy(CONFIG.CAM_2D_POS);
        cameraTransition.targetZoom = 1.5;
        controls.enableRotate = false;
    } else {
        cameraTransition.targetPos.copy(CONFIG.CAM_3D_POS);
        cameraTransition.targetZoom = 1;
        controls.enableRotate = true;
    }
    
    updateUI();
}

function updateCameraTransition(deltaTime) {
    if (!cameraTransition.active) return;
    
    cameraTransition.progress += deltaTime / cameraTransition.duration;
    
    if (cameraTransition.progress >= 1) {
        cameraTransition.progress = 1;
        cameraTransition.active = false;
        
        if (state.cameraMode === '2d') {
            controls.minPolarAngle = 0;
            controls.maxPolarAngle = 0.001;
        } else {
            controls.minPolarAngle = 0;
            controls.maxPolarAngle = Math.PI / 2 - 0.05;
        }
    }
    
    const t = cameraTransition.progress;
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    
    camera.position.lerpVectors(
        cameraTransition.startPos,
        cameraTransition.targetPos,
        ease
    );
    
    camera.zoom = cameraTransition.startZoom + 
        (cameraTransition.targetZoom - cameraTransition.startZoom) * ease;
    camera.updateProjectionMatrix();
    
    camera.lookAt(0, 0, 0);
}

// ============================================
// UI UPDATES
// ============================================

function updateUI() {
    document.getElementById('cam-3d').classList.toggle('active', state.cameraMode === '3d');
    document.getElementById('cam-2d').classList.toggle('active', state.cameraMode === '2d');
    document.getElementById('mode-wall').classList.toggle('active', state.mode === 'wall');
    document.getElementById('mode-edit').classList.toggle('active', state.mode === 'edit');
    document.getElementById('snap-toggle').checked = state.snapping;
}

function updateDebugPanel() {
    document.getElementById('wall-count').textContent = `Walls: ${state.walls.length}`;
    document.getElementById('floor-count').textContent = `Floors: ${state.floors.length}`;
}

// ============================================
// ACTIONS
// ============================================

function clearAll() {
    // Remove all walls
    state.walls.forEach(wall => {
        scene.remove(wall);
        wall.geometry.dispose();
        wall.material.dispose();
    });
    state.walls = [];
    state.wallSegments = [];
    state.selectedWall = null;
    selectionBox.visible = false;
    
    clearFloors();
    updateDebugPanel();
}

// ============================================
// EVENT LISTENERS
// ============================================

window.addEventListener('mousedown', onMouseDown);
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('mouseup', onMouseUp);
window.addEventListener('keydown', onKeyDown);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// UI Event Listeners
document.getElementById('mode-wall').addEventListener('click', () => {
    state.mode = 'wall';
    // Deselect when switching to wall mode
    if (state.selectedWall) {
        state.selectedWall.material.color.setHex(CONFIG.COLOR_WALL);
        state.selectedWall = null;
        selectionBox.visible = false;
    }
    updateUI();
});

document.getElementById('mode-edit').addEventListener('click', () => {
    state.mode = 'edit';
    updateUI();
});

document.getElementById('cam-3d').addEventListener('click', () => setCameraMode('3d'));
document.getElementById('cam-2d').addEventListener('click', () => setCameraMode('2d'));

document.getElementById('snap-toggle').addEventListener('change', (e) => {
    state.snapping = e.target.checked;
});

document.getElementById('clear-all').addEventListener('click', clearAll);

// ============================================
// ANIMATION LOOP
// ============================================

let lastTime = 0;

function animate(currentTime) {
    requestAnimationFrame(animate);
    
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    updateCameraTransition(deltaTime);
    controls.update();
    
    if (state.selectedWall) {
        selectionBox.update();
    }
    
    renderer.render(scene, camera);
}

// ============================================
// INITIALIZATION
// ============================================

updateUI();
updateDebugPanel();
animate();

console.log('Freeform Builder - Phase 1 initialized');
