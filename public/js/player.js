import { Revolver } from './revolver.js';
import { updateAmmoUI, updateHealthUI } from './ui.js';
import { applyRecoil, ejectShell } from './effects.js';
import { networkManager } from './network.js';

/**
 * The local Player class (first-person).
 */
export class Player {
  /**
   * @param {Object} config
   * @param {THREE.Scene} config.scene
   * @param {THREE.PerspectiveCamera} config.camera
   * @param {SoundManager} config.soundManager
   * @param {Function} config.onShoot - A callback function called when the player fires a bullet.
   */
  constructor({ scene, camera, soundManager, onShoot }) {
    this.scene = scene;
    this.camera = camera;
    this.soundManager = soundManager;
    this.onShootCallback = onShoot;

    this.group = new THREE.Group();
    
    // Start at a random spawn point in the town street
    this.spawnPlayerRandomly();
    
    this.scene.add(this.group);
    this.camera.position.set(0, 0, 0);
    this.group.add(this.camera);

    this.id = null; // will be set by networkManager.onInit
    this.velocity = new THREE.Vector3();
    this.canJump = false;

    // Movement flags
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    
    // Sprinting flag - new addition
    this.isSprinting = false;
    this.normalSpeed = 5; // Default movement speed
    this.sprintSpeed = 12; // Faster sprint speed
    this.sprintJumpBoost = 1.5; // Jump boost factor when sprinting

    // Aiming
    this.isAiming = false;
    this.defaultFOV = 75;
    this.aimFOV = 65;
    
    // Camera effects for sprinting - with smoothing parameters
    this.defaultCameraHeight = 0;
    this.bobPhase = 0; // Phase accumulator for bob effect
    this.bobIntensity = 0; // Current intensity of bobbing (interpolates)
    this.targetBobIntensity = 0; // Target bobbing intensity
    this.bobTransitionSpeed = 3; // Speed of transition to new bob intensity
    
    // Gun
    this.revolver = new Revolver();
    this.holsterOffset = new THREE.Vector3(0.6, -0.5, -0.8);
    this.aimOffset = new THREE.Vector3(0.3, -0.3, -0.5);
    this.currentGunOffset = this.holsterOffset.clone();
    this.camera.add(this.revolver.group);

    // FOV transition smoothing
    this.currentFOV = this.defaultFOV;
    this.targetFOV = this.defaultFOV;
    this.fovTransitionSpeed = 5; // Speed of FOV transitions

    // Reload
    this.isReloading = false;
    this.reloadTime = 2000;
    this.reloadProgress = 0;
    this.bullets = 6;
    this.maxBullets = 6;
    this.canShoot = true;

    // Health
    this.health = 100;

    // Networking
    this.lastNetworkUpdate = 0;
    this.networkUpdateInterval = 50; // ms

    // Quick Draw mode
    this.canAim = true; // Whether the player is allowed to aim (used by Quick Draw)
    
    // Store previous position to detect collision with arena boundary
    this.previousPosition = new THREE.Vector3();

    // Initialize network & UI
    this.initNetworking();
    updateAmmoUI(this);
    updateHealthUI(this);
  }

  /**
   * Spawn the player at a random position along the main street
   */
  spawnPlayerRandomly() {
    // Default position if town dimensions aren't available
    let spawnX = 0;
    let spawnY = 1.6;
    let spawnZ = 0;

    // If town dimensions are available, use them for spawn positioning
    if (window.townDimensions) {
      const streetWidth = window.townDimensions.streetWidth;
      const townLength = window.townDimensions.length;
      
      // Random position within the street area
      spawnX = (Math.random() - 0.5) * streetWidth * 0.8; // 80% of street width to avoid edges
      spawnZ = (Math.random() - 0.5) * townLength * 0.8; // 80% of town length
    }

    this.group.position.set(spawnX, spawnY, spawnZ);
    
    // Random rotation (facing any direction)
    this.group.rotation.y = Math.random() * Math.PI * 2;
    
    console.log(`Player spawned at: X=${spawnX.toFixed(2)}, Z=${spawnZ.toFixed(2)}`);
  }

