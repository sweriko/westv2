/* ===== GLOBAL VARIABLES ===== */
let scene, renderer;
let player;    // Our Player instance (holds camera, gun, movement, etc.)
let npc;       // A simple NPC target
const bullets = [];  // Active bullets
let lastTime = 0;    // For deltaTime calculation
let soundManager;    // Global SoundManager instance

/* ===== SOUND MANAGER ===== */
/**
 * The SoundManager class preloads and caches sound effects,
 * and provides helper methods to play sounds.
 */
class SoundManager {
  constructor() {
    this.sounds = {};
  }
  
  /**
   * Loads an audio file from a given URL and caches it.
   * @param {string} name - The key to reference this sound.
   * @param {string} url - The URL of the audio file.
   */
  loadSound(name, url) {
    try {
      const audio = new Audio();
      audio.src = url;
      audio.load();
      this.sounds[name] = audio;
    } catch (error) {
      console.error(`Error loading sound "${name}" from ${url}:`, error);
    }
  }
  
  /**
   * Plays a cached sound by its name.
   * Clones the audio node to allow overlapping playback.
   * @param {string} name - The key of the sound to play.
   */
  playSound(name) {
    if (this.sounds[name]) {
      const audioClone = this.sounds[name].cloneNode();
      audioClone.play().catch(error => {
        console.error(`Error playing sound "${name}":`, error);
      });
    } else {
      console.error(`Sound "${name}" not found in cache.`);
    }
  }
  
  /**
   * Plays a sequence of sounds, first playing sound1, then when it ends, plays sound2.
   * (Note: Not used in this implementation.)
   * @param {string} sound1 - The first sound to play.
   * @param {string} sound2 - The sound to play after sound1 ends.
   */
  playSoundSequence(sound1, sound2) {
    if (this.sounds[sound1]) {
      const audioClone = this.sounds[sound1].cloneNode();
      audioClone.play().then(() => {
        audioClone.addEventListener('ended', () => {
          this.playSound(sound2);
        });
      }).catch(error => {
        console.error(`Error playing sound "${sound1}":`, error);
      });
    } else {
      console.error(`Sound "${sound1}" not found in cache.`);
    }
  }
}

/* ===== PLAYER, REVOLVER, BULLET CLASSES ===== */

// The Player class encapsulates camera, movement, shooting, aiming, and reloading.
class Player {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    // Create a group for the player's position.
    this.group = new THREE.Group();
    this.group.position.set(0, 0, 0);
    this.scene.add(this.group);
    // Attach camera at eye level.
    this.camera.position.set(0, 1.6, 0);
    this.group.add(this.camera);

    // Create the revolver that loads the GLB gun model.
    this.revolver = new Revolver();
    this.camera.add(this.revolver.group);
    // Smoothly interpolate the gun's position from holstered to aimed.
    this.holsterOffset = new THREE.Vector3(0.6, -0.5, -0.8); // Gun at hip.
    this.aimOffset = new THREE.Vector3(0.3, -0.3, -0.5);     // Gun in aim.
    this.currentGunOffset = this.holsterOffset.clone();
    this.isAiming = false;
    // Camera FOV targets for zoom.
    this.defaultFOV = 75;
    this.aimFOV = 65;

    // Movement & physics.
    this.velocity = new THREE.Vector3();
    this.canJump = false;
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;

