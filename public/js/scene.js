// /public/js/scene.js
export let scene;
import { DesertTerrain } from './desertTerrain.js';
import { TumbleweedManager } from './tumbleweed.js';
import { GrassSystem } from './grassSystem.js';
import { DustParticleEffect } from './dustParticleEffect.js';
import { SmokeRingEffect } from './smokeRingEffect.js';

// Adding skybox references for animation
let skyMesh;
let groundMesh;
const SKYBOX_ROTATION_SPEED = 0; // Set to 0 to disable rotation

// Add tumbleweed manager
let tumbleweedManager;

// Add grass system
let grassSystem;

// Add train animation components
let train;
let trainPath;
let trainProgress = 0;
// Time-based train tracking
let trainStartTime = 0; // Global reference time when train started
let trainCycleTime = 0; // Time in ms for a full one-way trip
let trainSpeed = 0.0003; // Speed received from server
let trainTrackLength = 2000; // Track length (matching server)
let trainDirection = 1; // Current direction

// Position the track along Z axis
const TRAIN_TRACK_START = new THREE.Vector3(0, 0, -1000);
const TRAIN_TRACK_END = new THREE.Vector3(0, 0, 1000);

// Flag to control if train has been initialized from server
let trainInitialized = false;
let trainLogMessages = true; // Control train update logs

// Make train track endpoints globally available for terrain system
window.TRAIN_TRACK_START = TRAIN_TRACK_START;
window.TRAIN_TRACK_END = TRAIN_TRACK_END;

// Add texture state tracking
const texturesLoaded = {
  skyLoaded: false,
  groundLoaded: false,
  skyAttempts: 0,
  groundAttempts: 0
};

// Track FPS updates
let fpsUpdateCounter = 0;

// Initialize global variables
let camera, renderer, clock, gui;
let trainSmokeEmitter;
let dustParticleEffect;

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
  
  // Preload textures before creating skybox
  THREE.Cache.enabled = true;
  // Start loading skybox immediately
  preloadSkyboxTextures(() => {
    // Load the two skybox parts after preloading
    loadTwoPartSkybox();
  });
  
  // Remove scene fog entirely
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    10000  // Increased from 1000 to handle new skyboxRadius of 2500
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
  
  // Create curved train track and load train
  createTrainSystem();
  loadHorseModel();

  // Initialize effects
  initEffects();

  return { camera, renderer };
}

/**
 * Preloads skybox textures to ensure they're in memory
 * @param {Function} callback - Function to call when preloading is complete
 */
function preloadSkyboxTextures(callback) {
  const textureLoader = new THREE.TextureLoader();
  
  // Add cache-busting query parameter
  const timestamp = Date.now();
  const skyUrl = `models/skypart.png?t=${timestamp}`;
  
  // Preload the sky texture
  textureLoader.load(
    skyUrl,
    () => {
      console.log("Sky texture preloaded successfully");
      callback();
    },
    undefined,
    () => {
      console.warn("Sky texture preload failed, continuing anyway");
      callback();
    }
  );
}

/**
 * Loads the two-part skybox with separate ground and animated sky
 */