  initNetworking() {
    // Start the WebSocket
    networkManager.connect();

    networkManager.onInit = (initData) => {
      this.id = initData.id;
      console.log(`Local player initialized with ID: ${this.id}`);
    };

    // We also do not handle remote players here. That is done in the MultiplayerManager.
  }

  update(deltaTime) {
    // Store previous position before movement for collision detection
    this.previousPosition.copy(this.group.position);
    
    // Smoothly interpolate the gun offset & FOV
    const targetOffset = this.isAiming && this.canAim ? this.aimOffset : this.holsterOffset;
    this.currentGunOffset.lerp(targetOffset, 0.1);
    this.revolver.group.position.copy(this.currentGunOffset);

    // Adjust FOV based on sprinting and aiming with smoother transitions
    if (this.isAiming && this.canAim) {
      this.targetFOV = this.aimFOV;
    } else if (this.isSprinting && this.isMoving() && !window.quickDraw?.inDuel) {
      // FOV effect when sprinting, but not in QuickDraw duel
      this.targetFOV = this.defaultFOV + 7; // Less extreme FOV increase (was 10)
    } else {
      this.targetFOV = this.defaultFOV;
    }
    
    // Smooth FOV transition
    this.currentFOV = THREE.MathUtils.lerp(
      this.currentFOV, 
      this.targetFOV, 
      deltaTime * this.fovTransitionSpeed
    );
    
    // Only update camera FOV if it has changed enough to be noticeable
    if (Math.abs(this.camera.fov - this.currentFOV) > 0.01) {
      this.camera.fov = this.currentFOV;
      this.camera.updateProjectionMatrix();
    }

    // Handle head bob effect when moving - with improvements
    this.updateHeadBob(deltaTime);

    // Gravity
    this.velocity.y -= 20 * deltaTime;
    this.group.position.y += this.velocity.y * deltaTime;
    if (this.group.position.y < 1.6) {
      this.velocity.y = 0;
      this.group.position.y = 1.6;
      this.canJump = true;
    }

    // Movement - now with sprint capability
    const moveSpeed = this.getMoveSpeed();
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    // Calculate new position based on movement input
    const newPosition = this.group.position.clone();
    
    if (this.moveForward) newPosition.add(forward.clone().multiplyScalar(moveSpeed * deltaTime));
    if (this.moveBackward) newPosition.add(forward.clone().multiplyScalar(-moveSpeed * deltaTime));
    if (this.moveLeft) newPosition.add(right.clone().multiplyScalar(-moveSpeed * deltaTime));
    if (this.moveRight) newPosition.add(right.clone().multiplyScalar(moveSpeed * deltaTime));

    // Check for boundary collisions before applying the new position
    const canMove = this.checkBoundaryCollision(newPosition);
    
    if (canMove) {
      this.group.position.copy(newPosition);
    } else {
      // If can't move to the new position, try to slide along the boundary
      // This gives a better feeling than just stopping
      if (this.moveForward || this.moveBackward) {
        const slideX = this.group.position.clone();
        slideX.x = newPosition.x;
        if (this.checkBoundaryCollision(slideX)) {
          this.group.position.copy(slideX);
        }
      }
      
      if (this.moveLeft || this.moveRight) {
        const slideZ = this.group.position.clone();
        slideZ.z = newPosition.z;
        if (this.checkBoundaryCollision(slideZ)) {
          this.group.position.copy(slideZ);
        }
      }
    }

    // Send periodic network updates
    const now = performance.now();
    if (now - this.lastNetworkUpdate > this.networkUpdateInterval) {
      this.lastNetworkUpdate = now;
      this.sendNetworkUpdate();
    }
  }

