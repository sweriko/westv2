// /public/js/scene.js
export let scene;

/**
 * Initializes the Three.js scene, camera, and renderer.
 * @returns {Object} - Contains the camera and renderer.
 */
export function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 10, 100); // Reduced fog distance for smaller world

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

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  const ambientLight = new THREE.AmbientLight(0x404040);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(1, 1, 0.5).normalize();
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  scene.add(directionalLight);

  // Create the western town instead of just a ground plane
  createWesternTown();

  return { camera, renderer };
}

/**
 * Creates a western town with a main street and buildings
 */
function createWesternTown() {
  // Town dimensions
  const TOWN_WIDTH = 60;  // Width of the town (X-axis)
  const TOWN_LENGTH = 100; // Length of the town (Z-axis)
  const STREET_WIDTH = 15; // Width of the main street

  // Create the ground (smaller than the original 1000x1000)
  const groundGeometry = new THREE.PlaneGeometry(TOWN_WIDTH, TOWN_LENGTH);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0xCD853F, // Sandy color
    roughness: 0.8,
    metalness: 0.2
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Create the main street
  const streetGeometry = new THREE.PlaneGeometry(STREET_WIDTH, TOWN_LENGTH);
  const streetMaterial = new THREE.MeshStandardMaterial({
    color: 0xA0522D, // Brown street
    roughness: 0.9,
    metalness: 0.1
  });
  const street = new THREE.Mesh(streetGeometry, streetMaterial);
  street.rotation.x = -Math.PI / 2;
  street.position.y = 0.01; // Slightly above ground to prevent z-fighting
  street.receiveShadow = true;
  scene.add(street);

  // Add buildings on both sides of the street
  const buildingCount = 5; // Number of buildings on each side
  const buildingSpacing = TOWN_LENGTH / (buildingCount + 1);
  
  // Left side buildings (negative X)
  for (let i = 1; i <= buildingCount; i++) {
    const offset = i * buildingSpacing - TOWN_LENGTH / 2 + buildingSpacing / 2;
    createWesternBuilding(-STREET_WIDTH / 2 - 5, 0, offset);
  }
  
  // Right side buildings (positive X)
  for (let i = 1; i <= buildingCount; i++) {
    const offset = i * buildingSpacing - TOWN_LENGTH / 2 + buildingSpacing / 2;
    createWesternBuilding(STREET_WIDTH / 2 + 5, 0, offset);
  }

  // Create a visible border around the town
  createTownBorder(TOWN_WIDTH, TOWN_LENGTH);
  
  // Store these values in a global variable for access in other files
  window.townDimensions = {
    width: TOWN_WIDTH,
    length: TOWN_LENGTH,
    streetWidth: STREET_WIDTH
  };
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
 * Creates a visible border around the town
 * @param {number} width - Width of the town
 * @param {number} length - Length of the town
 */
function createTownBorder(width, length) {
  const borderHeight = 0.5;
  const borderWidth = 0.5;
  
  // Border material
  const borderMaterial = new THREE.MeshStandardMaterial({
    color: 0x8B4513, // Brown
    roughness: 0.8,
    metalness: 0.2
  });
  
  // Create four border segments
  const createBorderSegment = (x, z, sizeX, sizeZ) => {
    const geometry = new THREE.BoxGeometry(sizeX, borderHeight, sizeZ);
    const border = new THREE.Mesh(geometry, borderMaterial);
    border.position.set(x, borderHeight / 2, z);
    border.castShadow = true;
    border.receiveShadow = true;
    scene.add(border);
    return border;
  };
  
  // Left border (negative X)
  const leftBorder = createBorderSegment(-width / 2, 0, borderWidth, length);
  
  // Right border (positive X)
  const rightBorder = createBorderSegment(width / 2, 0, borderWidth, length);
  
  // Front border (negative Z)
  const frontBorder = createBorderSegment(0, -length / 2, width, borderWidth);
  
  // Back border (positive Z)
  const backBorder = createBorderSegment(0, length / 2, width, borderWidth);
  
  // Store border references in a global variable
  window.townBorders = {
    left: leftBorder,
    right: rightBorder,
    front: frontBorder,
    back: backBorder,
    width: width,
    length: length,
    height: borderHeight
  };
}

/**
 * Creates a simple NPC target.
 * @param {THREE.Scene} scene - The scene to add the NPC.
 * @returns {THREE.Group} - The NPC group.
 */
export function createNPC(scene) {
  const npcGroup = new THREE.Group();
  const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.3, 1.5, 8);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x8B0000 });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 0.9;
  npcGroup.add(body);
  const headGeometry = new THREE.SphereGeometry(0.2, 16, 16);
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xDEB887 });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 1.8;
  npcGroup.add(head);
  const hatGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.15, 8);
  const hatMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
  const hat = new THREE.Mesh(hatGeometry, hatMaterial);
  hat.position.y = 2.0;
  npcGroup.add(hat);

  // Position the NPC within the town instead of at (0, 0, -10)
  if (window.townDimensions) {
    // Place NPC at a random position in the town
    const x = (Math.random() - 0.5) * window.townDimensions.streetWidth * 0.8;
    const z = -window.townDimensions.length * 0.3; // Towards the front of the town
    npcGroup.position.set(x, 0, z);
  } else {
    // Default position as fallback
    npcGroup.position.set(0, 0, -10);
  }
  
  scene.add(npcGroup);
  return npcGroup;
}

/**
 * Updates the NPC's position.
 * @param {THREE.Group} npc - The NPC group.
 * @param {number} deltaTime - Time elapsed since last frame.
 */
export function updateNPC(npc, deltaTime) {
  if (npc) {
    npc.userData.direction = npc.userData.direction || 1;
    
    // Adjust the movement range to be appropriate for the town size
    const movementRange = window.townDimensions ? 
      window.townDimensions.streetWidth * 0.4 : // 40% of street width if town exists
      15; // Original value as fallback
    
    npc.position.x += npc.userData.direction * 2 * deltaTime;
    
    if (npc.position.x > movementRange) {
      npc.userData.direction = -1;
      npc.rotation.y = Math.PI / 2;
    } else if (npc.position.x < -movementRange) {
      npc.userData.direction = 1;
      npc.rotation.y = -Math.PI / 2;
    }
  }
}

/**
 * Updates the FPS counter.
 * @param {THREE.WebGLRenderer} renderer - The renderer.
 * @param {THREE.Camera} camera - The camera.
 * @param {number} deltaTime - Time elapsed since last frame.
 */
export function updateFPS(renderer, camera, deltaTime) {
  const fpsCounter = document.getElementById('fps-counter');
  if (fpsCounter) {
    const currentFPS = deltaTime > 0 ? Math.round(1 / deltaTime) : 0;
    fpsCounter.textContent = `FPS: ${currentFPS}`;
  }
}