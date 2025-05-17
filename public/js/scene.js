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
  const trackElevation = 1.5; // Increased from 0.5 to 1.5 to raise the track

  // Use town dimensions to calculate the radius 
  // Add buffer to ensure the track is outside the town
  const townRadius = Math.max(window.townDimensions.width, window.townDimensions.length) / 2;
  const trackRadius = townRadius + 200; // Increased from 150 to 280 units away from the edge of town
  
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
  
  // Create realistic railroad tracks instead of simple line
  createRealisticRailroadTracks(trainPath);
  
  // Load train model
  const loader = new THREE.GLTFLoader();
  loader.load(
    'models/train.glb',
    (gltf) => {
      train = gltf.scene;
      
      // Store train wagon floor reference for later use
      let trainWagonFloor = null;
      // Store train smoke spawn reference for smoke effect
      let trainSmokeSpawn = null;
      
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
          
          // Check for trainsmokespawn mesh
          if (node.name.toLowerCase() === 'trainsmokespawn') {
            trainSmokeSpawn = node;
            console.log("Found train smoke spawn point:", node.name);
            
            // Store the spawn point for later use
            window.trainSmokeSpawn = node;
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
      
      // Add train smoke effect if we found the smoke spawn point and the dust effect is initialized
      if (trainSmokeSpawn && dustParticleEffect) {
        dustParticleEffect.createForTrainSmoke(trainSmokeSpawn, "train_smoke");
        console.log("Train smoke effect initialized");
      } else if (!trainSmokeSpawn) {
        console.warn("No trainsmokespawn mesh found in the train model!");
      }
      
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
          
          // Modified collider dimensions - longer but narrower
          const lengthMultiplier = 4.5; // Extend length (z-axis)
          const widthMultiplier = 2; // Reduce width (x-axis)
          
          // Create a modified physics body for the floor
          const halfExtents = new CANNON.Vec3(
            size.x/2 * widthMultiplier, 
            size.y/2,  // Keep height the same
            size.z/2 * lengthMultiplier // Make longer
          );
          const shape = new CANNON.Box(halfExtents);
          
          // Calculate offset to shift collider toward the back of the train
          // Direction vector depends on train's current direction
          const trainDir = train.userData.lastDirection || 1;
          const backwardOffset = trainDir * (size.z * (lengthMultiplier - 1) / 3);
          
          // Create quaternion from train's rotation to determine "back" direction
          const trainQuat = new THREE.Quaternion();
          train.getWorldQuaternion(trainQuat);
          
          // Calculate offset direction based on train's rotation
          const offsetDir = new THREE.Vector3(0, 0, backwardOffset);
          offsetDir.applyQuaternion(trainQuat);
          
          // Apply offset to position
          const offsetPos = worldPos.clone().add(offsetDir);
          
          const trainFloorBody = new CANNON.Body({
            mass: 0, // Static for physics purposes, but we'll manually update position
            position: new CANNON.Vec3(offsetPos.x, worldPos.y, offsetPos.z),
            shape: shape
          });
          
          // Mark this body as a train floor for special handling
          trainFloorBody.isTrainFloor = true;
          trainFloorBody.trainMesh = trainWagonFloor;
          trainFloorBody.offsetVector = offsetDir.clone(); // Store offset for updates
          
          // Add to physics world
          window.physics.world.addBody(trainFloorBody);
          window.physics.bodies.push(trainFloorBody);
          
          // Store for convenient access
          window.trainFloorBody = trainFloorBody;
          
          console.log("Created modified physics body for train wagon floor", {
            originalSize: {x: size.x, y: size.y, z: size.z},
            modifiedSize: {
              x: size.x * widthMultiplier, 
              y: size.y, 
              z: size.z * lengthMultiplier
            },
            offset: offsetDir
          });
        }, 100);
      } else if (!trainWagonFloor) {
        console.warn("No trainwagonfloor mesh found in the train model!");
      }
      
      console.log('Train model loaded successfully');
    },
    undefined,
    (error) => {
      console.error('Error loading train model:', error);
      // Create simple placeholder if loading fails
      createSimpleTrainPlaceholder();
    }
  );
}

/**
 * Creates realistic railroad tracks with parallel rails and wooden ties
 * @param {THREE.CatmullRomCurve3} path - The spline path for the tracks
 */
