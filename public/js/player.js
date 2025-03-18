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
    this.group.position.set(0, 1.6, 0); // Start near eye level
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

    // Aiming
    this.isAiming = false;
    this.defaultFOV = 75;
    this.aimFOV = 65;
    
    // Gun
    this.revolver = new Revolver();
    this.holsterOffset = new THREE.Vector3(0.6, -0.5, -0.8);
    this.aimOffset = new THREE.Vector3(0.3, -0.3, -0.5);
    this.currentGunOffset = this.holsterOffset.clone();
    this.camera.add(this.revolver.group);

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

    // Initialize network & UI
    this.initNetworking();
    updateAmmoUI(this);
    updateHealthUI(this);
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
    // Smoothly interpolate the gun offset & FOV
    const targetOffset = this.isAiming ? this.aimOffset : this.holsterOffset;
    this.currentGunOffset.lerp(targetOffset, 0.1);
    this.revolver.group.position.copy(this.currentGunOffset);

    this.camera.fov = THREE.MathUtils.lerp(
      this.camera.fov,
      this.isAiming ? this.aimFOV : this.defaultFOV,
      0.1
    );
    this.camera.updateProjectionMatrix();

    // Gravity
    this.velocity.y -= 20 * deltaTime;
    this.group.position.y += this.velocity.y * deltaTime;
    if (this.group.position.y < 1.6) {
      this.velocity.y = 0;
      this.group.position.y = 1.6;
      this.canJump = true;
    }

    // Movement
    const moveSpeed = 5;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    if (this.moveForward) this.group.position.add(forward.clone().multiplyScalar(moveSpeed * deltaTime));
    if (this.moveBackward) this.group.position.add(forward.clone().multiplyScalar(-moveSpeed * deltaTime));
    if (this.moveLeft) this.group.position.add(right.clone().multiplyScalar(-moveSpeed * deltaTime));
    if (this.moveRight) this.group.position.add(right.clone().multiplyScalar(moveSpeed * deltaTime));

    // Send periodic network updates
    const now = performance.now();
    if (now - this.lastNetworkUpdate > this.networkUpdateInterval) {
      this.lastNetworkUpdate = now;
      this.sendNetworkUpdate();
    }
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
    }
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