  /**
   * Updates camera head bobbing effect for walking/running with much smoother transitions
   * @param {number} deltaTime - Time elapsed since last frame
   */
  updateHeadBob(deltaTime) {
    // Update target bobbing intensity based on movement
    if (this.isMoving() && this.canJump) {
      // Very subtle bobbing values
      this.targetBobIntensity = this.isSprinting ? 0.02 : 0.01;
    } else {
      this.targetBobIntensity = 0;
    }
    
    // Smoothly transition bob intensity
    this.bobIntensity = THREE.MathUtils.lerp(
      this.bobIntensity,
      this.targetBobIntensity,
      Math.min(1, deltaTime * this.bobTransitionSpeed)
    );
    
    // Only calculate bob if intensity is significant
    if (this.bobIntensity > 0.001) {
      // Update phase at a speed proportional to movement
      // Use different frequencies for vertical and horizontal to create more natural movement
      this.bobPhase += deltaTime * (this.isSprinting ? 10 : 6);
      
      // Calculate vertical and horizontal components
      const verticalBob = Math.sin(this.bobPhase * 2) * this.bobIntensity;
      // Much smaller horizontal component
      const horizontalBob = Math.cos(this.bobPhase) * this.bobIntensity * 0.3;
      
      // Apply to camera position smoothly
      this.camera.position.y = THREE.MathUtils.lerp(
        this.camera.position.y,
        this.defaultCameraHeight + verticalBob,
        Math.min(1, deltaTime * 8)
      );
      
      // Extremely subtle horizontal movement
      this.camera.position.x = THREE.MathUtils.lerp(
        this.camera.position.x,
        horizontalBob,
        Math.min(1, deltaTime * 3)
      );
    } else {
      // Smoothly return to default position when not moving
      this.camera.position.y = THREE.MathUtils.lerp(
        this.camera.position.y,
        this.defaultCameraHeight,
        Math.min(1, deltaTime * 4)
      );
      
      this.camera.position.x = THREE.MathUtils.lerp(
        this.camera.position.x,
        0,
        Math.min(1, deltaTime * 3)
      );
    }
  }

  /**
   * Returns the current movement speed based on sprint state and location
   * @returns {number} The current movement speed
   */
  getMoveSpeed() {
    // Disable sprinting in QuickDraw duels
    if (window.quickDraw && window.quickDraw.inDuel) {
      return this.normalSpeed;
    }
    
    // Apply sprint speed if sprint key is pressed
    return this.isSprinting ? this.sprintSpeed : this.normalSpeed;
  }
  
  /**
   * Checks if the player is currently moving
   * @returns {boolean} True if any movement key is pressed
   */
  isMoving() {
    return this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
  }

  /**
   * Check if a position is valid regarding boundaries
   * @param {THREE.Vector3} position - The position to check
   * @returns {boolean} - True if the position is valid
   */
  checkBoundaryCollision(position) {
    // First check Quick Draw arena boundary
    if (window.quickDraw) {
      const inArena = window.quickDraw.isPointInArena(position);
      const wasInArena = window.quickDraw.isPointInArena(this.previousPosition);
      
      // If player is in a duel, they must stay inside
      if (window.quickDraw.inDuel && !inArena && wasInArena) {
        return false; // Can't leave arena during duel
      }
      
      // If player is not in a duel, they must stay outside
      if (!window.quickDraw.inDuel && inArena && !wasInArena) {
        return false; // Can't enter arena from outside (except via the portal)
      }
    }
    
    // Check town boundary
    if (window.physics && typeof window.physics.isPointInTown === 'function') {
      if (!window.physics.isPointInTown(position)) {
        return false; // Can't leave town
      }
    } else if (window.townDimensions) {
      // Fallback if physics isn't available but town dimensions are
      const width = window.townDimensions.width;
      const length = window.townDimensions.length;
      
      if (
        position.x < -width / 2 || 
        position.x > width / 2 || 
        position.z < -length / 2 || 
        position.z > length / 2
      ) {
        return false; // Can't leave town
      }
    }
    
    return true; // No collision
  }

  /**
   * Send position/rotation updates to the server.
   */
  sendNetworkUpdate() {
    if (this.id == null) return;
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);