function createRealisticRailroadTracks(path) {
  // Number of points to sample along the path
  const numSamples = 300;
  const pathPoints = path.getPoints(numSamples);
  
  // Track dimensions
  const RAIL_HEIGHT = 0.15;      // Height of the rail
  const RAIL_HEAD_WIDTH = 0.2;   // Width of rail head (top)
  const RAIL_BASE_WIDTH = 0.25;  // Width of rail base (bottom)
  const RAIL_WEB_WIDTH = 0.08;   // Width of rail web (middle)
  const TRACK_GAUGE = 1.8;       // Distance between rails
  const TIE_WIDTH = 3.0;         // Width of wooden ties
  const TIE_HEIGHT = 0.2;        // Height of wooden ties
  const TIE_DEPTH = 0.5;         // Depth (length) of wooden ties
  const TIE_SPACING = 2.0;       // Distance between ties
  
  // Create materials
  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0x707070,             // Grey metallic color
    metalness: 0.9,
    roughness: 0.3,
    envMapIntensity: 1.0
  });
  
  const tieMaterial = new THREE.MeshStandardMaterial({
    color: 0x3d2817,             // Dark brown for wooden ties
    metalness: 0.0,
    roughness: 0.9,
    bumpScale: 0.02
  });
  
  // Create track group to hold all elements
  const trackGroup = new THREE.Group();
  
  // Calculate the total track length
  let totalTrackLength = 0;
  for (let i = 1; i < pathPoints.length; i++) {
    totalTrackLength += pathPoints[i].distanceTo(pathPoints[i-1]);
  }
  
  // Pre-calculate number of ties based on total length and spacing
  const estimatedTieCount = Math.floor(totalTrackLength / TIE_SPACING) + 1;
  
  // Create a more detailed tie geometry with beveled edges
  const tieGeometry = createBeveledTieGeometry(TIE_WIDTH, TIE_HEIGHT, TIE_DEPTH, 0.03);
  const tieMesh = new THREE.InstancedMesh(tieGeometry, tieMaterial, estimatedTieCount);
  
  // For dummy matrix storage
  const dummyMatrix = new THREE.Matrix4();
  
  // Track tie count for the instanced mesh
  let tieIndex = 0;
  
  // Create rails along the path
  let accumulatedDistance = 0;
  let nextTieDistance = 0;
  
  // Create a proper rail cross-section by extruding an I-beam shape
  const railGeometry = createRailProfileGeometry(RAIL_HEIGHT, RAIL_HEAD_WIDTH, RAIL_BASE_WIDTH, RAIL_WEB_WIDTH, 1);
  
  // Estimate number of rail segments needed
  const estimatedRailSegments = numSamples - 1;
  const leftRailMesh = new THREE.InstancedMesh(railGeometry, railMaterial, estimatedRailSegments);
  const rightRailMesh = new THREE.InstancedMesh(railGeometry, railMaterial, estimatedRailSegments);
  
  // Track rail segment count
  let railIndex = 0;
  
  for (let i = 1; i < pathPoints.length; i++) {
    const p1 = pathPoints[i-1];
    const p2 = pathPoints[i];
    
    // Calculate segment length
    const segmentLength = p1.distanceTo(p2);
    
    // Calculate t values for this segment within overall path
    const t1 = path.getUtoTmapping(accumulatedDistance / totalTrackLength);
    const t2 = path.getUtoTmapping((accumulatedDistance + segmentLength) / totalTrackLength);
    
    // Get exact tangent at the midpoint of this segment
    const segmentT = (t1 + t2) / 2;
    const exactDir = path.getTangentAt(segmentT).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const exactPerp = new THREE.Vector3().crossVectors(exactDir, up).normalize();
    
    // Create midpoint for segment
    const midpoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    
    // Create transformation matrix for rail segments
    // Scale the rail segments to the correct length
    const railMatrix = new THREE.Matrix4().makeBasis(
      exactPerp.clone().cross(exactDir),  // X perpendicular to track
      up,                                 // Y up
      exactDir                           // Z along track
    );
    
    // Apply scaling to the segment length
    const scaleMatrix = new THREE.Matrix4().makeScale(1, 1, segmentLength);
    railMatrix.multiply(scaleMatrix);
    
    // Position the left rail
    const leftRailPos = midpoint.clone().addScaledVector(exactPerp, TRACK_GAUGE / 2);
    leftRailPos.y += RAIL_HEIGHT * 0.5 + 3.0; // Added 1.0 to raise rails above embankment
    const leftMatrix = railMatrix.clone();
    leftMatrix.setPosition(leftRailPos);
    leftRailMesh.setMatrixAt(railIndex, leftMatrix);
    
    // Position the right rail
    const rightRailPos = midpoint.clone().addScaledVector(exactPerp, -TRACK_GAUGE / 2);
    rightRailPos.y += RAIL_HEIGHT * 0.5 + 3.0; // Added 1.0 to raise rails above embankment
    const rightMatrix = railMatrix.clone();
    rightMatrix.setPosition(rightRailPos);
    rightRailMesh.setMatrixAt(railIndex, rightMatrix);
    
    // Increment rail segment index
    railIndex++;
    
    // Add wooden ties at regular intervals
    accumulatedDistance += segmentLength;
    
    // Place ties at regular intervals
    while (accumulatedDistance >= nextTieDistance) {
      // Only continue if we haven't exceeded our pre-allocated tie count
      if (tieIndex >= estimatedTieCount) break;
      
      // Calculate position along the path for this tie
      const t = (nextTieDistance - (accumulatedDistance - segmentLength)) / segmentLength;
      const tiePosition = new THREE.Vector3().lerpVectors(p1, p2, t);
      
      // At this precise position on the curve, calculate the tangent
      // This ensures ties are always perpendicular to the exact point on the curve
      const tieTValue = path.getUtoTmapping(nextTieDistance / totalTrackLength);
      const exactTieDir = path.getTangentAt(tieTValue).normalize();
      
      // Recalculate perpendicular to ensure it's exactly perpendicular to the curve at this point
      const exactTiePerp = new THREE.Vector3().crossVectors(exactTieDir, up).normalize();
      
      // Create transformation matrix for this tie
      // X along perpendicular (across track), Y up, Z along track
      const tieMatrix = new THREE.Matrix4().makeBasis(
        exactTiePerp,    // X axis perpendicular to track direction
        up,              // Y axis pointing up
        exactTieDir      // Z axis along exact track direction
      );
      
      // Position slightly below the rail's bottom for correct alignment
      tiePosition.y += 2.8; // Increased from -0.02 to 0.8 to position ties above embankment
      
      // Set position
      tieMatrix.setPosition(tiePosition);
      
      // Set matrix for this instance
      tieMesh.setMatrixAt(tieIndex, tieMatrix);
      
      // Increment tie index and set next tie distance
      tieIndex++;
      nextTieDistance += TIE_SPACING;
    }
  }
  
  // Update the instance matrices
  leftRailMesh.count = railIndex;
  leftRailMesh.instanceMatrix.needsUpdate = true;
  
  rightRailMesh.count = railIndex;
  rightRailMesh.instanceMatrix.needsUpdate = true;
  
  tieMesh.count = tieIndex;
  tieMesh.instanceMatrix.needsUpdate = true;
  
  // Set shadows for all meshes
  leftRailMesh.castShadow = true;
  leftRailMesh.receiveShadow = true;
  rightRailMesh.castShadow = true;
  rightRailMesh.receiveShadow = true;
  tieMesh.castShadow = true;
  tieMesh.receiveShadow = true;
  
  // Add everything to track group
  trackGroup.add(leftRailMesh);
  trackGroup.add(rightRailMesh);
  trackGroup.add(tieMesh);
  
  // Add the entire track to the scene
  scene.add(trackGroup);
  
  console.log(`Created railroad track with ${railIndex} rail segments and ${tieIndex} ties.`);
}

