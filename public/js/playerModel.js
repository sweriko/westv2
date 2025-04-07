// /public/js/playerModel.js

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
    
    // Gun state tracking
    this.isAiming = false;
    this.isShooting = false;
    
    // Animation timing - reduced for faster transitions
    this.walkBlendTime = 0.15;     // Blend between walking animations
    this.jumpBlendTime = 0.01;     // Almost immediate jump animation
    this.gunBlendTime = 0.1;       // Gun animation blend time
    
    // Animation state protection - reduced for faster responsiveness
    this.animationCooldown = 0;
    this.minAnimationCooldown = 0.2; // Reduced from 0.5 seconds
    
    // Position adjustment to prevent sinking
    this.groundOffset = 0; // Reduced from 0.1 to make feet touch the ground
    
    // Skin system
    this.activeSkin = null;
    this.availableSkins = {
      default: null, // Default texture will be stored here after loading
      bananaSkin: null // Will be loaded on demand
    };
    this.skinPermissions = {
      bananaSkin: false // By default, skin is locked until verified with NFT
    };
    
    // Load the player model
    this.loadPlayerModel();
    
    // Add to scene
    scene.add(this.group);

    // To track active hit feedback timeout
    this.hitFeedbackTimeout = null;
  }

  loadPlayerModel() {
    // Get NPC type from playerId - this identifies specific NPCs like sheriff or bartender
    const isNpcSheriff = typeof this.playerId === 'string' && this.playerId.includes('Sheriff');
    const isNpcBartender = typeof this.playerId === 'string' && this.playerId.includes('Bartender');
    
    // Check if this is a special NPC that needs a custom model
    if (isNpcSheriff) {
      // Load sheriff model
      this._loadCustomNpcModel('models/sheriff.glb', 'sheriffidle');
      return;
    } else if (isNpcBartender) {
      // Load bartender model
      this._loadCustomNpcModel('models/bartender.glb', 'bartenderidle');
      return;
    }

    // Standard player model loading for all other entities
    // Check if we have a preloaded player model
    if (window.preloadedModels && (window.preloadedModels.playermodel || window.preloadedModels.playermodel_clone)) {
      console.log("Using preloaded playermodel");
      try {
        // Use the clone version to avoid reference issues
        const preloadedModel = window.preloadedModels.playermodel_clone || window.preloadedModels.playermodel;
        const gltf = {
          scene: preloadedModel.scene.clone(),
          animations: preloadedModel.animations
        };
        
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
        return; // Exit early since we've handled the model
      } catch (e) {
        console.error('Error using preloaded player model:', e);
        // Fall through to regular loading method if preloaded model fails
      }
    }
    
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

  /**
   * Loads a custom NPC model with specific idle animation
   * @param {string} modelPath - Path to the GLB model file
   * @param {string} idleAnimationName - Name of the idle animation to play in a loop
   * @private
   */
  _loadCustomNpcModel(modelPath, idleAnimationName) {
    // Create loader instance
    const loader = new THREE.GLTFLoader();
    
    // Load the custom NPC model
    loader.load(modelPath, 
      // Success callback
      (gltf) => {
        try {
          this.playerModel = gltf.scene;
          
          // Position at origin with no offset to make feet touch the ground
          this.playerModel.position.set(0, 0, 0);
          
          // Set appropriate scale (may need adjustment per model)
          this.playerModel.scale.set(1.445, 1.445, 1.445);
          
          // Rotate model to face the right direction (might need adjustment per model)
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
            
            // Play the specific idle animation if it exists (after a small delay to ensure it's loaded)
            setTimeout(() => {
              if (this.animations[idleAnimationName]) {
                // Play the custom idle animation in a loop
                this.playAnimation(idleAnimationName, 0.5);
                console.log(`Playing ${idleAnimationName} animation for NPC`);
              } else {
                console.warn(`${idleAnimationName} animation not found for NPC`);
                
                // Fall back to regular idle animation if specific one not found
                if (this.animations['idle']) {
                  this.playAnimation('idle', 0.5);
                }
              }
            }, 100);
          }
          
          // Initialize hit zone visualizers
          this.createHitZoneVisualizers();
          
          console.log(`Custom NPC model ${modelPath} loaded successfully`);
        } catch (e) {
          console.error(`Error setting up custom NPC model ${modelPath}:`, e);
        }
      }, 
      // Progress callback - silent
      () => {},
      // Error callback
      (error) => {
        console.error(`Error loading custom NPC model ${modelPath}:`, error);
        
        // Fall back to regular player model if custom model fails to load
        console.log("Falling back to regular player model for NPC");
        
        // Load the regular player model as fallback
        if (window.preloadedModels && window.preloadedModels.playermodel) {
          const preloadedModel = window.preloadedModels.playermodel;
          const gltf = {
            scene: preloadedModel.scene.clone(),
            animations: preloadedModel.animations
          };
          
          this.playerModel = gltf.scene;
          this.group.add(this.playerModel);
          
          // Setup player model
          this.playerModel.position.set(0, 0, 0);
          this.playerModel.scale.set(1.445, 1.445, 1.445);
          this.playerModel.rotation.y = Math.PI;
          
          // Set up meshes correctly
          this.playerModel.traverse(child => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.userData.isPlayerMesh = true;
              
              if (child.material) {
                child.material.side = THREE.DoubleSide;
                if (child.isSkinnedMesh) child.material.skinning = true;
                child.material.needsUpdate = true;
              }
            }
          });
          
          // Set up animations
          if (gltf.animations && gltf.animations.length > 0) {
            this.setupAnimations(gltf.animations);
          }
          
          // Initialize hit zone visualizers
          this.createHitZoneVisualizers();
        } else {
          // Last resort fallback - create a colored cube
          const geometry = new THREE.BoxGeometry(0.5, 1.8, 0.5);
          const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
          const cube = new THREE.Mesh(geometry, material);
          cube.position.set(0, 0.9, 0);
          this.group.add(cube);
          
          // Add hit zone visualizers even for fallback model
          this.createHitZoneVisualizers();
        }
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
          } else if (animation.name === 'jump' || animation.name === 'playerholstering' || 
                     animation.name === 'playershoot' || animation.name === 'death') {
            this.animations[animation.name].setLoop(THREE.LoopOnce);
            this.animations[animation.name].clampWhenFinished = true;
          } else if (animation.name === 'playeraim') {
            // Special handling for aim animation to ensure it freezes correctly
            this.animations[animation.name].setLoop(THREE.LoopOnce, 1);
            this.animations[animation.name].clampWhenFinished = true;
            
            // Pre-configure the animation to be easier to freeze at the end
            const aimAction = this.animations[animation.name];
            aimAction.zeroSlopeAtEnd = true; // Ensure smooth stop at end
            aimAction.zeroSlopeAtStart = true; // Better blending
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
    
    // Special handling for aim animation to ensure it gets frozen properly
    if (animationName === 'playeraim') {
      const action = this.fadeToAction(animationName, fadeTime);
      
      if (action) {
        // Configure it for freezing at the end
        action.clampWhenFinished = true;
        action.setLoop(THREE.LoopOnce, 1);
        action.zeroSlopeAtEnd = true;
      }
      
      return action;
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
    // Instead of returning no hit, we'll count it as a partial body hit with reduced damage
    return { hit: true, zone: 'body', damage: 30 };
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
    
    // Special handling for when we're in a frozen aim pose
    if (this.isAiming && !this.isShooting && !this.isJumping && this._aimPoseSnapshot) {
      // Skip the animation mixer update entirely and just apply the saved pose
      this.maintainAimPose();
    } 
    // Regular animation updates for all other states
    else if (this.animationMixer && deltaTime > 0 && deltaTime < 1) {
      try {
        this.animationMixer.update(deltaTime);
        
        // If we need to aim but don't have a snapshot yet, create one
        if (this.isAiming && !this.isShooting && !this.isJumping && !this._aimPoseSnapshot) {
          this.maintainAimPose();
        }
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
    
    // Check if this is an NPC or Bot
    const isAIControlled = this.isBot || this.isNpc || playerData.isBot || playerData.isNpc;

    // Handle death animation if the player is dying
    if (animationsLoaded && playerData.isDying && !this.isDying) {
      console.log(`Playing death animation for remote player ${this.playerId}`);
      this.playDeathAnimation();
      // Don't process any other animation states after playing death animation
      return;
    }
    
    // Handle jump animation first to ensure immediacy
    if (animationsLoaded && playerData.velocity && playerData.velocity.y > 2.5 && !this.isJumping) {
      this.playJumpAnimation();
    }

    // Handle landing from jump
    if (this.isJumping && (!playerData.velocity || playerData.velocity.y <= 0.1)) {
      this.isJumping = false;
    }
    
    // Special handling for aim state - we only want to process animation transitions
    // when there is an actual change in the aiming state
    if (animationsLoaded && !this.isJumping) {
      // Track if the aiming state has changed
      const wasAiming = this.isAiming;
      const isAimingNow = playerData.isAiming;
      
      // We only need to handle aim animation transitions when the state actually changes
      // or when we need to handle shooting while already aiming
      
      // Handle shooting animation - prioritize shooting over aim changes
      if (isAimingNow && playerData.isShooting && !this.isShooting) {
        this.playShootAnimation();
      }
      // Handle aiming animation start - only when state changes from not aiming to aiming
      else if (isAimingNow && !wasAiming) {
        this.playAimAnimation();
      }
      // Handle holstering animation - only when state changes from aiming to not aiming
      else if (!isAimingNow && wasAiming) {
        this.playHolsterAnimation();
      }
      // Maintain aim state - but don't restart the animation if already aiming
      else if (isAimingNow && wasAiming) {
        // If we have a snapshot, make sure it's applied
        if (this._aimPoseSnapshot) {
          // No need to call maintainAimPose() here as it will be called in animateMovement
        }
        // If we don't have a snapshot yet but should be aiming, create one
        else if (!this._aimPoseSnapshot && isAimingNow) {
          this.maintainAimPose();
        }
      }
    }
    
    // Update target position from network data
    if (playerData.position) {
      // Choose the right height adjustment based on entity type
      let heightAdjustment = 0;
      
      if (isAIControlled) {
        // NPCs/Bots need the same height adjustment as players to prevent floating
        heightAdjustment = -2.72; // Same as players to keep NPCs grounded
      } else {
        // Regular player adjustment to prevent sinking
        heightAdjustment = -2.72; // Adjusted for 70% taller player model (1.6 * 1.7)
      }
      
      // Position the model on the ground, with appropriate height adjustment
      const newPos = new THREE.Vector3(
        playerData.position.x,
        playerData.position.y + heightAdjustment,
        playerData.position.z
      );
      
      // Calculate distance before updating position
      const distance = newPos.distanceTo(this.targetPosition);
      
      // Only update if movement is significant (prevents jitter)
      if (distance > 0.01) {
        this.targetPosition.copy(newPos);
      }

      // Only process animation transitions if animations are loaded
      // and we're not in a special state (aiming/shooting/jumping)
      if (animationsLoaded && !this.isJumping && !this.isAiming && !this.isShooting) {
        // Check if moving based on position change or explicit walking flag
        const isMovingNow = isAIControlled ? 
                          (playerData.isWalking || false) : // Use isWalking flag for AI
                          (distance > 0.03);               // Reduced threshold for walking (was 0.05)
        
        const isRunningNow = distance > 0.2; // Reduced threshold for running (was 0.3)
        
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
    
    // Handle skin updates - only when skin data changes
    if (playerData.skins && (!this._lastSkinUpdate || JSON.stringify(playerData.skins) !== JSON.stringify(this._lastSkinUpdate))) {
      // Store current skin data to prevent redundant updates
      this._lastSkinUpdate = JSON.stringify(playerData.skins);
      
      // Update permissions
      this.updateSkinPermissions(playerData.skins);
      
      // Apply banana skin automatically if permission granted and not already applied
      if (playerData.skins.bananaSkin && this.activeSkin !== 'bananaSkin') {
        this.updateSkin('bananaSkin');
      }
    }
    // Force skin application during first update if it hasn't been applied yet
    else if (playerData.skins && playerData.skins.bananaSkin && !this._initialSkinApplied && this.activeSkin !== 'bananaSkin') {
      this._initialSkinApplied = true;
      this.updateSkin('bananaSkin');
      console.log(`Applied initial skin to player ${this.playerId} during first update`);
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

  // Play the aiming animation when player draws their gun
  playAimAnimation() {
    // Prevent rapid animation changes
    if (this.animationCooldown > 0) {
      return null;
    }
    
    this.isAiming = true;
    this.animationCooldown = this.minAnimationCooldown;
    
    const aimAction = this.playAnimation('playeraim', this.gunBlendTime);
    
    // If we successfully got the animation, set up to stay on the last frame
    if (aimAction && aimAction._clip) {
      const duration = aimAction._clip.duration;
      
      // After the aiming animation completes, freeze on the last frame
      setTimeout(() => {
        // If still aiming, make sure we're showing the last frame
        if (this.isAiming && !this.isShooting) {
          // Manually set to the end frame to show the gun aimed
          if (this.animations['playeraim']) {
            const aimAction = this.animations['playeraim'];
            
            // Ensure set to the end frame and frozen
            aimAction.reset();
            aimAction.time = aimAction._clip.duration - 0.01;
            aimAction.timeScale = 0; // Completely stop time advancement
            aimAction.enabled = true;
            aimAction.setEffectiveWeight(1);
            aimAction.clampWhenFinished = true;
            aimAction.setLoop(THREE.LoopOnce, 1); // Ensure it's set to loop once
            aimAction.paused = true; // Pause the action to prevent any updates
            aimAction.play();
            
            this.currentAction = aimAction;
          }
        }
      }, duration * 1000);
    }
    
    return aimAction;
  }
  
  // Maintain the aim pose at the last frame of the animation
  maintainAimPose() {
    // Only proceed if we have loaded animations and the playeraim animation exists
    if (!this.animations || !this.animations['playeraim']) return;
    
    const aimAction = this.animations['playeraim'];
    
    // If we don't have a snapshot yet, create one
    if (!this._aimPoseSnapshot) {
      // Stop all current actions to prevent interference
      this.animationMixer.stopAllAction();
      
      // Reset and prepare the aim action to capture the final pose
      aimAction.reset();
      aimAction.clampWhenFinished = true;
      aimAction.setLoop(THREE.LoopOnce, 1);
      aimAction.timeScale = 1; // Normal speed for setup
      aimAction.time = 0; // Start from beginning
      aimAction.enabled = true;
      aimAction.setEffectiveWeight(1);
      aimAction.play();
      
      // Skip to the end of the animation to capture final pose
      aimAction.time = aimAction._clip.duration - 0.01;
      
      // Force an update to apply the pose to the bones
      this.animationMixer.update(0);
      
      // Save a snapshot of all bone matrices in the model
      this._aimPoseSnapshot = {};
      this.playerModel.traverse(child => {
        if (child.isBone) {
          // Save position, rotation, scale for more accurate restoration
          this._aimPoseSnapshot[child.uuid] = {
            position: child.position.clone(),
            quaternion: child.quaternion.clone(),
            scale: child.scale.clone(),
            matrix: child.matrix.clone(),
            matrixWorld: child.matrixWorld.clone()
          };
        }
      });
      
      // Stop the animation to prevent further updates
      aimAction.stop();
      
      console.log(`Created detailed aim pose snapshot for player ${this.playerId}`);
      
      // Set the current action to aim so we know what state we're in
      this.currentAction = aimAction;
      this.isAiming = true;
    }
    
    // Apply the saved pose each frame to ensure it stays frozen
    if (this._aimPoseSnapshot) {
      this.playerModel.traverse(child => {
        if (child.isBone && this._aimPoseSnapshot[child.uuid]) {
          const snapshot = this._aimPoseSnapshot[child.uuid];
          
          // Apply the saved transform data directly
          child.position.copy(snapshot.position);
          child.quaternion.copy(snapshot.quaternion);
          child.scale.copy(snapshot.scale);
          child.matrix.copy(snapshot.matrix);
          
          // Also set the matrixWorld to ensure correct global pose
          child.matrixWorld.copy(snapshot.matrixWorld);
          
          // Ensure matrices are updated
          child.updateMatrix();
          child.updateMatrixWorld(true);
        }
      });
    }
  }
  
  // Play the jump animation
  playJumpAnimation() {
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
      
      // Shorten the jump animation to match faster gravity
      const adjustedDuration = duration * 0.8; // 20% shorter for quicker landing
      
      // Set immediate state transition when landing
      setTimeout(() => {
        if (this.isJumping) {
          this.isJumping = false;
          // Check if the player was moving before jumping
          const wasMoving = this.group.position.distanceTo(this.targetPosition) > 0.03; // Reduced from 0.05
          if (wasMoving) {
            this.isWalking = true;
            this.playAnimation('walking', 0.05);
            // Check if should be running with higher threshold
            if (this.group.position.distanceTo(this.targetPosition) > 0.2) { // Reduced from 0.3
              this.isRunning = true;
              this.playAnimation('running', 0.05);
            }
          } else {
            this.playAnimation('idle', 0.05);
          }
        }
      }, adjustedDuration * 1000);
    } else {
      // Fallback if jump animation fails
      setTimeout(() => {
        this.isJumping = false;
      }, 700); // Reduced from 1000ms to match faster jump
    }
  }
  
  // Play the holstering animation when player stops aiming
  playHolsterAnimation() {
    // Prevent rapid animation changes
    if (this.animationCooldown > 0) {
      return null;
    }
    
    this.isAiming = false;
    this.isShooting = false;
    this.animationCooldown = this.minAnimationCooldown;
    
    // Clear any aim pose snapshot when transitioning to holstering
    this._aimPoseSnapshot = null;
    
    return this.playAnimation('playerholstering', this.gunBlendTime);
  }
  
  // Play the shooting animation
  playShootAnimation() {
    // Prevent rapid animation changes
    if (this.animationCooldown > 0) {
      return null;
    }
    
    this.isShooting = true;
    this.animationCooldown = this.minAnimationCooldown;
    
    // Clear aim pose snapshot during shooting
    this._aimPoseSnapshot = null;
    
    // IMPORTANT: NO SOUNDS are played here!
    // All gunshot sounds are centrally managed in main.js to prevent duplication
    // This is especially critical for mobile devices which can have audio sync issues
    
    const shootAction = this.playAnimation('playershoot', this.gunBlendTime);
    
    // If we successfully got the animation, set up the transition back to aim
    if (shootAction && shootAction._clip) {
      const duration = shootAction._clip.duration;
      
      // After the shooting animation completes, return to aim
      setTimeout(() => {
        this.isShooting = false;
        
        // If still aiming, create a new aim pose snapshot
        if (this.isAiming) {
          // Clear any existing snapshot so we can create a fresh one
          this._aimPoseSnapshot = null;
          this.maintainAimPose();
        }
      }, duration * 1000);
    }
    
    return shootAction;
  }
  
  // Play the death animation when player is killed
  playDeathAnimation() {
    // Set death state
    this.isDying = true;
    
    // Reset other animation states
    this.isAiming = false;
    this.isShooting = false;
    this.isWalking = false;
    this.isRunning = false;
    this.isJumping = false;
    
    // Play the death animation with fast transition
    const deathAction = this.playAnimation('death', 0.1);
    
    // Return the action and its duration if available
    if (deathAction && deathAction._clip) {
      return {
        action: deathAction,
        duration: deathAction._clip.duration * 1000 // Duration in milliseconds
      };
    }
    
    // Return a default duration if animation couldn't be played
    return {
      action: null,
      duration: 1500 // Default fallback duration in milliseconds
    };
  }

  /**
   * Resets all animation states - useful when respawning or between matches
   */
  resetAnimationState() {
    console.log(`Resetting animation state for player ${this.playerId}`);
    
    // Reset all animation state flags
    this.isDying = false;
    this.isAiming = false;
    this.isShooting = false;
    this.isWalking = false;
    this.isRunning = false;
    this.isJumping = false;
    
    // Clear aim pose snapshot
    this._aimPoseSnapshot = null;
    
    // Stop all active animations and reset mixer
    if (this.animationMixer) {
      this.animationMixer.stopAllAction();
    }
    
    // Reset all animations
    if (this.animations) {
      for (const name in this.animations) {
        const action = this.animations[name];
        if (action) {
          action.reset();
          if (action.isRunning()) {
            action.stop();
          }
        }
      }
    }
    
    // Reset current and previous actions
    this.currentAction = null;
    this.previousAction = null;
    
    // Play idle animation if available
    if (this.animations && this.animations['idle']) {
      this.playAnimation('idle', 0.1);
    }
  }

  /**
   * Disposes of all resources
   */
  dispose() {
    // First reset animation state
    this.resetAnimationState();
    
    // Remove all models
    if (this.playerModel) {
      this.group.remove(this.playerModel);
    }
    
    // Remove any helpers
    if (this.headHelper) this.group.remove(this.headHelper);
    if (this.bodyHelper) this.group.remove(this.bodyHelper);
    if (this.leftArmHelper) this.group.remove(this.leftArmHelper);
    if (this.rightArmHelper) this.group.remove(this.rightArmHelper);
    if (this.leftLegHelper) this.group.remove(this.leftLegHelper);
    if (this.rightLegHelper) this.group.remove(this.rightLegHelper);
    
    // Remove from scene
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }

  /**
   * Updates the model's skin based on skin ID
   * @param {string} skinId - The skin ID to apply
   * @returns {boolean} - Whether the skin was successfully applied
   */
  updateSkin(skinId) {
    // Check if this is a valid skin
    if (!skinId || !this.availableSkins.hasOwnProperty(skinId)) {
      console.warn(`Invalid skin ID: ${skinId}`);
      return false;
    }
    
    // Check if player has permission for this skin
    if (skinId !== 'default' && !this.skinPermissions[skinId]) {
      console.warn(`Player ${this.playerId} does not have permission for skin: ${skinId}`);
      return false;
    }
    
    // Check if model is loaded before attempting to apply skins
    if (!this.playerModel) {
      console.warn(`Cannot apply skin - player model not loaded yet for player ${this.playerId}`);
      // Schedule another attempt after a short delay
      setTimeout(() => {
        if (this.playerModel) {
          console.log(`Retrying skin application for player ${this.playerId}`);
          this.updateSkin(skinId);
        }
      }, 500);
      return false;
    }
    
    // TEMPORARY: Debug the model structure to help identify meshes and materials
    this._debugModelStructure();
    
    // Check if the texture was already loaded for this skin
    if (!this.availableSkins[skinId]) {
      // Load the skin texture
      this.loadSkinTexture(skinId);
      return false; // Will be applied once loaded
    }
    
    // Apply the skin texture to the model
    this.applyTextureToModel(this.availableSkins[skinId]);
    this.activeSkin = skinId;
    
    console.log(`Applied skin '${skinId}' to player ${this.playerId}`);
    return true;
  }
  
  /**
   * TEMPORARY: Debug helper to print model hierarchy and materials
   * @private
   */
  _debugModelStructure() {
    if (!this.playerModel) return;
    
    console.log(`=== DEBUG: Model structure for player ${this.playerId} ===`);
    let meshCount = 0;
    let skinnedMeshCount = 0;
    let materialCount = 0;
    
    this.playerModel.traverse(child => {
      if (child.isMesh) {
        meshCount++;
        if (child.isSkinnedMesh) skinnedMeshCount++;
        
        console.log(`Mesh: ${child.name}`);
        
        if (child.material) {
          materialCount++;
          console.log(`  Material: ${child.material.name || 'unnamed'}`);
          console.log(`  Has map: ${child.material.map ? 'YES' : 'NO'}`);
          console.log(`  Side: ${child.material.side}`);
          if (child.isSkinnedMesh) {
            console.log(`  Skinning enabled: ${child.material.skinning ? 'YES' : 'NO'}`);
          }
        }
      }
    });
    
    console.log(`Total meshes: ${meshCount}, Skinned meshes: ${skinnedMeshCount}, Materials: ${materialCount}`);
    console.log(`=== END DEBUG ===`);
  }
  
  /**
   * Loads a skin texture by ID
   * @param {string} skinId - The skin ID to load
   */
  loadSkinTexture(skinId) {
    if (!skinId || skinId === 'default') return;
    
    const texturePath = `models/textures/${skinId}.png`;
    const textureLoader = new THREE.TextureLoader();
    
    // Store that we have permission before the async load starts
    const hasPermission = this.skinPermissions[skinId];
    
    console.log(`Loading skin texture for playermodel: ${texturePath}`);
    
    textureLoader.load(
      texturePath,
      (texture) => {
        console.log(`Successfully loaded texture: ${texturePath}`, texture);
        
        // Store the loaded texture
        this.availableSkins[skinId] = texture;
        
        // Use the stored permission value rather than checking again
        // This prevents race conditions where permissions might change during load
        if (hasPermission) {
          this.applyTextureToModel(texture);
          this.activeSkin = skinId;
          console.log(`Applied newly loaded skin '${skinId}' to player ${this.playerId}`);
        } else {
          console.log(`Texture loaded but not applied - no permission for skin: ${skinId}`);
        }
      },
      (progressEvent) => {
        console.log(`Texture loading progress: ${progressEvent.loaded} / ${progressEvent.total}`);
      },
      (error) => {
        console.error(`Error loading skin texture '${skinId}':`, error);
      }
    );
  }
  
  /**
   * Applies a texture to the player model
   * @param {THREE.Texture} texture - The texture to apply
   */
  applyTextureToModel(texture) {
    if (!this.playerModel || !texture) return;
    
    // List of revolver part names to look for (with different variations to match all cases)
    const revolverParts = ['barrel', 'drum', 'grip', 'revolver', 'gun', 'barrel.001', 'drum.001', 'grip.001'];
    
    // Count how many parts we modify for a single summary log instead of per-part logs
    let modifiedPartsCount = 0;
    
    // Debug mode to log all mesh names and material names to help identify parts
    const debugMode = false;
    
    // Apply the texture to all relevant meshes in the model
    this.playerModel.traverse(child => {
      if (child.isMesh && child.material) {
        if (debugMode) {
          console.log(`Found mesh: ${child.name} with material: ${child.material.name || 'unnamed'}`);
        }
        
        // Use Material.003 as primary check, but also check for revolver part names
        const isRevolverMaterial = child.material.name && child.material.name.includes('Material.003');
        const isRevolverPart = revolverParts.some(part => 
          child.name.toLowerCase().includes(part.toLowerCase())
        );
        
        // Also check for gun parts by looking at Pistol parts
        const isPistolPart = child.name.toLowerCase().includes('pistol');
        
        // Extra check for model materials that might be eligible for skins
        const isEligibleMaterial = child.material.name && 
          (child.material.name.includes('gun') || 
           child.material.name.includes('pistol') || 
           child.material.name.includes('revolver'));
        
        if (isRevolverMaterial || isRevolverPart || isPistolPart || isEligibleMaterial) {
          // Increment counter
          modifiedPartsCount++;
          
          // Store the original/default texture if not already stored
          if (!this.availableSkins.default && child.material.map) {
            this.availableSkins.default = child.material.map.clone();
          }
          
          // Clone the original material to preserve all properties
          if (child.material._originalMaterial === undefined) {
            child.material._originalMaterial = child.material.clone();
          }
          
          // Proper creation of new texture - maintaining UVs
          if (child.material._originalMaterial && child.material._originalMaterial.map) {
            const originalTexture = child.material._originalMaterial.map;
            
            // Copy ALL texture properties
            texture.wrapS = originalTexture.wrapS;
            texture.wrapT = originalTexture.wrapT;
            texture.repeat.copy(originalTexture.repeat);
            texture.offset.copy(originalTexture.offset);
            texture.center.copy(originalTexture.center);
            texture.rotation = originalTexture.rotation;
            
            // Copy any additional properties that might affect UV mapping
            texture.flipY = originalTexture.flipY;
            texture.encoding = originalTexture.encoding;
            
            // Handle mipmaps and filtering
            texture.generateMipmaps = originalTexture.generateMipmaps;
            texture.minFilter = originalTexture.minFilter;
            texture.magFilter = originalTexture.magFilter;
            
            // Also ensure texture is fully loaded before applying
            texture.needsUpdate = true;
          }
          
          // Apply the new texture
          child.material.map = texture;
          child.material.needsUpdate = true;
          
          if (debugMode) {
            console.log(`Applied texture to part: ${child.name}`);
          }
        }
      }
    });
    
    // Single summary log instead of multiple per-part logs
    if (modifiedPartsCount > 0) {
      console.log(`Applied texture to ${modifiedPartsCount} player model parts for player ${this.playerId}`);
    } else {
      console.warn(`No suitable parts found to apply texture for player ${this.playerId}`);
    }
  }
  
  /**
   * Updates skin permissions based on server data
   * @param {Object} skinData - Skin permission data from server
   */
  updateSkinPermissions(skinData) {
    if (!skinData) return;
    
    let skinChanged = false;
    
    // Update permissions for each skin
    Object.keys(skinData).forEach(skinId => {
      if (this.skinPermissions.hasOwnProperty(skinId)) {
        const oldPermission = this.skinPermissions[skinId];
        const newPermission = skinData[skinId];
        
        this.skinPermissions[skinId] = newPermission;
        
        // If permission was granted, preload the skin
        if (!oldPermission && newPermission) {
          this.loadSkinTexture(skinId);
          skinChanged = true;
        }
      }
    });
    
    // If permission changes might affect current skin, check if we need to reset
    if (skinChanged && this.activeSkin && !this.skinPermissions[this.activeSkin]) {
      // Reset to default skin if current skin is no longer permitted
      this.updateSkin('default');
    }
  }
}