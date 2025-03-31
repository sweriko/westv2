/**
 * A proper FPS viewmodel implementation with animation support
 * Handles animations for aim, fakeshoot, holster, idle, reload, and shoot actions
 */
export class Viewmodel {
  constructor() {
    // Adjustable constants for positioning the viewmodel
    this.SCALE = 1.0;  // Updated based on user preference
    this.POSITION = {
      x: 0,   // positive moves right
      y: 0,   // negative moves down 
      z: -0.5 // negative moves closer to camera, updated based on user preference
    };
    
    // Rotation adjustment (in radians)
    this.ROTATION = {
      x: 0,     // pitch
      y: 0,     // yaw
      z: 0      // roll
    };
    
    // Forward clipping offset - how far forward to position model
    this.FORWARD_CLIP = 0.18; // Increased from 0.16 to push model further from camera
    
    // Effect positioning constants
    this.EFFECTS = {
      // Muzzle flash anchor position (relative to model)
      MUZZLE_FLASH: {
        x: 0.33,       // Left/right offset of muzzle flash
        y: -0.17,      // Up/down offset of muzzle flash
        z: -1.67,      // Forward/backward offset of muzzle flash (negative = forward)
        scale: 0.1     // Scale of muzzle flash effect
      },
      
      // Smoke ring effect positioning
      SMOKE_RING: {
        forward_offset: 0.05,  // Forward offset from barrel
        x_offset: 0,           // Left/right offset from barrel
        y_offset: 0,           // Up/down offset from barrel
        scale: 1.0             // Scale of smoke ring effect
      },
      
      // Bullet spawn position (forward offset from muzzle)
      BULLET_SPAWN: {
        forward_offset: 0.1   // Forward distance from muzzle to spawn bullets
      }
    };
    
    this.group = new THREE.Group();
    this.animations = {};
    this.mixer = null;
    this.actions = {}; // Named references to configured actions
    this.currentAction = null;
    this.primaryAction = null; // The main active action
    this.secondaryAction = null; // Secondary blended action
    this.model = null;
    this.muzzleFlashAnchor = null;
    this.isLoaded = false;
    this.animationsConfigured = false;
    
    // Animation states and transitions
    this.animationState = 'none';
    this.transitionInProgress = false;
    this.queue = []; // Queue for animations to play in sequence
    
    // Flags to prevent holstering and keep viewmodel visible
    this.blockHolster = false;
    this.pendingHolster = false;
    this.forceVisible = false; // New flag to keep viewmodel visible
    
    // Set up with proper scale and position
    this.group.scale.set(this.SCALE, this.SCALE, this.SCALE);
    this.group.position.set(
      this.POSITION.x, 
      this.POSITION.y, 
      this.POSITION.z + this.FORWARD_CLIP
    );
    this.group.rotation.set(
      this.ROTATION.x,
      this.ROTATION.y,
      this.ROTATION.z
    );
    
    // Load the viewmodel with its animations
    this._loadModel();
    
    // Initially hidden until the player aims
    this.group.visible = false;
  }
  