/**
 * Creates a proper railway rail profile using extrusion
 * @param {number} height - Total height of the rail
 * @param {number} headWidth - Width of the top of the rail
 * @param {number} baseWidth - Width of the bottom of the rail
 * @param {number} webWidth - Width of the middle section of the rail
 * @param {number} length - Length of the rail segment
 * @returns {THREE.BufferGeometry} The rail geometry
 */
function createRailProfileGeometry(height, headWidth, baseWidth, webWidth, length) {
  // Create the rail profile shape (I-beam cross-section)
  // For a flat-lying rail, we'll define the profile in the XY plane
  // so that when extruded along Z, it will be oriented correctly
  const railShape = new THREE.Shape();
  
  // Calculate dimensions
  const headHeight = height * 0.2; // Top 20% for the head
  const baseHeight = height * 0.15; // Bottom 15% for the base
  const webHeight = height - headHeight - baseHeight; // Middle section
  
  // Draw the profile on its side, so it will lie flat when extruded
  // Start from left edge of base
  railShape.moveTo(0, -baseWidth/2);
  
  // Draw base (bottom part)
  railShape.lineTo(0, baseWidth/2);
  railShape.lineTo(baseHeight, baseWidth/2);
  
  // Draw web connection to base
  railShape.lineTo(baseHeight, webWidth/2);
  
  // Draw web (middle part)
  railShape.lineTo(baseHeight + webHeight, webWidth/2);
  
  // Draw head (top part)
  railShape.lineTo(baseHeight + webHeight, headWidth/2);
  railShape.lineTo(height, headWidth/2);
  railShape.lineTo(height, -headWidth/2);
  railShape.lineTo(baseHeight + webHeight, -headWidth/2);
  
  // Draw web (middle part, other side)
  railShape.lineTo(baseHeight + webHeight, -webWidth/2);
  
  // Draw web connection to base (other side)
  railShape.lineTo(baseHeight, -webWidth/2);
  
  // Close the shape
  railShape.lineTo(baseHeight, -baseWidth/2);
  railShape.lineTo(0, -baseWidth/2);
  
  // Extrude settings
  const extrudeSettings = {
    steps: 1,
    depth: length,
    bevelEnabled: false
  };
  
  // Create the extruded geometry
  const geometry = new THREE.ExtrudeGeometry(railShape, extrudeSettings);
  
  // Center the geometry around origin
  geometry.translate(-height/2, 0, -length/2);
  
  return geometry;
}

