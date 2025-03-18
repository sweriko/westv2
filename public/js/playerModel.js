// /public/js/playerModel.js
import { Revolver } from './revolver.js';

/**
 * A simple blocky first-person arms model.
 */
export class PlayerArms {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();

    // Right arm
    this.rightArm = this.createBlockyArm(0xC68642);
    this.rightArm.position.set(0.3, -0.4, -0.3);
    this.rightArm.rotation.set(0.3, 0, 0);
    this.group.add(this.rightArm);

    // Left arm
    this.leftArm = this.createBlockyArm(0xC68642);
    this.leftArm.position.set(-0.3, -0.4, -0.3);
    this.leftArm.rotation.set(0.3, 0, 0);
    this.group.add(this.leftArm);

    // Store initial positions/rotations for animations
    this.rightArmOriginalPos = this.rightArm.position.clone();
    this.rightArmOriginalRot = this.rightArm.rotation.clone();
    this.leftArmOriginalPos = this.leftArm.position.clone();
    this.leftArmOriginalRot = this.leftArm.rotation.clone();

    // Initially not visible
    this.setVisible(false);
  }

  /**
   * Creates a blocky "arm" geometry (only a small cube).
   * @param {number} color - Hex color (e.g. 0xC68642)
   * @returns {THREE.Group}
   */
  createBlockyArm(color) {
    const armGroup = new THREE.Group();

    // A small "hand" cube
    const handGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const handMat = new THREE.MeshStandardMaterial({ color });
    const handMesh = new THREE.Mesh(handGeo, handMat);
    armGroup.add(handMesh);

    return armGroup;
  }

  /**
   * Sets the arms' visibility.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.group.visible = visible;
  }

  /**
   * Updates arms for aiming. (Example usage in first-person code.)
   * @param {THREE.Camera} camera
   * @param {boolean} isAiming
   * @param {THREE.Vector3} gunBarrelTip
   */
  updatePosition(camera, isAiming, gunBarrelTip = null) {
    if (isAiming) {
      // Hide left arm by default (single-handed revolver stance)
      this.leftArm.visible = false;
      // Show right arm for aiming
      this.rightArm.visible = true;

      if (gunBarrelTip) {
        // Rough alignment based on gun barrel tip if desired
        this.rightArm.position.set(0.32, -0.35, -0.5);
        this.rightArm.rotation.set(Math.PI / 2, 0, 0);
      }
    } else {
      // Hide arms when not aiming
      this.rightArm.visible = false;
      this.leftArm.visible = false;
    }
  }

  /**
   * Plays a smooth reload animation using the left arm.
   * (This method is for the first-person arms model and remains unchanged.)
   */
  playReloadAnimation() {
    const originalPos = this.leftArm.position.clone();
    const originalRot = this.leftArm.rotation.clone();

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    const frames = [
      { t: 0,   pos: { x: -0.3, y: -0.4, z: -0.3 },      rot: { x: 0, y: 0, z: 0 } },
      { t: 300, pos: { x: -0.1, y: -0.2, z: -0.3 },      rot: { x: -0.2, y: 0.1, z: 0.1 } },
      { t: 600, pos: { x: -0.1, y: -0.2, z: -0.3 },      rot: { x: -0.3, y: 0.1, z: 0.1 } },
      { t: 900, pos: { x: -0.3, y: -0.4, z: -0.3 },      rot: { x: 0, y: 0, z: 0 } }
    ];

    const startTime = performance.now();

    const animate = (time) => {
      const elapsed = time - startTime;
      let currentFrame = frames[0];
      let nextFrame = frames[frames.length - 1];
      for (let i = 0; i < frames.length - 1; i++) {
        if (elapsed >= frames[i].t && elapsed < frames[i + 1].t) {
          currentFrame = frames[i];
          nextFrame = frames[i + 1];
          break;
        }
      }
      const segmentDuration = nextFrame.t - currentFrame.t;
      let segmentTime = elapsed - currentFrame.t;
      let alpha = Math.min(segmentTime / segmentDuration, 1);
      alpha = easeInOutCubic(alpha);

      const lerp = (a, b, t) => a + (b - a) * t;
      const newPos = {
        x: lerp(currentFrame.pos.x, nextFrame.pos.x, alpha),
        y: lerp(currentFrame.pos.y, nextFrame.pos.y, alpha),
        z: lerp(currentFrame.pos.z, nextFrame.pos.z, alpha)
      };
      const newRot = {
        x: lerp(currentFrame.rot.x, nextFrame.rot.x, alpha),
        y: lerp(currentFrame.rot.y, nextFrame.rot.y, alpha),
        z: lerp(currentFrame.rot.z, nextFrame.rot.z, alpha)
      };

      this.leftArm.position.set(newPos.x, newPos.y, newPos.z);
      this.leftArm.rotation.set(newRot.x, newRot.y, newRot.z);

      if (elapsed < frames[frames.length - 1].t) {
        requestAnimationFrame(animate);
      } else {
        this.leftArm.position.copy(originalPos);
        this.leftArm.rotation.copy(originalRot);
      }
    };
    requestAnimationFrame(animate);
  }
}

