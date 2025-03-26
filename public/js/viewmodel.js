/**
 * A proper FPS viewmodel implementation with animation support
 * Handles animations for DrawAim, Holster, idle and shooting states
 */
export class Viewmodel {
  constructor() {
    // Adjustable constants for positioning the viewmodel
    this.SCALE = 0.15;
    this.POSITION = {
      x: 0,   // positive moves right
      y: 0,   // negative moves down 
      z: 0    // negative moves closer to camera
    };
    
    // Rotation adjustment (in radians)
    this.ROTATION = {
      x: 0,     // pitch
      y: 0,     // yaw
      z: 0      // roll
    };
    
    // Forward clipping offset - how far forward to position model
    this.FORWARD_CLIP = 0.16; // Positive pushes model forward
    
    // Effect positioning constants
    this.EFFECTS = {
      // Muzzle flash anchor position (relative to model)
      MUZZLE_FLASH: {
        x: 1,       // Left/right offset of muzzle flash
        y: -0.5,    // Up/down offset of muzzle flash
        z: -5,    // Forward/backward offset of muzzle flash (negative = forward)
        scale: 0.1 // Scale of muzzle flash effect
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
    this.currentAction = null;
    this.model = null;
    this.muzzleFlashAnchor = null;
    this.isLoaded = false;
    
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
    const loader = new THREE.GLTFLoader();
    loader.load(
      'models/viewmodel.glb',
      (gltf) => {
        this.model = gltf.scene;
        this.group.add(this.model);
        
        // Setup animations
        this.mixer = new THREE.AnimationMixer(this.model);
        
        console.log('Viewmodel animations loaded:');
        if (gltf.animations && gltf.animations.length) {
          gltf.animations.forEach(clip => {
            console.log(`- Animation: "${clip.name}" (Duration: ${clip.duration.toFixed(2)}s)`);
            
            // Create action but don't play it yet
            const action = this.mixer.clipAction(clip);
            this.animations[clip.name] = action;
            
            // We'll configure each action when we need to play it
            action.clampWhenFinished = false;
            action.loop = THREE.LoopOnce;
            action.enabled = false;
          });
          
          // Set up idle to loop by default
          this._configureIdleAnimation();
          
          // Start with idle animation
          this.playIdle();
        } else {
          console.warn('No animations found in viewmodel.glb!');
        }
        
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
   * Find the idle animation and configure it to loop
   * @private
   */
  _configureIdleAnimation() {
    // Look for animations that might be for idle
    const idleNames = ['idle', 'Idle', 'IDLE', 'idle_loop', 'IdleLoop'];
    
    let idleAction = null;
    for (const name of idleNames) {
      if (this.animations[name]) {
        idleAction = this.animations[name];
        break;
      }
    }
    
    if (idleAction) {
      // Configure idle to loop indefinitely
      idleAction.loop = THREE.LoopRepeat;
      idleAction.clampWhenFinished = false;
    }
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
   * Stop all currently active animations
   * @private 
   */
  _stopAllAnimations() {
    if (!this.mixer) return;
    
    for (const name in this.animations) {
      this.animations[name].stop();
      this.animations[name].enabled = false;
    }
    this.currentAction = null;
  }
  
  /**
   * Play the Draw animation
   */
  playDrawAim() {
    if (!this.isLoaded || !this.mixer) return;
    
    // Find the draw animation
    const drawAction = this._findAnimation('DrawAim', ['Draw', 'draw', 'drawaim', 'draw_aim']);
    if (!drawAction) return;
    
    // Reset the mixer to clear any ongoing animations
    this.mixer.stopAllAction();
    
    // Configure the draw animation
    drawAction.loop = THREE.LoopOnce;
    drawAction.clampWhenFinished = true; // So it stays in the last frame
    drawAction.timeScale = 1;
    drawAction.reset();
    drawAction.play();
    
    this.currentAction = drawAction;
  }
  
  /**
   * Play the shooting animation
   */
  playShootAnim() {
    if (!this.isLoaded || !this.mixer) return;
    
    // Find the shooting animation
    const shootAction = this._findAnimation('shooting', ['Shoot', 'shoot', 'Fire', 'fire']);
    if (!shootAction) return;
    
    // Make sure the model is visible
    this.group.visible = true;
    
    // Reset the mixer - this stops all current animations
    this.mixer.stopAllAction();
    
    // Configure the shooting animation
    shootAction.loop = THREE.LoopOnce;
    shootAction.clampWhenFinished = true; // Keep it frozen on the last frame
    shootAction.timeScale = 1.2; // Slightly faster for responsiveness
    shootAction.reset();
    shootAction.play();
    
    this.currentAction = shootAction;
    
    // We don't need to transition back to DrawAim anymore
    // We want to stay on the last frame of the shooting animation
  }
  
  /**
   * Play the holster animation
   */
  playHolsterAnim() {
    if (!this.isLoaded || !this.mixer) return;
    
    // Find the holster animation
    const holsterAction = this._findAnimation('Holster', ['holster', 'holstergun', 'holster_gun']);
    if (!holsterAction) return;
    
    // Reset the mixer
    this.mixer.stopAllAction();
    
    // Configure the holster animation
    holsterAction.loop = THREE.LoopOnce;
    holsterAction.clampWhenFinished = false; // Don't freeze at the end
    holsterAction.timeScale = 1;
    holsterAction.reset();
    holsterAction.play();
    
    this.currentAction = holsterAction;
    
    // After holster finishes, go back to idle (for next time)
    const duration = holsterAction._clip.duration;
    setTimeout(() => {
      // Make sure we don't interrupt if another animation started
      if (this.currentAction === holsterAction) {
        this.playIdle();
      }
    }, duration * 1000 + 100); // Add a small buffer
  }
  
  /**
   * Play the idle animation
   */
  playIdle() {
    if (!this.isLoaded || !this.mixer) return;
    
    // Find the idle animation
    const idleAction = this._findAnimation('idle', ['Idle', 'idle_loop', 'IdleLoop']);
    if (!idleAction) return;
    
    // Reset the mixer
    this.mixer.stopAllAction();
    
    // Configure the idle animation
    idleAction.loop = THREE.LoopRepeat;
    idleAction.clampWhenFinished = false;
    idleAction.timeScale = 1;
    idleAction.reset();
    idleAction.play();
    
    this.currentAction = idleAction;
  }
  
  /**
   * Returns true if the current animation is a shooting animation
   * @returns {boolean} True if currently in shooting animation
   */
  isInShootAnimation() {
    return this.currentAction && 
           this.currentAction._clip && 
           ['shoot', 'fire', 'shooting'].some(name => 
             this.currentAction._clip.name.toLowerCase().includes(name));
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