function loadTwoPartSkybox() {
  console.log("Setting up skybox with equirectangular sky only");
  
  const textureLoader = new THREE.TextureLoader();
  const skyboxRadius = 2500; // Significantly increased from original 900
  
  // Add cache-busting query parameter
  const timestamp = Date.now();
  
  // Load the sky part for the scene background
  const skyUrl = `models/skypart.png?t=${timestamp}`;
  textureLoader.load(
    skyUrl,
    function(skyTexture) {
      console.log("Sky texture loaded for scene background");
      
      // Store the texture for rotation
      window.skyTexture = skyTexture;
      
      // Set the texture mapping type appropriate for equirectangular panoramas
      skyTexture.mapping = THREE.EquirectangularReflectionMapping;
      
      // Set the scene background to this texture
      scene.background = skyTexture;
      
      // Track that we've loaded the sky
      texturesLoaded.skyLoaded = true;
    },
    // Progress callback
    function(xhr) {
      if (xhr.lengthComputable) {
        const percentage = Math.round((xhr.loaded / xhr.total) * 100);
        if (percentage === 25 || percentage === 50 || percentage === 75 || percentage === 100) {
          console.log(`Loading sky texture: ${percentage}%`);
        }
      }
    },
    // Error callback - if all fails, just use a color
    function(error) {
      console.error("Failed to load sky texture for background:", error);
      scene.background = new THREE.Color(0x87CEEB); // Sky blue
      texturesLoaded.skyLoaded = true;
    }
  );
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
 * Creates a curved train track (half-circle) around the town area
 */
function createTrainSystem() {
  // Create a half-circle path around the town 
  const numPoints = 50; // More points for a smooth curve
  const points = [];
  const trackElevation = 0.5; // Slightly elevated above ground

  // Use town dimensions to calculate the radius 
  // Add buffer to ensure the track is outside the town
  const townRadius = Math.max(window.townDimensions.width, window.townDimensions.length) / 2;
  const trackRadius = townRadius + 150; // 150 units away from the edge of town
  
  // Create half circle arc points
  for (let i = 0; i < numPoints; i++) {
    // Generate points for half-circle (180 degrees, from -90 to 90 degrees)
    const angle = (i / (numPoints - 1)) * Math.PI - (Math.PI / 2);
    const x = Math.cos(angle) * trackRadius;
    const z = Math.sin(angle) * trackRadius;
    points.push(new THREE.Vector3(x, trackElevation, z));
  }

  // Create spline from points
  trainPath = new THREE.CatmullRomCurve3(points);
  trainPath.closed = false; // Open path, not a loop

  // Update global track start and end points for other components
  TRAIN_TRACK_START.copy(points[0]);
  TRAIN_TRACK_END.copy(points[points.length - 1]);
  
  // Update window globals for terrain and other systems
  window.TRAIN_TRACK_START = TRAIN_TRACK_START;
  window.TRAIN_TRACK_END = TRAIN_TRACK_END;
  window.trainPath = trainPath; // Make trainPath globally accessible
  
  // Recalculate track length for timing purposes
  trainTrackLength = 0;
  const tempPoints = trainPath.getPoints(200);
  for (let i = 1; i < tempPoints.length; i++) {
    trainTrackLength += tempPoints[i].distanceTo(tempPoints[i-1]);
  }
  
  // Visualize the path with a line - helps with debugging, can be removed later
  const pathGeometry = new THREE.BufferGeometry().setFromPoints(trainPath.getPoints(200));
  const pathMaterial = new THREE.LineBasicMaterial({ color: 0x888888 });
  const pathLine = new THREE.Line(pathGeometry, pathMaterial);
  scene.add(pathLine);
  
  // Load train model
  const loader = new THREE.GLTFLoader();
  loader.load(
    'models/train.glb',
    (gltf) => {
      train = gltf.scene;
      
      // Store train wagon floor reference for later use
      let trainWagonFloor = null;
      
      train.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
          
          // Check for trainwagonfloor mesh
          if (node.name.toLowerCase() === 'trainwagonfloor') {
            trainWagonFloor = node;
            console.log("Found train wagon floor mesh:", node.name);
            
            // Make the floor collider invisible (like the town colliders)
            if (node.material) {
              // Clone the material to avoid affecting other objects with the same material
              node.material = node.material.clone();
              node.material.transparent = true;
              node.material.opacity = 0.0;
              node.material.color.set(0x00ff00); // Make floor green in debug mode
            }
            
            // Store the floor mesh for later use
            window.trainWagonFloor = node;
            
            // Ensure the floor is initialized correctly
            console.log("Train wagon floor initialized, visible in global scope:", !!window.trainWagonFloor);
            
            // Hide floor mesh by default (will be toggled by debug mode)
            node.visible = false;
          }
        }
      });
      
      // Scale and position the train
      train.scale.set(2, 2, 2);
      
      // Initialize userData for direction tracking
      train.userData = { lastDirection: trainDirection };
      
      // Position based on current progress (either from server sync or default)
      if (trainInitialized) {
        // Calculate position using time-based approach if already initialized
        trainProgress = calculateTrainProgress();
        trainDirection = getCurrentTrainDirection();
        train.userData.lastDirection = trainDirection;
        
        console.log(`Train model loaded - positioning using time-based sync: progress=${trainProgress.toFixed(4)}, direction=${trainDirection}`);
      } else {
        // Initial position at the start of track as default
        trainProgress = 0;
        trainDirection = 1;
        console.log("Train model loaded - using default starting position");
      }
      
      // Position the train
      const position = trainPath.getPointAt(trainProgress);
      train.position.copy(position);
      
      // Set rotation based on direction
      if (trainDirection < 0) {
        // Should be facing TRAIN_TRACK_START from TRAIN_TRACK_END
        const dirVector = new THREE.Vector3().subVectors(TRAIN_TRACK_START, TRAIN_TRACK_END).normalize();
        const target = new THREE.Vector3().copy(train.position).add(dirVector);
        train.lookAt(target);
      } else {
        // Should be facing TRAIN_TRACK_END from TRAIN_TRACK_START
        const dirVector = new THREE.Vector3().subVectors(TRAIN_TRACK_END, TRAIN_TRACK_START).normalize();
        const target = new THREE.Vector3().copy(train.position).add(dirVector);
        train.lookAt(target);
      }
      
      // Add to scene
      scene.add(train);
      
      // Expose train to window
      window.train = train;
      exposeTrainToWindow();
      
      // Create a physics body for the train wagon floor after the train is positioned
      if (trainWagonFloor && window.physics) {
        // Wait a frame to ensure the train is fully positioned
        setTimeout(() => {
          // Get the world geometry of the floor
          const bbox = new THREE.Box3().setFromObject(trainWagonFloor);
          const size = new THREE.Vector3();
          bbox.getSize(size);
          
          const worldPos = new THREE.Vector3();
          trainWagonFloor.getWorldPosition(worldPos);
          
          // Create a physics body for the floor
          const halfExtents = new CANNON.Vec3(size.x/2, size.y/2, size.z/2);
          const shape = new CANNON.Box(halfExtents);
          
          const trainFloorBody = new CANNON.Body({
            mass: 0, // Static for physics purposes, but we'll manually update position
            position: new CANNON.Vec3(worldPos.x, worldPos.y, worldPos.z),
            shape: shape
          });
          
          // Mark this body as a train floor for special handling
          trainFloorBody.isTrainFloor = true;
          trainFloorBody.trainMesh = trainWagonFloor;
          
          // Add to physics world
          window.physics.world.addBody(trainFloorBody);
          window.physics.bodies.push(trainFloorBody);
          
          // Store for convenient access
          window.trainFloorBody = trainFloorBody;
          
          console.log("Created physics body for train wagon floor");
        }, 100);
      } else if (!trainWagonFloor) {
        console.warn("No trainwagonfloor mesh found in the train model!");
      }
      
      console.log('Train model loaded successfully');
    },
    (xhr) => {
      console.log(`Loading train: ${(xhr.loaded / xhr.total) * 100}% loaded`);
    },
    (error) => {
      console.error('Error loading train model:', error);
      
      // Fallback: create a simple train placeholder if model fails to load
      createSimpleTrainPlaceholder();
    }
  );
}

