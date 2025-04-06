/**
 * Handles tumbleweeds that spawn around the town and travel across the desert.
 */

/**
 * Represents a single tumbleweed in the world.
 */
export class Tumbleweed {
    constructor(scene, position, direction) {
      this.scene = scene;
      this.position = position || new THREE.Vector3(0, 0, 0);
      this.direction = direction || new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
      
      // Speed variables
      this.baseSpeed = 0.05 + Math.random() * 0.03; // Increased base speed (0.05-0.08)
      this.currentSpeed = this.baseSpeed; // Current speed with variation
      this.targetSpeed = this.currentSpeed; // Target to interpolate toward
      this.minSpeedMultiplier = 0.5; // Increased min speed to 50% of base speed (was 0.4)
      this.maxSpeedMultiplier = 1.8; // Can speed up to 180% of base speed (was 1.5)
      
      // Speed variation timers
      this.speedChangeTimer = 0;
      this.speedChangeInterval = 2 + Math.random() * 3; // Change speed every 2-5 seconds
      
      // Bounce variables
      this.baseHeight = 0.2; // Higher offset from ground (was 0.1)
      this.bounceHeight = 0.5 + Math.random() * 0.8; // Increased bounce height (0.5-1.3)
      this.currentBounceHeight = 0; // For smooth transitions
      this.targetBounceHeight = this.isBouncing ? this.bounceHeight : 0;
      this.bounceFrequency = 0.3 + Math.random() * 0.3; // Faster bounce (0.3-0.6 Hz)
      this.bounceTime = Math.random() * Math.PI * 2; // Random starting phase
      
      // Bounce phase variables
      this.isBouncing = Math.random() < 0.7; // 70% chance to start bouncing (was 50%)
      this.bouncePhaseTimer = 0;
      this.bouncePhaseInterval = 3 + Math.random() * 5; // Change bounce state every 3-8 seconds
      
      // Transition rates for smooth changes
      this.speedTransitionRate = 0.5; // Speed units per second
      this.bounceTransitionRate = 0.2; // Bounce height units per second
      
      this.group = new THREE.Group();
      this.group.position.copy(this.position);
      this.isLoaded = false;
      this.animationMixer = null;
      this.animations = {};
      this.rotationAxis = new THREE.Vector3(0, 1, 0); // Default rotation axis
      this.rotationSpeed = 0.5 + Math.random() * 0.5; // Random rotation speed
      
      // Pre-calculate transform for smoother animation
      this.lastBounceHeight = 0;
  
      // Load the tumbleweed model
      this.loadTumbleweedModel();
      
      // Add to scene
      scene.add(this.group);
      
      // Maximum distance to travel before being removed
      this.maxDistance = 800; // Increased from 500 to let them travel further
      this.distanceTraveled = 0;
    }
  
