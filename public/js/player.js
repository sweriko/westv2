import { Revolver } from './revolver.js';
import { Bullet } from './bullet.js';
import { updateAmmoUI } from './ui.js';
import { createMuzzleFlash, createSmokeEffect, createShockwaveRing, applyRecoil, ejectShell } from './effects.js';

export class Player {
  constructor(scene, camera, soundManager) {
    this.scene = scene;
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.position.set(0, 0, 0);
    this.scene.add(this.group);
    this.camera.position.set(0, 1.6, 0);
    this.group.add(this.camera);

    this.revolver = new Revolver();
    this.camera.add(this.revolver.group);
    this.holsterOffset = new THREE.Vector3(0.6, -0.5, -0.8);
    this.aimOffset = new THREE.Vector3(0.3, -0.3, -0.5);
    this.currentGunOffset = this.holsterOffset.clone();
    this.isAiming = false;

    this.defaultFOV = 75;
    this.aimFOV = 65;

    this.velocity = new THREE.Vector3();
    this.canJump = false;
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;

    this.bullets = 6;
    this.maxBullets = 6;
    this.isReloading = false;
    this.reloadTime = 2000; // milliseconds.
    this.reloadProgress = 0;
    this.canShoot = true;
    this.soundManager = soundManager;

    // Array to track active bullets.
    this.bulletsArray = [];
  }

  update(deltaTime) {
    // Smoothly interpolate gun offset & camera FOV.
    const targetOffset = this.isAiming ? this.aimOffset : this.holsterOffset;
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
  }

  shoot() {
    if (this.bullets > 0 && this.canShoot && !this.isReloading) {
      this.bullets--;
      updateAmmoUI(this);
      this.canShoot = false;
      setTimeout(() => { this.canShoot = true; }, 250);

      // Get bullet start position from gun barrel tip.
      const bulletStart = this.revolver.getBarrelTipWorldPosition();
      const shootDir = new THREE.Vector3();
      this.camera.getWorldDirection(shootDir);
      // Add slight randomness.
      shootDir.x += (Math.random() - 0.5) * 0.02;
      shootDir.y += (Math.random() - 0.5) * 0.02;
      shootDir.z += (Math.random() - 0.5) * 0.02;
      shootDir.normalize();

      const bullet = new Bullet(bulletStart, shootDir);
      this.bulletsArray.push(bullet);
      this.scene.add(bullet.mesh);

      // Create muzzle flash and other shooting effects.
      createMuzzleFlash(bulletStart, this.scene);
      createSmokeEffect(bulletStart, shootDir, this.scene);
      createShockwaveRing(bulletStart, shootDir, this.scene);
      applyRecoil(this);

      // Play a random shot sound (either shot1 or shot2).
      if (this.soundManager) {
        const shotSound = Math.random() < 0.5 ? "shot1" : "shot2";
        this.soundManager.playSound(shotSound);
      }
    }
    if (this.bullets === 0) {
      const reloadMessage = document.getElementById('reload-message');
      if (reloadMessage) {
        reloadMessage.style.display = 'block';
      }
    }
  }

  startReload() {
    if (!this.isReloading && this.bullets < this.maxBullets) {
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
      // Eject shells sequentially.
      for (let i = 0; i < this.maxBullets; i++) {
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
  }

  completeReload() {
    this.bullets = this.maxBullets;
    updateAmmoUI(this);
    const reloadProgressContainer = document.getElementById('reload-progress-container');
    const reloadProgressBar = document.getElementById('reload-progress-bar');
    if (reloadProgressContainer) reloadProgressContainer.style.display = 'none';
    if (reloadProgressBar) reloadProgressBar.style.width = '0%';
    this.isReloading = false;
  }
}