/**
 * Creates a simple placeholder train if the model fails to load
 */
function createSimpleTrainPlaceholder() {
  // Create a simple train placeholder using basic shapes
  const trainGroup = new THREE.Group();
  
  // Create main body
  const trainBody = new THREE.Mesh(
    new THREE.BoxGeometry(5, 2, 2),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );
  trainGroup.add(trainBody);
  
  // Create locomotive top
  const trainTop = new THREE.Mesh(
    new THREE.BoxGeometry(2, 1, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  trainTop.position.set(-1.5, 1.5, 0);
  trainGroup.add(trainTop);
  
  // Create wheels
  const wheelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 16);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
  
  // Front wheels
  const frontWheel1 = new THREE.Mesh(wheelGeometry, wheelMaterial);
  frontWheel1.rotation.z = Math.PI / 2;
  frontWheel1.position.set(-1.5, -1, -1);
  trainGroup.add(frontWheel1);
  
  const frontWheel2 = new THREE.Mesh(wheelGeometry, wheelMaterial);
  frontWheel2.rotation.z = Math.PI / 2;
  frontWheel2.position.set(-1.5, -1, 1);
  trainGroup.add(frontWheel2);
  
  // Back wheels
  const backWheel1 = new THREE.Mesh(wheelGeometry, wheelMaterial);
  backWheel1.rotation.z = Math.PI / 2;
  backWheel1.position.set(1.5, -1, -1);
  trainGroup.add(backWheel1);
  
  const backWheel2 = new THREE.Mesh(wheelGeometry, wheelMaterial);
  backWheel2.rotation.z = Math.PI / 2;
  backWheel2.position.set(1.5, -1, 1);
  trainGroup.add(backWheel2);
  
  // Add chimney
  const chimney = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 1, 8),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  chimney.position.set(-2, 2, 0);
  trainGroup.add(chimney);
  
  // Set up train as the placeholder
  train = trainGroup;
  train.castShadow = true;
  
  // Initialize userData for direction tracking
  train.userData = { lastDirection: trainDirection };
  
  // Position based on current progress (either from server sync or default)
  if (trainInitialized) {
    // Calculate position using time-based approach if already initialized
    trainProgress = calculateTrainProgress();
    trainDirection = getCurrentTrainDirection();
    train.userData.lastDirection = trainDirection;
    
    console.log(`Train placeholder - positioning using time-based sync: progress=${trainProgress.toFixed(4)}, direction=${trainDirection}`);
  } else {
    // Initial position at the start of track as default
    trainProgress = 0;
    trainDirection = 1;
    console.log("Train placeholder - using default starting position");
  }
  
  // Position the train
  const position = trainPath.getPointAt(trainProgress);
  train.position.copy(position);
  
  // Set rotation based on direction
  if (trainDirection < 0) {
    // Should be facing TRAIN_TRACK_START from TRAIN_TRACK_END
    const dirVector = new THREE.Vector3().subVectors(TRAIN_TRACK_START, TRAIN_TRACK_END).normalize();
    const target = new THREE.Vector3().copy(train.position).add(dirVector);
    train.lookAt(target);
  } else {
    // Should be facing TRAIN_TRACK_END from TRAIN_TRACK_START
    const dirVector = new THREE.Vector3().subVectors(TRAIN_TRACK_END, TRAIN_TRACK_START).normalize();
    const target = new THREE.Vector3().copy(train.position).add(dirVector);
    train.lookAt(target);
  }
  
  scene.add(train);
  
  console.log('Using simple train placeholder');
}