    // Shooting & reload state.
    this.bullets = 6;
    this.maxBullets = 6;
    this.isReloading = false;
    this.reloadTime = 2000;  // milliseconds.
    this.reloadProgress = 0;
    this.canShoot = true;
  }
  
  update(deltaTime) {
    // Smoothly interpolate gun offset & camera FOV.
    let targetOffset = this.isAiming ? this.aimOffset : this.holsterOffset;
    this.currentGunOffset.lerp(targetOffset, 0.1);
    this.revolver.group.position.copy(this.currentGunOffset);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.isAiming ? this.aimFOV : this.defaultFOV, 0.1);
    this.camera.updateProjectionMatrix();

    // Apply gravity.
    this.velocity.y -= 20 * deltaTime;
    this.group.position.y += this.velocity.y * deltaTime;
    if (this.group.position.y < 0) {
      this.velocity.y = 0;
      this.group.position.y = 0;
      this.canJump = true;
    }
    // Movement relative to camera.
    const moveSpeed = 5;
    let forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    let right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    if (this.moveForward) this.group.position.add(forward.clone().multiplyScalar(moveSpeed * deltaTime));
    if (this.moveBackward) this.group.position.add(forward.clone().multiplyScalar(-moveSpeed * deltaTime));
    if (this.moveLeft) this.group.position.add(right.clone().multiplyScalar(-moveSpeed * deltaTime));
    if (this.moveRight) this.group.position.add(right.clone().multiplyScalar(moveSpeed * deltaTime));
  }
  
  shoot() {
    if (this.bullets > 0 && this.canShoot && !this.isReloading) {
      this.bullets--;
      updateAmmoUI();
      this.canShoot = false;
      setTimeout(() => { this.canShoot = true; }, 250);
      
      // Get bullet start position from gun barrel tip.
      const bulletStart = this.revolver.getBarrelTipWorldPosition();
      let shootDir = new THREE.Vector3();
      this.camera.getWorldDirection(shootDir);
      // Add slight randomness.
      shootDir.x += (Math.random()-0.5)*0.02;
      shootDir.y += (Math.random()-0.5)*0.02;
      shootDir.z += (Math.random()-0.5)*0.02;
      shootDir.normalize();
      
      const bullet = new Bullet(bulletStart, shootDir);
      bullets.push(bullet);
      this.scene.add(bullet.mesh);
      
      // Create muzzle flash and smoke at the barrel tip.
      createMuzzleFlash(bulletStart);
      createSmokeEffect(bulletStart, shootDir);
      createShockwaveRing(bulletStart, shootDir);
      // Apply recoil (camera shake).
      applyRecoil();

      // Play a random shot sound.
      if (soundManager) {
        const shotSound = Math.random() < 0.5 ? "shot1" : "shot2";
        soundManager.playSound(shotSound);
      }
    }
    if (this.bullets === 0) {
      document.getElementById('reload-message').style.display = 'block';
    }
  }
  
  startReload() {
    if (!this.isReloading && this.bullets < this.maxBullets) {
      this.isReloading = true;
      this.reloadProgress = 0;
      document.getElementById('reload-message').style.display = 'none';
      document.getElementById('reload-progress-container').style.display = 'block';
      // Play shellejection and reloading sounds concurrently.
      if (soundManager) {
        soundManager.playSound("shellejection");
        soundManager.playSound("reloading");
      }
      // Eject spent shells with staggered delays.
      for (let i = 0; i < this.maxBullets; i++) {
        setTimeout(() => { ejectShell(); }, i * 200);
      }
      const reloadInterval = setInterval(() => {
        this.reloadProgress += 100 / (this.reloadTime / 50);
        document.getElementById('reload-progress-bar').style.width = Math.min(this.reloadProgress, 100) + '%';
        if (this.reloadProgress >= 100) {
          clearInterval(reloadInterval);
          this.completeReload();
        }
      }, 50);
    }
  }
  
  completeReload() {
    this.bullets = this.maxBullets;
    updateAmmoUI();
    document.getElementById('reload-progress-container').style.display = 'none';
    document.getElementById('reload-progress-bar').style.width = '0%';
    this.isReloading = false;
  }
}

// The Revolver class loads a low–poly GLB gun model via GLTFLoader.
class Revolver {
  constructor() {
    this.group = new THREE.Group();
    // Load the GLB model (replace the URL with your model's URL).
    const loader = new THREE.GLTFLoader();
    loader.load('models/lowpolygun.glb', (gltf) => {
      const gunModel = gltf.scene;
      gunModel.scale.set(0.5, 0.5, 0.5);
      // Rotate/position the model so the barrel points forward.
      gunModel.position.set(0, 0, 0);
      gunModel.rotation.set(0, Math.PI, 0);
      this.group.add(gunModel);
      this.gunModel = gunModel;
    }, undefined, (error) => {
      console.error('Error loading gun model:', error);
    });
  }
  
