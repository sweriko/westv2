// /public/js/scene.js
export let scene;
import { DesertTerrain } from './desertTerrain.js';
import { TumbleweedManager } from './tumbleweed.js';

// Adding skybox references for animation
let skyMesh;
let groundMesh;
const SKYBOX_ROTATION_SPEED = 0.00001; // Much slower rotation speed

// Add tumbleweed manager
let tumbleweedManager;

/**
 * Initializes the Three.js scene, camera, and renderer.
 * @returns {Object} - Contains the camera and renderer.
 */
export function initScene() {
  scene = new THREE.Scene();
  
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  // Set output encoding for consistent lighting and color reproduction.
  renderer.outputEncoding = THREE.sRGBEncoding;

  const gameContainer = document.getElementById('game-container');
  if (!gameContainer) {
    throw new Error("Game container not found in HTML.");
  }
  gameContainer.appendChild(renderer.domElement);

  // Initialize with a desert sand color instead of blue
  scene.background = new THREE.Color(0xec9e5c);
  
  // Load the two skybox parts - ground and sky
  loadTwoPartSkybox();
  
  // Change fog color to match desert colors instead of blue
  const desertFogColor = new THREE.Color(0xec9e5c); // Desert sand color
  scene.fog = new THREE.Fog(desertFogColor, 250, 900); // Increased fog distances

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  // Increase ambient light intensity and warm it up to match desert environment
  const ambientLight = new THREE.AmbientLight(0xffebc8, 0.6);
  scene.add(ambientLight);

  // Adjust directional light to be softer and more diffused for desert environment
  const directionalLight = new THREE.DirectionalLight(0xffffb3, 1.0);
  directionalLight.position.set(1, 1.2, 0.5).normalize();
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.radius = 3; // Add shadow blur for softer shadows
  scene.add(directionalLight);

  // Create the western town instead of just a ground plane
  createWesternTown();
  
  // Create the desert terrain
  createDesertTerrain();

  return { camera, renderer };
}

/**
 * Loads the two-part skybox with separate ground and animated sky
 */
function loadTwoPartSkybox() {
  const textureLoader = new THREE.TextureLoader();
  const skyboxRadius = 900;
  
  // Function to create sky part with a texture
  function createSkyPart(skyTexture) {
    console.log("Creating sky part with texture");
    
    // Create sky mesh with LARGER radius (1.01x)
    const skyGeometry = new THREE.SphereGeometry(skyboxRadius * 1.01, 64, 32);
    skyGeometry.scale(-1, 1, 1);
    
    const skyMaterial = new THREE.MeshBasicMaterial({
      map: skyTexture,
      transparent: true,
      fog: false
    });
    
    skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(skyMesh);
    console.log("Sky part added to scene");
  }
  
  // Function to create ground part with a texture
  function createGroundPart(groundTexture) {
    console.log("Creating ground part with texture");
    
    // Create ground mesh with normal radius
    const groundGeometry = new THREE.SphereGeometry(skyboxRadius, 64, 32);
    groundGeometry.scale(-1, 1, 1);
    
    const groundMaterial = new THREE.MeshBasicMaterial({
      map: groundTexture,
      transparent: true,
      fog: false
    });
    
    groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    scene.add(groundMesh);
    console.log("Ground part added to scene");
  }
  
  // Load sky texture
  textureLoader.load('models/skypart.png', function(skyTexture) {
    console.log("Sky texture loaded successfully");
    createSkyPart(skyTexture);
  });
  
  // Load ground texture
  textureLoader.load('models/groundpart.png', function(groundTexture) {
    console.log("Ground texture loaded successfully");
    createGroundPart(groundTexture);
  });
}

/**
 * Creates a western town by loading the town.glb model
 */