/**
 * Creates a beveled wooden tie geometry
 * @param {number} width - Width of the tie (across track)
 * @param {number} height - Height of the tie
 * @param {number} depth - Depth of the tie (along track)
 * @param {number} bevelSize - Size of the beveled edge
 * @returns {THREE.BufferGeometry} The tie geometry
 */
function createBeveledTieGeometry(width, height, depth, bevelSize) {
  // Create a box with beveled edges
  const geometry = new THREE.BoxGeometry(width, height, depth);
  
  // Get vertices and faces
  geometry.computeVertexNormals();
  
  // Add subtle randomness to vertices to make it look more like wood
  const positionAttribute = geometry.getAttribute('position');
  const positions = positionAttribute.array;
  
  // Add random displacement to vertices except at the top face
  // This makes it look like rough-hewn wood
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    
    // Don't modify top face points (where y == height/2)
    if (Math.abs(y - height/2) > 0.001) {
      // Add small random displacements
      positions[i] += (Math.random() - 0.5) * 0.03;     // x
      positions[i + 2] += (Math.random() - 0.5) * 0.03; // z
      
      // Only modify y for side faces slightly
      if (Math.abs(y) !== height/2) {
        positions[i + 1] += (Math.random() - 0.5) * 0.01; // y (less displacement)
      }
    }
  }
  
  // Update position attribute
  positionAttribute.needsUpdate = true;
  
  // Add bevel using Bevel modifier (simulation)
  // In Three.js we don't have direct bevel modifiers, 
  // so we simulate by applying subdivision and then scaling inward at the edges
  
  // Use BufferGeometryUtils to create subdivided geometry
  const subdivided = new THREE.BufferGeometry().copy(geometry);
  
  // Apply slight rounding to top edges
  const edgeVertices = [];
  const topY = height/2 - 0.001; // Just below the exact top
  
  // Mark vertices near the top edges
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    if (y > topY) {
      const x = positions[i];
      const z = positions[i + 2];
      
      // Check if at edge (within bevelSize of the edge)
      const xEdge = Math.abs(Math.abs(x) - width/2) < bevelSize;
      const zEdge = Math.abs(Math.abs(z) - depth/2) < bevelSize;
      
      if (xEdge || zEdge) {
        // Push inward slightly
        if (xEdge) {
          positions[i] *= 0.97; // Scale x towards center
        }
        if (zEdge) {
          positions[i + 2] *= 0.97; // Scale z towards center
        }
        
        // Lower slightly
        positions[i + 1] -= bevelSize * 0.7;
      }
    }
  }
  
  // Update position attribute
  positionAttribute.needsUpdate = true;
  
  return geometry;
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
  // Always go from right to left (1 to 0)
  let cycleProgress = timeInCurrentCycle / trainCycleTime;
  
  // If progress reaches 1, reset to 0 (right side)
  if (cycleProgress >= 1) {
    cycleProgress = 0;
  }
  
  // Return 1 - progress to go from right (1) to left (0)
  return 1 - cycleProgress;
}

