/**
 * Freeform Builder - Phase 1: Basic Building (Lasso Drawing)
 * 
 * Core systems:
 * - Lasso-style wall drawing (continuous chain)
 * - Snapping (strong cardinal, soft diagonal, endpoint)
 * - Floor generation (multiple closed loop detection)
 * - Camera modes (3D orbit + 2D top-down)
 * - Wall selection and deletion
 * - Visual feedback (snap color change, loop closing)
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
    
    // Lasso Drawing
    SEGMENT_THRESHOLD: 0.8, // Distance to create new segment while drawing
    MIN_SEGMENT_LENGTH: 0.3,
    
    // Snapping
    SNAP_ANGLE_STEP: Math.PI / 4,
    SNAP_DISTANCE: 0.5,
    SNAP_ANGLE_THRESHOLD: Math.PI / 12,
    SNAP_CARDINAL_THRESHOLD: Math.PI / 24,
    
    // Colors
    COLOR_WALL: 0x5a5a5a,
    COLOR_WALL_SELECTED: 0x7a9aca,
    COLOR_WALL_HOVER: 0x7a7a7a,
    COLOR_FLOOR: 0x4a4a4a,
    COLOR_GRID: 0x333333,
    COLOR_GROUND: 0x1a1a1a,
    COLOR_GHOST_DEFAULT: 0x4fc3f7,
    COLOR_GHOST_SNAP: 0x7fff7f,
    
    // Camera
    CAM_3D_POS: new THREE.Vector3(15, 12, 15),
    CAM_2D_POS: new THREE.Vector3(0, 30, 0),
};

// ============================================
// STATE MANAGEMENT
// ============================================

const state = {
    mode: 'wall', // 'wall' | 'edit'
    cameraMode: '3d',
    snapping: true,
    
    // Lasso Drawing State
    isDrawing: false,
    drawPoints: [], // Array of Vector3 points in the current chain
    pendingWalls: [], // Temp wall meshes being drawn
    
    // Selection
    hoveredWall: null,
    selectedWall: null,
    
    // Data
    walls: [], // Permanent wall meshes
    floors: [],
    wallSegments: [], // {start, end, wallId}
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
    duration: 0.4
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

const gridHelper = new THREE.GridHelper(100, 100, CONFIG.COLOR_GRID, CONFIG.COLOR_GRID);
gridHelper.material.opacity = 0.3;
gridHelper.material.transparent = true;
scene.add(gridHelper);

const raycastPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// ============================================
// PREVIEW OBJECTS
// ============================================

// Current segment being drawn
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

// Start point indicator
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
// WALL CREATION
// ============================================

function createWallMesh(start, end, id, isGhost = false) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    const geometry = new THREE.BoxGeometry(length, CONFIG.WALL_HEIGHT, CONFIG.WALL_THICKNESS);
    
    let material;
    if (isGhost) {
        material = new THREE.MeshBasicMaterial({
            color: CONFIG.COLOR_GHOST_DEFAULT,
            transparent: true,
            opacity: 0.5,
            depthWrite: false
        });
    } else {
        material = new THREE.MeshStandardMaterial({
            color: CONFIG.COLOR_WALL,
            roughness: 0.7,
            metalness: 0.2
        });
    }
    
    const wall = new THREE.Mesh(geometry, material);
    wall.position.copy(center);
    wall.position.y = CONFIG.WALL_HEIGHT / 2;
    wall.lookAt(end);
    
    if (!isGhost) {
        wall.castShadow = true;
        wall.receiveShadow = true;
    }
    
    wall.userData = {
        type: 'wall',
        start: start.clone(),
        end: end.clone(),
        id: id
    };
    
    return wall;
}

function commitWall(start, end) {
    const id = Date.now() + Math.random();
    const wall = createWallMesh(start, end, id, false);
    scene.add(wall);
    
    state.walls.push(wall);
    state.wallSegments.push({ start: start.clone(), end: end.clone(), wallId: id });
    
    return wall;
}

function createPendingWall(start, end) {
    const id = 'pending_' + Date.now() + Math.random();
    const wall = createWallMesh(start, end, id, true);
    scene.add(wall);
    state.pendingWalls.push(wall);
    return wall;
}

function clearPendingWalls() {
    state.pendingWalls.forEach(wall => {
        scene.remove(wall);
        wall.geometry.dispose();
        wall.material.dispose();
    });
    state.pendingWalls = [];
}

function deleteWall(wall) {
    if (!wall) return;
    
    scene.remove(wall);
    wall.geometry.dispose();
    wall.material.dispose();
    
    const wallIndex = state.walls.indexOf(wall);
    if (wallIndex > -1) {
        state.walls.splice(wallIndex, 1);
    }
    
    const segIndex = state.wallSegments.findIndex(s => s.wallId === wall.userData.id);
    if (segIndex > -1) {
        state.wallSegments.splice(segIndex, 1);
    }
    
    if (state.selectedWall === wall) {
        state.selectedWall = null;
        selectionBox.visible = false;
    }
    
    regenerateAllFloors();
    updateDebugPanel();
}

function selectWall(wall) {
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
    
    const vertices = new Map();
    const edges = [];
    
    state.wallSegments.forEach(seg => {
        const k1 = getVertexKey(seg.start);
        const k2 = getVertexKey(seg.end);
        
        if (!vertices.has(k1)) vertices.set(k1, seg.start.clone());
        if (!vertices.has(k2)) vertices.set(k2, seg.end.clone());
        
        edges.push([k1, k2]);
    });
    
    const adj = new Map();
    vertices.forEach((_, key) => adj.set(key, []));
    
    edges.forEach(([k1, k2]) => {
        adj.get(k1).push(k2);
        adj.get(k2).push(k1);
    });
    
    const foundLoops = [];
    const processedStarts = new Set();
    
    vertices.forEach((_, startKey) => {
        if (processedStarts.has(startKey)) return;
        
        const queue = [[startKey, [startKey], new Set([startKey])]];
        
        while (queue.length > 0) {
            const [current, path, visited] = queue.shift();
            
            const neighbors = adj.get(current);
            for (const neighbor of neighbors) {
                if (path.length > 2 && neighbor === startKey) {
                    const loop = [...path];
                    foundLoops.push(loop);
                    loop.forEach(k => processedStarts.add(k));
                    return;
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

function snapPoint(point, referencePoint, checkEndpoints = true) {
    if (!state.snapping) return { point: point.clone(), didSnap: false };
    
    let snapped = point.clone();
    let didSnap = false;
    
    // Angle snapping
    if (referencePoint) {
        const direction = new THREE.Vector3().subVectors(point, referencePoint);
        const angle = Math.atan2(direction.z, direction.x);
        const distance = direction.length();
        
        const snapAngle = Math.round(angle / CONFIG.SNAP_ANGLE_STEP) * CONFIG.SNAP_ANGLE_STEP;
        const angleDiff = Math.abs(angle - snapAngle);
        
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
    if (checkEndpoints) {
        const snapCandidates = [];
        state.wallSegments.forEach(seg => {
            snapCandidates.push(seg.start, seg.end);
        });
        // Also check start point of current drawing
        if (state.drawPoints.length > 0) {
            snapCandidates.push(state.drawPoints[0]);
        }
        
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
    }
    
    return { point: snapped, didSnap };
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
// LASSO DRAWING
// ============================================

function startDrawing(point) {
    state.isDrawing = true;
    state.drawPoints = [point.clone()];
    
    controls.enabled = false;
    
    // Show start indicator
    startPointIndicator.position.set(point.x, 0.05, point.z);
    startPointIndicator.visible = true;
    startPointIndicator.material.color.setHex(0xffff00);
    startPointIndicator.scale.set(1, 1, 1);
    
    // Show ghost wall for first segment
    ghostWall.visible = true;
    
    updateDebugPanel();
}

function updateDrawing(currentPoint) {
    if (!state.isDrawing || state.drawPoints.length === 0) return;
    
    const lastPoint = state.drawPoints[state.drawPoints.length - 1];
    
    // Snap the current point
    const { point: snappedPoint, didSnap } = snapPoint(currentPoint, lastPoint);
    
    // Update visual feedback
    snapIndicator.position.set(snappedPoint.x, 0.06, snappedPoint.z);
    snapIndicator.visible = didSnap;
    
    if (didSnap) {
        ghostWall.material.color.setHex(CONFIG.COLOR_GHOST_SNAP);
        snapIndicator.material.color.setHex(CONFIG.COLOR_GHOST_SNAP);
    } else {
        ghostWall.material.color.setHex(CONFIG.COLOR_GHOST_DEFAULT);
        snapIndicator.material.color.setHex(CONFIG.COLOR_GHOST_DEFAULT);
    }
    
    // Check if we should create a new segment
    const distFromLast = lastPoint.distanceTo(snappedPoint);
    
    if (distFromLast >= CONFIG.SEGMENT_THRESHOLD) {
        // Commit the segment from lastPoint to snappedPoint
        createPendingWall(lastPoint, snappedPoint);
        state.drawPoints.push(snappedPoint.clone());
    }
    
    // Update ghost wall from last committed point to current
    const direction = new THREE.Vector3().subVectors(snappedPoint, lastPoint);
    const length = direction.length();
    
    if (length > 0.01) {
        const center = new THREE.Vector3().addVectors(lastPoint, snappedPoint).multiplyScalar(0.5);
        ghostWall.scale.set(Math.max(length, 0.1), 1, 1);
        ghostWall.position.copy(center);
        ghostWall.position.y = CONFIG.WALL_HEIGHT / 2;
        ghostWall.lookAt(snappedPoint);
        ghostWall.visible = true;
    } else {
        ghostWall.visible = false;
    }
    
    // Check for loop closing (near start point)
    if (state.drawPoints.length > 2) {
        const distToStart = snappedPoint.distanceTo(state.drawPoints[0]);
        if (distToStart < CONFIG.SNAP_DISTANCE) {
            startPointIndicator.material.color.setHex(0x00ff00);
            startPointIndicator.scale.set(1.5, 1.5, 1.5);
        } else {
            startPointIndicator.material.color.setHex(0xffff00);
            startPointIndicator.scale.set(1, 1, 1);
        }
    }
}

function finishDrawing() {
    if (!state.isDrawing) return;
    
    state.isDrawing = false;
    controls.enabled = true;
    
    // Commit all pending walls
    state.pendingWalls.forEach(wall => {
        const start = wall.userData.start;
        const end = wall.userData.end;
        
        // Remove ghost
        scene.remove(wall);
        wall.geometry.dispose();
        wall.material.dispose();
        
        // Create real wall
        commitWall(start, end);
    });
    
    // Check if we should close the loop
    if (state.drawPoints.length > 2) {
        const lastPoint = state.drawPoints[state.drawPoints.length - 1];
        const firstPoint = state.drawPoints[0];
        const distToStart = lastPoint.distanceTo(firstPoint);
        
        if (distToStart < CONFIG.SNAP_DISTANCE && distToStart > CONFIG.MIN_SEGMENT_LENGTH) {
            // Close the loop
            commitWall(lastPoint, firstPoint);
        }
    }
    
    // Clear state
    state.pendingWalls = [];
    state.drawPoints = [];
    ghostWall.visible = false;
    snapIndicator.visible = false;
    startPointIndicator.visible = false;
    
    regenerateAllFloors();
    updateDebugPanel();
}

function cancelDrawing() {
    if (!state.isDrawing) return;
    
    state.isDrawing = false;
    controls.enabled = true;
    
    // Clear all pending walls
    clearPendingWalls();
    
    state.drawPoints = [];
    ghostWall.visible = false;
    snapIndicator.visible = false;
    startPointIndicator.visible = false;
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
            const { point: snappedPoint } = snapPoint(point, null, true);
            startDrawing(snappedPoint);
        }
    } else if (state.mode === 'edit') {
        const wall = getWallIntersection(event.clientX, event.clientY);
        selectWall(wall);
    }
}

function onMouseMove(event) {
    const point = getGroundIntersection(event.clientX, event.clientY);
    
    if (state.isDrawing) {
        updateDrawing(point);
    } else if (state.mode === 'edit') {
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
        finishDrawing();
    }
}

function onKeyDown(event) {
    if (event.key === 'Escape') {
        if (state.isDrawing) {
            cancelDrawing();
        }
        return;
    }
    
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

console.log('Freeform Builder - Phase 1 (Lasso Drawing) initialized');