function createWesternTown() {
  // Town dimensions (kept the same for compatibility)
  const TOWN_WIDTH = 60;  // Width of the town (X-axis)
  const TOWN_LENGTH = 100; // Length of the town (Z-axis)
  const STREET_WIDTH = 15; // Width of the main street

  // Make town dimensions globally accessible
  window.townDimensions = {
    width: TOWN_WIDTH,
    length: TOWN_LENGTH,
    streetWidth: STREET_WIDTH
  };

  // Function to process the town model
  function processTownModel(gltf) {
    // Add the entire model to the scene
    scene.add(gltf.scene);
    console.log("Town model added to scene");
    
    // Log all objects in the model
    let objectCount = 0;
    let colliderCount = 0;
    
    // Create colliders for objects prefixed with "collider"
    const colliders = [];
    
    gltf.scene.traverse((node) => {
      if (node.isMesh) {
        objectCount++;
        
        // Make sure all meshes cast and receive shadows
        node.castShadow = true;
        node.receiveShadow = true;
        
        // Add collision boxes for objects with "collider" prefix
        if (node.name.toLowerCase().startsWith('collider')) {
          colliderCount++;
          
          // Make the collider semi-transparent for easier identification in debug mode
          if (node.material) {
            // Clone the material to avoid affecting other objects with the same material
            node.material = node.material.clone();
            node.material.transparent = true;
            node.material.opacity = 0.0;
            node.material.color.set(0xff0000); // Make colliders red
          }
          
          // Get world geometry
          const bbox = new THREE.Box3().setFromObject(node);
          const size = new THREE.Vector3();
          bbox.getSize(size);
          
          // Create a physics body for this collider
          if (window.physics) {
            const position = new THREE.Vector3();
            bbox.getCenter(position);
            
            const halfExtents = new CANNON.Vec3(size.x/2, size.y/2, size.z/2);
            const shape = new CANNON.Box(halfExtents);
            
            const body = new CANNON.Body({
              mass: 0, // Static body
              position: new CANNON.Vec3(position.x, position.y, position.z),
              shape: shape
            });
            
            // Add to physics world
            window.physics.world.addBody(body);
            window.physics.bodies.push(body);
            
            // Store the node and body together for debugging
            colliders.push({ node, body });
            
            // Hide collider mesh by default (will be toggled by debug mode)
            node.visible = false;
          }
        }
      }
    });
    
    // Store colliders for potential later use
    window.townColliders = colliders;
    
    console.log(`Town model loaded with ${objectCount} objects, including ${colliderCount} colliders`);
  }
  
  // Load the town model
  const loader = new THREE.GLTFLoader();
  console.log("Loading town.glb model...");
  loader.load('models/town.glb', 
    (gltf) => processTownModel(gltf), 
    // Progress callback
    (progress) => {
      if (progress.lengthComputable) {
        const percentage = Math.round((progress.loaded / progress.total) * 100);
        // Only log at 25%, 50%, 75%, and 100% to reduce spam
        if (percentage === 25 || percentage === 50 || percentage === 75 || percentage === 100) {
          console.log(`Loading town model: ${percentage}%`);
        }
      }
    },
    (error) => {
      console.error('Error loading town model:', error);
    }
  );
}

/**
 * Creates a simple western-style building
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} z - Z position
 */