  // Returns the world position of the barrel tip.
  // Here we invert the local Z offset (from 0.7 to -0.7) so the effects appear at the correct end.
  getBarrelTipWorldPosition() {
    const localTip = new THREE.Vector3(0, 0, -0.7);
    return this.group.localToWorld(localTip);
  }
}

// The Bullet class creates a small sphere that travels in a given direction.
class Bullet {
  constructor(position, direction) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xB8860B })
    );
    this.mesh.position.copy(position);
    this.direction = direction.clone();
    this.speed = 80; // Doubled from 40 to 80
    this.distanceTraveled = 0;
    this.maxDistance = 100;
  }
  
  update(deltaTime) {
    const displacement = this.direction.clone().multiplyScalar(this.speed * deltaTime);
    this.mesh.position.add(displacement);
    this.distanceTraveled += displacement.length();
    
    // Check for collision with NPC
    if (npc) {
      // Calculate distance to NPC center (roughly body position)
      const npcCenterPos = new THREE.Vector3(
        npc.position.x,
        npc.position.y + 1.0, // Middle of body
        npc.position.z
      );
      const distanceToNPC = this.mesh.position.distanceTo(npcCenterPos);
      
      // If within reasonable distance (hit box)
      if (distanceToNPC < 0.7) { // Adjust collision radius as needed
        createImpactEffect(this.mesh.position, this.direction);
        return false; // Bullet is destroyed on impact
      }
    }
    
    return this.distanceTraveled < this.maxDistance;
  }
}

/* ===== UTILITY FUNCTIONS ===== */

// Update the ammo counter UI.
function updateAmmoUI() {
  document.getElementById('ammo-counter').textContent =
    `Bullets: ${player.bullets}/${player.maxBullets}`;
}

// Create a muzzle flash effect at the given position.
function createMuzzleFlash(position) {
  const flashGeometry = new THREE.SphereGeometry(0.08, 8, 8);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xFFFF00,
    transparent: true,
    opacity: 0.8
  });
  const flash = new THREE.Mesh(flashGeometry, flashMaterial);
  // Position the flash at the barrel tip.
  flash.position.copy(position);
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 100);
}

// Create a simple smoke effect from the barrel.
function createSmokeEffect(position, direction) {
  const particleCount = 10;
  const particles = [];
  const pixelSize = 0.025;
  for (let i = 0; i < particleCount; i++) {
    const smokeGeometry = new THREE.BoxGeometry(pixelSize, pixelSize, pixelSize);
    const grayValue = 0.6 + Math.random() * 0.3;
    const smokeMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(grayValue, grayValue, grayValue),
      transparent: true,
      opacity: 0.7
    });
    const smokeParticle = new THREE.Mesh(smokeGeometry, smokeMaterial);
    // Position the smoke at the barrel tip.
    smokeParticle.position.copy(position);
    // Slight random offset.
    smokeParticle.position.x += (Math.random()-0.5)*0.05;
    smokeParticle.position.y += (Math.random()-0.5)*0.05;
    smokeParticle.position.z += (Math.random()-0.5)*0.05;
    let particleDir = direction.clone();
    particleDir.x += (Math.random()-0.5)*0.3;
    particleDir.y += (Math.random()-0.5)*0.3 + 0.1;
    particleDir.z += (Math.random()-0.5)*0.3;
    particleDir.normalize();
    const speed = 0.03 + Math.random() * 0.05;
    const velocity = particleDir.multiplyScalar(speed);
    scene.add(smokeParticle);
    particles.push({
      mesh: smokeParticle,
      velocity: velocity,
      life: 30 + Math.floor(Math.random()*30),
      maxLife: 30 + Math.floor(Math.random()*30)
    });
  }
  const interval = setInterval(() => {
    let allDead = true;
    particles.forEach(p => {
      if (p.life > 0) {
        p.mesh.position.add(p.velocity);
        p.velocity.multiplyScalar(0.97);
        p.velocity.y += 0.0005;
        p.mesh.material.opacity = (p.life / p.maxLife) * 0.7;
        p.life--;
        allDead = false;
      } else {
        scene.remove(p.mesh);
      }
    });
    if (allDead) clearInterval(interval);
  }, 16);
}