    networkManager.sendUpdate({
      position: {
        x: this.group.position.x,
        y: this.group.position.y,
        z: this.group.position.z
      },
      rotation: {
        y: this.group.rotation.y
      },
      isAiming: this.isAiming,
      isReloading: this.isReloading,
      health: this.health
    });
  }

  shoot() {
    if (this.bullets <= 0 || !this.canShoot || this.isReloading) {
      // No bullets or can't shoot
      if (this.bullets === 0) {
        const reloadMessage = document.getElementById('reload-message');
        if (reloadMessage) reloadMessage.style.display = 'block';
      }
      return;
    }
    // Actually shoot
    this.bullets--;
    updateAmmoUI(this);

    this.canShoot = false;
    setTimeout(() => { this.canShoot = true; }, 250);

    // Find bullet spawn
    const bulletStart = this.revolver.getBarrelTipWorldPosition();
    const shootDir = new THREE.Vector3();
    this.camera.getWorldDirection(shootDir);

    // Slight random spread
    shootDir.x += (Math.random() - 0.5) * 0.02;
    shootDir.y += (Math.random() - 0.5) * 0.02;
    shootDir.z += (Math.random() - 0.5) * 0.02;
    shootDir.normalize();

    // Recoil effect
    applyRecoil(this);

    // Call the callback to spawn bullet in main.js
    if (typeof this.onShootCallback === 'function') {
      this.onShootCallback(bulletStart, shootDir);
    }

    // If out of bullets, show reload hint
    if (this.bullets === 0) {
      const reloadMessage = document.getElementById('reload-message');
      if (reloadMessage) {
        reloadMessage.style.display = 'block';
      }
    }
  }

  /**
   * Called when the player takes damage.
   * @param {number} amount - Damage amount.
   */
  takeDamage(amount) {
    this.health = Math.max(this.health - amount, 0);
    console.log(`Player ${this.id} took ${amount} damage. Health is now ${this.health}`);
    updateHealthUI(this);
    // You could add death/respawn logic here
    if (this.health === 0) {
      console.log('Game Over');
      // Optionally, disable input or show a Game Over screen.
      this.respawn();
    }
  }

  /**
   * Respawn the player after death
   */
  respawn() {
    // Reset health
    this.health = 100;
    updateHealthUI(this);
    
    // Spawn at a random position
    this.spawnPlayerRandomly();
    
    // Reset weapon state
    this.bullets = this.maxBullets;
    this.isReloading = false;
    this.canAim = true;
    this.isAiming = false;
    updateAmmoUI(this);
    
    // Reset vertical velocity
    this.velocity.y = 0;
    
    console.log('Player respawned');
  }

  startReload() {
    if (this.isReloading || this.bullets >= this.maxBullets) return;

    this.isReloading = true;
    this.reloadProgress = 0;
    const reloadMessage = document.getElementById('reload-message');
    const reloadProgressContainer = document.getElementById('reload-progress-container');
    if (reloadMessage) reloadMessage.style.display = 'none';
    if (reloadProgressContainer) reloadProgressContainer.style.display = 'block';

    if (this.soundManager) {
      this.soundManager.playSound("shellejection");
      this.soundManager.playSound("reloading");
    }

    // Eject shells sequentially
    for (let i = 0; i < this.maxBullets - this.bullets; i++) {
      setTimeout(() => {
        ejectShell(this, this.scene, this.soundManager);
      }, i * 200);
    }

    const startTime = performance.now();
    const updateReload = (currentTime) => {
      const elapsed = currentTime - startTime;
      this.reloadProgress = Math.min((elapsed / this.reloadTime) * 100, 100);
      const reloadProgressBar = document.getElementById('reload-progress-bar');
      if (reloadProgressBar) {
        reloadProgressBar.style.width = this.reloadProgress + '%';
      }
      if (elapsed < this.reloadTime) {
        requestAnimationFrame(updateReload);
      } else {
        this.completeReload();
      }
    };
    requestAnimationFrame(updateReload);
  }

  completeReload() {
    this.bullets = this.maxBullets;
    updateAmmoUI(this);

    const reloadProgressContainer = document.getElementById('reload-progress-container');
    const reloadProgressBar = document.getElementById('reload-progress-bar');
    if (reloadProgressContainer) reloadProgressContainer.style.display = 'none';
    if (reloadProgressBar) reloadProgressBar.style.width = '0%';
    
    this.isReloading = false;
    this.sendNetworkUpdate(); // let others know
  }
}