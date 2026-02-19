/**
 * Freeform Builder - Phase 1: Basic Building
 * 
 * Core systems:
 * - Wall drawing (click + drag)
 * - Snapping (angle and endpoint)
 * - Floor generation (closed loop detection)
 * - Camera modes (3D orbit + 2D top-down)
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
    SNAP_ANGLE_STEP: Math.PI / 4, // 45°
    SNAP_DISTANCE: 0.5,
    SNAP_ANGLE_THRESHOLD: Math.PI / 12, // 15°
    
    // Colors
    COLOR_WALL: 0x5a5a5a,
    COLOR_WALL_HOVER: 0x7a7a7a,
    COLOR_FLOOR: 0x4a4a4a,
    COLOR_GRID: 0x333333,
    COLOR_GROUND: 0x1a1a1a,
    
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
    isDragging: false,
    dragStart: null,
    dragCurrent: null,
    
    // Selection
    hoveredWall: null,
    selectedWall: null,
    
    // Data
    walls: [], // Array of wall objects
    floors: [], // Array of floor meshes
    wallSegments: [], // Array of {start: Vector3, end: Vector3}
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

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground

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
    color: 0x4fc3f7,
    transparent: true,
    opacity: 0.4,
    depthWrite: false
});
const ghostWall = new THREE.Mesh(ghostWallGeo, ghostWallMat);
ghostWall.visible = false;
ghostWall.position.y = CONFIG.WALL_HEIGHT / 2;
scene.add(ghostWall);

// Ghost line
const ghostLineGeo = new THREE.BufferGeometry();
const ghostLineMat = new THREE.LineBasicMaterial({ 
    color: 0x4fc3f7,
    linewidth: 2
});
const ghostLine = new THREE.Line(ghostLineGeo, ghostLineMat);
ghostLine.visible = false;
scene.add(ghostLine);

// Snap indicator
const snapIndicatorGeo = new THREE.RingGeometry(0.15, 0.25, 32);
const snapIndicatorMat = new THREE.MeshBasicMaterial({ 
    color: 0x4fc3f7,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
});
const snapIndicator = new THREE.Mesh(snapIndicatorGeo, snapIndicatorMat);
snapIndicator.rotation.x = -Math.PI / 2;
snapIndicator.visible = false;
scene.add(snapIndicator);

// ============================================
// WALL MANAGEMENT
// ============================================

function createWallMesh(start, end) {
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
        id: Date.now() + Math.random()
    };
    
    return wall;
}

function addWall(start, end) {
    const wall = createWallMesh(start, end);
    scene.add(wall);
    
    state.walls.push(wall);
    state.wallSegments.push({ start: start.clone(), end: end.clone() });
    
    updateDebugPanel();
    checkForClosedLoop();
}

// ============================================
// FLOOR GENERATION
// ============================================

function findClosedLoops() {
    // Build adjacency graph from wall segments
    const vertices = new Map(); // Map<key, Vector3>
    const edges = []; // Array of [v1_key, v2_key]
    
    // Helper to get vertex key
    const getKey = (v) => `${v.x.toFixed(3)},${v.z.toFixed(3)}`;
    
    state.wallSegments.forEach(seg => {
        const k1 = getKey(seg.start);
        const k2 = getKey(seg.end);
        
        if (!vertices.has(k1)) vertices.set(k1, seg.start.clone());
        if (!vertices.has(k2)) vertices.set(k2, seg.end.clone());
        
        edges.push([k1, k2]);
    });
    
    // Build adjacency list
    const adj = new Map();
    vertices.forEach((_, key) => adj.set(key, []));
    
    edges.forEach(([k1, k2]) => {
        adj.get(k1).push(k2);
        adj.get(k2).push(k1);
    });
    
    // Find cycles using DFS (simplified - finds basic loops)
    const visited = new Set();
    const loops = [];
    
    function findCycles(start, current, path, visitedInPath) {
        if (path.length > 2 && current === start) {
            loops.push([...path]);
            return;
        }
        
        if (path.length > 20) return; // Limit depth
        
        const neighbors = adj.get(current);
        for (const neighbor of neighbors) {
            if (visitedInPath.has(neighbor) && neighbor !== start) continue;
            
            const newPath = [...path, neighbor];
            const newVisited = new Set(visitedInPath);
            newVisited.add(neighbor);
            
            findCycles(start, neighbor, newPath, newVisited);
        }
    }
    
    vertices.forEach((_, key) => {
        findCycles(key, key, [key], new Set([key]));
    });
    
    // Filter to smallest cycles (basic rooms, not outer perimeters with holes)
    // For now, just take the first valid loop
    return loops.length > 0 ? loops[0] : null;
}

function generateFloor(loopKeys) {
    if (!loopKeys || loopKeys.length < 3) return;
    
    // Get vertices from keys
    const vertices = new Map();
    const getKey = (v) => `${v.x.toFixed(3)},${v.z.toFixed(3)}`;
    
    state.wallSegments.forEach(seg => {
        const k1 = getKey(seg.start);
        const k2 = getKey(seg.end);
        vertices.set(k1, seg.start);
        vertices.set(k2, seg.end);
    });
    
    // Build shape from loop
    const points = loopKeys.map(key => vertices.get(key));
    if (points.some(p => !p)) return;
    
    // Create floor shape
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
    
    scene.add(floor);
    state.floors.push(floor);
    
    updateDebugPanel();
}

function clearFloors() {
    state.floors.forEach(floor => {
        scene.remove(floor);
        floor.geometry.dispose();
        floor.material.dispose();
    });
    state.floors = [];
}

function checkForClosedLoop() {
    clearFloors();
    const loop = findClosedLoops();
    if (loop) {
        generateFloor(loop);
    }
}

// ============================================
// SNAPPING SYSTEM
// ============================================

function snapPoint(point, referencePoint) {
    if (!state.snapping) return point.clone();
    
    let snapped = point.clone();
    
    // Angle snapping relative to reference point
    if (referencePoint) {
        const direction = new THREE.Vector3().subVectors(point, referencePoint);
        const angle = Math.atan2(direction.z, direction.x);
        const distance = direction.length();
        
        // Find nearest snap angle
        const snapAngle = Math.round(angle / CONFIG.SNAP_ANGLE_STEP) * CONFIG.SNAP_ANGLE_STEP;
        const angleDiff = Math.abs(angle - snapAngle);
        
        if (angleDiff < CONFIG.SNAP_ANGLE_THRESHOLD || 
            angleDiff > Math.PI * 2 - CONFIG.SNAP_ANGLE_THRESHOLD) {
            snapped.x = referencePoint.x + Math.cos(snapAngle) * distance;
            snapped.z = referencePoint.z + Math.sin(snapAngle) * distance;
        }
    }
    
    // Endpoint snapping to existing walls
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
            break;
        }
    }
    
    return snapped;
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

// ============================================
// INTERACTION HANDLERS
// ============================================

function onMouseDown(event) {
    if (event.button !== 0) return; // Left click only
    if (event.target.closest('#toolbar')) return;
    
    if (state.mode === 'wall') {
        const point = getGroundIntersection(event.clientX, event.clientY);
        if (point) {
            state.isDrawing = true;
            state.dragStart = snapPoint(point, null);
            state.dragCurrent = state.dragStart.clone();
            controls.enabled = false;
            
            ghostWall.visible = true;
            ghostLine.visible = true;
        }
    }
}

function onMouseMove(event) {
    const point = getGroundIntersection(event.clientX, event.clientY);
    
    if (state.isDrawing && state.dragStart && point) {
        state.dragCurrent = snapPoint(point, state.dragStart);
        
        // Update ghost wall
        const direction = new THREE.Vector3().subVectors(state.dragCurrent, state.dragStart);
        const length = direction.length();
        const center = new THREE.Vector3().addVectors(state.dragStart, state.dragCurrent).multiplyScalar(0.5);
        
        if (length > 0.01) {
            ghostWall.scale.set(length, 1, 1);
            ghostWall.position.copy(center);
            ghostWall.position.y = CONFIG.WALL_HEIGHT / 2;
            ghostWall.lookAt(state.dragCurrent);
            ghostWall.visible = true;
            
            // Update ghost line
            const positions = new Float32Array([
                state.dragStart.x, 0.05, state.dragStart.z,
                state.dragCurrent.x, 0.05, state.dragCurrent.z
            ]);
            ghostLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            ghostLine.visible = true;
            
            // Show snap indicator
            if (state.snapping) {
                snapIndicator.position.set(state.dragCurrent.x, 0.06, state.dragCurrent.z);
                snapIndicator.visible = true;
            }
        } else {
            ghostWall.visible = false;
            ghostLine.visible = false;
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
        
        if (state.dragStart && state.dragCurrent) {
            const length = state.dragStart.distanceTo(state.dragCurrent);
            if (length > 0.3) { // Minimum wall length
                addWall(state.dragStart, state.dragCurrent);
            }
        }
        
        state.dragStart = null;
        state.dragCurrent = null;
    }
}

// ============================================
// CAMERA MODES
// ============================================

function setCameraMode(mode) {
    state.cameraMode = mode;
    
    if (mode === '2d') {
        // Smooth transition to top-down
        camera.position.copy(CONFIG.CAM_2D_POS);
        camera.lookAt(0, 0, 0);
        camera.zoom = 1.5;
        
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = 0;
        controls.enableRotate = false;
    } else {
        // 3D mode
        camera.position.copy(CONFIG.CAM_3D_POS);
        camera.lookAt(0, 0, 0);
        camera.zoom = 1;
        
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = Math.PI / 2 - 0.05;
        controls.enableRotate = true;
    }
    
    camera.updateProjectionMatrix();
    controls.update();
    updateUI();
}

// ============================================
// UI UPDATES
// ============================================

function updateUI() {
    // Camera buttons
    document.getElementById('cam-3d').classList.toggle('active', state.cameraMode === '3d');
    document.getElementById('cam-2d').classList.toggle('active', state.cameraMode === '2d');
    
    // Mode buttons
    document.getElementById('mode-wall').classList.toggle('active', state.mode === 'wall');
    document.getElementById('mode-edit').classList.toggle('active', state.mode === 'edit');
    
    // Snap toggle
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
    
    // Remove all floors
    clearFloors();
    
    updateDebugPanel();
}

// ============================================
// EVENT LISTENERS
// ============================================

window.addEventListener('mousedown', onMouseDown);
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('mouseup', onMouseUp);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// UI Event Listeners
document.getElementById('mode-wall').addEventListener('click', () => {
    state.mode = 'wall';
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

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// ============================================
// INITIALIZATION
// ============================================

updateUI();
updateDebugPanel();
animate();

console.log('Freeform Builder - Phase 1 initialized');