function createWesternBuilding(x, y, z) {
  // Randomize building dimensions
  const width = 8 + Math.random() * 4;
  const height = 5 + Math.random() * 3;
  const depth = 6 + Math.random() * 4;
  
  const buildingGroup = new THREE.Group();
  
  // Building body
  const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
  const buildingMaterial = new THREE.MeshStandardMaterial({
    color: Math.random() > 0.5 ? 0x8B4513 : 0xA0522D, // Brown variations
    roughness: 0.8,
    metalness: 0.2
  });
  const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
  building.position.set(0, height / 2, 0);
  building.castShadow = true;
  building.receiveShadow = true;
  buildingGroup.add(building);
  
  // Roof (simple triangular prism)
  const roofHeight = 2;
  const roofGeometry = new THREE.BufferGeometry();
  
  const vertices = new Float32Array([
    // Front triangle
    -width/2, height, -depth/2,
    width/2, height, -depth/2,
    0, height + roofHeight, -depth/2,
    
    // Back triangle
    -width/2, height, depth/2,
    width/2, height, depth/2,
    0, height + roofHeight, depth/2,
    
    // Left side
    -width/2, height, -depth/2,
    -width/2, height, depth/2,
    0, height + roofHeight, -depth/2,
    0, height + roofHeight, depth/2,
    
    // Right side
    width/2, height, -depth/2,
    width/2, height, depth/2,
    0, height + roofHeight, -depth/2,
    0, height + roofHeight, depth/2
  ]);
  
  const indices = [
    // Front triangle
    0, 1, 2,
    
    // Back triangle
    3, 5, 4,
    
    // Left side
    6, 8, 7,
    7, 8, 9,
    
    // Right side
    10, 11, 12,
    11, 13, 12
  ];
  
  roofGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  roofGeometry.setIndex(indices);
  roofGeometry.computeVertexNormals();
  
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x8B4513, // Dark brown
    roughness: 0.9,
    metalness: 0.1
  });
  
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.castShadow = true;
  buildingGroup.add(roof);
  
  // Door
  const doorWidth = 1.5;
  const doorHeight = 3;
  const doorGeometry = new THREE.PlaneGeometry(doorWidth, doorHeight);
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0x4d2600, // Dark brown
    roughness: 0.8,
    metalness: 0.2
  });
  const door = new THREE.Mesh(doorGeometry, doorMaterial);
  door.position.set(0, doorHeight / 2, depth / 2 + 0.01);
  buildingGroup.add(door);
  
  // Windows (1-3 random windows)
  const windowCount = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < windowCount; i++) {
    const windowWidth = 1;
    const windowHeight = 1;
    const windowGeometry = new THREE.PlaneGeometry(windowWidth, windowHeight);
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0xECF0F1, // White-ish
      roughness: 0.4,
      metalness: 0.6
    });
    const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);
    
    // Position windows randomly on the front face
    let wxPos = -width / 3 + i * width / 3;
    if (windowCount === 1) wxPos = 0;
    
    windowMesh.position.set(
      wxPos,
      height / 2 + 0.5,
      depth / 2 + 0.01
    );
    buildingGroup.add(windowMesh);
  }
  
  // Position the whole building
  buildingGroup.position.set(x, y, z);
  
  // Rotate the building to face the street
  if (x < 0) {
    buildingGroup.rotation.y = Math.PI / 2;
  } else {
    buildingGroup.rotation.y = -Math.PI / 2;
  }
  
  scene.add(buildingGroup);
}

/**
 * Updates the FPS counter and handles animation
 * @param {THREE.WebGLRenderer} renderer - The renderer.
 * @param {THREE.Camera} camera - The camera.
 * @param {number} deltaTime - Time since last frame in seconds.
 */
export function updateFPS(renderer, camera, deltaTime) {
  // Rotate the sky part of the skybox
  if (skyMesh) {
    skyMesh.rotation.y += SKYBOX_ROTATION_SPEED * deltaTime * 1000; // Convert to milliseconds
  }
  
  // Update tumbleweeds if manager exists
  if (tumbleweedManager) {
    tumbleweedManager.update(deltaTime);
  }
  
  // Update FPS counter
  const fpsCounter = document.getElementById('fps-counter');
  if (fpsCounter && deltaTime > 0) {
    const fps = Math.round(1 / deltaTime);
    fpsCounter.textContent = `FPS: ${fps}`;
  }
}

/**
 * Creates desert terrain around the town
 */
function createDesertTerrain() {
  // Create desert terrain after town dimensions are set
  if (window.townDimensions) {
    console.log("Creating desert terrain around town...");
    const desertTerrain = new DesertTerrain(scene, window.townDimensions);
    desertTerrain.generate();
    
    // Store terrain instance for potential access later
    window.desertTerrain = desertTerrain;
    
    // Initialize tumbleweed manager after terrain is created
    initializeTumbleweedManager();
  } else {
    // If town dimensions aren't available yet, wait for them
    console.log("Waiting for town dimensions before creating desert terrain...");
    const checkInterval = setInterval(() => {
      if (window.townDimensions) {
        console.log("Town dimensions available, creating desert terrain...");
        const desertTerrain = new DesertTerrain(scene, window.townDimensions);
        desertTerrain.generate();
        
        // Store terrain instance for potential access later
        window.desertTerrain = desertTerrain;
        
        // Initialize tumbleweed manager after terrain is created
        initializeTumbleweedManager();
        
        clearInterval(checkInterval);
      }
    }, 100);
  }
}

/**
 * Initializes the tumbleweed manager
 */
function initializeTumbleweedManager() {
  if (window.townDimensions) {
    console.log("Initializing tumbleweed manager...");
    tumbleweedManager = new TumbleweedManager(scene, window.townDimensions);
    
    // Store manager instance for potential access later
    window.tumbleweedManager = tumbleweedManager;
  }
}