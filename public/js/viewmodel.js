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
        x: -0.05,       // Left/right offset of muzzle flash
        y: 0.1,      // Up/down offset of muzzle flash
        z: -0.1,      // Forward/backward offset of muzzle flash (negative = forward)
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
    this.pendingAimTransition = false; // Flag to track pending transition to aim from draw
    
    // Timeout tracking for animation callbacks
    this._actionTimeoutId = null;
    this._holsterTimeoutId = null;
    
    // Flags to prevent holstering and keep viewmodel visible
    this.blockHolster = false;
    this.pendingHolster = false;
    this.forceVisible = false; // New flag to keep viewmodel visible
    
    // Skin system
    this.activeSkin = null;
    this.availableSkins = {
      default: null, // Default texture will be stored here after loading
      bananaSkin: null // Will be loaded on demand
    };
    this.skinPermissions = {
      bananaSkin: false // By default, skin is locked until verified with NFT
    };
    
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

    // Configure the new animation names
    this._findAndConfigureAction('idle', {
      loop: THREE.LoopRepeat, // This should loop continuously
      clampWhenFinished: false,
      alternatives: ['Idle']
    });
    
    this._findAndConfigureAction('revolverdraw', {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      alternatives: ['DrawAim', 'Draw', 'draw', 'drawaim']
    });
    
    this._findAndConfigureAction('revolveraim', {
      loop: THREE.LoopRepeat, // Should loop as long as player is aiming
      clampWhenFinished: false,
      alternatives: ['Aim', 'aim', 'AimLoop', 'aimloop']
    });
    
    this._findAndConfigureAction('revolverholster', {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      alternatives: ['Holster', 'holstering', 'holster']
    });
    
    this._findAndConfigureAction('revolvershot', {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      alternatives: ['Shoot', 'shoot', 'Fire', 'fire', 'shooting']
    });
    
    this._findAndConfigureAction('revolverreload', {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      alternatives: ['Reload', 'reload_gun', 'reload']
    });
    
    this._findAndConfigureAction('revolverempty', {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      alternatives: ['fakeshoot', 'empty', 'dryfire', 'no_ammo']
    });
    
    // Initialize with the idle animation
    if (this.actions.idle) {
      const idleAction = this.actions.idle;
      idleAction.enabled = true;
      idleAction.setEffectiveWeight(1);
      idleAction.play();
      
      this.primaryAction = idleAction;
      this.animationState = 'idle';
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
   * Transition to a new animation state with abrupt stitching instead of blending
   * @param {string} actionName - The action name to transition to
   * @param {Object} options - Transition options
   * @private
   */
  _transitionTo(actionName, options = {}) {
    if (!this.isLoaded || !this.mixer || !this.animationsConfigured) return;
    
    // If we're transitioning to revolveraim but the player has already requested to holster
    // (indicated by pendingHolster), cancel this transition and play holster instead
    if (actionName === 'revolveraim' && this.pendingHolster) {
      this.pendingHolster = false;
      this.pendingAimTransition = false;
      this.playHolsterAnim();
      return;
    }
    
    // If we're transitioning to revolveraim but the pendingAimTransition flag was cancelled,
    // simply abort this transition and return to idle
    if (actionName === 'revolveraim' && !this.pendingAimTransition && this.animationState === 'revolverdraw') {
      this._transitionTo('idle', { resetTimeOnPlay: true });
      return;
    }
    
    // Special case: Always allow draw to interrupt holster when re-toggling aim
    if (actionName === 'revolverdraw' && this.animationState === 'revolverholster') {
      // We're interrupting a holster animation to draw again - allow it
      this.blockHolster = false;
      
      // Clear any pending holster animation timeouts
      if (this._holsterTimeoutId) {
        clearTimeout(this._holsterTimeoutId);
        this._holsterTimeoutId = null;
      }
    } 
    // Special case: Always allow holster to interrupt revolveraim
    else if (actionName === 'revolverholster' && this.animationState === 'revolveraim') {
      // Reset any blocking flags that might prevent holstering
      this.blockHolster = false;
    }
    // Special case: Always allow reload to interrupt any animation
    else if (actionName === 'revolverreload') {
      // Clear all animation state flags to ensure we start fresh
      this.pendingAimTransition = false;
      
      // Clear any pending animation timeouts
      if (this._actionTimeoutId) {
        clearTimeout(this._actionTimeoutId);
        this._actionTimeoutId = null;
      }
      if (this._holsterTimeoutId) {
        clearTimeout(this._holsterTimeoutId);
        this._holsterTimeoutId = null;
      }
    }
    // If currently playing the holster animation and it was manually blocked (user initiated),
    // don't allow other animations to interrupt it unless explicitly allowed
    else if (this.animationState === 'revolverholster' && this.blockHolster && 
        actionName !== 'idle' && actionName !== 'revolverempty' && actionName !== 'revolverreload') {
      // For certain critical animations (empty/reload), we'll queue them for after holster
      if (actionName === 'revolverempty' || actionName === 'revolverreload') {
        this._queueAnimation(actionName, options);
      }
      return;
    }
    
    const action = this.actions[actionName];
    if (!action) {
      console.warn(`Action "${actionName}" not found for transition`);
      return;
    }
    
    // Default options
    const defaults = {
      resetAction: true,          // Reset the target action before transitioning
      resetTimeOnPlay: true,      // Reset time to 0 when playing
      stopPrevious: true,         // Stop the previous action
      onComplete: null,           // Callback when transition completes
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
    
    // Enable the action
    action.enabled = true;
    
    // Immediately stop the previous action instead of cross-fading
    if (this.primaryAction && settings.stopPrevious && this.primaryAction !== action) {
      // Cancel any pending callbacks for the previous action
      if (this._actionTimeoutId && this.primaryAction) {
        clearTimeout(this._actionTimeoutId);
        this._actionTimeoutId = null;
      }
      
      this.primaryAction.enabled = false;
      this.primaryAction.setEffectiveWeight(0);
    }
    
    // Set the new primary action with full weight
    this.primaryAction = action;
    this.currentAction = action;
    action.setEffectiveWeight(1);
    action.play();
    
    // Update animation state
    this.animationState = actionName;
    
    // Set up completion callback if needed
    if (settings.onComplete) {
      const clipDuration = action._clip.duration;
      
      // Don't queue for repeating animations
      if (action.loop !== THREE.LoopRepeat) {
        // For holster animation, ensure we use the full duration
        const timeoutDuration = actionName === 'revolverholster' 
          ? clipDuration * 1000  // Use full duration for holster
          : clipDuration * 1000 - 50; // Small time reduction for other animations
        
        // Store the timeout ID so we can cancel it if needed
        const timeoutId = setTimeout(() => {
          // Check if this is still the active animation and callback wasn't cancelled
          if (this.primaryAction === action) {
            // Clear the stored timeout ID
            if (actionName === 'revolverholster') {
              this._holsterTimeoutId = null;
            } else {
              this._actionTimeoutId = null;
            }
            
            settings.onComplete();
          }
        }, timeoutDuration);
        
        // Store the timeout ID for potential cancellation
        if (actionName === 'revolverholster') {
          this._holsterTimeoutId = timeoutId;
        } else {
          this._actionTimeoutId = timeoutId;
        }
      }
    }
    
    // Mark transition as complete immediately since we're using abrupt stitching
    this.transitionInProgress = false;
    
    // Process queue if anything is waiting
    this._processQueue();
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
   * Play the draw animation (when player aims)
   */
  playDrawAim() {
    if (!this.isLoaded) return;
    
    // Reset any block or pending flags that might prevent proper animation
    this.pendingHolster = false;
    
    // If we're already in aim mode, we don't need to do anything
    if (this.animationState === 'revolveraim') {
      return;
    }
    
    // If we're holstering, interrupt it and switch to draw
    // This handles the case of re-toggling aim during holster
    if (this.animationState === 'revolverholster') {
      // Cancel any pending callbacks from the holster animation
      if (this.primaryAction === this.actions.revolverholster) {
        // Reset block holster flag to allow interruption
        this.blockHolster = false;
      }
      
      if (this._holsterTimeoutId) {
        clearTimeout(this._holsterTimeoutId);
        this._holsterTimeoutId = null;
      }
      
      this._transitionTo('revolverdraw', {
        resetTimeOnPlay: true,
        onComplete: () => {
          // Only transition to aim if we haven't requested to holster again
          if (!this.pendingHolster) {
            // After draw animation completes, transition to aim loop
            this.pendingAimTransition = true;
            this._transitionTo('revolveraim', {
              resetTimeOnPlay: true
            });
            this.pendingAimTransition = false;
          } else {
            // If holster was requested during draw, go back to holstering
            this.pendingHolster = false;
            this.playHolsterAnim();
          }
        }
      });
      return;
    }
    
    // Transition to draw with immediate stitching
    this._transitionTo('revolverdraw', {
      resetTimeOnPlay: true,
      onComplete: () => {
        // Only transition to aim if we haven't requested to holster again
        if (!this.pendingHolster) {
          // After draw animation completes, transition to aim loop
          this.pendingAimTransition = true;
          this._transitionTo('revolveraim', {
            resetTimeOnPlay: true
          });
          this.pendingAimTransition = false;
        } else {
          // If holster was requested during draw, go back to holstering
          this.pendingHolster = false;
          this.playHolsterAnim();
        }
      }
    });
  }
  
  /**
   * Play the shooting animation while aiming
   */
  playShootAnim() {
    if (!this.isLoaded) return;
    
    // Make sure the model is visible
    this.group.visible = true;
    
    // Can only shoot if in aim mode
    if (this.animationState !== 'revolveraim' && 
        this.animationState !== 'revolverdraw' && 
        this.animationState !== 'revolvershot') {
      return;
    }
    
    // Transition to shoot animation
    this._transitionTo('revolvershot', {
      resetTimeOnPlay: true,
      onComplete: () => {
        // After shot animation completes, go back to aim loop if still aiming
        if (!this.blockHolster && !this.pendingHolster) {
          this._transitionTo('revolveraim', {
            resetTimeOnPlay: true
          });
        } else if (this.pendingHolster) {
          // Player stopped aiming during the shot, play holster
          this.pendingHolster = false;
          this.playHolsterAnim();
        }
      }
    });
  }
  
  /**
   * Play the empty gun animation (when trying to shoot without ammo)
   */
  playFakeShootAnim() {
    if (!this.isLoaded) return;
    
    // Make sure the model is visible
    this.group.visible = true;
    
    // Block holstering until empty animation completes
    this.blockHolster = true;
    this.pendingHolster = false;
    this.forceVisible = true; // Force viewmodel to stay visible
    
    // Transition to empty animation
    this._transitionTo('revolverempty', {
      resetTimeOnPlay: true,
      onComplete: () => {
        // After empty animation completes
        this.blockHolster = false;
        this.forceVisible = false;
        
        // Check if player released aim during the animation
        if (this.pendingHolster) {
          this.pendingHolster = false;
          this.playHolsterAnim();
        } else {
          // Go back to aim loop if still aiming
          this._transitionTo('revolveraim', {
            resetTimeOnPlay: true
          });
        }
      }
    });
  }
  
  /**
   * Play the holster animation (when stopping aiming)
   */
  playHolsterAnim() {
    if (!this.isLoaded) return;
    
    // If we're currently playing empty or reload animations, don't interrupt
    if (this.blockHolster && this.animationState !== 'revolveraim') {
      this.pendingHolster = true;
      return;
    }
    
    // If we're in aim state, we should always be able to holster
    // This fixes issues after reload
    if (this.animationState === 'revolveraim') {
      this.blockHolster = false;
    }
    
    // Cancel any pending transition to aim state if we're still in drawing phase
    if (this.animationState === 'revolverdraw' && this.pendingAimTransition) {
      this.pendingAimTransition = false;
    }
    
    // Cancel any pending callbacks that might interfere
    if (this._actionTimeoutId) {
      clearTimeout(this._actionTimeoutId);
      this._actionTimeoutId = null;
    }
    
    // Force model to stay visible during the entire holster animation
    this.forceVisible = true;
    
    // If we were interrupted while holstering previously, make sure we use a fresh holster animation
    // This ensures the holster animation plays fully after rapid toggling
    if (this.animationState === 'revolverdraw' || this.animationState === 'revolveraim') {
      // Reset the holster animation to ensure it plays from the beginning
      if (this.actions.revolverholster) {
        this.actions.revolverholster.reset();
      }
    }
    
    // Ensure holster animation can't be interrupted once started
    this.blockHolster = true;
    
    // Play the gun holster sound
    if (window.localPlayer && window.localPlayer.soundManager) {
      window.localPlayer.soundManager.playSound("gunholster", 0, 0.6);
    }
    
    // Transition to holster
    this._transitionTo('revolverholster', {
      resetTimeOnPlay: true,
      onComplete: () => {
        // After holster completes, go back to idle
        this._transitionTo('idle', {
          resetTimeOnPlay: true
        });
        
        // Allow the model to be hidden and unblock holster
        this.forceVisible = false;
        this.blockHolster = false;
      }
    });
  }
  
  /**
   * Play the reload animation
   */
  playReloadAnim() {
    if (!this.isLoaded) return;
    
    // Make sure the model is visible during reload
    this.group.visible = true;
    
    // Reset ALL animation state flags completely when starting reload
    // This ensures we have a clean state regardless of what was happening before
    this.forceVisible = true;
    this.blockHolster = true;
    this.pendingHolster = false;
    this.pendingAimTransition = false;
    
    // Clear any pending animation timeouts
    if (this._actionTimeoutId) {
      clearTimeout(this._actionTimeoutId);
      this._actionTimeoutId = null;
    }
    if (this._holsterTimeoutId) {
      clearTimeout(this._holsterTimeoutId);
      this._holsterTimeoutId = null;
    }
    
    // Reset all animations to ensure clean state
    Object.values(this.actions).forEach(action => {
      if (action !== this.actions.revolverreload) {
        action.reset();
        action.enabled = false;
        action.setEffectiveWeight(0);
      }
    });
    
    // Transition to reload animation
    this._transitionTo('revolverreload', {
      resetTimeOnPlay: true,
      onComplete: () => {
        // After reload completes, always go back to idle animation first
        // We don't need to play holster here - just go straight to idle
        this._transitionTo('idle', {
          resetTimeOnPlay: true,
          onComplete: () => {
            // Fully reset all animation state flags again after transition to idle
            this.forceVisible = false;
            this.blockHolster = false;
            this.pendingHolster = false;
            this.pendingAimTransition = false;
            
            // Clear any pending animation timeouts again
            if (this._actionTimeoutId) {
              clearTimeout(this._actionTimeoutId);
              this._actionTimeoutId = null;
            }
            if (this._holsterTimeoutId) {
              clearTimeout(this._holsterTimeoutId);
              this._holsterTimeoutId = null;
            }
            
            // Check aim state now, not before
            const isAimingNow = window.localPlayer && window.localPlayer.isAiming;
            
            // If player is still aiming after reload, immediately transition to draw
            if (isAimingNow) {
              // Force a complete reset of animation state before drawing
              this.animationState = 'idle';
              this.primaryAction = this.actions.idle;
              this.currentAction = this.actions.idle;
              
              // Start the draw animation with a slight delay to ensure clean state
              setTimeout(() => {
                if (window.localPlayer && window.localPlayer.isAiming) {
                  this.playDrawAim();
                }
              }, 10);
            }
          }
        });
      }
    });
  }
  
  /**
   * Play the idle animation - always looping
   */
  playIdle() {
    if (!this.isLoaded) return;
    
    // Only play idle if we're not in another animation
    if (!this.animationState || this.animationState === 'none') {
      this._transitionTo('idle', {
        resetTimeOnPlay: true
      });
    }
  }
  
  /**
   * Returns true if the current animation is a shooting animation
   * @returns {boolean} True if currently in shooting animation
   */
  isInShootAnimation() {
    return this.animationState === 'revolvershot' || this.animationState === 'revolverempty';
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
      console.warn(`Player does not have permission for skin: ${skinId}`);
      return false;
    }
    
    // Check if the texture was already loaded for this skin
    if (!this.availableSkins[skinId]) {
      // Load the skin texture
      this.loadSkinTexture(skinId);
      return false; // Will be applied once loaded
    }
    
    // Apply the skin texture to the model
    this.applyTextureToModel(this.availableSkins[skinId]);
    this.activeSkin = skinId;
    
    console.log(`Applied skin '${skinId}' to viewmodel`);
    return true;
  }
  
  /**
   * Loads a skin texture by ID
   * @param {string} skinId - The skin ID to load
   */
  loadSkinTexture(skinId) {
    if (!skinId || skinId === 'default') return;
    
    const texturePath = `models/textures/${skinId}.png`;
    const textureLoader = new THREE.TextureLoader();
    
    console.log(`Loading skin texture for viewmodel: ${texturePath}`);
    
    textureLoader.load(
      texturePath,
      (texture) => {
        console.log(`Successfully loaded texture: ${texturePath}`, texture);
        
        // Store the loaded texture
        this.availableSkins[skinId] = texture;
        
        // If we have permission for this skin, apply it immediately
        if (this.skinPermissions[skinId]) {
          this.applyTextureToModel(texture);
          this.activeSkin = skinId;
          console.log(`Applied newly loaded skin '${skinId}' to viewmodel`);
        } else {
          console.log(`Texture loaded but not applied - no permission for skin: ${skinId}`);
        }
      },
      (progressEvent) => {
        console.log(`Texture loading progress: ${progressEvent.loaded} / ${progressEvent.total}`);
      },
      (error) => {
        console.error(`Error loading skin texture '${skinId}' for viewmodel:`, error);
      }
    );
  }
  
  /**
   * Applies a texture to the viewmodel
   * @param {THREE.Texture} texture - The texture to apply
   */
  applyTextureToModel(texture) {
    if (!this.model || !texture) return;
    
    // List of revolver part names to look for
    const revolverParts = ['barrel', 'drum', 'grip', 'revolver', 'gun'];
    
    // Apply the texture to all relevant meshes in the model
    this.model.traverse(child => {
      if (child.isMesh && child.material) {
        // Use Material.002 as primary check, but also check for revolver part names
        const isRevolverMaterial = child.material.name && child.material.name.includes('Material.002');
        const isRevolverPart = revolverParts.some(part => 
          child.name.toLowerCase().includes(part.toLowerCase())
        );
        
        if (isRevolverMaterial || isRevolverPart) {
          console.log(`Found revolver part: ${child.name} with material: ${child.material.name}`);
          
          // Store the original/default texture if not already stored
          if (!this.availableSkins.default && child.material.map) {
            this.availableSkins.default = child.material.map.clone();
            console.log('Stored original texture for later restoration');
          }
          
          // Clone the original material to preserve all properties
          if (child.material._originalMaterial === undefined) {
            child.material._originalMaterial = child.material.clone();
            console.log('Cloned original material to preserve properties');
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
            
            console.log('Copied all texture properties to preserve UV mapping');
          }
          
          // Apply the new texture
          child.material.map = texture;
          child.material.needsUpdate = true;
          
          console.log(`Applied texture to viewmodel part: ${child.name}`);
        }
      }
    });
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