  /**
   * Loads the viewmodel and its animations
   * @private
   */
  _loadModel() {
    // Check if we have a preloaded viewmodel
    if (window.preloadedModels && (window.preloadedModels.viewmodel || window.preloadedModels.viewmodel_clone)) {
      console.log("Using preloaded viewmodel");
      try {
        // Use the clone version to avoid reference issues
        const preloadedModel = window.preloadedModels.viewmodel_clone || window.preloadedModels.viewmodel;
        const gltf = {
          scene: preloadedModel.scene.clone(),
          animations: preloadedModel.animations
        };
        
        this.model = gltf.scene;
        this.group.add(this.model);
        
        // Setup animations
        this.mixer = new THREE.AnimationMixer(this.model);
        
        // Remove verbose animation logging
        if (gltf.animations && gltf.animations.length) {
          this._setupActions(gltf.animations);
        } else {
          console.warn('No animations found in preloaded viewmodel!');
        }
        
        // Keep this single log to confirm successful loading
        console.log('Viewmodel loaded successfully from preload');
        this.isLoaded = true;
        
        // Create a muzzle flash anchor
        this._createMuzzleFlashAnchor();
        return; // Exit early since we've handled the model
      } catch (e) {
        console.error('Error using preloaded viewmodel:', e);
        // Fall through to regular loading method if preloaded model fails
      }
    }
    
    const loader = new THREE.GLTFLoader();
    loader.load(
      'models/viewmodel.glb',
      (gltf) => {
        this.model = gltf.scene;
        this.group.add(this.model);
        
        // Setup animations
        this.mixer = new THREE.AnimationMixer(this.model);
        
        // Remove verbose animation logging
        if (gltf.animations && gltf.animations.length) {
          this._setupActions(gltf.animations);
        } else {
          console.warn('No animations found in viewmodel.glb!');
        }
        
        // Keep this single log to confirm successful loading
        console.log('Viewmodel loaded successfully');
        this.isLoaded = true;
        
        // Create a muzzle flash anchor
        this._createMuzzleFlashAnchor();
      },
      undefined,
      (error) => {
        console.error('Error loading viewmodel:', error);
      }
    );
  }
  
  /**
   * Set up all animation actions with proper configuration
   * @param {Array} animations - Array of AnimationClips from the loaded model
   * @private
   */
  _setupActions(animations) {
    // Index all animations by name
    animations.forEach(clip => {
      // Remove verbose animation logging
      
      // Create action but don't play it yet
      const action = this.mixer.clipAction(clip);
      this.animations[clip.name] = action;
      
      // Default configuration
      action.enabled = false;
      action.setEffectiveWeight(0);
      action.loop = THREE.LoopOnce;
      action.clampWhenFinished = true;
      action.reset();
    });

    // Configure specific actions with proper settings
    this._findAndConfigureAction('aim', {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      alternatives: ['DrawAim', 'Draw', 'draw', 'drawaim']
    });
    
    this._findAndConfigureAction('shoot', {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      timeScale: 1.2,
      alternatives: ['shooting', 'Shoot', 'Fire', 'fire']
    });
    
    this._findAndConfigureAction('fakeshoot', {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      alternatives: ['empty', 'dryfire', 'no_ammo']
    });
    
    this._findAndConfigureAction('holster', {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      alternatives: ['Holster', 'holstering']
    });
    
    this._findAndConfigureAction('reload', {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      alternatives: ['Reload', 'reload_gun']
    });
    
    // Initialize with the aim animation frozen at the end frame to always show gun
    if (this.actions.aim) {
      const aimAction = this.actions.aim;
      
      // Set aim to frozen end frame
      aimAction.time = aimAction._clip.duration - 0.01;
      aimAction.enabled = true;
      aimAction.setEffectiveWeight(1);
      aimAction.play();
      
      this.primaryAction = aimAction;
      this.animationState = 'aim';
    }

    this.animationsConfigured = true;
  }
  
  /**
   * Find and configure an action, storing it in the actions object
   * @param {string} name - The action name to use as key
   * @param {Object} options - Configuration options for the action
   * @private
   * @returns {THREE.AnimationAction|null} - The configured action
   */
  _findAndConfigureAction(name, options) {
    const action = this._findAnimation(name, options.alternatives || []);
    if (!action) return null;
    
    // Apply configuration
    action.loop = options.loop || THREE.LoopOnce;
    action.clampWhenFinished = options.clampWhenFinished !== undefined ? options.clampWhenFinished : true;
    if (options.timeScale) action.timeScale = options.timeScale;
    
    // Store in actions map
    this.actions[name] = action;
    return action;
  }
  