/**
 * Calculate train progress (0-1) based on elapsed time since train system started
 * @returns {number} Progress value between 0-1
 */
function calculateTrainProgress() {
  if (!trainInitialized || !trainStartTime || !trainCycleTime) {
    // Fall back to default
    return trainProgress;
  }
  
  const elapsedTime = Date.now() - trainStartTime;
  const cycleCount = Math.floor(elapsedTime / trainCycleTime);
  const timeInCurrentCycle = elapsedTime % trainCycleTime;
  
  // Calculate progress within current cycle (0-1)
  const cycleProgress = timeInCurrentCycle / trainCycleTime;
  
  // If even cycle, progress from 0 to 1 (forward)
  // If odd cycle, progress from 1 to 0 (backward)
  return cycleCount % 2 === 0 ? cycleProgress : 1 - cycleProgress;
}

/**
 * Get current train direction based on elapsed time
 * @returns {number} 1 for forward, -1 for backward
 */
function getCurrentTrainDirection() {
  if (!trainInitialized || !trainStartTime || !trainCycleTime) {
    // Fall back to default
    return trainDirection;
  }
  
  const elapsedTime = Date.now() - trainStartTime;
  const cycleCount = Math.floor(elapsedTime / trainCycleTime);
  // Direction changes every cycle
  return cycleCount % 2 === 0 ? 1 : -1;
}

/**
 * Explicitly expose train-related objects to the window scope
 */
function exposeTrainToWindow() {
  // Make sure train is exposed
  window.train = train;
  
  console.log("Train objects exposed to window:", {
    train: !!window.train,
    trainWagonFloor: !!window.trainWagonFloor,
    trainFloorBody: !!window.trainFloorBody
  });
}

/**
 * Updates the train position along the curved track
 * @param {number} deltaTime - Time since last frame in seconds
 */
