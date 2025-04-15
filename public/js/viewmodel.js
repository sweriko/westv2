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
    
    // Configure shotgun animation actions
    this._findAndConfigureAction('shotgundraw', {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      alternatives: ['shotgunDraw', 'ShotgunDraw']
    });
    
    this._findAndConfigureAction('shotgunaim', {
      loop: THREE.LoopRepeat,
      clampWhenFinished: false,
      alternatives: ['shotgunAim', 'ShotgunAim', 'shotgunaimloop', 'ShotgunAimLoop']
    });
    
    this._findAndConfigureAction('shotgunholster', {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      alternatives: ['shotgunHolster', 'ShotgunHolster', 'shotgunholstering']
    });
    
    this._findAndConfigureAction('shotgunshot', {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      alternatives: ['shotgunShoot', 'ShotgunShoot', 'shotgunfire', 'ShotgunFire']
    });
    
    this._findAndConfigureAction('shotgunreload', {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      alternatives: ['shotgunReload', 'ShotgunReload']
    });
    
    this._findAndConfigureAction('shotgunempty', {
      loop: THREE.LoopOnce,
      clampWhenFinished: true,
      alternatives: ['shotgunEmpty', 'ShotgunEmpty', 'shotgundryfire', 'ShotgunDryFire']
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
   * Helper method to check if an animation can interrupt the current one
   * @param {string} newActionName - The action name that wants to play
   * @returns {boolean} - Whether interruption is allowed
   * @private
   */
  _canInterruptCurrentAnimation(newActionName) {
    const state = this.animationState;
    
    // Reload can interrupt any animation
    if (newActionName.includes('reload')) return true;
    
    // Empty can only be interrupted by reload
    if (state.includes('empty') && !newActionName.includes('reload')) return false;
    
    // Holster animation with blockHolster flag set has limited interruptions
    if (state.includes('holster') && this.blockHolster && 
        !newActionName.includes('idle') && 
        !newActionName.includes('empty') && 
        !newActionName.includes('reload')) {
      return false;
    }
    
    // Always allow draw to interrupt holster (re-aiming)
    if ((newActionName === 'revolverdraw' && state === 'revolverholster') ||
        (newActionName === 'shotgundraw' && state === 'shotgunholster')) {
      return true;
    }
    
    // Always allow holster to interrupt aim
    if ((newActionName === 'revolverholster' && state === 'revolveraim') ||
        (newActionName === 'shotgunholster' && state === 'shotgunaim')) {
      return true;
    }
    
    return true;
  }
  
  /**
   * Transition to a new animation state with abrupt stitching instead of blending
   * @param {string} actionName - The action name to transition to
   * @param {Object} options - Transition options
   * @private
   */
  _transitionTo(actionName, options = {}) {
    if (!this.isLoaded || !this.mixer || !this.animationsConfigured) return;
    
    // Handle aim transitions with pending holster
    if ((actionName === 'revolveraim' || actionName === 'shotgunaim') && this.pendingHolster) {
      this.pendingHolster = false;
      this.pendingAimTransition = false;
      this.playHolsterAnim();
      return;
    }
    
    // Handle cancelled aim transitions
    if ((actionName === 'revolveraim' && !this.pendingAimTransition && this.animationState === 'revolverdraw') ||
        (actionName === 'shotgunaim' && !this.pendingAimTransition && this.animationState === 'shotgundraw')) {
      this._transitionTo('idle', { resetTimeOnPlay: true });
      return;
    }
    
    // Check if the current animation can be interrupted
    if (!this._canInterruptCurrentAnimation(actionName)) {
      // Queue critical animations for later
      if (actionName.includes('empty') || actionName.includes('reload')) {
        this._queueAnimation(actionName, options);
      }
      return;
    }
    
    // Handle specific transition cases
    if (actionName.includes('draw') && this.animationState.includes('holster')) {
      // Interrupting holster to draw - allow it
      this.blockHolster = false;
      this._clearTimeouts();
    } 
    else if (actionName.includes('holster') && this.animationState.includes('aim')) {
      // Always allow holstering from aim state
      this.blockHolster = false;
    }
    else if (actionName.includes('reload')) {
      // Clear flags for reload
      this.pendingAimTransition = false;
      this.blockHolster = false;
      this._clearTimeouts();
    }
    else if ((this.animationState === 'revolverempty' || this.animationState === 'shotgunempty') && 
             (actionName === 'idle' || actionName.includes('aim'))) {
      // Reset flags when transitioning from empty animation
      this.blockHolster = false;
      this.pendingHolster = false;
      this.pendingAimTransition = false;
    }
    
    const action = this.actions[actionName];
    if (!action) {
      console.warn(`Action "${actionName}" not found for transition`);
      return;
    }
    
    // Default options
    const settings = {
      resetAction: true,
      resetTimeOnPlay: true,
      stopPrevious: true,
      onComplete: null,
      ...options
    };
    
    this.transitionInProgress = true;
    
    // Reset and prepare action
    if (settings.resetAction) action.reset();
    if (settings.resetTimeOnPlay) action.time = 0;
    action.enabled = true;
    
    // Stop previous action
    if (this.primaryAction && settings.stopPrevious && this.primaryAction !== action) {
      if (this._actionTimeoutId) {
        clearTimeout(this._actionTimeoutId);
        this._actionTimeoutId = null;
      }
      
      this.primaryAction.enabled = false;
      this.primaryAction.setEffectiveWeight(0);
    }
    
    // Set new action
    this.primaryAction = action;
    this.currentAction = action;
    action.setEffectiveWeight(1);
    action.play();
    
    // Update animation state
    this.animationState = actionName;
    
    // Set up completion callback
    if (settings.onComplete && action.loop !== THREE.LoopRepeat) {
      const clipDuration = action._clip.duration;
      const timeoutDuration = actionName.includes('holster') 
        ? clipDuration * 1000 
        : clipDuration * 1000 - 50;
      
      const timeoutId = setTimeout(() => {
        if (this.primaryAction === action) {
          if (actionName.includes('holster')) {
            this._holsterTimeoutId = null;
          } else {
            this._actionTimeoutId = null;
          }
          settings.onComplete();
        }
      }, timeoutDuration);
      
      if (actionName.includes('holster')) {
        this._holsterTimeoutId = timeoutId;
      } else {
        this._actionTimeoutId = timeoutId;
      }
    }
    
    this.transitionInProgress = false;
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
   * Play the draw animation when starting to aim.
   * Transitions to aim when completed.
   */
  playDrawAim() {
    if (!this.isLoaded) return;
    
    const weaponPrefix = this._getWeaponPrefix();
    this.pendingHolster = false;
    
    // If we're already in aim mode, we don't need to do anything
    if (this.animationState === `${weaponPrefix}aim`) return;
    
    // Make sure the model is visible during draw
    this.group.visible = true;
    
    // If we're holstering, interrupt it and switch to draw
    if (this.animationState === `${weaponPrefix}holster`) {
      // Cancel any pending callbacks from the holster animation
      if (this.primaryAction === this.actions[`${weaponPrefix}holster`]) {
        this.blockHolster = false;
      }
      
      this._clearTimeouts();
      
      this._transitionTo(`${weaponPrefix}draw`, {
        resetTimeOnPlay: true,
        onComplete: () => {
          if (!this.pendingHolster) {
            this.pendingAimTransition = true;
            this._transitionTo(`${weaponPrefix}aim`, { resetTimeOnPlay: true });
            this.pendingAimTransition = false;
          } else {
            this.pendingHolster = false;
            this.playHolsterAnim();
          }
        }
      });
      return;
    }
    
    this._clearTimeouts();
    this.blockHolster = false;
    
    this._transitionTo(`${weaponPrefix}draw`, {
      resetTimeOnPlay: true,
      onComplete: () => {
        if (!this.pendingHolster) {
          this.pendingAimTransition = true;
          this._transitionTo(`${weaponPrefix}aim`, { resetTimeOnPlay: true });
          this.pendingAimTransition = false;
        } else {
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
    
    const weaponPrefix = this._getWeaponPrefix();
    this.group.visible = true;
    
    // Can only shoot if in aim mode or already shooting
    if (this.animationState !== `${weaponPrefix}aim` && 
        this.animationState !== `${weaponPrefix}draw` && 
        this.animationState !== `${weaponPrefix}shot`) {
      return;
    }
    
    const completeAction = () => {
      if (!this.blockHolster && !this.pendingHolster) {
        this._transitionTo(`${weaponPrefix}aim`, { resetTimeOnPlay: true });
      } else if (this.pendingHolster) {
        this.pendingHolster = false;
        this.playHolsterAnim();
      }
    };
    
    // For rapid fire shooting, if we're already in the shoot animation,
    // cancel the current animation and any pending callback
    if (this.animationState === `${weaponPrefix}shot`) {
      this._clearTimeouts();
      
      // Reset the shot animation to play from the beginning
      const shootAction = this.actions[`${weaponPrefix}shot`];
      shootAction.reset();
      shootAction.time = 0;
      shootAction.enabled = true;
      shootAction.setEffectiveWeight(1);
      shootAction.play();
      
      // Set up a new completion callback
      const clipDuration = shootAction._clip.duration;
      this._actionTimeoutId = setTimeout(() => {
        if (this.primaryAction === shootAction) {
          this._actionTimeoutId = null;
          completeAction();
        }
      }, clipDuration * 1000 - 50);
      
      return;
    }
    
    // For first shot, transition to shoot animation normally
    this._transitionTo(`${weaponPrefix}shot`, {
      resetTimeOnPlay: true,
      onComplete: completeAction
    });
  }
  
  /**
   * Play the empty gun animation (when trying to shoot without ammo)
   */
  playFakeShootAnim() {
    if (!this.isLoaded) return;
    
    const weaponPrefix = this._getWeaponPrefix();
    this.group.visible = true;
    
    // Block everything until empty animation completes
    this.blockHolster = true;
    this.pendingHolster = false;
    this.forceVisible = true;
    
    this._clearTimeouts();
    
    // Reset all animations to ensure clean state
    Object.values(this.actions).forEach(action => {
      if (action !== this.actions[`${weaponPrefix}empty`]) {
        action.reset();
        action.setEffectiveWeight(0);
      }
    });
    
    // Transition to empty animation
    this._transitionTo(`${weaponPrefix}empty`, {
      resetTimeOnPlay: true,
      onComplete: () => {
        this._resetAnimationFlags();
        
        // Get current aim state
        const isAimingNow = window.localPlayer?.isAiming || false;
        
        // Transition based on current aim state
        if (isAimingNow) {
          this._transitionTo(`${weaponPrefix}aim`, { resetTimeOnPlay: true });
        } else {
          this._transitionTo('idle', { resetTimeOnPlay: true });
        }
      }
    });
  }
  
  /**
   * Play the holster animation (when stopping aiming)
   */
  playHolsterAnim() {
    if (!this.isLoaded) return;
    
    const weaponPrefix = this._getWeaponPrefix();
    
    // If we're currently playing empty or reload animations, don't interrupt
    if (this.blockHolster && this.animationState !== `${weaponPrefix}aim`) {
      this.pendingHolster = true;
      return;
    }
    
    // If we're in aim state, we should always be able to holster
    if (this.animationState === `${weaponPrefix}aim`) {
      this.blockHolster = false;
    }
    
    // Cancel any pending transition to aim state if we're still in drawing phase
    if (this.animationState === `${weaponPrefix}draw` && this.pendingAimTransition) {
      this.pendingAimTransition = false;
    }
    
    this._clearTimeouts();
    this.forceVisible = true;
    
    // Reset holster animation if interrupted during draw or aim
    if ((this.animationState === `${weaponPrefix}draw` || this.animationState === `${weaponPrefix}aim`) && 
         this.actions[`${weaponPrefix}holster`]) {
      this.actions[`${weaponPrefix}holster`].reset();
    }
    
    // Ensure holster animation can't be interrupted once started
    this.blockHolster = true;
    
    // Play the gun holster sound
    if (window.localPlayer?.soundManager) {
      const soundName = weaponPrefix === 'shotgun' ? "shotgunholstering" : "revolverholstering";
      window.localPlayer.soundManager.playSound(soundName, 0, 0.6);
    }
    
    // Transition to holster animation
    this._transitionTo(`${weaponPrefix}holster`, {
      resetTimeOnPlay: true,
      onComplete: () => {
        // After holster completes, transition to idle and hide model
        this._transitionTo('idle', {
          resetTimeOnPlay: true,
          onComplete: () => {
            this.blockHolster = false;
            this.pendingHolster = false;
            this.forceVisible = false;
            
            // Hide viewmodel when transitioning back to idle from holster
            setTimeout(() => {
              if (!this.forceVisible) this.group.visible = false;
            }, 50);
          }
        });
      }
    });
  }
  
  /**
   * Play the reload animation
   */
  playReloadAnim() {
    if (!this.isLoaded) return;
    
    const weaponPrefix = this._getWeaponPrefix();
    
    // Make sure the model is visible during reload
    this.group.visible = true;
    
    // Reset ALL animation state flags completely when starting reload
    this.forceVisible = true;
    this.blockHolster = true;
    this.pendingHolster = false;
    this.pendingAimTransition = false;
    
    this._clearTimeouts();
    
    // Reset all animations to ensure clean state
    Object.values(this.actions).forEach(action => {
      if (action !== this.actions[`${weaponPrefix}reload`]) {
        action.reset();
        action.enabled = false;
        action.setEffectiveWeight(0);
      }
    });
    
    // Play reload sound
    if (window.localPlayer?.soundManager) {
      const soundName = weaponPrefix === 'shotgun' ? "shotgunreloading" : "reloading";
      window.localPlayer.soundManager.playSound(soundName, 0, 0.6);
    }
    
    // Transition to reload animation
    this._transitionTo(`${weaponPrefix}reload`, {
      resetTimeOnPlay: true,
      onComplete: () => {
        // After reload completes, go back to idle animation first
        this._transitionTo('idle', {
          resetTimeOnPlay: true,
          onComplete: () => {
            this._resetAnimationFlags();
            
            // If player is still aiming after reload, immediately transition to draw
            const isAimingNow = window.localPlayer?.isAiming;
            if (isAimingNow) {
              this.animationState = 'idle';
              this.primaryAction = this.actions.idle;
              this.currentAction = this.actions.idle;
              
              // Start the draw animation with a slight delay to ensure clean state
              setTimeout(() => {
                if (window.localPlayer?.isAiming) this.playDrawAim();
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
    return this.animationState === 'revolvershot' || 
           this.animationState === 'revolverempty' ||
           this.animationState === 'shotgunshot' ||
           this.animationState === 'shotgunempty';
  }
  
  /**
   * Updates the animation mixer
   * @param {number} deltaTime - Time since last frame in seconds
   */
  update(deltaTime) {
    if (!this.isLoaded || !this.mixer) return;
    
    this.mixer.update(deltaTime);
    
    // Add animation state monitoring to detect and recover from stuck animations
    if (!this._stateStartTime) {
      this._stateStartTime = {};
      this._lastAnimationState = '';
    }
    
    // If animation state changed, record the start time
    if (this.animationState !== this._lastAnimationState) {
      this._stateStartTime[this.animationState] = Date.now();
      this._lastAnimationState = this.animationState;
    }
    
    // Check for stuck animations - if an animation has been playing too long
    if (this.animationState && this._stateStartTime[this.animationState]) {
      const timeInState = Date.now() - this._stateStartTime[this.animationState];
      
      // Empty and holster animations can get stuck
      if ((this.animationState.includes('empty') || this.animationState.includes('holster')) && 
          timeInState > 5000) { // 5 seconds is too long for these animations
        console.warn(`Animation stuck in ${this.animationState} for ${timeInState}ms, resetting`);
        
        // Force reset animation flags
        this.blockHolster = false;
        this.pendingHolster = false;
        this.forceVisible = false;
        
        // Reset to idle state
        this._transitionTo('idle', {
          resetTimeOnPlay: true
        });
        
        // Reset timer
        this._stateStartTime = {};
      }
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
    
    console.log(`Loading skin texture for viewmodel: ${texturePath}`);
    
    new THREE.TextureLoader().load(
      texturePath,
      (texture) => {
        // Store the loaded texture
        this.availableSkins[skinId] = texture;
        
        // Apply if we have permission
        if (this.skinPermissions[skinId]) {
          this.applyTextureToModel(texture);
          this.activeSkin = skinId;
          console.log(`Applied newly loaded skin '${skinId}' to viewmodel`);
        }
      },
      undefined,
      (error) => console.error(`Error loading skin texture '${skinId}':`, error)
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
      if (!child.isMesh || !child.material) return;
      
      // Check if this is a relevant part to apply the texture to
      const isRevolverMaterial = child.material.name?.includes('Material.002');
      const isRevolverPart = revolverParts.some(part => 
        child.name.toLowerCase().includes(part.toLowerCase())
      );
      
      if (isRevolverMaterial || isRevolverPart) {
        // Store the original/default texture if not already stored
        if (!this.availableSkins.default && child.material.map) {
          this.availableSkins.default = child.material.map.clone();
        }
        
        // Clone the original material to preserve all properties
        if (child.material._originalMaterial === undefined) {
          child.material._originalMaterial = child.material.clone();
        }
        
        // Copy properties from original texture
        if (child.material._originalMaterial?.map) {
          const originalTexture = child.material._originalMaterial.map;
          
          // Copy texture properties
          const props = ['wrapS', 'wrapT', 'flipY', 'encoding', 'generateMipmaps', 'minFilter', 'magFilter'];
          props.forEach(prop => texture[prop] = originalTexture[prop]);
          
          // Copy vector properties
          texture.repeat.copy(originalTexture.repeat);
          texture.offset.copy(originalTexture.offset);
          texture.center.copy(originalTexture.center);
          texture.rotation = originalTexture.rotation;
        }
        
        // Apply the new texture
        child.material.map = texture;
        child.material.needsUpdate = true;
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
    
    // Reset to default skin if current skin is no longer permitted
    if (skinChanged && this.activeSkin && !this.skinPermissions[this.activeSkin]) {
      this.updateSkin('default');
    }
  }
  
  /**
   * Cancels the current reload animation and resets animation state
   */
  cancelReload() {
    if (!this.isLoaded) return;
    
    // Determine which weapon prefix to use
    const weaponPrefix = window.localPlayer && window.localPlayer.activeWeapon === 'shotgun' ? 'shotgun' : 'revolver';
    
    // Reset animation flags
    this.forceVisible = false;
    this.blockHolster = false;
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
    
    // Stop the reload animation
    if (this.actions[`${weaponPrefix}reload`]) {
      this.actions[`${weaponPrefix}reload`].stop();
    }
    
    // Transition to idle animation
    this._transitionTo(`${weaponPrefix}idle`, {
      resetTimeOnPlay: true
    });
    
    // If player isn't aiming, hide the viewmodel
    if (window.localPlayer && !window.localPlayer.isAiming) {
      setTimeout(() => {
        this.group.visible = false;
      }, 100); // Short delay to ensure animation transition starts
    }
    
    console.log(`Canceled ${weaponPrefix} reload animation`);
  }

  _getWeaponPrefix() {
    return window.localPlayer && window.localPlayer.activeWeapon === 'shotgun' ? 'shotgun' : 'revolver';
  }

  _clearTimeouts() {
    if (this._actionTimeoutId) {
      clearTimeout(this._actionTimeoutId);
      this._actionTimeoutId = null;
    }
    if (this._holsterTimeoutId) {
      clearTimeout(this._holsterTimeoutId);
      this._holsterTimeoutId = null;
    }
  }

  _resetAnimationFlags() {
    this.blockHolster = false;
    this.pendingHolster = false;
    this.forceVisible = false;
    this.pendingAimTransition = false;
  }
} 