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

// Add train animation components
let train;
let trainPath;
let trainProgress = 0;
const TRAIN_SPEED = 0.0003; // Reduced speed for slower train movement
const TRAIN_TRACK_LENGTH = 2000; // 2000m straight track - much longer
let trainDirection = 1; // 1 = forward, -1 = backward
// Position the track along Z axis (rotated 90°) with one end at the town edge and extending far beyond
const TRAIN_TRACK_START = new THREE.Vector3(0, 0, -1000);
const TRAIN_TRACK_END = new THREE.Vector3(0, 0, 1000);

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
  
  // Create circular train track and load train
  createTrainSystem();

  return { camera, renderer };
}

/**
 * Preloads skybox textures to ensure they're in memory
 * @param {Function} callback - Function to call when preloading is complete
 */
function preloadSkyboxTextures(callback) {
  const textureLoader = new THREE.TextureLoader();
  let loadedCount = 0;
  const totalTextures = 2;
  
  // Add cache-busting query parameter
  const timestamp = Date.now();
  const skyUrl = `models/skypart.png?t=${timestamp}`;
  const groundUrl = `models/groundpart.png?t=${timestamp}`;
  
  function checkAllLoaded() {
    loadedCount++;
    if (loadedCount >= totalTextures) {
      callback();
    }
  }

  // Preload the sky texture
  textureLoader.load(
    skyUrl,
    () => {
      console.log("Sky texture preloaded successfully");
      checkAllLoaded();
    },
    undefined,
    () => {
      console.warn("Sky texture preload failed, continuing anyway");
      checkAllLoaded();
    }
  );
  
  // Preload the ground texture
  textureLoader.load(
    groundUrl,
    () => {
      console.log("Ground texture preloaded successfully");
      checkAllLoaded();
    },
    undefined,
    () => {
      console.warn("Ground texture preload failed, continuing anyway");
      checkAllLoaded();
    }
  );
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
    
    // Verify if texture is valid before proceeding
    if (!skyTexture.image || !skyTexture.image.width || !skyTexture.image.height) {
      console.error("Sky texture is invalid, using fallback instead");
      createFallbackSkyPart();
      return;
    }
    
    // Create sky mesh with LARGER radius (1.01x)
    const skyGeometry = new THREE.SphereGeometry(skyboxRadius * 1.01, 64, 32);
    skyGeometry.scale(-1, 1, 1);
    
    const skyMaterial = new THREE.MeshBasicMaterial({
      map: skyTexture,
      transparent: true,
      fog: false
    });
    
    // Cleanup previous mesh if exists
    if (skyMesh) {
      scene.remove(skyMesh);
      skyMesh.geometry.dispose();
      skyMesh.material.dispose();
    }
    
    skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(skyMesh);
    texturesLoaded.skyLoaded = true;
    console.log("Sky part added to scene");
  }
  
  // Function to create fallback sky part
  function createFallbackSkyPart() {
    console.log("Creating fallback sky part");
    
    // Create fallback sky with solid color
    const skyGeometry = new THREE.SphereGeometry(skyboxRadius * 1.01, 64, 32);
    skyGeometry.scale(-1, 1, 1);
    
    const skyMaterial = new THREE.MeshBasicMaterial({
      color: 0x87CEEB, // Sky blue
      side: THREE.BackSide,
      fog: false
    });
    
    // Cleanup previous mesh if exists
    if (skyMesh) {
      scene.remove(skyMesh);
      skyMesh.geometry.dispose();
      skyMesh.material.dispose();
    }
    
    skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(skyMesh);
    texturesLoaded.skyLoaded = true;
    console.log("Fallback sky part added to scene");
  }
  
  // Function to create ground part with a texture
  function createGroundPart(groundTexture) {
    console.log("Creating ground part with texture");
    
    // Verify if texture is valid before proceeding
    if (!groundTexture.image || !groundTexture.image.width || !groundTexture.image.height) {
      console.error("Ground texture is invalid, using fallback instead");
      createFallbackGroundPart();
      return;
    }
    
    // Create ground mesh with normal radius
    const groundGeometry = new THREE.SphereGeometry(skyboxRadius, 64, 32);
    groundGeometry.scale(-1, 1, 1);
    
    const groundMaterial = new THREE.MeshBasicMaterial({
      map: groundTexture,
      transparent: true,
      fog: false
    });
    
    // Cleanup previous mesh if exists
    if (groundMesh) {
      scene.remove(groundMesh);
      groundMesh.geometry.dispose();
      groundMesh.material.dispose();
    }
    
    groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    scene.add(groundMesh);
    texturesLoaded.groundLoaded = true;
    console.log("Ground part added to scene");
  }
  
  // Function to create fallback ground part
  function createFallbackGroundPart() {
    console.log("Creating fallback ground part");
    
    // Create fallback ground with solid color
    const groundGeometry = new THREE.SphereGeometry(skyboxRadius, 64, 32);
    groundGeometry.scale(-1, 1, 1);
    
    const groundMaterial = new THREE.MeshBasicMaterial({
      color: 0xAA7755, // Desert sand color
      side: THREE.BackSide,
      fog: false
    });
    
    // Cleanup previous mesh if exists
    if (groundMesh) {
      scene.remove(groundMesh);
      groundMesh.geometry.dispose();
      groundMesh.material.dispose();
    }
    
    groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    scene.add(groundMesh);
    texturesLoaded.groundLoaded = true;
    console.log("Fallback ground part added to scene");
  }
  
  // Function to load sky texture with retry capability and cache-busting
  function loadSkyTexture(retryCount = 0) {
    const maxRetries = 3;
    texturesLoaded.skyAttempts++;
    
    // Add cache-busting query param
    const timestamp = Date.now();
    const url = `models/skypart.png?t=${timestamp}`;
    
    textureLoader.load(
      url,
      function(skyTexture) {
        console.log("Sky texture loaded successfully");
        skyTexture.needsUpdate = true; // Ensure texture is updated
        createSkyPart(skyTexture);
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
      // Error callback
      function(error) {
        console.error('Error loading sky texture:', error);
        
        // Retry logic with increasing delay
        if (retryCount < maxRetries) {
          const delay = 500 * Math.pow(2, retryCount); // Exponential backoff: 500ms, 1000ms, 2000ms
          console.log(`Retrying sky texture load (attempt ${retryCount + 1}/${maxRetries}) in ${delay}ms...`);
          setTimeout(() => {
            loadSkyTexture(retryCount + 1);
          }, delay);
        } else {
          console.error('Failed to load sky texture after multiple attempts');
          createFallbackSkyPart();
        }
      }
    );
  }
  
  // Function to load ground texture with retry capability and cache-busting
  function loadGroundTexture(retryCount = 0) {
    const maxRetries = 3;
    texturesLoaded.groundAttempts++;
    
    // Add cache-busting query param
    const timestamp = Date.now();
    const url = `models/groundpart.png?t=${timestamp}`;
    
    textureLoader.load(
      url,
      function(groundTexture) {
        console.log("Ground texture loaded successfully");
        groundTexture.needsUpdate = true; // Ensure texture is updated
        createGroundPart(groundTexture);
      },
      // Progress callback
      function(xhr) {
        if (xhr.lengthComputable) {
          const percentage = Math.round((xhr.loaded / xhr.total) * 100);
          if (percentage === 25 || percentage === 50 || percentage === 75 || percentage === 100) {
            console.log(`Loading ground texture: ${percentage}%`);
          }
        }
      },
      // Error callback
      function(error) {
        console.error('Error loading ground texture:', error);
        
        // Retry logic with increasing delay
        if (retryCount < maxRetries) {
          const delay = 500 * Math.pow(2, retryCount); // Exponential backoff: 500ms, 1000ms, 2000ms
          console.log(`Retrying ground texture load (attempt ${retryCount + 1}/${maxRetries}) in ${delay}ms...`);
          setTimeout(() => {
            loadGroundTexture(retryCount + 1);
          }, delay);
        } else {
          console.error('Failed to load ground texture after multiple attempts');
          createFallbackGroundPart();
        }
      }
    );
  }
  
  // Start the texture loading with retry capability
  loadSkyTexture();
  loadGroundTexture();
  
  // Safety check - if textures aren't loaded after 10 seconds, use fallbacks
  setTimeout(() => {
    if (!texturesLoaded.skyLoaded && texturesLoaded.skyAttempts < 4) {
      console.warn("Sky texture not loaded after timeout, using fallback");
      createFallbackSkyPart();
    }
    if (!texturesLoaded.groundLoaded && texturesLoaded.groundAttempts < 4) {
      console.warn("Ground texture not loaded after timeout, using fallback");
      createFallbackGroundPart();
    }
  }, 10000);
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
 * Creates a straight train track and loads the train model
 */
function createTrainSystem() {
  // Create a straight path for the train
  const numPoints = 2; // Just need two points for a straight line
  const points = [];
  const trackElevation = 0.5; // Slightly elevated above ground

  // Add track endpoints
  points.push(new THREE.Vector3(TRAIN_TRACK_START.x, TRAIN_TRACK_START.y + trackElevation, TRAIN_TRACK_START.z));
  points.push(new THREE.Vector3(TRAIN_TRACK_END.x, TRAIN_TRACK_END.y + trackElevation, TRAIN_TRACK_END.z));

  // Create spline from points
  trainPath = new THREE.CatmullRomCurve3(points);
  trainPath.closed = false; // Open path, not a loop

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
      train.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      
      // Scale and position the train
      train.scale.set(2, 2, 2);
      
      // Initial position at the start of track
      const trackElevation = 0.5;
      train.position.copy(new THREE.Vector3(TRAIN_TRACK_START.x, trackElevation, TRAIN_TRACK_START.z));
      
      // Initial rotation - look toward the end of track
      const direction = new THREE.Vector3().subVectors(TRAIN_TRACK_END, TRAIN_TRACK_START).normalize();
      const target = new THREE.Vector3().copy(train.position).add(direction);
      train.lookAt(target);
      
      // Add to scene
      scene.add(train);
      
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
  
  // Initial position at the start of track
  const trackElevation = 0.5;
  train.position.copy(new THREE.Vector3(TRAIN_TRACK_START.x, trackElevation, TRAIN_TRACK_START.z));
  
  // Initial rotation - look toward the end of track
  const direction = new THREE.Vector3().subVectors(TRAIN_TRACK_END, TRAIN_TRACK_START).normalize();
  const target = new THREE.Vector3().copy(train.position).add(direction);
  train.lookAt(target);
  
  scene.add(train);
  
  console.log('Using simple train placeholder');
}

/**
 * Updates the train position along the straight track
 * @param {number} deltaTime - Time since last frame in seconds
 */
export function updateTrain(deltaTime) {
  if (train) {
    // Increment progress based on direction
    trainProgress += TRAIN_SPEED * trainDirection;
    
    // Change direction and "respawn" when reaching either end
    if (trainProgress >= 1) {
      // Reached the end, turn around
      trainDirection = -1;
      trainProgress = 1;
      
      // Rotate 180 degrees
      const currentRotation = train.rotation.y;
      train.rotation.y = currentRotation + Math.PI;
      
    } else if (trainProgress <= 0) {
      // Reached the start, turn around
      trainDirection = 1;
      trainProgress = 0;
      
      // Rotate 180 degrees
      const currentRotation = train.rotation.y;
      train.rotation.y = currentRotation + Math.PI;
    }
    
    // Get position on the path
    const position = trainPath.getPointAt(trainProgress);
    train.position.copy(position);
  }
}

/**
 * Updates the FPS counter and handles animation
 * @param {THREE.WebGLRenderer} renderer - The renderer.
 * @param {THREE.Camera} camera - The camera.
 * @param {number} deltaTime - Time since last frame in seconds.
 */
export function updateFPS(renderer, camera, deltaTime) {
  // Safely rotate the sky part of the skybox if it exists
  if (skyMesh && skyMesh.rotation) {
    skyMesh.rotation.y += SKYBOX_ROTATION_SPEED * deltaTime * 1000; // Convert to milliseconds
  } else if (!skyMesh && !texturesLoaded.skyLoaded) {
    // If skyMesh doesn't exist but should be loaded, attempt recovery
    if (texturesLoaded.skyAttempts < 4) {
      console.warn("Sky mesh missing in animation loop, attempting recovery");
      loadTwoPartSkybox();
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
  }
  
  // Update tumbleweed positions if manager exists
  if (tumbleweedManager) {
    tumbleweedManager.update(deltaTime);
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
 * Cleans up resources when switching scene or closing
 */
export function cleanupScene() {
  console.log("Cleaning up scene resources...");
  
  // Dispose of tumbleweed manager
  if (tumbleweedManager) {
    tumbleweedManager.dispose();
    tumbleweedManager = null;
  }
  
  // Clean up other resources as needed
}