  /**
   * Create and position the muzzle flash anchor
   * @private
   */
  _createMuzzleFlashAnchor() {
    // Create an anchor point for muzzle flash effects
    this.muzzleFlashAnchor = new THREE.Group();
    
    // Try to find the barrel / muzzle in the model
    const muzzle = this.model.getObjectByName('barrel') || 
                   this.model.getObjectByName('muzzle') ||
                   this.model.getObjectByName('barrelEnd') ||
                   this.model.getObjectByName('barrel_end');
    
    if (muzzle) {
      // If found, attach to the muzzle
      muzzle.add(this.muzzleFlashAnchor);
      // Adjust forward position using the constants
      this.muzzleFlashAnchor.position.set(
        this.EFFECTS.MUZZLE_FLASH.x,
        this.EFFECTS.MUZZLE_FLASH.y,
        this.EFFECTS.MUZZLE_FLASH.z
      );
      // Only log in debug mode
      if (window.debugMode) {
        console.log("Muzzle flash anchor attached to barrel");
      }
    } else {
      // If not found, attach to model root with an estimated position
      this.model.add(this.muzzleFlashAnchor);
      
      // Position the muzzle flash anchor using the constants
      this.muzzleFlashAnchor.position.set(
        this.EFFECTS.MUZZLE_FLASH.x,
        this.EFFECTS.MUZZLE_FLASH.y,
        this.EFFECTS.MUZZLE_FLASH.z
      );
      // Only log in debug mode
      if (window.debugMode) {
        console.log("Muzzle flash anchor attached to model root - no barrel found");
      }
    }
  }
  
  /**
   * Find an animation by name with various fallbacks
   * @param {string} baseName - The base animation name to find
   * @param {string[]} alternatives - Alternative names to try
   * @returns {THREE.AnimationAction|null} - The found animation action or null
   * @private
   */
  _findAnimation(baseName, alternatives = []) {
    // First try the exact name
    if (this.animations[baseName]) {
      return this.animations[baseName];
    }
    
    // Try alternatives
    for (const name of alternatives) {
      if (this.animations[name]) {
        return this.animations[name];
      }
    }
    
    // Try matching case-insensitively with all animations
    const lowerName = baseName.toLowerCase();
    for (const key of Object.keys(this.animations)) {
      if (key.toLowerCase() === lowerName || key.toLowerCase().includes(lowerName)) {
        return this.animations[key];
      }
    }
    
    // If nothing found, log error and return null
    console.warn(`Animation "${baseName}" not found! Available:`, Object.keys(this.animations));
    return null;
  }
  
  /**
   * Transition to a new animation state with proper blending
   * @param {string} actionName - The action name to transition to
   * @param {Object} options - Transition options
   * @private
   */
  _transitionTo(actionName, options = {}) {
    if (!this.isLoaded || !this.mixer || !this.animationsConfigured) return;
    
    const action = this.actions[actionName];
    if (!action) {
      console.warn(`Action "${actionName}" not found for transition`);
      return;
    }
    
    // Default options
    const defaults = {
      duration: 0.15,            // Transition duration in seconds
      resetAction: true,         // Reset the target action before transitioning
      resetTimeOnPlay: true,     // Reset time to 0 when playing
      stopPrevious: true,        // Stop the previous action
      onComplete: null,          // Callback when transition completes
      weight: 1.0                // Target weight for the action
    };
    
    // Merge with provided options
    const settings = {...defaults, ...options};
    
    // Mark transition in progress
    this.transitionInProgress = true;
    
    // If we need to reset the action first
    if (settings.resetAction) {
      action.reset();
    }
    
    // Time reset if needed
    if (settings.resetTimeOnPlay) {
      action.time = 0;
    }
    
    // Enable the action and ensure it's in the mixer
    action.enabled = true;
    
    // Set weight to a very small value instead of 0 to maintain influence
    // This prevents the default pose from appearing during transitions
    action.setEffectiveWeight(0.001);
    action.play();
    
    // If we had a previous primary action
    if (this.primaryAction && settings.stopPrevious && this.primaryAction !== action) {
      // Don't immediately stop it - we'll cross-fade
      this.secondaryAction = this.primaryAction;
    }
    
    // Set the new primary action
    this.primaryAction = action;
    this.currentAction = action;
    
    // Update animation state
    this.animationState = actionName;
    
    // Initial weights
    let currentWeight = action.getEffectiveWeight();
    let secondaryWeight = this.secondaryAction ? this.secondaryAction.getEffectiveWeight() : 0;
    
    // Create an interpolation function
    const startTime = performance.now();
    const endTime = startTime + (settings.duration * 1000);
    
    // Do the interpolation on each frame
    const updateWeights = () => {
      const now = performance.now();
      
      // Calculate progress (0 to 1)
      const progress = Math.min((now - startTime) / (endTime - startTime), 1);
      
      // Use smoother easing function for transitions
      const easedProgress = this._easeInOutQuad(progress);
      
      // Update weights based on progress
      currentWeight = easedProgress * settings.weight;
      this.primaryAction.setEffectiveWeight(Math.max(0.001, currentWeight));
      
      if (this.secondaryAction) {
        secondaryWeight = 1 - easedProgress;
        this.secondaryAction.setEffectiveWeight(Math.max(0.001, secondaryWeight));
      }
      
      // If not complete, continue updating
      if (progress < 1) {
        requestAnimationFrame(updateWeights);
      } else {
        // Transition complete
        this.transitionInProgress = false;
        
        // Set final weights explicitly to avoid floating point issues
        this.primaryAction.setEffectiveWeight(settings.weight);
        
        // Stop the secondary action fully if we were transitioning
        if (this.secondaryAction) {
          // Keep a tiny weight to maintain bone influence and prevent model collapse
          // This is key to preventing default pose flashing
          this.secondaryAction.setEffectiveWeight(0.001);
          
          // Don't stop it completely
          // this.secondaryAction.stop();
          this.secondaryAction = null;
        }
        
        // Call completion callback if provided
        if (settings.onComplete) {
          settings.onComplete();
        }
        
        // Process next animation in queue if any
        this._processQueue();
      }
    };
    
    // Start the weight interpolation
    updateWeights();
  }
  
