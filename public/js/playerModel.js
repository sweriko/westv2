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

    // Health
    this.health = 100;

    // Target position/rotation for smooth interpolation.
    this.targetPosition = this.group.position.clone();
    this.targetRotation = this.group.rotation.y;

    // Load the T-pose model
    this.loadTposeModel();
    scene.add(this.group);

    this.walkCycle = 0;
    this.isWalking = false;
    this.lastPosition = new THREE.Vector3();

    // To track active hit feedback timeout.
    this.hitFeedbackTimeout = null;
  }

  loadTposeModel() {
    // Create loader instance
    const loader = new THREE.GLTFLoader();
    
    // Load the tpose.glb model
    loader.load('models/tpose.glb', (gltf) => {
      this.tposeModel = gltf.scene;
      
      // User indicated the model is offset Y by half its size downwards by default
      // So we need to raise it up to compensate
      this.tposeModel.position.set(0, 0.9, 0); // Raise it by 0.9 units
      
      // Set an appropriate scale for the model
      this.tposeModel.scale.set(0.8, 0.8, 0.8);
      
      // Add the model to the group
      this.group.add(this.tposeModel);
      
      // Debug info
      console.log('T-pose model loaded successfully');
      
      // Look through the model to set up meshes correctly
      this.tposeModel.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.userData.isPlayerMesh = true;
        }
      });
      
      // Store references to bones/objects for animation if needed
      this.setupModelReferences();
      
      // Add revolver to the model's hand
      this.addRevolver();
    }, 
    undefined,
    (error) => {
      console.error('Error loading tpose.glb model:', error);
    });
  }

  setupModelReferences() {
    // Find and store references to important bones/objects in the model
    // This depends on the structure of the tpose.glb model
    if (this.tposeModel) {
      // Example: Find head, arms, etc. based on their names in the model
      this.head = this.tposeModel.getObjectByName('Head') || this.tposeModel;
      this.rightArm = this.tposeModel.getObjectByName('RightArm') || this.tposeModel;
      this.leftArm = this.tposeModel.getObjectByName('LeftArm') || this.tposeModel;
      this.rightLeg = this.tposeModel.getObjectByName('RightLeg') || this.tposeModel;
      this.leftLeg = this.tposeModel.getObjectByName('LeftLeg') || this.tposeModel;
      this.body = this.tposeModel.getObjectByName('Body') || this.tposeModel;
    }
  }

  /**
   * Adds the revolver model to the model's left arm.
   */
  addRevolver() {
    this.revolver = new Revolver();
    
    // Initialize rotations
    this.revolverDefaultRotation = new THREE.Euler(-Math.PI / -1.5, Math.PI, 0);
    this.revolverAimingRotation = new THREE.Euler(-Math.PI / 0.7, Math.PI, 0);
    
    // Find a suitable hand/arm attachment point in the model
    let handAttachment = this.leftArm;
    
    // For T-pose model, we need to adjust the position and rotation
    this.revolver.group.position.set(0.1, 0, 0.1);
    this.revolver.group.rotation.set(0, Math.PI / 2, 0);
    this.revolver.group.scale.set(0.5, 0.5, 0.5);
    
    // Attach revolver to the hand
    if (handAttachment) {
      handAttachment.add(this.revolver.group);
    } else {
      // If no hand attachment found, attach to the main model
      this.tposeModel.add(this.revolver.group);
    }
    
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
   * Smoothly updates the model's position and rotation toward target values.
   * @param {number} deltaTime - Time elapsed since last frame.
   */
  animateMovement(deltaTime) {
    // Interpolate position and rotation for smooth remote movement
    this.group.position.lerp(this.targetPosition, 0.1);
    this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, this.targetRotation, 0.1);
    this.updateCollisionBox();
    
    // If we're using the tpose model, ensure its Y position is maintained at the correct offset
    if (this.tposeModel && this.tposeModel.position) {
      // Maintain the proper Y offset for the tpose model
      // If walking, the walk animation will handle the bobbing
      if (!this.isWalking) {
        this.tposeModel.position.y = 0.9;
      }
    }
  }

  /**
   * Updates the third-person model using data received from the server.
   * @param {Object} playerData
   */
  update(playerData) {
    if (!playerData) return;
    
    // Update target position from network data (shifting from eye-level to model base)
    if (playerData.position) {
      // Apply standard eye-level to base offset
      const yOffset = 1.6;
      
      const newPos = new THREE.Vector3(
        playerData.position.x,
        playerData.position.y - yOffset,
        playerData.position.z
      );
      this.targetPosition.copy(newPos);

      // Check if walking based on movement
      this.isWalking = newPos.distanceTo(this.lastPosition) > 0.01;
      this.lastPosition.copy(newPos);
    }

    // Update target rotation with a 180° offset for proper facing
    if (playerData.rotation && playerData.rotation.y !== undefined) {
      this.targetRotation = playerData.rotation.y + Math.PI;
    }

    // Set pose based on whether the player is aiming
    if (playerData.isAiming) {
      this.setAimingPose();
    } else {
      this.setNormalPose();
    }

    // Update health if provided
    if (playerData.health !== undefined) {
      this.health = playerData.health;
    }
  }

  /**
   * Sets the model's pose for aiming.
   */
  setAimingPose() {
    if (this.leftArm && this.leftArm !== this.tposeModel && this.leftArm.rotation) {
      this.leftArm.rotation.set(-Math.PI / 3, 0, 0);
    }
    
    if (this.head && this.head !== this.tposeModel && this.head.rotation) {
      this.head.rotation.x = 0.1;
    }
    
    if (this.revolver && this.revolver.group && this.revolverAimingRotation) {
      this.revolver.group.rotation.copy(this.revolverAimingRotation);
    }
  }

  /**
   * Sets the model's pose for normal (non-aiming) state.
   */
  setNormalPose() {
    if (this.leftArm && this.leftArm !== this.tposeModel && this.leftArm.rotation) {
      this.leftArm.rotation.set(0, 0, 0);
    }
    
    if (this.rightArm && this.rightArm !== this.tposeModel && this.rightArm.rotation) {
      this.rightArm.rotation.set(0, 0, 0);
    }
    
    if (this.head && this.head !== this.tposeModel && this.head.rotation) {
      this.head.rotation.x = 0;
    }
    
    if (this.revolver && this.revolver.group && this.revolverDefaultRotation) {
      this.revolver.group.rotation.copy(this.revolverDefaultRotation);
    }
  }

  /**
   * Placeholder for reload animation (kept for interface compatibility).
   * Shell ejection is handled separately in effects.js.
   */
  playReloadAnimation() {
    // Empty stub - reload animations have been removed
    return;
  }

  /**
   * Animates the walk cycle.
   * @param {number} deltaTime
   */
  animateWalk(deltaTime) {
    if (!this.isWalking) return;
    
    this.walkCycle += deltaTime * 5;
    
    // Simple animation for the tpose model - just a slight up/down bob
    const bobAmount = Math.sin(this.walkCycle) * 0.05;
    
    // Apply bob to the model itself, not the group (to maintain proper positioning)
    if (this.tposeModel && this.tposeModel.position) {
      // Keep the base y-offset of 0.9 and add the bob
      this.tposeModel.position.y = 0.9 + bobAmount;
    }
    
    // If we have identified body parts, we can animate them
    if (this.rightLeg && this.rightLeg !== this.tposeModel && this.rightLeg.rotation) {
      this.rightLeg.rotation.x = Math.sin(this.walkCycle) * 0.3;
    }
    
    if (this.leftLeg && this.leftLeg !== this.tposeModel && this.leftLeg.rotation) {
      this.leftLeg.rotation.x = Math.sin(this.walkCycle + Math.PI) * 0.3;
    }
    
    // Arm swing (if identified properly)
    if (this.rightArm && this.rightArm !== this.tposeModel && this.rightArm.rotation) {
      this.rightArm.rotation.x = Math.sin(this.walkCycle + Math.PI) * 0.2;
    }
    
    if (this.leftArm && this.leftArm !== this.tposeModel && this.leftArm.rotation) {
      this.leftArm.rotation.x = Math.sin(this.walkCycle) * 0.2;
    }
  }

  /**
   * Resets the walk animation.
   */
  resetWalkAnimation() {
    // Reset the tpose model position to its base offset
    if (this.tposeModel && this.tposeModel.position) {
      this.tposeModel.position.y = 0.9; // Reset to the base Y offset
    }
    
    // Reset individual part rotations if they exist
    if (this.rightLeg && this.rightLeg !== this.tposeModel && this.rightLeg.rotation) {
      this.rightLeg.rotation.x = 0;
    }
    
    if (this.leftLeg && this.leftLeg !== this.tposeModel && this.leftLeg.rotation) {
      this.leftLeg.rotation.x = 0;
    }
    
    if (this.rightArm && this.rightArm !== this.tposeModel && this.rightArm.rotation) {
      this.rightArm.rotation.x = 0;
    }
    
    if (this.leftArm && this.leftArm !== this.tposeModel && this.leftArm.rotation) {
      this.leftArm.rotation.x = 0;
    }
  }

  /**
   * Removes the model from the scene (e.g. on player disconnect).
   * Fully disposes geometry and material.
   */
  remove() {
    this.scene.remove(this.group);
    this.group.traverse(child => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }

  /**
   * Provides visual feedback (temporary red flash) when the model is hit.
   */
  showHitFeedback() {
    // Clear any existing hit feedback timeout.
    if (this.hitFeedbackTimeout) {
      clearTimeout(this.hitFeedbackTimeout);
    }
    // Traverse the model and replace each mesh's material with a red flash.
    this.group.traverse(child => {
      if (child.isMesh && child.material) {
        // Store the original material in userData if not already stored.
        if (!child.userData.originalMaterial) {
          child.userData.originalMaterial = child.material;
        }
        child.material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        child.material.needsUpdate = true;
      }
    });
    // After 200ms, restore the original materials.
    this.hitFeedbackTimeout = setTimeout(() => {
      this.group.traverse(child => {
        if (child.isMesh && child.userData.originalMaterial) {
          child.material.dispose();
          child.material = child.userData.originalMaterial;
          child.material.needsUpdate = true;
          delete child.userData.originalMaterial;
        }
      });
      this.hitFeedbackTimeout = null;
    }, 200);
  }

  /**
   * Reduces health when hit.
   * @param {number} amount - Damage amount.
   */
  takeDamage(amount) {
    this.health = Math.max(this.health - amount, 0);
    console.log(`Remote player ${this.playerId} took ${amount} damage. Health: ${this.health}`);
  }
}