    /**
     * Loads the tumbleweed model and animations
     */
    loadTumbleweedModel() {
      // Check if we have a preloaded tumbleweed model
      if (window.preloadedModels && (window.preloadedModels.tumbleweed || window.preloadedModels.tumbleweed_clone)) {
        try {
          // Use the clone version to avoid reference issues
          const preloadedModel = window.preloadedModels.tumbleweed_clone || window.preloadedModels.tumbleweed;
          const gltf = {
            scene: preloadedModel.scene.clone(),
            animations: preloadedModel.animations
          };
          
          this.model = gltf.scene;
          
          // Position at origin of group
          this.model.position.set(0, 0, 0);
          
          // Make tumbleweed larger (1.5-2.5x original size)
          const scale = 1.5 + Math.random() * 1.0;
          this.model.scale.set(scale, scale, scale);
          
          // Add the model to the group
          this.group.add(this.model);
          
          // Setup shadows and materials
          this.model.traverse(child => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              
              // Ensure materials are set up correctly
              if (child.material) {
                if (child.isSkinnedMesh) {
                  child.material.skinning = true;
                }
                child.material.needsUpdate = true;
              }
            }
          });
          
          // Set up animations if they exist
          if (gltf.animations && gltf.animations.length > 0) {
            this.setupAnimations(gltf.animations);
          }
          
          this.isLoaded = true;
          return; // Exit early since we've handled the model
        } catch (e) {
          console.error('Error using preloaded tumbleweed model:', e);
          // Fall through to regular loading method if preloaded model fails
        }
      }
      
      // Fallback to regular loading if preloaded model isn't available or fails
      const loader = new THREE.GLTFLoader();
      
      loader.load('models/tumbleweed.glb', 
        // Success callback
        (gltf) => {
          this.model = gltf.scene;
          
          // Position at origin of group
          this.model.position.set(0, 0, 0);
          
          // Make tumbleweed larger (1.5-2.5x original size)
          const scale = 1.5 + Math.random() * 1.0;
          this.model.scale.set(scale, scale, scale);
          
          // Add the model to the group
          this.group.add(this.model);
          
          // Setup shadows and materials
          this.model.traverse(child => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              
              // Ensure materials are set up correctly
              if (child.material) {
                if (child.isSkinnedMesh) {
                  child.material.skinning = true;
                }
                child.material.needsUpdate = true;
              }
            }
          });
          
          // Set up animations if they exist
          if (gltf.animations && gltf.animations.length > 0) {
            this.setupAnimations(gltf.animations);
          }
          
          console.log('Tumbleweed model loaded successfully');
          this.isLoaded = true;
        }, 
        // Progress callback - silent
        undefined,
        // Error callback
        (error) => {
          console.error('Error loading tumbleweed.glb model:', error);
        }
      );
    }
  
    /**
     * Sets up animations from the loaded model
     * @param {Array} animations - The animations from the GLB file
     */
    setupAnimations(animations) {
      if (!animations || animations.length === 0) {
        console.warn('No animations found in tumbleweed model');
        return;
      }
      
      // Create animation mixer
      this.animationMixer = new THREE.AnimationMixer(this.model);
      
      // Store animations and start playing tumble animation
      animations.forEach(animation => {
        this.animations[animation.name] = this.animationMixer.clipAction(animation);
        
        // If this is the tumble animation, play it on loop
        if (animation.name === 'tumble') {
          // Optimize animation for smooth looping
          this.animations[animation.name].setLoop(THREE.LoopRepeat);
          this.animations[animation.name].clampWhenFinished = false;
          
          // Set longer blend time to ensure smoother transitions
          this.animations[animation.name].fadeIn(0.5);
          
          // Eliminate jerking by synchronizing with frame rate
          this.animations[animation.name].zeroSlopeAtEnd = true;
          this.animations[animation.name].zeroSlopeAtStart = true;
          
          this.animations[animation.name].play();
        }
      });
      
      if (!this.animations['tumble']) {
        console.warn('Tumble animation not found in tumbleweed model');
      }
    }
  
    /**
     * Updates the tumbleweed's position and animation
     * @param {number} deltaTime - Time elapsed since last frame
     */
    update(deltaTime) {
      if (!this.isLoaded) return;
      
      // Cap delta time to avoid large jumps
      const cappedDelta = Math.min(deltaTime, 0.1);
      
      // Update speed change timer
      this.speedChangeTimer += cappedDelta;
      if (this.speedChangeTimer >= this.speedChangeInterval) {
        this.speedChangeTimer = 0;
        this.targetSpeed = this.baseSpeed * (this.minSpeedMultiplier + Math.random() * (this.maxSpeedMultiplier - this.minSpeedMultiplier));
        this.speedChangeInterval = 2 + Math.random() * 3; // Vary interval as well
      }
      
      // Update bounce phase timer
      this.bouncePhaseTimer += cappedDelta;
      if (this.bouncePhaseTimer >= this.bouncePhaseInterval) {
        this.bouncePhaseTimer = 0;
        this.isBouncing = Math.random() < 0.7; // 70% chance to bounce
        this.targetBounceHeight = this.isBouncing ? this.bounceHeight : 0;
        this.bouncePhaseInterval = 3 + Math.random() * 5; // Vary interval
      }
      
      // Update animation mixer if it exists
      if (this.animationMixer) {
        this.animationMixer.update(cappedDelta);
      }
      
      // Smoothly transition speed
      const speedDiff = this.targetSpeed - this.currentSpeed;
      if (Math.abs(speedDiff) > 0.0001) {
        const step = Math.min(Math.abs(speedDiff), this.speedTransitionRate * cappedDelta);
        this.currentSpeed += Math.sign(speedDiff) * step;
      }
      
      // Smoothly transition bounce height
      const bounceDiff = this.targetBounceHeight - this.currentBounceHeight;
      if (Math.abs(bounceDiff) > 0.0001) {
        const step = Math.min(Math.abs(bounceDiff), this.bounceTransitionRate * cappedDelta);
        this.currentBounceHeight += Math.sign(bounceDiff) * step;
      }
      
      // Update bounce animation - smoother when not fully bouncing
      this.bounceTime += cappedDelta * this.bounceFrequency * Math.PI * 2;
      
      // Calculate horizontal movement
      const movement = this.direction.clone().multiplyScalar(this.currentSpeed);
      
      // Apply horizontal movement
      this.group.position.x += movement.x;
      this.group.position.z += movement.z;
      
      // Calculate bounce offset without abrupt changes
      const bounceWave = Math.abs(Math.sin(this.bounceTime));
      const smoothBounceOffset = bounceWave * this.currentBounceHeight;
      
      // Store last bounce height before applying new one
      this.lastBounceHeight = smoothBounceOffset;
      
      // Apply vertical position with smoother transitions
      this.group.position.y = this.baseHeight + smoothBounceOffset;
      
      // Update the distance traveled
      this.distanceTraveled += movement.length();
      
      // Face in the direction of travel - smoother orientation
      this.group.lookAt(this.group.position.clone().add(this.direction));
      
      // Return true if the tumbleweed should be removed
      return this.distanceTraveled > this.maxDistance;
    }
  
    /**
     * Removes the tumbleweed from the scene
     */
    remove() {
      this.scene.remove(this.group);
      
      // Clean up resources
      if (this.model) {
        this.model.traverse(child => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(material => material.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      }
    }
  }
  
  /**
   * Manages multiple tumbleweeds in the scene
   */
  export class TumbleweedManager {
    constructor(scene, townDimensions) {
      this.scene = scene;
      this.townDimensions = townDimensions;
      this.tumbleweeds = [];
      this.tumbleweedPool = []; // Pool of inactive tumbleweeds for reuse
      
      // Maximum tumbleweeds on screen at once
      this.maxTumbleweeds = 5;
      
      // Spawn timer variables - ticks up each frame
      this.spawnTimer = 0;
      this.spawnInterval = 12 + Math.random() * 6; // 12-18 second spawn interval
      
      // Initial spawn
      this.initialSpawn();
    }
  
    /**
     * Spawns initial tumbleweeds when the manager is created
     */
    initialSpawn() {
      // Spawn 1-3 tumbleweeds immediately
      const initialCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < initialCount; i++) {
        this.spawnTumbleweed();
      }
      console.log(`Initially spawned ${initialCount} tumbleweeds`);
    }
  
    /**
     * Gets a tumbleweed from the pool or creates a new one
     */
    getTumbleweed(position, direction) {
      let tumbleweed;
      
      // Check if we have any inactive tumbleweeds in the pool
      if (this.tumbleweedPool.length > 0) {
        // Reuse a tumbleweed from the pool
        tumbleweed = this.tumbleweedPool.pop();
        
        // Reset tumbleweed properties
        tumbleweed.position.copy(position);
        tumbleweed.direction.copy(direction);
        tumbleweed.group.position.copy(position);
        tumbleweed.distanceTraveled = 0;
        tumbleweed.currentSpeed = tumbleweed.baseSpeed;
        tumbleweed.targetSpeed = tumbleweed.currentSpeed;
        tumbleweed.currentBounceHeight = 0;
        tumbleweed.targetBounceHeight = tumbleweed.isBouncing ? tumbleweed.bounceHeight : 0;
        
        // Random rotation speed for variety
        tumbleweed.rotationSpeed = 0.5 + Math.random() * 0.5;
        
        // Add back to scene
        this.scene.add(tumbleweed.group);
      } else {
        // Create a new tumbleweed
        tumbleweed = new Tumbleweed(this.scene, position, direction);
      }
      
      return tumbleweed;
    }
  
    /**
     * Spawns a new tumbleweed at a random position around the town
     */
    spawnTumbleweed() {
      if (this.tumbleweeds.length >= this.maxTumbleweeds) return;
      
      // Calculate a random position around the town
      const angle = Math.random() * Math.PI * 2; // Random angle around town
      const townSize = Math.max(this.townDimensions.width, this.townDimensions.length);
      const distance = townSize * (0.8 + Math.random() * 0.5); // Spawn 80-130% of town size away
      
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const y = 0.5; // Slight offset from ground
      
      const position = new THREE.Vector3(x, y, z);
      
      // Direction calculation - heavily favor crossing the town
      let directionAngle;
      
      // 80% chance to use a path that crosses through town
      if (Math.random() < 0.8) {
        // Calculate angle that points through town center
        // This creates a path that goes through or very near the town center
        directionAngle = angle + Math.PI; // Point toward town center
        
        // Add a small random variation (-30° to +30°) to avoid all tumbleweeds 
        // following exactly the same path but still keeping them pointed at town
        directionAngle += (Math.random() - 0.5) * Math.PI / 3;
      } else {
        // 20% chance for more random directions (original behavior)
        const randomAngleOffset = (Math.random() - 0.5) * Math.PI; // +/- 90 degrees
        directionAngle = angle + Math.PI + randomAngleOffset;
      }
      
      const direction = new THREE.Vector3(
        Math.cos(directionAngle),
        0,
        Math.sin(directionAngle)
      ).normalize();
      
      // Get a tumbleweed from the pool or create a new one
      const tumbleweed = this.getTumbleweed(position, direction);
      this.tumbleweeds.push(tumbleweed);
      
      // Reset spawn timer with some randomness
      this.spawnTimer = 0;
    }
  
    /**
     * Recycles a tumbleweed by removing it from the scene and adding to the pool
     * @param {Tumbleweed} tumbleweed - The tumbleweed to recycle
     * @param {number} index - Index in the active tumbleweeds array
     */
    recycleTumbleweed(tumbleweed, index) {
      // Remove from active list
      this.tumbleweeds.splice(index, 1);
      
      // Remove from scene but don't destroy
      this.scene.remove(tumbleweed.group);
      
      // Add to pool for reuse
      this.tumbleweedPool.push(tumbleweed);
    }
  
    /**
     * Updates all tumbleweeds and handles spawning/removal
     * @param {number} deltaTime - Time elapsed since last frame
     */
    update(deltaTime) {
      // Update spawn timer
      this.spawnTimer += deltaTime;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTumbleweed();
      }
      
      // Update all tumbleweeds and recycle those that are too far
      for (let i = this.tumbleweeds.length - 1; i >= 0; i--) {
        const shouldRemove = this.tumbleweeds[i].update(deltaTime);
        
        if (shouldRemove) {
          // Instead of removing completely, recycle it
          this.recycleTumbleweed(this.tumbleweeds[i], i);
        }
      }
    }
    
    /**
     * Cleanup all resources when no longer needed
     */
    dispose() {
      // Properly remove all active tumbleweeds
      for (let i = 0; i < this.tumbleweeds.length; i++) {
        this.tumbleweeds[i].remove();
      }
      
      // Clear active tumbleweeds
      this.tumbleweeds = [];
      
      // Properly remove all pooled tumbleweeds
      for (let i = 0; i < this.tumbleweedPool.length; i++) {
        this.tumbleweedPool[i].remove();
      }
      
      // Clear the pool
      this.tumbleweedPool = [];
    }
  } 