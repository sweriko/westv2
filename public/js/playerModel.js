// /public/js/playerModel.js

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
    this.hitboxSize = { width: 1.02, height: 3.06, depth: 1.02 };
    
    // Hit zones for damage calculations
    this.headHitbox = new THREE.Box3();
    this.bodyHitbox = new THREE.Box3();
    this.limbsHitbox = new THREE.Box3();
    
    // Define hit zone relative sizes - adjusted for better accuracy
    this.headSize = { width: 0.45, height: 0.45, depth: 0.45 }; // Slightly smaller head hitbox
    this.bodySize = { width: 0.8, height: 0.95, depth: 0.55 }; // Narrower and much shorter body
    this.limbsSize = { width: 1.02, height: 3.06, depth: 1.02 }; // Full character size
    
    // Vertical offsets for positioning hitboxes more accurately
    this.headOffset = 0.45; // Further increased to move head lower
    this.bodyOffset = 0.25; // Adjusted to prevent overlap with head

    // Health
    this.health = 100;

    // Target position/rotation for smooth interpolation
    this.targetPosition = new THREE.Vector3(0, 0, 0);
    this.targetRotation = 0;
    
    // Initialize the group position to match target position
    this.group.position.copy(this.targetPosition);
    this.group.rotation.y = this.targetRotation;

    // Animation states
    this.animationMixer = null;
    this.animations = {};
    this.currentAction = null;
    this.previousAction = null;
    
    // Movement state tracking
    this.isWalking = false;
    this.isRunning = false;
    this.isJumping = false;
    this.lastPosition = new THREE.Vector3();
    this.movementSpeed = 0;
    
    // Animation timing - reduced for faster transitions
    this.walkBlendTime = 0.15;     // Blend between walking animations
    this.jumpBlendTime = 0.01;     // Almost immediate jump animation
    
    // Animation state protection - reduced for faster responsiveness
    this.animationCooldown = 0;
    this.minAnimationCooldown = 0.2; // Reduced from 0.5 seconds
    
    // Position adjustment to prevent sinking
    this.groundOffset = 0; // Reduced from 0.1 to make feet touch the ground
    
    // Load the player model
    this.loadPlayerModel();
    
    // Add to scene
    scene.add(this.group);

    // To track active hit feedback timeout
    this.hitFeedbackTimeout = null;
  }

  loadPlayerModel() {
    // Create loader instance
    const loader = new THREE.GLTFLoader();
    
    // Load the playermodel.glb model
    loader.load('models/playermodel.glb', 
      // Success callback
      (gltf) => {
        try {
          this.playerModel = gltf.scene;
          
          // Position at origin with no offset to make feet touch the ground
          this.playerModel.position.set(0, 0, 0);
          
          // Set scale - increased by 70%
          this.playerModel.scale.set(1.445, 1.445, 1.445);
          
          // Rotate model to face the right direction (might need adjustment)
          this.playerModel.rotation.y = Math.PI; // Rotate 180 degrees
      
          // Add the model to the group
          this.group.add(this.playerModel);
          
          // Set up meshes correctly
          this.playerModel.traverse(child => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.userData.isPlayerMesh = true;
              
              // Ensure materials are set up correctly
              if (child.material) {
                child.material.side = THREE.DoubleSide;
                
                // If this is a skinned mesh, ensure skinning is enabled
                if (child.isSkinnedMesh) {
                  child.material.skinning = true;
                }
                
                child.material.needsUpdate = true;
              }
            }
          });
          
          // Set up animations - do this after model is loaded
          if (gltf.animations && gltf.animations.length > 0) {
            // Initialize animations immediately
            this.setupAnimations(gltf.animations);
          }
          
          // Initialize hit zone visualizers
          this.createHitZoneVisualizers();
        } catch (e) {
          console.error('Error setting up player model:', e);
        }
      }, 
      // Progress callback - silent
      () => {},
      // Error callback
      (error) => {
        console.error('Error loading playermodel.glb model:', error);
        
        // If model fails to load, create a fallback cube
        const geometry = new THREE.BoxGeometry(0.5, 1.8, 0.5);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const cube = new THREE.Mesh(geometry, material);
        cube.position.set(0, 0.9, 0);  // Position at center, accounting for height
        this.group.add(cube);
        
        // Add hit zone visualizers even for fallback model
        this.createHitZoneVisualizers();
      }
    );
  }

  setupAnimations(animations) {
    if (!animations || animations.length === 0) {
      return;
    }
    
    try {
      // Create animation mixer
      this.animationMixer = new THREE.AnimationMixer(this.playerModel);
      
      // Store all animations from the model
      animations.forEach(animation => {
        try {
          this.animations[animation.name] = this.animationMixer.clipAction(animation);
          
          // Configure animation properties
          this.animations[animation.name].setEffectiveTimeScale(1);
          this.animations[animation.name].setEffectiveWeight(1);
          
          // Set loop mode based on animation type
          if (animation.name === 'idle' || animation.name === 'walking' || animation.name === 'running') {
            this.animations[animation.name].setLoop(THREE.LoopRepeat);
          } else if (animation.name === 'jump') {
            this.animations[animation.name].setLoop(THREE.LoopOnce);
            this.animations[animation.name].clampWhenFinished = true;
          }
        } catch (e) {
          console.error(`Error setting up animation ${animation.name}:`, e);
        }
      });
      
      // Initialize with idle animation if available
      if (this.animations['idle']) {
        this.playAnimation('idle');
      }
    } catch (e) {
      console.error('Failed to set up animations:', e);
    }
  }

  // Cross-fade between animations with specific blend time
  fadeToAction(actionName, duration = 0.5) {
    // Don't proceed if animations aren't loaded yet
    if (!this.animations || !this.animations[actionName]) {
      return null;
    }
    
    // Don't interrupt if same animation already playing
    if (this.currentAction && this.currentAction._clip.name === actionName) {
      return this.currentAction;
    }
    
    // Get the requested animation
    const nextAction = this.animations[actionName];
    
    // Store previous action
    this.previousAction = this.currentAction;
    this.currentAction = nextAction;
    
    // If a previous action exists, cross-fade to the new action
    if (this.previousAction) {
      this.currentAction.reset();
      this.currentAction.setEffectiveWeight(1);
      this.currentAction.play();
      
      this.currentAction.crossFadeFrom(this.previousAction, duration, true);
    } else {
      // First animation - just play it
      this.currentAction.play();
    }
    
    return this.currentAction;
  }

  // Play animation with appropriate fade time
  playAnimation(animationName, customFadeTime = null) {
    let fadeTime = customFadeTime;
    
    // Set specific fade times based on animation if not explicitly provided
    if (fadeTime === null) {
      switch (animationName) {
        case 'jump':
          fadeTime = this.jumpBlendTime;
          break;
        default:
          fadeTime = this.walkBlendTime;
      }
    }
    
    // Play the animation with the determined fade time
    return this.fadeToAction(animationName, fadeTime);
  }

  // Simpler directToWalking implementation
  directToWalking(isRunning = false) {
    // Prevent rapid animation changes by enforcing a cooldown
    if (this.animationCooldown > 0) {
      return;
    }
    
    // Set walking state
    this.isWalking = true;
    
    // Set animation based on speed
    if (isRunning) {
      this.isRunning = true;
      this.playAnimation('running', 0.1);
    } else {
      this.isRunning = false;
      this.playAnimation('walking', 0.1);
    }
    
    // Set cooldown to prevent immediate state changes
    this.animationCooldown = this.minAnimationCooldown;
  }

  // Simpler directToIdle implementation
  directToIdle() {
    // Prevent rapid animation changes
    if (this.animationCooldown > 0) {
      return;
    }
    
    // Only stop if we're actually walking
    if (!this.isWalking) {
      return;
    }
    
    // Mark as idle
    this.isWalking = false;
    this.isRunning = false;
    
    // Set cooldown to prevent immediate state changes
    this.animationCooldown = this.minAnimationCooldown;
    
    // Play idle animation
    this.playAnimation('idle', 0.1);
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
    
    // Update hit zones with exact positioning
    
    // Head hitbox (top of the model but offset downward)
    const headHalfWidth = this.headSize.width / 2;
    const headHalfDepth = this.headSize.depth / 2;
    const headHeight = this.headSize.height;
    // Position head at the top of the model with offset
    const headY = this.group.position.y + this.hitboxSize.height - headHeight - this.headOffset;
    
    this.headHitbox.setFromPoints([
      new THREE.Vector3(
        this.group.position.x - headHalfWidth,
        headY,
        this.group.position.z - headHalfDepth
      ),
      new THREE.Vector3(
        this.group.position.x + headHalfWidth,
        headY + headHeight,
        this.group.position.z + headHalfDepth
      )
    ]);
    
    // Body hitbox (middle of the model)
    const bodyHalfWidth = this.bodySize.width / 2;
    const bodyHalfDepth = this.bodySize.depth / 2;
    const bodyHeight = this.bodySize.height;
    // Adjust body position to be just below the head with offset
    const topOfBody = headY; // Body starts where head ends
    const bodyBottom = topOfBody - bodyHeight - this.bodyOffset; // Apply the body offset
    
    this.bodyHitbox.setFromPoints([
      new THREE.Vector3(
        this.group.position.x - bodyHalfWidth,
        bodyBottom,
        this.group.position.z - bodyHalfDepth
      ),
      new THREE.Vector3(
        this.group.position.x + bodyHalfWidth,
        topOfBody,
        this.group.position.z + bodyHalfDepth
      )
    ]);
    
    // Limbs hitbox is everything not covered by head and body
    // Create a specific limbs hitbox for arms and legs with precise sizes
    
    // Define precise limb dimensions
    const legWidth = this.bodySize.width * 0.4; // Legs are narrower than body
    const armWidth = this.bodySize.width * 0.15; // Make arms thinner
    const armExtension = 0.35; // Extend arms further out
    const armHeight = bodyHeight * 0.7; // Make arms taller (70% of body height)
    
    // Left leg hitbox
    const leftLegHitbox = new THREE.Box3();
    leftLegHitbox.setFromPoints([
      new THREE.Vector3(
        this.group.position.x - bodyHalfWidth/2 - legWidth/2,
        this.group.position.y,
        this.group.position.z - bodyHalfDepth
      ),
      new THREE.Vector3(
        this.group.position.x - bodyHalfWidth/2 + legWidth/2,
        bodyBottom,
        this.group.position.z + bodyHalfDepth
      )
    ]);
    
    // Right leg hitbox
    const rightLegHitbox = new THREE.Box3();
    rightLegHitbox.setFromPoints([
      new THREE.Vector3(
        this.group.position.x + bodyHalfWidth/2 - legWidth/2,
        this.group.position.y,
        this.group.position.z - bodyHalfDepth
      ),
      new THREE.Vector3(
        this.group.position.x + bodyHalfWidth/2 + legWidth/2,
        bodyBottom,
        this.group.position.z + bodyHalfDepth
      )
    ]);
    
    // Left arm hitbox - positioned to not overlap with body
    const leftArmHitbox = new THREE.Box3();
    leftArmHitbox.setFromPoints([
      new THREE.Vector3(
        this.group.position.x - bodyHalfWidth - armExtension, // Start outside body
        bodyBottom + bodyHeight * 0.15, // Start lower (15% up)
        this.group.position.z - bodyHalfDepth/1.5 // Narrower depth
      ),
      new THREE.Vector3(
        this.group.position.x - bodyHalfWidth, // End exactly at body edge
        bodyBottom + bodyHeight * 0.85, // End higher (85% up)
        this.group.position.z + bodyHalfDepth/1.5 // Narrower depth
      )
    ]);
    
    // Right arm hitbox - positioned to not overlap with body
    const rightArmHitbox = new THREE.Box3();
    rightArmHitbox.setFromPoints([
      new THREE.Vector3(
        this.group.position.x + bodyHalfWidth, // Start exactly at body edge
        bodyBottom + bodyHeight * 0.15, // Start lower
        this.group.position.z - bodyHalfDepth/1.5 // Narrower depth
      ),
      new THREE.Vector3(
        this.group.position.x + bodyHalfWidth + armExtension, // End outside body
        bodyBottom + bodyHeight * 0.85, // End higher
        this.group.position.z + bodyHalfDepth/1.5 // Narrower depth
      )
    ]);
    
    // Combine the leg and arm hitboxes for the limbs hitbox
    this.limbsHitbox.makeEmpty();
    this.limbsHitbox.union(leftLegHitbox);
    this.limbsHitbox.union(rightLegHitbox);
    this.limbsHitbox.union(leftArmHitbox);
    this.limbsHitbox.union(rightArmHitbox);
  }

  /**
   * Determines which hit zone a ray intersects with
   * @param {THREE.Ray} ray - The ray to test
   * @returns {string|null} - 'head', 'body', 'limbs', or null if no hit
   */
  getHitZone(ray) {
    // Temporary variables for intersection checks
    const invMatrix = new THREE.Matrix4();
    invMatrix.copy(this.group.matrixWorld).invert();
    
    // Transform ray to model local space
    const localRay = ray.clone();
    localRay.applyMatrix4(invMatrix);
    
    // Check for intersection with head
    if (localRay.intersectsBox(this.headHitbox)) {
      return 'head';
    }
    
    // Check for intersection with body
    if (localRay.intersectsBox(this.bodyHitbox)) {
      return 'body';
    }
    
    // Check for intersection with limbs
    if (localRay.intersectsBox(this.limbsHitbox)) {
      return 'limbs';
    }
    
    // No hit
    return null;
  }

  /**
   * Check if a bullet hit this player model and determine which zone was hit
   * @param {THREE.Vector3} bulletPos - Position of the bullet
   * @return {object} - Hit result with zone and damage information
   */
  checkBulletHit(bulletPos) {
    // Add a small tolerance to prevent edge cases and near-miss detections
    const PRECISION_EPSILON = 0.01;
    
    // First check if bullet is clearly within the overall collision box with precision adjustment
    // This prevents false positives at the edge of the collision box
    const strictCollisionBox = this.collisionBox.clone();
    strictCollisionBox.min.add(new THREE.Vector3(PRECISION_EPSILON, PRECISION_EPSILON, PRECISION_EPSILON));
    strictCollisionBox.max.sub(new THREE.Vector3(PRECISION_EPSILON, PRECISION_EPSILON, PRECISION_EPSILON));
    
    if (!strictCollisionBox.containsPoint(bulletPos)) {
      return { hit: false, zone: null, damage: 0 };
    }
    
    // Test hitboxes in priority order (head > body > limbs)
    // A bullet can only count as hitting ONE hitbox to prevent double-counting
    
    // 1. Head check (highest damage) - most important, so check first
    const strictHeadBox = this.headHitbox.clone();
    strictHeadBox.min.add(new THREE.Vector3(PRECISION_EPSILON, PRECISION_EPSILON, PRECISION_EPSILON));
    strictHeadBox.max.sub(new THREE.Vector3(PRECISION_EPSILON, PRECISION_EPSILON, PRECISION_EPSILON));
    
    if (strictHeadBox.containsPoint(bulletPos)) {
      return { hit: true, zone: 'head', damage: 100 };
    }
    
    // 2. Body check (medium damage)
    const strictBodyBox = this.bodyHitbox.clone();
    strictBodyBox.min.add(new THREE.Vector3(PRECISION_EPSILON, PRECISION_EPSILON, PRECISION_EPSILON));
    strictBodyBox.max.sub(new THREE.Vector3(PRECISION_EPSILON, PRECISION_EPSILON, PRECISION_EPSILON));
    
    if (strictBodyBox.containsPoint(bulletPos)) {
      return { hit: true, zone: 'body', damage: 40 };
    }
    
    // 3. Limbs check - we need to check each limb individually to prevent overlap issues
    
    // Create strict boxes for each individual limb
    const leftLegHitbox = new THREE.Box3();
    leftLegHitbox.setFromPoints([
      new THREE.Vector3(
        this.group.position.x - this.bodySize.width/4 - this.bodySize.width * 0.2,
        this.group.position.y + PRECISION_EPSILON,
        this.group.position.z - this.bodySize.depth/2 + PRECISION_EPSILON
      ),
      new THREE.Vector3(
        this.group.position.x - this.bodySize.width/4 + this.bodySize.width * 0.2,
        this.bodyHitbox.min.y - PRECISION_EPSILON,
        this.group.position.z + this.bodySize.depth/2 - PRECISION_EPSILON
      )
    ]);
    
    const rightLegHitbox = new THREE.Box3();
    rightLegHitbox.setFromPoints([
      new THREE.Vector3(
        this.group.position.x + this.bodySize.width/4 - this.bodySize.width * 0.2,
        this.group.position.y + PRECISION_EPSILON,
        this.group.position.z - this.bodySize.depth/2 + PRECISION_EPSILON
      ),
      new THREE.Vector3(
        this.group.position.x + this.bodySize.width/4 + this.bodySize.width * 0.2,
        this.bodyHitbox.min.y - PRECISION_EPSILON,
        this.group.position.z + this.bodySize.depth/2 - PRECISION_EPSILON
      )
    ]);
    
    const leftArmHitbox = new THREE.Box3();
    leftArmHitbox.setFromPoints([
      new THREE.Vector3(
        this.group.position.x - this.bodySize.width/2 - this.bodySize.width * 0.175,
        this.bodyHitbox.min.y + this.bodySize.height * 0.15 + PRECISION_EPSILON,
        this.group.position.z - this.bodySize.depth/3 + PRECISION_EPSILON
      ),
      new THREE.Vector3(
        this.group.position.x - this.bodySize.width/2 + PRECISION_EPSILON,
        this.bodyHitbox.min.y + this.bodySize.height * 0.85 - PRECISION_EPSILON,
        this.group.position.z + this.bodySize.depth/3 - PRECISION_EPSILON
      )
    ]);
    
    const rightArmHitbox = new THREE.Box3();
    rightArmHitbox.setFromPoints([
      new THREE.Vector3(
        this.group.position.x + this.bodySize.width/2 - PRECISION_EPSILON,
        this.bodyHitbox.min.y + this.bodySize.height * 0.15 + PRECISION_EPSILON,
        this.group.position.z - this.bodySize.depth/3 + PRECISION_EPSILON
      ),
      new THREE.Vector3(
        this.group.position.x + this.bodySize.width/2 + this.bodySize.width * 0.175,
        this.bodyHitbox.min.y + this.bodySize.height * 0.85 - PRECISION_EPSILON,
        this.group.position.z + this.bodySize.depth/3 - PRECISION_EPSILON
      )
    ]);
    
    // Check each limb individually
    if (leftLegHitbox.containsPoint(bulletPos)) {
      return { hit: true, zone: 'limbs', damage: 20 };
    }
    
    if (rightLegHitbox.containsPoint(bulletPos)) {
      return { hit: true, zone: 'limbs', damage: 20 };
    }
    
    if (leftArmHitbox.containsPoint(bulletPos)) {
      return { hit: true, zone: 'limbs', damage: 20 };
    }
    
    if (rightArmHitbox.containsPoint(bulletPos)) {
      return { hit: true, zone: 'limbs', damage: 20 };
    }
    
    // If we're here, the bullet is inside the overall collision box but not in any specific zone
    // We consider this a grazing hit with no damage
    return { hit: false, zone: null, damage: 0 };
  }

  /**
   * Smoothly updates the model's position and rotation toward target values.
   * @param {number} deltaTime - Time elapsed since last frame.
   */
  animateMovement(deltaTime) {
    // Ensure the model is visible
    if (this.playerModel) {
      this.playerModel.visible = true;
    }
    
    // Store position before movement for walking detection
    this.lastPosition.copy(this.group.position);
    
    // Update animation mixer if available
    if (this.animationMixer && deltaTime > 0 && deltaTime < 1) {
      try {
        this.animationMixer.update(deltaTime);
      } catch (e) {
        console.warn("Error updating animation mixer:", e);
      }
    }
    
    // Normal interpolation for network movement
    this.group.position.lerp(this.targetPosition, 0.1);
    
    // Rotate the model
    this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, this.targetRotation, 0.1);
    
    // Update cooldown timer
    if (this.animationCooldown > 0) {
      this.animationCooldown -= deltaTime;
      if (this.animationCooldown < 0) {
        this.animationCooldown = 0;
      }
    }
    
    // Update collision box
    this.updateCollisionBox();
  }

  /**
   * Updates the third-person model using data received from the server.
   * @param {Object} playerData
   */
  update(playerData) {
    if (!playerData) return;
    
    // Skip animation updates if animations aren't loaded yet
    const animationsLoaded = this.animations && Object.keys(this.animations).length > 0;
    
    // Handle jump animation first to ensure immediacy
    if (animationsLoaded && playerData.velocity && playerData.velocity.y > 2.5 && !this.isJumping) {
      // Interrupt any current animation for immediate jump
      this.isJumping = true;
      this.isWalking = false;
      this.isRunning = false;
      
      // Force immediate transition to jump
      this.animationCooldown = 0;
      const jumpAction = this.playAnimation('jump', 0.01);
      
      // Only proceed with timing if we successfully got the animation
      if (jumpAction && jumpAction._clip) {
        // Reset to walking or idle after jump animation completes
        const duration = jumpAction._clip.duration;
        
        // Set immediate state transition when landing
        setTimeout(() => {
          if (this.isJumping) {
            this.isJumping = false;
            // Check if the player was moving before jumping
            const wasMoving = this.group.position.distanceTo(this.targetPosition) > 0.05;
            if (wasMoving) {
              this.isWalking = true;
              this.playAnimation('walking', 0.05);
              // Check if should be running with higher threshold
              if (this.group.position.distanceTo(this.targetPosition) > 0.3) {
                this.isRunning = true;
                this.playAnimation('running', 0.05);
              }
            } else {
              this.playAnimation('idle', 0.05);
            }
          }
        }, duration * 1000);
      } else {
        // Fallback if jump animation fails
        setTimeout(() => {
          this.isJumping = false;
        }, 1000);
      }
      
      // Fast return to process only jump this frame
      return;
    }
    
    // Update target position from network data
    if (playerData.position) {
      // Position the model on the ground, with a small offset to prevent sinking
      const newPos = new THREE.Vector3(
        playerData.position.x,
        playerData.position.y - 2.72, // Adjusted for 70% taller player model (1.6 * 1.7)
        playerData.position.z
      );
      
      // Calculate distance before updating position
      const distance = newPos.distanceTo(this.targetPosition);
      
      // Only update if movement is significant (prevents jitter)
      if (distance > 0.01) {
        this.targetPosition.copy(newPos);
      }

      // Only process animation transitions if animations are loaded
      if (animationsLoaded && !this.isJumping) {
        // Check if moving based on position change
        const isMovingNow = distance > 0.05; 
        const isRunningNow = distance > 0.3; // Threshold for running
        
        // Handle animation state transitions
        if (isMovingNow) {
          if (!this.isWalking) {
            // Start walking or running based on speed
            this.directToWalking(isRunningNow);
          } else {
            // Switch between walking and running based on speed
            if (isRunningNow && !this.isRunning) {
              this.isRunning = true;
              this.playAnimation('running', 0.1); 
            } else if (!isRunningNow && this.isRunning) {
              this.isRunning = false;
              this.playAnimation('walking', 0.1);
            }
          }
        } else if (!isMovingNow && this.isWalking) {
          // Transition directly to idle if not moving
          this.directToIdle();
        }
      }
    }

    // Update target rotation (with default value if missing)
    if (playerData.rotation !== undefined) {
      // For network data, rotation is typically just a y rotation value
      if (typeof playerData.rotation === 'number') {
        this.targetRotation = playerData.rotation;
      } 
      // Handle case where rotation might be an object with a y property
      else if (playerData.rotation && playerData.rotation.y !== undefined) {
        this.targetRotation = playerData.rotation.y;
      }
    }
    
    // Handle landing from jump
    if (this.isJumping && playerData.velocity && playerData.velocity.y < 0 && playerData.canJump) {
      // Player has landed
      this.isJumping = false;
      // Check current movement state
      const isMovingNow = this.group.position.distanceTo(this.targetPosition) > 0.05;
      if (isMovingNow) {
        this.isWalking = true;
        this.playAnimation('walking', 0.05);
        // Check if should be running with higher threshold
        if (this.group.position.distanceTo(this.targetPosition) > 0.3) {
          this.isRunning = true;
          this.playAnimation('running', 0.05);
        }
      } else {
        this.playAnimation('idle', 0.05);
      }
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
   * Alias for remove() for compatibility with the new code
   */
  dispose() {
    this.remove();
  }

  /**
   * Provides visual feedback (temporary red flash) when the model is hit.
   */
  showHitFeedback() {
    // Clear any existing hit feedback timeout
    if (this.hitFeedbackTimeout) {
      clearTimeout(this.hitFeedbackTimeout);
    }
    
    // Traverse the model and replace each mesh's material with a red flash
    this.group.traverse(child => {
      if (child.isMesh && child.material) {
        // Store the original material in userData if not already stored
        if (!child.userData.originalMaterial) {
          child.userData.originalMaterial = child.material;
        }
        
        // Create a new material for the flash effect
        const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        
        // If this is a skinned mesh, enable skinning on the material
        if (child.isSkinnedMesh) {
          flashMaterial.skinning = true;
        }
        
        // Apply the flash material
        child.material = flashMaterial;
        child.material.needsUpdate = true;
      }
    });
    
    // After 200ms, restore the original materials
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

  /**
   * Creates visual helpers for the hit zones (for debugging)
   * Call this method to see the hit zones visually
   * @param {boolean} forceVisible - Override default visibility setting
   */
  createHitZoneVisualizers(forceVisible = null) {
    const hitZoneVisible = forceVisible !== null ? forceVisible : false;
    
    if (!hitZoneVisible) return;
    
    // Clean up any existing helpers
    if (this.headHelper) this.group.remove(this.headHelper);
    if (this.bodyHelper) this.group.remove(this.bodyHelper);
    if (this.leftLegHelper) this.group.remove(this.leftLegHelper);
    if (this.rightLegHelper) this.group.remove(this.rightLegHelper);
    
    // Remove arm helpers and limbs helper if they exist
    if (this.leftArmHelper) this.group.remove(this.leftArmHelper);
    if (this.rightArmHelper) this.group.remove(this.rightArmHelper);
    if (this.limbsHelper) this.group.remove(this.limbsHelper);
    
    // Materials for different hitboxes
    const headMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000, // Red for head
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });
    
    const bodyMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00, // Green for body
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });
    
    const legMaterial = new THREE.MeshBasicMaterial({
      color: 0x8800ff, // Purple for legs
      wireframe: true,
      transparent: true,
      opacity: 0.7
    });
    
    // Head helper - adjusted with offset
    const headGeometry = new THREE.BoxGeometry(
      this.headSize.width,
      this.headSize.height,
      this.headSize.depth
    );
    this.headHelper = new THREE.Mesh(headGeometry, headMaterial);
    this.headHelper.position.set(
      0,
      this.hitboxSize.height - this.headSize.height/2 - this.headOffset,
      0
    );
    this.group.add(this.headHelper);
    
    // Body helper with offset
    const bodyGeometry = new THREE.BoxGeometry(
      this.bodySize.width,
      this.bodySize.height,
      this.bodySize.depth
    );
    this.bodyHelper = new THREE.Mesh(bodyGeometry, bodyMaterial);
    
    // Position body below head with offset
    const headBottom = this.hitboxSize.height - this.headSize.height - this.headOffset;
    const bodyTop = headBottom;
    const bodyBottom = bodyTop - this.bodySize.height - this.bodyOffset;
    const bodyCenter = (bodyTop + bodyBottom) / 2;
    
    this.bodyHelper.position.set(
      0,
      bodyCenter,
      0
    );
    this.group.add(this.bodyHelper);
    
    // Create precise limb helpers matching our collision detection
    // Define precise limb dimensions - same as in updateCollisionBox
    const legWidth = this.bodySize.width * 0.4;
    
    // Left leg helper
    const leftLegGeometry = new THREE.BoxGeometry(
      legWidth,
      bodyBottom, // Height from ground to bottom of body
      this.bodySize.depth
    );
    this.leftLegHelper = new THREE.Mesh(leftLegGeometry, legMaterial);
    this.leftLegHelper.position.set(
      -this.bodySize.width/4, // Center of left leg
      bodyBottom/2, // Middle of leg
      0
    );
    this.group.add(this.leftLegHelper);
    
    // Right leg helper
    const rightLegGeometry = new THREE.BoxGeometry(
      legWidth,
      bodyBottom,
      this.bodySize.depth
    );
    this.rightLegHelper = new THREE.Mesh(rightLegGeometry, legMaterial);
    this.rightLegHelper.position.set(
      this.bodySize.width/4, // Center of right leg
      bodyBottom/2,
      0
    );
    this.group.add(this.rightLegHelper);
  }
}