export function updateTrain(deltaTime) {
  if (!train) return;
  
  // Store previous position to calculate velocity
  const prevPosition = train.position.clone();
  
  if (trainInitialized) {
    // Time-based train movement - calculate position based on global timer
    trainProgress = calculateTrainProgress();
    trainDirection = getCurrentTrainDirection();
    
    // Get position on the path
    const position = trainPath.getPointAt(trainProgress);
    train.position.copy(position);
    
    // Orient the train to follow the curved path
    const tangent = trainPath.getTangentAt(trainProgress).normalize();
    
    // Make the train face the direction of travel
    if (trainDirection > 0) {
      // Forward direction - directly use the tangent
      const up = new THREE.Vector3(0, 1, 0);
      train.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), // default forward vector
        tangent
      );
    } else {
      // Backward direction - use the opposite tangent
      const reverseTangent = tangent.clone().negate();
      train.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), // default forward vector
        reverseTangent
      );
    }
    
    // Log only if verbose logging is enabled
    if (trainLogMessages && trainProgress % 0.1 < 0.001) {
      console.log(`Train at progress=${trainProgress.toFixed(4)}, direction=${trainDirection}`);
    }
  } else {
    // Original client-side train movement (fallback before server sync)
    trainProgress += 0.0003 * trainDirection * deltaTime * 60;
    
    // Change direction when reaching either end
    if (trainProgress >= 1) {
      // Reached the end, turn around
      trainDirection = -1;
      trainProgress = 1;
    } else if (trainProgress <= 0) {
      // Reached the start, turn around
      trainDirection = 1;
      trainProgress = 0;
    }
    
    // Get position on the path
    const position = trainPath.getPointAt(trainProgress);
    train.position.copy(position);
    
    // Orient the train to follow the curved path
    const tangent = trainPath.getTangentAt(trainProgress).normalize();
    
    // Make the train face the direction of travel
    if (trainDirection > 0) {
      // Forward direction
      train.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), // default forward vector
        tangent
      );
    } else {
      // Backward direction
      const reverseTangent = tangent.clone().negate();
      train.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), // default forward vector
        reverseTangent
      );
    }
  }
  
  // Update train velocity based on position change
  const newPosition = train.position;
  const velocity = new THREE.Vector3().subVectors(newPosition, prevPosition).divideScalar(deltaTime);
  
  // Store velocity for use with players
  train.userData.velocity = velocity;
  
  // Update the train floor physics body if it exists
  if (window.trainFloorBody && window.trainWagonFloor) {
    // Get world position and rotation of the wagon floor mesh
    const worldPos = new THREE.Vector3();
    window.trainWagonFloor.getWorldPosition(worldPos);
    
    // Update physics body position
    window.trainFloorBody.position.copy(worldPos);
    
    // Get the world quaternion of the floor
    const worldQuat = new THREE.Quaternion();
    window.trainWagonFloor.getWorldQuaternion(worldQuat);
    
    // Update physics body rotation
    window.trainFloorBody.quaternion.set(
      worldQuat.x,
      worldQuat.y,
      worldQuat.z,
      worldQuat.w
    );
    
    // Store velocity in the floor body
    window.trainFloorBody.trainVelocity = new CANNON.Vec3(
      velocity.x,
      velocity.y,
      velocity.z
    );
  }
  
  // Periodically ensure train objects are exposed to window
  if (Math.random() < 0.01) { // About every 100 frames
    exposeTrainToWindow();
  }
  
  // Update horse positions and animations if loaded
  if (window.horses && window.horses.length > 0 && train) {
    // Update animation mixers
    if (window.horseMixers) {
      window.horseMixers.forEach(mixer => {
        mixer.update(deltaTime);
      });
    }
    
    // Current time for gallop animation
    const currentTime = Date.now() / 1000;
    
    // Position the horses next to the train wagon floor
    if (window.trainWagonFloor) {
      // Get train floor position
      const worldPos = new THREE.Vector3();
      window.trainWagonFloor.getWorldPosition(worldPos);
      
      // Get train rotation
      const worldQuat = new THREE.Quaternion();
      train.getWorldQuaternion(worldQuat);
      
      // Update each horse with an offset
      window.horses.forEach((horse, index) => {
        // Base offset from train
        const baseOffset = new THREE.Vector3(6, 0, 2);
        
        // Use the stored random offsets for natural positioning
        const randomX = horse.userData.randomOffsetX || 0;
        const randomZ = horse.userData.randomOffsetZ || 0;
        const randomY = horse.userData.randomOffsetY || 0;
        
        // Calculate galloping bounce using sine wave with realistic easing
        const phase = horse.userData.gallopPhase || 0;
        const frequency = horse.userData.gallopFrequency || 15; 
        const amplitude = horse.userData.gallopAmplitude || 0.08;
        
        // Create realistic horse gallop motion with easing
        // Horses have quick upward movement and slower downward movement
        let wave = Math.sin(currentTime * frequency + phase);
        
        // Add easing: sharper rise, slower fall
        // When wave is positive (rising), make it more pronounced
        // When wave is negative (falling), make it more gradual
        if (wave > 0) {
            // Fast rise (make positive values more pronounced)
            wave = Math.pow(wave, 0.7); // Sharper rise with power < 1
        } else {
            // Slow fall (make negative values less pronounced)
            wave = -Math.pow(-wave, 1.3); // More gradual fall with power > 1
        }
        
        const gallopBounce = wave * amplitude;
        
        // Create the final offset using primarily the pre-calculated random offsets
        const offsetDirection = new THREE.Vector3(
          baseOffset.x + randomX, 
          baseOffset.y + randomY + gallopBounce, 
          baseOffset.z + randomZ
        );
        
        // Apply train's rotation to the offset vector
        offsetDirection.applyQuaternion(worldQuat);
        
        // Apply the offset to position the horse
        horse.position.copy(worldPos).add(offsetDirection);
        
        // Match the train's rotation directly (no additional rotation)
        horse.quaternion.copy(train.quaternion);
      });
    } else {
      // Fallback: If trainWagonFloor isn't available
      window.horses.forEach((horse, index) => {
        // Base position
        horse.position.copy(train.position);
        
        // Use the stored random offsets for natural positioning
        const randomX = horse.userData.randomOffsetX || 0;
        const randomZ = horse.userData.randomOffsetZ || 0;
        const randomY = horse.userData.randomOffsetY || 0;
        
        // Calculate galloping bounce using sine wave with realistic easing
        const phase = horse.userData.gallopPhase || 0;
        const frequency = horse.userData.gallopFrequency || 15; 
        const amplitude = horse.userData.gallopAmplitude || 0.08;
        
        // Create realistic horse gallop motion with easing
        // Horses have quick upward movement and slower downward movement
        let wave = Math.sin(currentTime * frequency + phase);
        
        // Add easing: sharper rise, slower fall
        // When wave is positive (rising), make it more pronounced
        // When wave is negative (falling), make it more gradual
        if (wave > 0) {
            // Fast rise (make positive values more pronounced)
            wave = Math.pow(wave, 0.7); // Sharper rise with power < 1
        } else {
            // Slow fall (make negative values less pronounced)
            wave = -Math.pow(-wave, 1.3); // More gradual fall with power > 1
        }
        
        const gallopBounce = wave * amplitude;
        
        // Apply offsets to position the horse
        horse.position.x += 6 + randomX;  // Base offset from train + random variation
        horse.position.z += 2 + randomZ;  // Base offset from train + random variation
        horse.position.y += randomY + gallopBounce;  // Height variation + gallop bounce
        
        // Match the train's rotation directly
        horse.quaternion.copy(train.quaternion);
      });
    }
    
    // Update dust particle effect if initialized
    if (dustParticleEffect) {
      dustParticleEffect.update(deltaTime);
    }
  }
}