/**
 * The third-person model used to represent remote players
 * (and possibly the local player in others' view).
 */
export class ThirdPersonModel {
  constructor(scene, playerId) {
    this.scene = scene;
    this.playerId = playerId;
    this.group = new THREE.Group();

    this.collisionBox = new THREE.Box3();
    this.hitboxSize = { width: 0.6, height: 1.8, depth: 0.6 };

    // Build a basic "Minecraft-like" character.
    this.createBlockyCharacter();
    scene.add(this.group);

    this.walkCycle = 0;
    this.isWalking = false;
    this.lastPosition = new THREE.Vector3();
  }

  createBlockyCharacter() {
    // Head
    const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xC68642 });
    this.head = new THREE.Mesh(headGeo, headMat);
    this.head.position.y = 1.6;
    this.group.add(this.head);

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.4, 0.6, 0.2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3F51B5 });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.position.y = 1.1;
    this.group.add(this.body);

    // Arms
    this.createBlockyArms();
    // Legs
    this.createBlockyLegs();
    // Hat
    this.createCowboyHat();

    // Use the normal revolver model on the left arm.
    this.addRevolver();
  }

  createBlockyArms() {
    // Right arm
    const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xC68642 });
    this.rightArm = new THREE.Group();
    const rightArmMesh = new THREE.Mesh(armGeo, skinMat);
    rightArmMesh.position.y = -0.3;
    this.rightArm.add(rightArmMesh);
    this.rightArm.position.set(0.3, 1.4, 0);
    this.group.add(this.rightArm);

    // Left arm (holding the revolver)
    this.leftArm = new THREE.Group();
    const leftArmMesh = new THREE.Mesh(armGeo, skinMat);
    leftArmMesh.position.y = -0.3;
    this.leftArm.add(leftArmMesh);
    this.leftArm.position.set(-0.3, 1.4, 0);
    this.group.add(this.leftArm);
  }

  createBlockyLegs() {
    const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1A237E });
    // Right leg
    this.rightLeg = new THREE.Group();
    const rightLegMesh = new THREE.Mesh(legGeo, pantsMat);
    rightLegMesh.position.y = -0.3;
    this.rightLeg.add(rightLegMesh);
    // Adjusted leg group vertical position from 0.6 to 0.8
    this.rightLeg.position.set(0.1, 0.8, 0);
    this.group.add(this.rightLeg);

    // Left leg
    this.leftLeg = new THREE.Group();
    const leftLegMesh = new THREE.Mesh(legGeo, pantsMat);
    leftLegMesh.position.y = -0.3;
    this.leftLeg.add(leftLegMesh);
    // Adjusted leg group vertical position from 0.6 to 0.8
    this.leftLeg.position.set(-0.1, 0.8, 0);
    this.group.add(this.leftLeg);
  }

  createCowboyHat() {
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });

    // Hat brim
    const brimGeo = new THREE.BoxGeometry(0.5, 0.05, 0.5);
    this.hatBrim = new THREE.Mesh(brimGeo, hatMat);
    this.hatBrim.position.y = 0.225;
    this.head.add(this.hatBrim);

    // Hat top
    const topGeo = new THREE.BoxGeometry(0.3, 0.15, 0.3);
    this.hatTop = new THREE.Mesh(topGeo, hatMat);
    this.hatTop.position.y = 0.325;
    this.head.add(this.hatTop);
  }

  /**
   * Adds the normal revolver model to the third-person model's left arm.
   * The left arm holds the revolver.
   */
  addRevolver() {
    this.revolver = new Revolver();
    // Attach the revolver to the left arm.
    this.leftArm.add(this.revolver.group);
    // Set default positions and rotations for non-aiming state.
    this.revolverDefaultRotation = new THREE.Euler(-Math.PI / -1.5, Math.PI, 0);
    this.revolverAimingRotation = new THREE.Euler(-Math.PI / 0.7, Math.PI, 0);
    this.revolver.group.position.set(0.05, -0.8, -0.1);
    this.revolver.group.rotation.copy(this.revolverDefaultRotation);
    this.revolver.group.visible = true;
  }

  updateCollisionBox() {
    const halfWidth = this.hitboxSize.width / 2;
    const halfDepth = this.hitboxSize.depth / 2;

    this.collisionBox.setFromPoints([
      new THREE.Vector3(
        this.group.position.x - halfWidth,
        this.group.position.y,
        this.group.position.z - halfDepth
      ),
      new THREE.Vector3(
        this.group.position.x + halfWidth,
        this.group.position.y + this.hitboxSize.height,
        this.group.position.z + halfDepth
      )
    ]);
  }

  /**
   * Updates the third-person model using data received from the server.
   * @param {Object} playerData
   */
  update(playerData) {
    // Shift down from eye-level (data) to model base.
    const newPos = new THREE.Vector3(
      playerData.position.x,
      playerData.position.y - 1.6,
      playerData.position.z
    );

    // Check if walking based on movement.
    this.isWalking = newPos.distanceTo(this.lastPosition) > 0.01;
    this.lastPosition.copy(newPos);

    this.group.position.copy(newPos);

    // Rotate the model to face the proper direction (+180 offset).
    if (playerData.rotation && playerData.rotation.y !== undefined) {
      this.group.rotation.y = playerData.rotation.y + Math.PI;
    }

    // Set pose based on whether the player is aiming.
    if (playerData.isAiming) {
      this.setAimingPose();
    } else {
      this.setNormalPose();
    }

    // If reloading, play the reload animation.
    if (playerData.isReloading) {
      this.playReloadAnimation();
    }

    this.updateCollisionBox();
  }

  /**
   * Sets the model's pose for aiming.
   * The revolver (left arm) is rotated up by 90°.
   */
  setAimingPose() {
    // Right arm remains at default.
    this.rightArm.rotation.set(0, 0, 0);
    this.rightArm.position.set(0.3, 1.4, 0);

    // Left arm (holding revolver) rotates upward.
    this.leftArm.rotation.set(-Math.PI / 2, 0, 0);
    this.leftArm.position.set(-0.3, 1.4, 0);

    if (this.revolver) {
      this.revolver.group.rotation.copy(this.revolverAimingRotation);
    }

    this.head.rotation.x = 0.1;
  }

  /**
   * Sets the model's pose for normal (non-aiming) state.
   * The revolver (left arm) is rotated down a bit.
   */
  setNormalPose() {
    // Right arm stays default.
    this.rightArm.rotation.set(0, 0, 0);
    this.rightArm.position.set(0.3, 1.4, 0);

    // Left arm (holding revolver) is held lower.
    this.leftArm.rotation.set(-Math.PI / 15, 0, 0);
    this.leftArm.position.set(-0.3, 1.4, 0);

    if (this.revolver) {
      this.revolver.group.rotation.copy(this.revolverDefaultRotation);
    }

    this.head.rotation.x = 0;
  }

  /**
   * Plays a smooth reload animation for the model.
   * The reload animation is performed by the right arm (the one not holding the revolver),
   * moving it up and sideways (by about 45°) towards the revolver arm with 2 back-and-forth cycles
   * before returning to its default position.
   */
  playReloadAnimation() {
    const originalPos = this.rightArm.position.clone();
    const originalRot = this.rightArm.rotation.clone();

    // Define keyframes (in ms) for the right arm reload motion.
    const frames = [
      { t: 0,    pos: { x: 0.3,  y: 1.4, z: 0 },        rot: { x: 0,       y: 0, z: 0 } },
      { t: 250,  pos: { x: 0.2,  y: 1.5, z: 0 },        rot: { x: -Math.PI / 4, y: 0, z: -Math.PI / 4 } },
      { t: 500,  pos: { x: 0.3,  y: 1.4, z: 0 },        rot: { x: 0,       y: 0, z: 0 } },
      { t: 750,  pos: { x: 0.2,  y: 1.5, z: 0 },        rot: { x: -Math.PI / 4, y: 0, z: -Math.PI / 4 } },
      { t: 1000, pos: { x: 0.3,  y: 1.4, z: 0 },        rot: { x: 0,       y: 0, z: 0 } }
    ];

    const startTime = performance.now();

    const animate = (time) => {
      const elapsed = time - startTime;
      let currentFrame = frames[0];
      let nextFrame = frames[frames.length - 1];
      for (let i = 0; i < frames.length - 1; i++) {
        if (elapsed >= frames[i].t && elapsed < frames[i + 1].t) {
          currentFrame = frames[i];
          nextFrame = frames[i + 1];
          break;
        }
      }
      const segmentDuration = nextFrame.t - currentFrame.t;
      let segmentTime = elapsed - currentFrame.t;
      let alpha = Math.min(segmentTime / segmentDuration, 1);

      // Cubic easing for smooth interpolation.
      const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      alpha = easeInOutCubic(alpha);

      const lerp = (a, b, t) => a + (b - a) * t;
      const newPos = {
        x: lerp(currentFrame.pos.x, nextFrame.pos.x, alpha),
        y: lerp(currentFrame.pos.y, nextFrame.pos.y, alpha),
        z: lerp(currentFrame.pos.z, nextFrame.pos.z, alpha)
      };
      const newRot = {
        x: lerp(currentFrame.rot.x, nextFrame.rot.x, alpha),
        y: lerp(currentFrame.rot.y, nextFrame.rot.y, alpha),
        z: lerp(currentFrame.rot.z, nextFrame.rot.z, alpha)
      };

      this.rightArm.position.set(newPos.x, newPos.y, newPos.z);
      this.rightArm.rotation.set(newRot.x, newRot.y, newRot.z);

      if (elapsed < frames[frames.length - 1].t) {
        requestAnimationFrame(animate);
      } else {
        this.rightArm.position.copy(originalPos);
        this.rightArm.rotation.copy(originalRot);
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Animates the walk cycle.
   * @param {number} deltaTime
   */
  animateWalk(deltaTime) {
    this.walkCycle += deltaTime * 5;
    // Leg swing
    this.rightLeg.rotation.x = Math.sin(this.walkCycle) * 0.7;
    this.leftLeg.rotation.x = Math.sin(this.walkCycle + Math.PI) * 0.7;

    // Arm swing (if not in an aiming pose)
    if (this.rightArm.rotation.x === 0 && this.leftArm.rotation.x === 0) {
      this.rightArm.rotation.x = Math.sin(this.walkCycle + Math.PI) * 0.5;
      this.leftArm.rotation.x = Math.sin(this.walkCycle) * 0.5;
    }

    // Subtle body bob
    this.body.position.y = 1.1 + Math.abs(Math.sin(this.walkCycle * 2)) * 0.05;
  }

  /**
   * Resets the walk animation.
   */
  resetWalkAnimation() {
    this.rightLeg.rotation.x = 0;
    this.leftLeg.rotation.x = 0;

    if (Math.abs(this.rightArm.rotation.x) < 0.1 &&
        Math.abs(this.leftArm.rotation.x) < 0.1) {
      this.rightArm.rotation.x = 0;
      this.leftArm.rotation.x = 0;
    }
    this.body.position.y = 1.1;
  }

  /**
   * Removes the model from the scene (e.g. on player disconnect).
   */
  remove() {
    this.scene.remove(this.group);
  }

  /**
   * Provides visual feedback (flash red) when the model is hit.
   */
  showHitFeedback() {
    const originalMaterials = [];

    this.group.traverse((child) => {
      if (child.isMesh && child.material) {
        const cloneMat = child.material.clone();
        originalMaterials.push({ mesh: child, mat: cloneMat });
        child.material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      }
    });

    setTimeout(() => {
      originalMaterials.forEach(({ mesh, mat }) => {
        mesh.material.dispose();
        mesh.material = mat;
      });
    }, 200);
  }
}
