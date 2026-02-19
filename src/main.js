import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);
scene.fog = new THREE.Fog(0x1a1a1a, 10, 50);

// Camera setup
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(5, 5, 5);

// Renderer setup
const canvas = document.getElementById('gl-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

const pointLight = new THREE.PointLight(0x4fc3f7, 0.5, 20);
pointLight.position.set(-5, 5, -5);
scene.add(pointLight);

// Grid and ground
const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
scene.add(gridHelper);

const groundGeometry = new THREE.PlaneGeometry(50, 50);
const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x1a1a1a,
    roughness: 0.8,
    metalness: 0.2
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);

// State
let selectedObject = null;
let isDragging = false;
let dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let dragOffset = new THREE.Vector3();
const objects = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Selection highlight
const selectionBox = new THREE.BoxHelper();
selectionBox.material.depthTest = false;
selectionBox.material.transparent = true;
selectionBox.visible = false;
scene.add(selectionBox);

// Object creation functions
function createMaterial() {
    const hue = Math.random();
    return new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(hue, 0.7, 0.5),
        roughness: 0.4,
        metalness: 0.3,
    });
}

function addCube() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = createMaterial();
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(
        (Math.random() - 0.5) * 4,
        0.5,
        (Math.random() - 0.5) * 4
    );
    cube.castShadow = true;
    cube.receiveShadow = true;
    cube.userData.type = 'Cube';
    scene.add(cube);
    objects.push(cube);
    selectObject(cube);
}

function addSphere() {
    const geometry = new THREE.SphereGeometry(0.5, 32, 32);
    const material = createMaterial();
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(
        (Math.random() - 0.5) * 4,
        0.5,
        (Math.random() - 0.5) * 4
    );
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.userData.type = 'Sphere';
    scene.add(sphere);
    objects.push(sphere);
    selectObject(sphere);
}

function addCylinder() {
    const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    const material = createMaterial();
    const cylinder = new THREE.Mesh(geometry, material);
    cylinder.position.set(
        (Math.random() - 0.5) * 4,
        0.5,
        (Math.random() - 0.5) * 4
    );
    cylinder.castShadow = true;
    cylinder.receiveShadow = true;
    cylinder.userData.type = 'Cylinder';
    scene.add(cylinder);
    objects.push(cylinder);
    selectObject(cylinder);
}

function addCone() {
    const geometry = new THREE.ConeGeometry(0.5, 1, 32);
    const material = createMaterial();
    const cone = new THREE.Mesh(geometry, material);
    cone.position.set(
        (Math.random() - 0.5) * 4,
        0.5,
        (Math.random() - 0.5) * 4
    );
    cone.castShadow = true;
    cone.receiveShadow = true;
    cone.userData.type = 'Cone';
    scene.add(cone);
    objects.push(cone);
    selectObject(cone);
}

// Selection and manipulation
function selectObject(object) {
    if (selectedObject === object) return;
    
    selectedObject = object;
    
    if (selectedObject) {
        selectionBox.setFromObject(selectedObject);
        selectionBox.visible = true;
        updateObjectInfo();
    } else {
        selectionBox.visible = false;
        hideObjectInfo();
    }
}

function clearSelection() {
    selectedObject = null;
    selectionBox.visible = false;
    hideObjectInfo();
}

function deleteSelected() {
    if (!selectedObject) return;
    
    scene.remove(selectedObject);
    const index = objects.indexOf(selectedObject);
    if (index > -1) {
        objects.splice(index, 1);
    }
    
    // Clean up
    selectedObject.geometry.dispose();
    selectedObject.material.dispose();
    
    clearSelection();
}

function clearAll() {
    objects.forEach(obj => {
        scene.remove(obj);
        obj.geometry.dispose();
        obj.material.dispose();
    });
    objects.length = 0;
    clearSelection();
}

function randomizeColors() {
    objects.forEach(obj => {
        obj.material.color.setHSL(Math.random(), 0.7, 0.5);
    });
}

// UI Functions
function updateObjectInfo() {
    const info = document.getElementById('object-info');
    const type = document.getElementById('selected-type');
    
    info.classList.remove('hidden');
    type.textContent = selectedObject ? selectedObject.userData.type : '-';
}

function hideObjectInfo() {
    const info = document.getElementById('object-info');
    info.classList.add('hidden');
}

// Event handlers
function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    if (isDragging && selectedObject) {
        raycaster.setFromCamera(mouse, camera);
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragPlane, intersectPoint);
        
        if (intersectPoint) {
            selectedObject.position.copy(intersectPoint.sub(dragOffset));
            selectionBox.setFromObject(selectedObject);
            selectionBox.update();
        }
    }
}

function onMouseDown(event) {
    if (event.button !== 0) return; // Only left click
    
    // Check if clicking on UI
    if (event.target.closest('#toolbar')) return;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(objects);
    
    if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        
        if (selectedObject !== clickedObject) {
            selectObject(clickedObject);
        }
        
        // Start dragging
        isDragging = true;
        controls.enabled = false;
        
        // Set up drag plane at object's height
        dragPlane.constant = -clickedObject.position.y;
        
        // Calculate drag offset
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragPlane, intersectPoint);
        dragOffset.copy(intersectPoint).sub(clickedObject.position);
    } else {
        clearSelection();
    }
}

function onMouseUp() {
    isDragging = false;
    controls.enabled = true;
}

function onKeyDown(event) {
    if (event.key === 'Delete' || event.key === 'Backspace') {
        deleteSelected();
    }
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Event listeners
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('mousedown', onMouseDown);
window.addEventListener('mouseup', onMouseUp);
window.addEventListener('keydown', onKeyDown);
window.addEventListener('resize', onResize);

// UI Button listeners
document.getElementById('add-cube').addEventListener('click', addCube);
document.getElementById('add-sphere').addEventListener('click', addSphere);
document.getElementById('add-cylinder').addEventListener('click', addCylinder);
document.getElementById('add-cone').addEventListener('click', addCone);
document.getElementById('clear-all').addEventListener('click', clearAll);
document.getElementById('random-colors').addEventListener('click', randomizeColors);
document.getElementById('delete-selected').addEventListener('click', deleteSelected);

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    controls.update();
    
    if (selectedObject) {
        selectionBox.update();
    }
    
    renderer.render(scene, camera);
}

// Initialize with a demo object
addCube();

// Start
animate();