/**
 * Sets train state from server's initial data
 * @param {Object} data - Train initialization data from server
 */
export function setTrainInitialState(data) {
  console.log('Received initial train state:', data);
  
  if (!data || typeof data.startTime !== 'number' || typeof data.cycleTime !== 'number') {
    console.error("Invalid train initialization data:", data);
    return;
  }
  
  // Store time-based tracking values
  trainStartTime = data.startTime;
  trainCycleTime = data.cycleTime;
  trainSpeed = data.speed || 0.0003;
  trainTrackLength = data.trackLength || 2000;
  
  // Calculate current position
  trainProgress = calculateTrainProgress();
  trainDirection = getCurrentTrainDirection();
  
  console.log(`Train synchronized: startTime=${trainStartTime}, progress=${trainProgress.toFixed(4)}, direction=${trainDirection}`);
  
  // Update train position if it exists
  if (train) {
    // Store the direction in the train object for rotation tracking
    if (!train.userData) train.userData = {};
    train.userData.lastDirection = trainDirection;
    
    // Update train position
    const position = trainPath.getPointAt(trainProgress);
    train.position.copy(position);
    
    // Set initial rotation
    if (trainDirection < 0) {
      // Should be facing TRAIN_TRACK_START from TRAIN_TRACK_END
      const dirVector = new THREE.Vector3().subVectors(TRAIN_TRACK_START, TRAIN_TRACK_END).normalize();
      const target = new THREE.Vector3().copy(train.position).add(dirVector);
      train.lookAt(target);
    } else {
      // Should be facing TRAIN_TRACK_END from TRAIN_TRACK_START
      const dirVector = new THREE.Vector3().subVectors(TRAIN_TRACK_END, TRAIN_TRACK_START).normalize();
      const target = new THREE.Vector3().copy(train.position).add(dirVector);
      train.lookAt(target);
    }
    
    console.log(`Train positioned at progress=${trainProgress.toFixed(4)}`);
  } else {
    console.log("Train model not loaded yet, will position when available");
  }
  
  trainInitialized = true;
  
  // Disable verbose logging after 5 seconds
  setTimeout(() => {
    trainLogMessages = false;
    console.log("Train logging reduced");
  }, 5000);
}

