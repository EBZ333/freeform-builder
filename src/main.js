/**
 * Freeform Builder - Phase 1: Basic Building (Extruded Wall Drawing)
 * 
 * Core systems:
 * - Draw continuous paths that get extruded into walls
 * - Snapping (strong cardinal, soft diagonal, endpoint)
 * - Floor generation (multiple closed loop detection)
 * - Camera modes (3D orbit + 2D top-down)
 * - Wall selection and deletion
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
    
    // Drawing
    MIN_POINT_DISTANCE: 0.3, // Minimum distance between path points
    
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
    COLOR_GHOST: 0x4fc3f7,
    COLOR_GHOST_SNAP: 0x7fff7f,
    
    // Camera
    CAM_3D_POS: new THREE.Vector3(15, 12, 15),
    CAM_2D_POS: new THREE.Vector3(0, 30, 0),
};

// ============================================
// STATE MANAGEMENT
// ============================================

const state = {
    mode: 'wall',
    cameraMode: '3d',
    snapping: true,
    
    // Drawing State
    isDrawing: false,
    drawPoints: [], // Array of Vector3 path points
    
    // Selection
    hoveredWall: null,
    selectedWall: null,
    
    // Data
    walls: [], // Wall mesh objects
    floors: [],
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

// Camera transition
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

// Ghost wall (extruded along path)
const ghostWallMat = new THREE.MeshBasicMaterial({
    color: CONFIG.COLOR_GHOST,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    side: THREE.DoubleSide
});
let ghostWall = null; // Created dynamically

// Path line on ground
const pathLineMat = new THREE.LineBasicMaterial({ 
    color: CONFIG.COLOR_GHOST,
    linewidth: 3
});
const pathLineGeo = new THREE.BufferGeometry();
const pathLine = new THREE.Line(pathLineGeo, pathLineMat);
pathLine.visible = false;
scene.add(pathLine);

// Snap indicator
const snapIndicatorGeo = new THREE.RingGeometry(0.15, 0.25, 32);
const snapIndicatorMat = new THREE.MeshBasicMaterial({ 
    color: CONFIG.COLOR_GHOST,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
});
const snapIndicator = new THREE.Mesh(snapIndicatorGeo, snapIndicatorMat);
snapIndicator.rotation.x = -Math.PI / 2;
snapIndicator.visible = false;
scene.add(snapIndicator);

// Start point indicator
const startPointGeo = new THREE.RingGeometry(0.25, 0.35, 32);
const startPointMat = new THREE.MeshBasicMaterial({ 
    color: 0xffff00,
    transparent: true,
    opacity: 0.7,
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
// WALL GEOMETRY CREATION
// ============================================

function createExtrudedWallGeometry(points, height, thickness) {
    if (points.length < 2) return null;
    
    const vertices = [];
    const indices = [];
    const halfThick = thickness / 2;
    
    // Create vertices along the path with thickness
    for (let i = 0; i < points.length; i++) {
        const current = points[i];
        
        // Calculate direction
        let direction;
        if (i === 0) {
            direction = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
        } else if (i === points.length - 1) {
            direction = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
        } else {
            const prev = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
            const next = new THREE.Vector3().subVectors(points[i + 1], points[i]).normalize();
            direction = new THREE.Vector3().addVectors(prev, next).normalize();
        }
        
        // Perpendicular vector (for thickness)
        const perp = new THREE.Vector3(-direction.z, 0, direction.x);
        
        // Add vertices for this point (bottom and top, left and right)
        const left = new THREE.Vector3().copy(current).addScaledVector(perp, -halfThick);
        const right = new THREE.Vector3().copy(current).addScaledVector(perp, halfThick);
        
        // Bottom vertices
        vertices.push(left.x, 0, left.z); // left bottom
        vertices.push(right.x, 0, right.z); // right bottom
        
        // Top vertices
        vertices.push(left.x, height, left.z); // left top
        vertices.push(right.x, height, right.z); // right top
    }
    
    // Create faces
    for (let i = 0; i < points.length - 1; i++) {
        const base = i * 4;
        const next = (i + 1) * 4;
        
        // Front face (facing outward on left side)
        indices.push(base, next + 2, base + 2);
        indices.push(base, next, next + 2);
        
        // Back face (facing outward on right side)
        indices.push(base + 1, base + 3, next + 3);
        indices.push(base + 1, next + 3, next + 1);
        
        // Top face
        indices.push(base + 2, next + 3, base + 3);
        indices.push(base + 2, next + 2, next + 3);
        
        // Bottom face
        indices.push(base, base + 1, next + 1);
        indices.push(base, next + 1, next);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    
    return geometry;
}

function createWallFromPath(points, isGhost = false) {
    const geometry = createExtrudedWallGeometry(points, CONFIG.WALL_HEIGHT, CONFIG.WALL_THICKNESS);
    if (!geometry) return null;
    
    let material;
    if (isGhost) {
        material = new THREE.MeshBasicMaterial({
            color: CONFIG.COLOR_GHOST,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
            side: THREE.DoubleSide
        });
    } else {
        material = new THREE.MeshStandardMaterial({
            color: CONFIG.COLOR_WALL,
            roughness: 0.7,
            metalness: 0.2
        });
    }
    
    const wall = new THREE.Mesh(geometry, material);
    
    if (!isGhost) {
        wall.castShadow = true;
        wall.receiveShadow = true;
    }
    
    wall.userData = {
        type: 'wall',
        points: points.map(p => p.clone()),
        id: Date.now() + Math.random()
    };
    
    return wall;
}

function commitWall(points) {
    const wall = createWallFromPath(points, false);
    if (wall) {
        scene.add(wall);
        state.walls.push(wall);
    }
    return wall;
}

function deleteWall(wall) {
    if (!wall) return;
    
    scene.remove(wall);
    wall.geometry.dispose();
    wall.material.dispose();
    
    const index = state.walls.indexOf(wall);
    if (index > -1) {
        state.walls.splice(index, 1);
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
// FLOOR GENERATION
// ============================================

function getVertexKey(v) {
    return `${v.x.toFixed(3)},${v.z.toFixed(3)}`;
}

function findClosedLoopsFromWalls() {
    // Extract all endpoints from walls
    const vertices = new Map();
    const edges = [];
    
    state.walls.forEach(wall => {
        const points = wall.userData.points;
        if (points.length < 2) return;
        
        // Add all consecutive point pairs as edges
        for (let i = 0; i < points.length - 1; i++) {
            const k1 = getVertexKey(points[i]);
            const k2 = getVertexKey(points[i + 1]);
            
            if (!vertices.has(k1)) vertices.set(k1, points[i].clone());
            if (!vertices.has(k2)) vertices.set(k2, points[i + 1].clone());
            
            edges.push([k1, k2]);
        }
    });
    
    if (edges.length === 0) return [];
    
    // Build adjacency
    const adj = new Map();
    vertices.forEach((_, key) => adj.set(key, []));
    
    edges.forEach(([k1, k2]) => {
        adj.get(k1).push(k2);
        adj.get(k2).push(k1);
    });
    
    // Find cycles
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
                
                if (!visited.has(neighbor) && path.length < 20) {
                    queue.push([neighbor, [...path, neighbor], new Set([...visited, neighbor])]);
                }
            }
        }
    });
    
    return foundLoops.map(loop => loop.map(key => vertices.get(key)));
}

function generateFloorFromLoop(loopPoints) {
    if (!loopPoints || loopPoints.length < 3) return null;
    
    const shape = new THREE.Shape();
    shape.moveTo(loopPoints[0].x, loopPoints[0].z);
    
    for (let i = 1; i < loopPoints.length; i++) {
        shape.lineTo(loopPoints[i].x, loopPoints[i].z);
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
    
    const loops = findClosedLoopsFromWalls();
    
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
// SNAPPING
// ============================================

function snapPoint(point, referencePoint, canSnapToStart = false) {
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
    const snapCandidates = [];
    state.walls.forEach(wall => {
        const points = wall.userData.points;
        snapCandidates.push(points[0], points[points.length - 1]);
    });
    
    if (canSnapToStart && state.drawPoints.length > 0) {
        snapCandidates.push(state.drawPoints[0]);
    }
    
    for (const candidate of snapCandidates) {
        const dist = snapped.distanceTo(candidate);
        if (dist < CONFIG.SNAP_DISTANCE) {
            snapped.copy(candidate);
            didSnap = true;
            break;
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
// DRAWING
// ============================================

function updateGhostWall() {
    // Remove old ghost
    if (ghostWall) {
        scene.remove(ghostWall);
        ghostWall.geometry.dispose();
        ghostWall = null;
    }
    
    if (state.drawPoints.length < 2) return;
    
    // Create new ghost
    ghostWall = createWallFromPath(state.drawPoints, true);
    if (ghostWall) {
        scene.add(ghostWall);
    }
}

function updatePathLine() {
    if (state.drawPoints.length < 2) {
        pathLine.visible = false;
        return;
    }
    
    const positions = [];
    state.drawPoints.forEach(p => {
        positions.push(p.x, 0.05, p.z);
    });
    
    pathLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    pathLine.visible = true;
}

function startDrawing(point) {
    state.isDrawing = true;
    state.drawPoints = [point.clone()];
    
    controls.enabled = false;
    
    // Show start indicator
    startPointIndicator.position.set(point.x, 0.05, point.z);
    startPointIndicator.visible = true;
    startPointIndicator.material.color.setHex(0xffff00);
    startPointIndicator.scale.set(1, 1, 1);
}

function updateDrawing(currentPoint) {
    if (!state.isDrawing || state.drawPoints.length === 0) return;
    
    const lastPoint = state.drawPoints[state.drawPoints.length - 1];
    
    // Snap the current point
    const canSnapToStart = state.drawPoints.length > 2;
    const { point: snappedPoint, didSnap } = snapPoint(currentPoint, lastPoint, canSnapToStart);
    
    // Update indicators
    snapIndicator.position.set(snappedPoint.x, 0.06, snappedPoint.z);
    snapIndicator.visible = didSnap;
    snapIndicator.material.color.setHex(didSnap ? CONFIG.COLOR_GHOST_SNAP : CONFIG.COLOR_GHOST);
    
    if (didSnap && ghostWall) {
        ghostWall.material.color.setHex(CONFIG.COLOR_GHOST_SNAP);
    } else if (ghostWall) {
        ghostWall.material.color.setHex(CONFIG.COLOR_GHOST);
    }
    
    // Add point if far enough from last
    const distFromLast = lastPoint.distanceTo(snappedPoint);
    if (distFromLast >= CONFIG.MIN_POINT_DISTANCE) {
        state.drawPoints.push(snappedPoint.clone());
        updateGhostWall();
        updatePathLine();
    } else {
        // Update last point for visual feedback
        state.drawPoints[state.drawPoints.length - 1] = snappedPoint.clone();
        updateGhostWall();
        updatePathLine();
    }
    
    // Check for loop closing
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
    
    // Check if should close loop
    if (state.drawPoints.length > 2) {
        const lastPoint = state.drawPoints[state.drawPoints.length - 1];
        const firstPoint = state.drawPoints[0];
        const distToStart = lastPoint.distanceTo(firstPoint);
        
        if (distToStart < CONFIG.SNAP_DISTANCE) {
            // Close the loop by snapping last point to first
            state.drawPoints[state.drawPoints.length - 1] = firstPoint.clone();
        }
    }
    
    // Commit if valid
    if (state.drawPoints.length >= 2) {
        commitWall(state.drawPoints);
        regenerateAllFloors();
    }
    
    // Cleanup
    if (ghostWall) {
        scene.remove(ghostWall);
        ghostWall = null;
    }
    
    state.drawPoints = [];
    pathLine.visible = false;
    snapIndicator.visible = false;
    startPointIndicator.visible = false;
    
    updateDebugPanel();
}

function cancelDrawing() {
    if (!state.isDrawing) return;
    
    state.isDrawing = false;
    controls.enabled = true;
    
    if (ghostWall) {
        scene.remove(ghostWall);
        ghostWall = null;
    }
    
    state.drawPoints = [];
    pathLine.visible = false;
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
            const { point: snappedPoint } = snapPoint(point, null, false);
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
    });
    state.walls = [];
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

// UI
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

console.log('Freeform Builder - Phase 1 (Extruded Walls) initialized');