/**
 * Get current train direction based on elapsed time
 * @returns {number} 1 for forward, -1 for backward
 */
function getCurrentTrainDirection() {
  // Always return -1 (right to left direction)
  return -1;
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
    // Check if we need to add railway embankment now that train is initialized
    if (window.desertTerrain && window.trainPath && !window.embankmentInitialized) {
      console.log("Train is initialized, adding railway embankment...");
      window.desertTerrain.addRailwayEmbankment();
      window.embankmentInitialized = true;
    }
    
    // Time-based train movement - calculate position based on global timer
    trainProgress = calculateTrainProgress();
    trainDirection = getCurrentTrainDirection();
    
    // Get position on the path
    const position = trainPath.getPointAt(trainProgress);
    train.position.copy(position);
    
    // Orient the train to follow the curved path
    const tangent = trainPath.getTangentAt(trainProgress).normalize();
    
    // Make the train face the direction of travel
    // Always use backward direction (right to left)
    const reverseTangent = tangent.clone().negate();
    train.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1), // default forward vector
      reverseTangent
    );
    
    // Log only if verbose logging is enabled
    if (trainLogMessages && trainProgress % 0.1 < 0.001) {
      console.log(`Train at progress=${trainProgress.toFixed(4)}, direction=${trainDirection}`);
    }
  } else {
    // Original client-side train movement (fallback before server sync)
    // Always move from right to left at a constant speed
    trainProgress -= 0.0003 * deltaTime * 60;
    trainDirection = -1;
    
    // If train reaches the end, reset to beginning
    if (trainProgress <= 0) {
      trainProgress = 1;
    }
    
    // Get position on the path
    const position = trainPath.getPointAt(trainProgress);
    train.position.copy(position);
    
    // Orient the train to follow the curved path
    const tangent = trainPath.getTangentAt(trainProgress).normalize();
    
    // Always backward direction (right to left)
    const reverseTangent = tangent.clone().negate();
    train.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1), // default forward vector
      reverseTangent
    );
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
    
    // Get the world quaternion of the floor
    const worldQuat = new THREE.Quaternion();
    window.trainWagonFloor.getWorldQuaternion(worldQuat);
    
    // Apply stored offset if it exists, otherwise use current position
    if (window.trainFloorBody.offsetVector) {
      // Create a fresh copy of the offset vector
      const currentOffset = window.trainFloorBody.offsetVector.clone();
      
      // Make sure the offset stays aligned with the train's current rotation
      // This keeps the collider extending in the right direction as train turns
      const adjustedOffset = currentOffset.clone().applyQuaternion(worldQuat);
      
      // Apply the offset to the position
      const offsetPos = worldPos.clone().add(adjustedOffset);
      
      // Update physics body position with offset
      window.trainFloorBody.position.set(
        offsetPos.x,
        worldPos.y,
        offsetPos.z
      );
    } else {
      // Fallback to original behavior if no offset is stored
      window.trainFloorBody.position.copy(worldPos);
    }
    
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
    
    // Z-offset constant for positioning horses "behind" the scene
    const HORSE_Z_OFFSET = -120; // Increased value to position horses more "behind"
    // X-offset constant for positioning horses left/right of the train
    const HORSE_X_OFFSET = 40; // Adjust to shift the entire horde left (-) or right (+)
    // Rotation offset constant for adjusting horse horde's orientation
    const HORSE_ROTATION_OFFSET = 0; // Adjust to rotate the entire horde (in radians)
    
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
      
      // Create rotation offset quaternion
      const rotOffset = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), // Y-axis rotation
        HORSE_ROTATION_OFFSET
      );
      
      // Combine train rotation with offset rotation
      const combinedQuat = worldQuat.clone().multiply(rotOffset);
      
      // Update each horse with an offset
      window.horses.forEach((horse, index) => {
        // Base offset from train
        const baseOffset = new THREE.Vector3(6 + HORSE_X_OFFSET, 0, 2 + HORSE_Z_OFFSET);
        
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
        offsetDirection.applyQuaternion(combinedQuat);
        
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
        horse.position.x += 6 + randomX + HORSE_X_OFFSET;  // Base offset from train + random variation + X offset
        horse.position.z += 2 + randomZ + HORSE_Z_OFFSET;  // Base offset from train + random variation + Z offset
        horse.position.y += randomY + gallopBounce;  // Height variation + gallop bounce
        
        // Create rotation with offset
        const baseQuaternion = train.quaternion.clone();
        const rotOffset = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0), // Y-axis rotation
          HORSE_ROTATION_OFFSET
        );
        const combinedQuat = baseQuaternion.multiply(rotOffset);
        
        // Match the train's rotation with the offset
        horse.quaternion.copy(combinedQuat);
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
  
  // Set up a timer to add the railway embankment
  if (window.desertTerrain && !window.embankmentInitialized) {
    console.log("Setting up timer to add railway embankment...");
    
    // Try to add the embankment immediately
    const embankmentAdded = window.desertTerrain.addRailwayEmbankment();
    
    // If not successful, set up repeated attempts
    if (!embankmentAdded) {
      window.embankmentTimer = setInterval(() => {
        if (window.desertTerrain && window.trainPath) {
          const success = window.desertTerrain.addRailwayEmbankment();
          
          if (success) {
            console.log("Railway embankment successfully added after retries");
            window.embankmentInitialized = true;
            clearInterval(window.embankmentTimer);
          }
        }
      }, 1000); // Try every second
      
      // Clear the interval after 30 seconds no matter what
      setTimeout(() => {
        if (window.embankmentTimer) {
          clearInterval(window.embankmentTimer);
          console.log("Stopped embankment retry timer after timeout");
        }
      }, 30000);
    } else {
      window.embankmentInitialized = true;
    }
  }
  
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
  
  // Z-offset constant for positioning horses "behind" the scene
  const HORSE_BASE_Z_OFFSET = 15; // Base Z offset value (same as in updateTrain)
  // X-offset constant for positioning horses left/right of the train
  const HORSE_BASE_X_OFFSET = 0; // Base X offset value (same as in updateTrain)
  
  // Create 6 horses alternating between the two models
  for (let i = 0; i < 6; i++) {
    // Get model index (0, 1, 0, 1, 0, 1)
    const modelIndex = i % horseModels.length;
    const modelPath = horseModels[modelIndex];
    
    // Store random offsets for consistent positioning with more variation
    // Create zigzag pattern with increased spacing and Z offset
    const positions = [
      { x: -5.0 + (Math.random() - 0.5) * 3 + HORSE_BASE_X_OFFSET, z: 1.0 + Math.random() * 3.0 + HORSE_BASE_Z_OFFSET },  // 0: front left
      { x: 0.0 + (Math.random() - 0.5) * 3 + HORSE_BASE_X_OFFSET, z: 7.0 + Math.random() * 3.0 + HORSE_BASE_Z_OFFSET },   // 1: middle-back
      { x: 5.0 + (Math.random() - 0.5) * 3 + HORSE_BASE_X_OFFSET, z: 12.0 + Math.random() * 3.0 + HORSE_BASE_Z_OFFSET },  // 2: far back right
      { x: -3.0 + (Math.random() - 0.5) * 3 + HORSE_BASE_X_OFFSET, z: 4.0 + Math.random() * 3.0 + HORSE_BASE_Z_OFFSET },  // 3: middle left
      { x: 4.0 + (Math.random() - 0.5) * 3 + HORSE_BASE_X_OFFSET, z: 3.0 + Math.random() * 3.0 + HORSE_BASE_Z_OFFSET },   // 4: front right
      { x: 1.0 + (Math.random() - 0.5) * 3 + HORSE_BASE_X_OFFSET, z: 9.0 + Math.random() * 3.0 + HORSE_BASE_Z_OFFSET }    // 5: back middle
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