// Create a shockwave ring effect expanding from the barrel
function createShockwaveRing(position, direction) {
  // Create a ring geometry
  const ringGeometry = new THREE.RingGeometry(0.05, 0.06, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xFFFF00,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8
  });
  
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.copy(position);
  
  // Orient the ring to face outward from the barrel
  ring.lookAt(position.clone().add(direction));
  
  scene.add(ring);
  
  // Animate the ring expanding outward
  const duration = 300; // 300ms duration
  const startTime = performance.now();
  const startScale = 1;
  const endScale = 10;
  
  function animateShockwave(timestamp) {
    const elapsed = timestamp - startTime;
    const progress = elapsed / duration;
    
    if (progress < 1) {
      // Expand the ring
      const currentScale = startScale + (endScale - startScale) * progress;
      ring.scale.set(currentScale, currentScale, 1);
      
      // Fade out the ring
      ring.material.opacity = 0.8 * (1 - progress);
      
      requestAnimationFrame(animateShockwave);
    } else {
      // Remove the ring when animation completes
      scene.remove(ring);
      ring.material.dispose();
      ringGeometry.dispose();
    }
  }
  
  requestAnimationFrame(animateShockwave);
}

// Create an impact effect when a bullet hits a target
function createImpactEffect(position, direction) {
  // Create debris/blood particles
  const particleCount = 15;
  const particles = [];
  
  for (let i = 0; i < particleCount; i++) {
    const particleGeometry = new THREE.SphereGeometry(0.03, 4, 4);
    const particleMaterial = new THREE.MeshBasicMaterial({
      color: 0xFF0000, // Red for blood splatter
      transparent: true,
      opacity: 0.8
    });
    
    const particle = new THREE.Mesh(particleGeometry, particleMaterial);
    particle.position.copy(position);
    
    // Scatter in roughly opposing direction from bullet
    const particleDir = direction.clone().negate();
    particleDir.x += (Math.random() - 0.5) * 2;
    particleDir.y += (Math.random() - 0.5) * 2;
    particleDir.z += (Math.random() - 0.5) * 2;
    particleDir.normalize();
    
    const speed = 0.1 + Math.random() * 0.3;
    const velocity = particleDir.multiplyScalar(speed);
    
    scene.add(particle);
    particles.push({
      mesh: particle,
      velocity: velocity,
      life: 30 + Math.floor(Math.random() * 20)
    });
  }
  
  // Also create an impact flash
  const impactGeometry = new THREE.SphereGeometry(0.1, 8, 8);
  const impactMaterial = new THREE.MeshBasicMaterial({
    color: 0xFFFFFF,
    transparent: true,
    opacity: 0.8
  });
  const impactFlash = new THREE.Mesh(impactGeometry, impactMaterial);
  impactFlash.position.copy(position);
  scene.add(impactFlash);
  
  // Fade out impact flash
  let flashOpacity = 0.8;
  const flashInterval = setInterval(() => {
    flashOpacity -= 0.1;
    impactFlash.material.opacity = flashOpacity;
    if (flashOpacity <= 0) {
      clearInterval(flashInterval);
      scene.remove(impactFlash);
      impactFlash.material.dispose();
      impactGeometry.dispose();
    }
  }, 30);
  
  // Animate particles
  const interval = setInterval(() => {
    let allDead = true;
    particles.forEach(p => {
      if (p.life > 0) {
        p.mesh.position.add(p.velocity);
        p.velocity.y -= 0.01; // Gravity
        p.mesh.material.opacity = p.life / 50;
        p.life--;
        allDead = false;
      } else {
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        p.mesh.geometry.dispose();
      }
    });
    
    if (allDead) clearInterval(interval);
  }, 16);
}