  /**
   * Smoother quadratic easing function for animation transitions
   * @param {number} t - Input value (0-1)
   * @returns {number} - Eased value (0-1)
   * @private
   */
  _easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  
  /**
   * Queue an animation to play when current animation completes
   * @param {string} actionName - The action name to queue
   * @param {Object} options - Transition options
   * @private 
   */
  _queueAnimation(actionName, options = {}) {
    this.queue.push({ actionName, options });
    
    // If no transition in progress, process queue immediately
    if (!this.transitionInProgress) {
      this._processQueue();
    }
  }
  
  /**
   * Process the animation queue
   * @private
   */
  _processQueue() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this._transitionTo(next.actionName, next.options);
    }
  }
  
  /**
   * Play the aim animation (when right mouse button is pressed)
   */
  playDrawAim() {
    if (!this.isLoaded || !this.actions.aim) return;
    
    // If we're already in the aim state with the aim animation at its end,
    // we don't need to do anything
    if (this.animationState === 'aim' && 
        this.actions.aim.time >= this.actions.aim._clip.duration - 0.02) {
      return;
    }
    
    // Transition to aim with short duration for responsive aiming
    this._transitionTo('aim', {
      duration: 0.1,
      resetTimeOnPlay: true // Start from beginning
    });
  }
  
  /**
   * Play the shooting animation
   */
  playShootAnim() {
    if (!this.isLoaded || !this.actions.shoot) return;
    
    // Make sure the model is visible
    this.group.visible = true;
    
    // If we're already in a shooting animation, use a different approach to avoid flicker
    if (this.animationState === 'shoot') {
      // Since we're already in the shoot animation and it's frozen at the end,
      // we need to reset it without disrupting the rendering
      
      // Use the same action but reset it and play again
      const shootAction = this.actions.shoot;
      
      // Keep its weight at 1 to avoid any flicker of the default pose
      shootAction.setEffectiveWeight(1);
      
      // Just reset the time to 0 and let it play again
    shootAction.reset();
      shootAction.time = 0;
      shootAction.enabled = true;
    shootAction.play();
      
      // No need to transition since we're already in the right state
      return;
    }
    
    // For normal transition from a different animation state
    this._transitionTo('shoot', {
      duration: 0.08,
      resetTimeOnPlay: true, // Always play from start
      onComplete: () => {
        // Freeze on the last frame of the shooting animation
        // We stay in this state to allow for continuous shooting
      }
    });
  }
  
  /**
   * Play the fakeshoot animation (when trying to shoot without ammo)
   */
  playFakeShootAnim() {
    if (!this.isLoaded || !this.actions.fakeshoot) return;
    
    // Make sure the model is visible
    this.group.visible = true;
    
    // Block holstering until fakeshoot animation completes
    this.blockHolster = true;
    this.pendingHolster = false;
    this.forceVisible = true; // Force viewmodel to stay visible
    
    // Special handling if we're in aim animation and it's frozen at the end pose
    if (this.animationState === 'aim' && 
        this.actions.aim.time >= this.actions.aim._clip.duration - 0.02) {
      
      // Get the fakeshoot action
      const fakeshootAction = this.actions.fakeshoot;
      
      // Reset and prepare the fakeshoot action
      fakeshootAction.reset();
      fakeshootAction.time = 0;
      fakeshootAction.enabled = true;
      fakeshootAction.setEffectiveWeight(1);
      fakeshootAction.clampWhenFinished = false; // Don't freeze on the last frame
      
      // Get the exact fakeshoot duration
      const fakeshootDuration = fakeshootAction._clip.duration;
      
      // Immediately stop the aim animation and switch to fakeshoot
      this.actions.aim.setEffectiveWeight(0);
      fakeshootAction.play();
      
      // Update our tracking state
      this.primaryAction = fakeshootAction;
      this.animationState = 'fakeshoot';
      
      // Wait for the fakeshoot animation to complete, then transition back to aim
      setTimeout(() => {
        // If we're still in the fakeshoot state (nothing else interrupted)
        if (this.animationState === 'fakeshoot') {
          // First reset the aim animation to the frozen end pose
          this.actions.aim.time = this.actions.aim._clip.duration - 0.01;
          this.actions.aim.enabled = true;
          
          // Quick transition back to aim pose
          this._transitionTo('aim', {
            duration: 0.15,
            resetTimeOnPlay: false, // Keep at the end frame
            onComplete: () => {
              // After fakeshoot animation is completely done
              this.blockHolster = false;
              this.forceVisible = false; // Allow visibility to be controlled normally again
              
              // Check if player released aim during fakeshoot animation
              if (this.pendingHolster) {
                this.pendingHolster = false;
                this.playHolsterAnim();
              }
            }
          });
        } else {
          // Safety fallback - always unblock holster even if interrupted
          this.blockHolster = false;
          this.forceVisible = false; // Allow visibility to be controlled normally again
          
          if (this.pendingHolster) {
            this.pendingHolster = false;
            this.playHolsterAnim();
          }
        }
      }, fakeshootDuration * 1000 - 100); // Transition 100ms before end for smoother animation
      
      return;
    }
    
    // Standard transition for other cases
    this._transitionTo('fakeshoot', {
      duration: 0.1,
      resetTimeOnPlay: true,
      onComplete: () => {
        // After fakeshoot completes, return to aim stance
        if (this.actions.aim) {
          // Set action time to end of animation for a static aim pose
          this.actions.aim.time = this.actions.aim._clip.duration - 0.01;
          
          this._transitionTo('aim', {
            duration: 0.15,
            resetTimeOnPlay: false, // Don't reset time, keep at end
            onComplete: () => {
              // After fakeshoot animation is completely done
              this.blockHolster = false;
              this.forceVisible = false; // Allow visibility to be controlled normally again
              
              // Check if player released aim during fakeshoot animation
              if (this.pendingHolster) {
                this.pendingHolster = false;
                this.playHolsterAnim();
              }
            }
          });
        } else {
          // Safety fallback
          this.blockHolster = false;
          this.forceVisible = false; // Allow visibility to be controlled normally again
          
          if (this.pendingHolster) {
            this.pendingHolster = false;
            this.playHolsterAnim();
          }
        }
      }
    });
  }
  
  /**
   * Play the holster animation
   */
  playHolsterAnim() {
    if (!this.isLoaded || !this.actions.holster) return;
    
    // If we're currently playing fakeshoot, don't interrupt it
    if (this.blockHolster) {
      this.pendingHolster = true;
      return;
    }
    
    // Force model to stay visible during the entire holster animation
    this.forceVisible = true;
    
    // Smooth transition to holster with longer duration
    this._transitionTo('holster', {
      duration: 0.25, // Increased from 0.15 for smoother transition
      onComplete: () => {
        // Get the exact duration of the holster animation
        const holsterDuration = this.actions.holster._clip.duration;
        
        // Wait for animation to complete before allowing the model to be hidden
        setTimeout(() => {
          this.forceVisible = false;
        }, holsterDuration * 1000 - 50); // Small buffer before the end
      }
    });
  }
  
  /**
   * Play the reload animation
   */
  playReloadAnim() {
    if (!this.isLoaded || !this.actions.reload) return;
    
    // Make sure the model is visible during reload
    this.group.visible = true;
    
    // Force viewmodel to stay visible during reload
    this.forceVisible = true;
    this.blockHolster = true;
    this.pendingHolster = false;
    
    // Transition to reload with slightly longer duration for better visibility
    this._transitionTo('reload', {
      duration: 0.2,
      onComplete: () => {
        // Get the exact duration of the reload animation
        const reloadDuration = this.actions.reload._clip.duration;
        
        // Set a timer to queue up the next animation before reload finishes
        // This prevents any flicker at the end of reload
        setTimeout(() => {
          // After reload completes, return to aim state
          if (this.actions.aim) {
            // Set action time to end of animation
            this.actions.aim.time = this.actions.aim._clip.duration - 0.01;
            
            this._transitionTo('aim', {
              duration: 0.15,
              resetTimeOnPlay: false, // Don't reset time, keep at end
              onComplete: () => {
                // Allow visibility to be controlled normally again
                this.forceVisible = false;
                this.blockHolster = false;
                
                // If player released aim during reload, holster now
                if (this.pendingHolster) {
                  this.pendingHolster = false;
                  this.playHolsterAnim();
                }
              }
            });
          }
        }, Math.max(0, (reloadDuration * 1000) - 150)); // Queue 150ms before end of animation
      }
    });
  }
  
  /**
   * Play the idle animation - actually a no-op since we never use idle
   */
  playIdle() {
    // This is a no-op - we don't play the idle animation at all
    // Instead, we stay in the current animation state or use the aim pose
    if (this.isLoaded && this.actions.aim && !this.animationState) {
      // Only if we have no other animation playing, set a static aim pose
      this.actions.aim.time = this.actions.aim._clip.duration - 0.01;
      this.actions.aim.enabled = true;
      this.actions.aim.setEffectiveWeight(1);
      this.actions.aim.play();
      this.animationState = 'aim';
    }
  }
  
  /**
   * Returns true if the current animation is a shooting animation
   * @returns {boolean} True if currently in shooting animation
   */
  isInShootAnimation() {
    return this.animationState === 'shoot' || this.animationState === 'fakeshoot';
  }
  
  /**
   * Updates the animation mixer
   * @param {number} deltaTime - Time since last frame in seconds
   */
  update(deltaTime) {
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
  }
  
  /**
   * Returns the world position of the gun barrel tip
   * @returns {THREE.Vector3} The world position for spawning bullets and effects
   */
  getBarrelTipWorldPosition() {
    if (this.muzzleFlashAnchor) {
      const worldPos = new THREE.Vector3();
      this.muzzleFlashAnchor.getWorldPosition(worldPos);
      
      // Add a small forward offset to ensure effects appear in front of the barrel
      // This is in world space, so we need the camera's forward direction
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion()));
      forward.multiplyScalar(this.EFFECTS.BULLET_SPAWN.forward_offset); // Forward offset amount
      
      worldPos.add(forward);
      return worldPos;
    }
    
    // Fallback if muzzle flash anchor isn't ready yet
    return this.group.localToWorld(new THREE.Vector3(0, 0, -0.5));
  }
} 