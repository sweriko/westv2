import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue background

// Camera setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 50, 100);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

// Ground
const groundGeometry = new THREE.PlaneGeometry(200, 200);
const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x228B22,  // Forest green
    side: THREE.DoubleSide 
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Create a circular path
const radius = 50; // 100m diameter means 50m radius
const numPoints = 100;
const points = [];

for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    points.push(new THREE.Vector3(x, 0, z));
}

// Create closed loop
points.push(points[0].clone());

// Create spline from points
const spline = new THREE.CatmullRomCurve3(points);
spline.closed = true;

// Visualize the path with a line
const pathGeometry = new THREE.BufferGeometry().setFromPoints(spline.getPoints(200));
const pathMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
const pathLine = new THREE.Line(pathGeometry, pathMaterial);
scene.add(pathLine);

// Variables for animation
let train;
let trainLoaded = false;
let progress = 0;

// Load train model
const loader = new GLTFLoader();
loader.load(
    '../models/train.glb',
    (gltf) => {
        train = gltf.scene;
        train.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
        
        // Scale and position the train
        train.scale.set(2, 2, 2);
        train.position.y = 0; // Adjust as needed based on the model
        
        // Add to scene
        scene.add(train);
        trainLoaded = true;
        
        console.log('Train model loaded successfully');
    },
    (xhr) => {
        console.log(`Loading: ${(xhr.loaded / xhr.total) * 100}% loaded`);
    },
    (error) => {
        console.error('Error loading train model:', error);
    }
);

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update controls
    controls.update();
    
    // Move the train along the path
    if (trainLoaded) {
        // Increment progress
        progress += 0.0005; // Adjust speed here
        if (progress > 1) progress = 0;
        
        // Get position on the path
        const position = spline.getPointAt(progress);
        train.position.copy(position);
        
        // Orient the train to follow the path
        const tangent = spline.getTangentAt(progress).normalize();
        
        // Make the train rotate to face the direction of motion
        // We're assuming the train's forward axis is along the z-axis
        const up = new THREE.Vector3(0, 1, 0);
        const axis = new THREE.Vector3().crossVectors(up, tangent).normalize();
        
        // Calculate the rotation angle
        const radians = Math.acos(up.dot(tangent));
        
        // Apply the rotation - use quaternion to avoid gimbal lock
        train.quaternion.setFromAxisAngle(axis, radians);
        
        // Rotate 90 degrees on Y to align with track
        train.rotateY(Math.PI / 2);
    }
    
    // Render
    renderer.render(scene, camera);
}

animate(); 