// Apply enhanced recoil to both the gun model and viewport
function applyRecoil() {
  // Store original values
  const originalAimOffset = player.aimOffset.clone();
  const originalFOV = player.camera.fov;
  const originalCameraPos = player.camera.position.clone();
  
  // Apply intense viewport shake
  const recoilIntensity = 0.2; // Increased from 0.05
  player.camera.position.x += (Math.random()-0.5) * recoilIntensity;
  player.camera.position.y += (Math.random()-0.5) * recoilIntensity;
  
  // Apply recoil to gun by temporarily modifying the aim offset
  player.aimOffset.z += 0.3; // Kick the gun back
  player.aimOffset.y += 0.1; // Kick the gun up
  
  // Add a slight camera rotation for more intense effect
  const originalRotation = player.camera.rotation.clone();
  player.camera.rotation.x -= 0.05; // Kick upward
  
  // Kick the FOV to enhance the effect
  player.camera.fov -= 5;
  player.camera.updateProjectionMatrix();
  
  // Recover over time with a smooth animation
  let progress = 0;
  const duration = 300; // 300ms for recovery
  const startTime = performance.now();
  
  function recoverFromRecoil(timestamp) {
    progress = (timestamp - startTime) / duration;
    
    if (progress < 1) {
      // Smoothly interpolate back to original values
      player.camera.rotation.x = THREE.MathUtils.lerp(
        player.camera.rotation.x,
        originalRotation.x,
        progress * 0.2
      );
      
      player.aimOffset.lerp(originalAimOffset, progress * 0.2);
      player.camera.fov = THREE.MathUtils.lerp(
        player.camera.fov,
        originalFOV,
        progress * 0.2
      );
      player.camera.updateProjectionMatrix();
      
      // Continue animation
      requestAnimationFrame(recoverFromRecoil);
    } else {
      // Final reset to ensure precision
      player.camera.rotation.copy(originalRotation);
      player.aimOffset.copy(originalAimOffset);
      player.camera.fov = originalFOV;
      player.camera.updateProjectionMatrix();
      player.camera.position.copy(originalCameraPos);
    }
  }
  
  requestAnimationFrame(recoverFromRecoil);
}

// Eject a bullet shell with an animated fly-away.
function ejectShell() {
  const shellGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.03, 8);
  const shellMaterial = new THREE.MeshStandardMaterial({ color: 0xD4AF37 });
  const shell = new THREE.Mesh(shellGeometry, shellMaterial);
  // Start at the gun's barrel tip.
  const shellStart = player.revolver.getBarrelTipWorldPosition();
  shell.position.copy(shellStart);
  scene.add(shell);
  
  // Determine an ejection direction (to the right and upward).
  const ejectionDir = new THREE.Vector3(1, 1, 0).normalize();
  const speed = 1 + Math.random()*0.5;
  const duration = 1000; // 1 second.
  const startTime = performance.now();
  
  function animateShell(time) {
    const elapsed = time - startTime;
    const t = elapsed / duration;
    if (t < 1) {
      shell.position.add(ejectionDir.clone().multiplyScalar(speed * (time - startTime) / 1000));
      shell.rotation.x += 0.1;
      shell.rotation.y += 0.1;
      requestAnimationFrame(animateShell);
    } else {
      scene.remove(shell);
    }
  }
  requestAnimationFrame(animateShell);
}

/* ===== SCENE, CAMERA, RENDERER SETUP ===== */
function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 10, 750);
  
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.getElementById('game-container').appendChild(renderer.domElement);
  
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth/window.innerHeight,
    0.1,
    1000
  );
  
  const ambientLight = new THREE.AmbientLight(0x404040);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(1,1,0.5).normalize();
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
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = true;
  scene.add(ground);
  
  return camera;
}

/* ===== SIMPLE NPC TARGET ===== */
function createNPC() {
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
  
  npcGroup.position.set(0,0,-10);
  scene.add(npcGroup);
  return npcGroup;
}