/**
 * Updates train state from server updates
 * @param {Object} data - Train state update from server
 */
export function updateTrainState(data) {
  // Process if we haven't initialized yet
  if (!trainInitialized) {
    console.log("Processing train state as initial");
    setTrainInitialState(data);
  } else if (trainLogMessages) {
    // Only log if verbose logging is enabled
    console.log("Received train update (already initialized)");
  }
}

/**
 * Updates the FPS counter and handles animation
 * @param {THREE.WebGLRenderer} renderer - The renderer.
 * @param {THREE.Camera} camera - The camera.
 * @param {number} deltaTime - Time since last frame in seconds.
 */
export function updateFPS(renderer, camera, deltaTime) {
  // Keep the ground mesh following the camera horizontally if it exists
  if (groundMesh && camera) {
    groundMesh.position.x = camera.position.x;
    groundMesh.position.z = camera.position.z;
    groundMesh.position.y = 20; // Maintain the height offset
  }
  
  // Removed skybox rotation code
  
  // If skybox is missing, try to recover (but only once per second)
  if (!texturesLoaded.skyLoaded && texturesLoaded.skyAttempts < 4) {
    // Only attempt recovery every 60 frames (approximately once per second)
    if (fpsUpdateCounter % 60 === 0) {
      console.warn("Skybox missing in animation loop, attempting recovery");
      loadTwoPartSkybox();
      texturesLoaded.skyAttempts++;
    }
  }
  
  // Update FPS counter if enabled
  if (window.fpsCounterEnabled) {
    fpsUpdateCounter++;
    if (fpsUpdateCounter >= 10) { // Update every 10 frames
      const fps = Math.round(1 / deltaTime);
      const fpsElement = document.getElementById('fps-counter');
      if (fpsElement) {
        fpsElement.textContent = `FPS: ${fps}`;
      }
      fpsUpdateCounter = 0;
    }
  } else {
    // Still increment counter for skybox recovery timing
    fpsUpdateCounter++;
  }
  
  // Update tumbleweed positions if manager exists
  if (tumbleweedManager) {
    tumbleweedManager.update(deltaTime);
  }
  
  // Update grass system if it exists
  if (grassSystem) {
    grassSystem.update(deltaTime, camera.position);
  }
  
  // Update train position
  updateTrain(deltaTime);
  
  // Render the final scene
  renderer.render(scene, camera);
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
    
    // Initialize grass system after terrain is created
    initializeGrassSystem();
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
        
        // Initialize grass system after terrain is created
        initializeGrassSystem();
        
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
    
    // Dispose of the previous manager if it exists
    if (tumbleweedManager) {
      tumbleweedManager.dispose();
    }
    
    tumbleweedManager = new TumbleweedManager(scene, window.townDimensions);
    
    // Store manager instance for potential access later
    window.tumbleweedManager = tumbleweedManager;
  }
}

/**
 * Initializes the grass system
 */
function initializeGrassSystem() {
  // Skip grass initialization on mobile devices for better performance
  if (window.isMobile) {
    console.log("Skipping grass system initialization on mobile device for performance");
    return;
  }

  if (window.renderer && window.renderer.camera) {
    console.log("Initializing grass system...");
    
    // Dispose of the previous system if it exists
    if (grassSystem) {
      grassSystem.dispose();
    }
    
    // Create new grass system
    grassSystem = new GrassSystem(scene, window.renderer.camera);
    
    // Store grass system instance for potential access later
    window.grassSystem = grassSystem;
  } else {
    console.warn("Camera not available, delaying grass system initialization");
    
    // Try again in a moment when the camera should be available
    setTimeout(initializeGrassSystem, 500);
  }
}

/**
 * Cleans up resources when switching scene or closing
 */
export function cleanupScene() {
  console.log("Cleaning up scene resources...");
  
  // Dispose of tumbleweed manager
  if (tumbleweedManager) {
    tumbleweedManager.dispose();
    tumbleweedManager = null;
  }
  
  // Dispose of grass system
  if (grassSystem) {
    grassSystem.dispose();
    grassSystem = null;
  }
  
  // Clean up other resources as needed
}

/**
 * Loads and sets up the horse models that run alongside the train
 */
