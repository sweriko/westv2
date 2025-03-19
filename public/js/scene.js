export let scene;

/**
 * Initializes the Three.js scene, camera, and renderer.
 * @returns {Object} - Contains the camera and renderer.
 */
export function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 10, 750);

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

  const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0xCD853F,
    roughness: 0.8,
    metalness: 0.2
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  return { camera, renderer };
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

  npcGroup.position.set(0, 0, -10);
  scene.add(npcGroup);
  return npcGroup;
}

/**
 * Updates the NPC’s position.
 * @param {THREE.Group} npc - The NPC group.
 * @param {number} deltaTime - Time elapsed since last frame.
 */
export function updateNPC(npc, deltaTime) {
  if (npc) {
    npc.userData.direction = npc.userData.direction || 1;
    npc.position.x += npc.userData.direction * 2 * deltaTime;
    if (npc.position.x > 15) {
      npc.userData.direction = -1;
      npc.rotation.y = Math.PI / 2;
    } else if (npc.position.x < -15) {
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