let npcDirection = 1;
function updateNPC(deltaTime) {
  if (npc) {
    npc.position.x += npcDirection * 2 * deltaTime;
    if (npc.position.x > 15) {
      npcDirection = -1;
      npc.rotation.y = Math.PI/2;
    } else if (npc.position.x < -15) {
      npcDirection = 1;
      npc.rotation.y = -Math.PI/2;
    }
  }
}

/* ===== INPUT & POINTER LOCK ===== */
function initInput() {
  document.body.addEventListener('click', () => {
    if (document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock();
    }
  });
  
  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === renderer.domElement) {
      const movementX = event.movementX || 0;
      const movementY = event.movementY || 0;
      // Reduce sensitivity when aiming.
      let sensitivity = player.isAiming ? 0.001 : 0.002;
      player.group.rotation.y -= movementX * sensitivity;
      player.camera.rotation.x -= movementY * sensitivity;
      player.camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, player.camera.rotation.x));
    }
  });
  
  document.addEventListener('keydown', (event) => {
    switch(event.code) {
      case 'KeyW': player.moveForward = true; break;
      case 'KeyS': player.moveBackward = true; break;
      case 'KeyA': player.moveLeft = true; break;
      case 'KeyD': player.moveRight = true; break;
      case 'Space': if(player.canJump){ player.velocity.y = 10; player.canJump = false; } break;
      case 'KeyR': player.startReload(); break;
    }
  });
  
  document.addEventListener('keyup', (event) => {
    switch(event.code) {
      case 'KeyW': player.moveForward = false; break;
      case 'KeyS': player.moveBackward = false; break;
      case 'KeyA': player.moveLeft = false; break;
      case 'KeyD': player.moveRight = false; break;
    }
  });
  
  // Right mouse button: smooth aim animation.
  document.addEventListener('mousedown', (event) => {
    if(event.button === 2) {  // Right-click: begin aiming.
      player.isAiming = true;
      player.revolver.group.visible = true;
      document.getElementById('crosshair').style.display = 'block';
      // Play the aim-click sound effect.
      if (soundManager) {
        soundManager.playSound("aimclick");
      }
    } else if(event.button === 0) {  // Left-click: shoot if aiming.
      if(player.revolver.group.visible) {
        player.shoot();
      }
    }
  });
  
  document.addEventListener('mouseup', (event) => {
    if(event.button === 2) {  // Right-click released: stop aiming.
      player.isAiming = false;
      player.revolver.group.visible = false;
      document.getElementById('crosshair').style.display = 'none';
    }
  });
  
  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });
  
  window.addEventListener('resize', () => {
    player.camera.aspect = window.innerWidth/window.innerHeight;
    player.camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

/* ===== FPS COUNTER ===== */
function updateFPS(deltaTime) {
  const fpsCounter = document.getElementById('fps-counter');
  const currentFPS = Math.round(1/deltaTime);
  fpsCounter.textContent = `FPS: ${currentFPS}`;
}

/* ===== ANIMATION LOOP ===== */
function animate(time) {
  requestAnimationFrame(animate);
  const deltaTime = (time - lastTime) / 1000;
  lastTime = time;
  
  player.update(deltaTime);
  
  // Update active bullets.
  for(let i = bullets.length - 1; i >= 0; i--) {
    const stillActive = bullets[i].update(deltaTime);
    if(!stillActive) {
      scene.remove(bullets[i].mesh);
      bullets.splice(i,1);
    }
  }
  
  updateNPC(deltaTime);
  updateFPS(deltaTime);
  renderer.render(scene, player.camera);
}

/* ===== INITIALIZATION ===== */
function init() {
  // Initialize the sound manager and preload sounds.
  soundManager = new SoundManager();
  soundManager.loadSound("shot1", "sounds/shot1.mp3");
  soundManager.loadSound("shot2", "sounds/shot2.mp3");
  soundManager.loadSound("aimclick", "sounds/aimclick.mp3");
  soundManager.loadSound("shellejection", "sounds/shellejection.mp3");
  soundManager.loadSound("reloading", "sounds/reloading.mp3");

  const camera = initScene();
  player = new Player(scene, camera);
  npc = createNPC();
  initInput();
  updateAmmoUI();
  animate(0);
}

init();