function loadHorseModel() {
  const loader = new THREE.GLTFLoader();
  
  // Array to store all horse objects
  window.horses = [];
  window.horseMixers = [];
  
  // Horse model files
  const horseModels = [
    'models/horse1.glb',
    'models/horse2.glb'
  ];
  
  // Create 6 horses alternating between the two models
  for (let i = 0; i < 6; i++) {
    // Get model index (0, 1, 0, 1, 0, 1)
    const modelIndex = i % horseModels.length;
    const modelPath = horseModels[modelIndex];
    
    // Store random offsets for consistent positioning with more variation
    // Create zigzag pattern with increased spacing
    const positions = [
      { x: -5.0 + (Math.random() - 0.5) * 3, z: 1.0 + Math.random() * 3.0 },  // 0: front left
      { x: 0.0 + (Math.random() - 0.5) * 3, z: 7.0 + Math.random() * 3.0 },   // 1: middle-back
      { x: 5.0 + (Math.random() - 0.5) * 3, z: 12.0 + Math.random() * 3.0 },  // 2: far back right
      { x: -3.0 + (Math.random() - 0.5) * 3, z: 4.0 + Math.random() * 3.0 },  // 3: middle left
      { x: 4.0 + (Math.random() - 0.5) * 3, z: 3.0 + Math.random() * 3.0 },   // 4: front right
      { x: 1.0 + (Math.random() - 0.5) * 3, z: 9.0 + Math.random() * 3.0 }    // 5: back middle
    ];
    
    // Load the horse model
    loader.load(
      modelPath,
      (gltf) => {
        const horse = gltf.scene;
        
        // Scale and adjust the horse as needed
        horse.scale.set(2, 2, 2);
        
        // Add shadows
        horse.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });
        
        // Store positioning data
        horse.userData = horse.userData || {};
        horse.userData.randomOffsetX = positions[i].x;
        horse.userData.randomOffsetZ = positions[i].z;
        horse.userData.randomOffsetY = (Math.random() - 0.5) * 0.3; // Small height variation
        
        // Add galloping bounce parameters
        horse.userData.gallopPhase = Math.random() * Math.PI * 2; // Random starting phase
        horse.userData.gallopFrequency = 15 + Math.random() * 3; // Faster bounce frequency (15-18 Hz)
        horse.userData.gallopAmplitude = 0.08 + Math.random() * 0.04; // Much smaller bounce height (0.08-0.12)
        
        // Set up animation
        const mixer = new THREE.AnimationMixer(horse);
        const animations = gltf.animations;
        
        // Find and play the "Gallop" animation
        const gallopAnim = animations.find(animation => animation.name === "Gallop");
        if (gallopAnim) {
          const action = mixer.clipAction(gallopAnim);
          
          // Moderate animation speed for more natural galloping
          const speedVariation = 1.1 + Math.random() * 0.2; // 1.1 to 1.3 speed variation
          action.timeScale = speedVariation;
          
          // Store the timeScale in userData for reference
          horse.userData.animationSpeed = speedVariation;
          
          action.play();
          action.setLoop(THREE.LoopRepeat);
        } else {
          console.warn("Gallop animation not found in horse model");
        }
        
        // Find the toe bone for dust effects and attach dust system
        let toeBone = null;
        horse.traverse((node) => {
          // Look for the E_toeR bone
          if (node.isBone && node.name === "E_toeR") {
            toeBone = node;
          }
        });
        
        // Add to scene
        scene.add(horse);
        
        // Store references for animation updates
        window.horses.push(horse);
        window.horseMixers.push(mixer);
        
        // If we found the toe bone and dust effect is initialized, attach dust
        if (toeBone && dustParticleEffect) {
          dustParticleEffect.createForHorse(toeBone, "horse_" + i);
        }
      },
      (xhr) => {
        console.log(`Loading horse model ${modelPath}: ${(xhr.loaded / xhr.total) * 100}% loaded`);
      },
      (error) => {
        console.error(`Error loading horse model ${modelPath}:`, error);
      }
    );
  }
  
  console.log('Horse models loading initiated');
}

/**
 * Initialize visual effects systems
 */
function initEffects() {
  // Initialize smoke ring effect for guns (preload to avoid stuttering)
  window.smokeRingEffect = new SmokeRingEffect(scene).preload();
  
  // Initialize dust particle effect for horses
  dustParticleEffect = new DustParticleEffect(scene).preload();
}