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
      
      // Collision/hitbox properties
      this.hitbox = new THREE.Sphere(this.group.position.clone(), 2.0); // Generous hitbox radius
      this.isExploding = false;
      this.explosionStartTime = 0;
      this.explosionDuration = 3.0; // How long explosion lasts (seconds)
      this.fragmentMeshes = [];
      this.fragmentVelocities = [];
      this.fragmentRotations = [];
      this.fragmentGroundTime = []; // How long each fragment has been on ground
      this.dustParticles = null;
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
          
          // Store references to the fragment meshes
          this.storeFragmentMeshes();
          
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
          
          // Store references to the fragment meshes
          this.storeFragmentMeshes();
          
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
     * Store references to fragment meshes
     */
    storeFragmentMeshes() {
      this.fragmentMeshes = [];
      
      // Find all fragment meshes in the model
      this.model.traverse(child => {
        // Check if this is one of our fragment meshes (fragment1-8)
        if (child.isMesh && child.name && child.name.match(/fragment[1-8]/i)) {
          // Add to our array for later reference
          this.fragmentMeshes.push(child);
          
          // Store original position and rotation
          child.userData.originalPosition = child.position.clone();
          child.userData.originalRotation = child.rotation.clone();
          child.userData.originalQuaternion = child.quaternion.clone();
          child.userData.originalScale = child.scale.clone();
          child.userData.originalVisibility = child.visible;
        }
      });
      
      console.log(`Found ${this.fragmentMeshes.length} fragment meshes in tumbleweed model`);
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
     * Handles collision with a bullet
     * @returns {boolean} True if hit was successful
     */
    hit() {
      if (!this.isLoaded || this.isExploding) return false;
      
      // Start explosion effect
      this.explode();
      
      return true;
    }
    
    /**
     * Start the explosion/shattering effect
     */
    explode() {
      if (!this.isLoaded || this.isExploding) return;
      
      this.isExploding = true;
      this.explosionStartTime = performance.now() / 1000.0; // Current time in seconds
      
      // Stop the tumble animation if it exists
      if (this.animations['tumble']) {
        this.animations['tumble'].stop();
      }
      
      // Play explosion sound
      if (window.soundManager) {
        window.soundManager.playSound('tumbleweedexplode', 0, 1.0);
      } else if (window.localPlayer && window.localPlayer.soundManager) {
        // Play sound at tumbleweed position with some randomized pitch
        window.localPlayer.soundManager.playSoundAt(
          'tumbleweedexplode',
          this.group.position,
          0, // No cooldown
          0.8 + Math.random() * 0.4, // Volume between 0.8 and 1.2
          false, // Don't loop
          true // Use spatial audio
        );
      }
      
      // Initialize fragment velocities and rotations
      this.fragmentVelocities = [];
      this.fragmentRotations = [];
      this.fragmentGroundTime = [];
      
      // Set random velocities and rotations for each fragment
      for (let i = 0; i < this.fragmentMeshes.length; i++) {
        // Random direction with slight upward bias
        const angle = Math.random() * Math.PI * 2;
        const upwardBias = 0.3 + Math.random() * 0.5; // 0.3-0.8 upward component
        
        const velocity = new THREE.Vector3(
          Math.cos(angle) * (0.15 + Math.random() * 0.25), // Increased from 0.1-0.3 to 0.15-0.4
          upwardBias, // 0.3-0.8 y (up)
          Math.sin(angle) * (0.15 + Math.random() * 0.25)  // Increased from 0.1-0.3 to 0.15-0.4
        );
        
        // Random rotation speed around each axis
        const rotation = new THREE.Vector3(
          (Math.random() - 0.5) * 5, // Increased from -1.5 to 1.5 rad/s to -2.5 to 2.5
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5
        );
        
        this.fragmentVelocities.push(velocity);
        this.fragmentRotations.push(rotation);
        this.fragmentGroundTime.push(0); // Initialize ground time to 0
      }
      
      // Create dust particle effect
      this.createDustEffect();
    }
    
    /**
     * Creates a dust particle effect for the tumbleweed explosion
     */
    createDustEffect() {
      // Create dust particles if SmokeRingEffect is available
      if (window.effects && window.effects.createSmokeEffect) {
        // Use existing smoke effect with custom parameters
        this.dustParticles = window.effects.createSmokeEffect(
          this.group.position.clone(),
          new THREE.Vector3(0, 1, 0), // Direction upward
          this.scene
        );
      } else {
        // Create our own simple particle system
        const numParticles = 25; // Increased from 12 to 25 for more particles
        const dustGroup = new THREE.Group();
        dustGroup.position.copy(this.group.position);
        this.scene.add(dustGroup);
        
        const particles = [];
        
        // Create dust particles
        for (let i = 0; i < numParticles; i++) {
          // Random size with varied dust particles - larger size range
          const size = 0.08 + Math.random() * 0.25; // Increased from 0.05-0.2 to 0.08-0.33
          
          // Create particle geometry - more detailed for larger particles
          const geometry = i % 5 === 0 ? 
            new THREE.IcosahedronGeometry(size, 1) : // More detailed for some particles
            new THREE.IcosahedronGeometry(size, 0);  // Simple for most particles
          
          // Dust material - sandy brown/grey color with more variation
          const colorVariation = Math.random();
          const dustColor = new THREE.Color(
            0.6 + colorVariation * 0.2, // 0.6-0.8 (more sandish brown)
            0.5 + colorVariation * 0.2, // 0.5-0.7 (more earthy tones)
            0.4 + colorVariation * 0.15  // 0.4-0.55 (more greyish tint)
          );
          
          const material = new THREE.MeshBasicMaterial({
            color: dustColor,
            transparent: true,
            opacity: 0.15 + Math.random() * 0.2, // Reduced from 0.2-0.5 to 0.15-0.35
            depthWrite: false // Ensures particles render correctly
          });
          
          // Create mesh
          const particle = new THREE.Mesh(geometry, material);
          
          // Random initial position - wider distribution
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * 0.5; // Increased from 0.3 to 0.5
          
          // Determine if this is a ground dust particle or airborne
          const isGroundDust = Math.random() < 0.4; // 40% chance for ground dust
          
          particle.position.set(
            Math.cos(angle) * radius,
            isGroundDust ? 0.05 + Math.random() * 0.1 : 0.1 + Math.random() * 0.4, // Ground or airborne
            Math.sin(angle) * radius
          );
          
          // Random rotation
          particle.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
          );
          
          // Add to group
          dustGroup.add(particle);
          
          // Random velocity direction with higher upward bias for airborne particles
          const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 0.5, // Increased outward velocity
            isGroundDust ? 0.05 + Math.random() * 0.15 : 0.2 + Math.random() * 0.4, // Lower for ground dust
            (Math.random() - 0.5) * 0.5
          );
          
          // Store particle data
          particles.push({
            mesh: particle,
            velocity: vel,
            rotationSpeed: new THREE.Vector3(
              (Math.random() - 0.5) * 1.5, // Increased rotation speed
              (Math.random() - 0.5) * 1.5,
              (Math.random() - 0.5) * 1.5
            ),
            life: 0,
            maxLife: isGroundDust ? 
              1.5 + Math.random() * 1.0 : // 1.5-2.5 seconds for ground dust
              1.0 + Math.random() * 1.5,  // 1.0-2.5 seconds for airborne particles
            isGroundDust: isGroundDust
          });
        }
        
        // Store particles for animation
        this.dustParticles = { dustGroup, particles };
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
      
      // Update hitbox position
      this.hitbox.center.copy(this.group.position);
      
      // Handle normal tumbleweed logic when not exploding
      if (!this.isExploding) {
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
      } 
      // Handle explosion/fragment logic
      else {
        // Calculate how far we are through the explosion (0-1)
        const currentTime = performance.now() / 1000.0;
        const explosionTime = currentTime - this.explosionStartTime;
        const explosionProgress = Math.min(explosionTime / this.explosionDuration, 1.0);
        
        // Update each fragment's position and rotation
        for (let i = 0; i < this.fragmentMeshes.length; i++) {
          const fragment = this.fragmentMeshes[i];
          const velocity = this.fragmentVelocities[i];
          const rotation = this.fragmentRotations[i];
          
          // Check if this fragment is on the ground
          const isOnGround = fragment.position.y <= 0.05;
          
          if (isOnGround) {
            // Fragment is on the ground, update ground time
            this.fragmentGroundTime[i] += cappedDelta;
            
            // Ensure fragment stays at ground level
            fragment.position.y = 0.05;
            
            // Stop velocity completely when on ground
            velocity.y = 0;
            
            // Heavy ground drag
            velocity.x *= 0.7; // More drag on ground
            velocity.z *= 0.7;
            
            // Stop rotation after a brief settling period (0.2 seconds)
            if (this.fragmentGroundTime[i] > 0.2) {
              rotation.x = 0;
              rotation.y = 0;
              rotation.z = 0;
            } else {
              // Quickly reduce rotation during settling
              rotation.x *= 0.7;
              rotation.z *= 0.7;
            }
            
            // Sink fragment into ground after it's been there for a while (1.5 seconds)
            if (this.fragmentGroundTime[i] > 1.5) {
              // Calculate sink progress (0 to 1)
              const sinkProgress = Math.min((this.fragmentGroundTime[i] - 1.5) / 0.8, 1.0);
              
              // Sink slowly into the ground
              fragment.position.y = 0.05 * (1.0 - sinkProgress);
              
              // Fade opacity as it sinks (if material has opacity)
              if (fragment.material && fragment.material.opacity !== undefined) {
                fragment.material.opacity = 1.0 - sinkProgress;
                fragment.material.transparent = true;
              }
            }
          } else {
            // Fragment is still in the air
            
            // Apply stronger gravity to velocity for faster falling
            velocity.y -= cappedDelta * 0.9; // Increased from 0.5 to 0.9
            
            // Update position based on velocity with increased speed
            fragment.position.x += velocity.x * cappedDelta * 8; // Increased from 5 to 8
            fragment.position.y += velocity.y * cappedDelta * 8; // Increased from 5 to 8
            fragment.position.z += velocity.z * cappedDelta * 8; // Increased from 5 to 8
            
            // Update rotation based on rotation speed
            fragment.rotation.x += rotation.x * cappedDelta;
            fragment.rotation.y += rotation.y * cappedDelta;
            fragment.rotation.z += rotation.z * cappedDelta;
            
            // Apply more air resistance for x/z but less for y (gravity)
            velocity.x *= 0.95; // Increased drag from 0.98 to 0.95
            velocity.z *= 0.95; // Increased drag from 0.98 to 0.95
            
            // Reset ground time if fragment is in the air
            this.fragmentGroundTime[i] = 0;
          }
        }
        
        // Update dust particle effect
        this.updateDustEffect(cappedDelta, explosionProgress);
      }
      
      // Return true if the tumbleweed should be removed
      return this.isExploding ? 
        (performance.now() / 1000.0 - this.explosionStartTime > this.explosionDuration) : 
        (this.distanceTraveled > this.maxDistance);
    }
    
    /**
     * Updates the dust particle effect
     * @param {number} deltaTime - Time elapsed since last frame
     * @param {number} explosionProgress - Progress of explosion (0-1)
     */
    updateDustEffect(deltaTime, explosionProgress) {
      // Skip if no dust particles
      if (!this.dustParticles) return;
      
      // If we used the effects system's built-in dust, it handles itself
      if (!this.dustParticles.particles) return;
      
      // Update our custom particles
      let anyAlive = false;
      
      for (const particle of this.dustParticles.particles) {
        // Increase particle life
        particle.life += deltaTime;
        
        // Skip if particle has expired
        if (particle.life >= particle.maxLife) {
          particle.mesh.visible = false;
          continue;
        }
        
        anyAlive = true;
        
        // Calculate life progress (0-1)
        const lifeProgress = particle.life / particle.maxLife;
        
        // Different behavior based on ground vs airborne particles
        if (particle.isGroundDust) {
          // Ground dust spreads outward more than upward
          
          // Less gravity for ground dust
          particle.velocity.y -= deltaTime * 0.1;
          
          // Keep ground dust from going below ground
          if (particle.mesh.position.y < 0.02) {
            particle.mesh.position.y = 0.02;
            particle.velocity.y = Math.max(0, particle.velocity.y);
          }
          
          // Ground dust slows down more quickly
          const groundDampening = 1.0 - lifeProgress * 0.7;
          
          particle.mesh.position.x += particle.velocity.x * deltaTime * groundDampening * 1.5; // Faster outward
          particle.mesh.position.y += particle.velocity.y * deltaTime * groundDampening;
          particle.mesh.position.z += particle.velocity.z * deltaTime * groundDampening * 1.5; // Faster outward
          
          // Slower rotation for ground dust
          particle.mesh.rotation.x += particle.rotationSpeed.x * deltaTime * 0.5;
          particle.mesh.rotation.y += particle.rotationSpeed.y * deltaTime * 0.5;
          particle.mesh.rotation.z += particle.rotationSpeed.z * deltaTime * 0.5;
          
          // Ground dust stays more opaque initially then fades - reduced opacity further
          const opacityFactor = lifeProgress < 0.6 ? 0.5 : 0.5 - (lifeProgress - 0.6) * 2.5;
          particle.mesh.material.opacity = 0.25 * opacityFactor; // Reduced from 0.4 to 0.25
          
          // Ground dust grows more
          const scale = 1.0 + lifeProgress * 2.5;
          particle.mesh.scale.set(scale, scale * 0.6, scale); // Flatter on Y-axis
        } else {
          // Airborne dust - similar to original but with refinements
          
          // More gravity for airborne particles
          particle.velocity.y -= deltaTime * 0.2;
          
          // Apply dampening as particles age
          const dampening = 1.0 - lifeProgress * 0.5;
          
          particle.mesh.position.x += particle.velocity.x * deltaTime * dampening;
          particle.mesh.position.y += particle.velocity.y * deltaTime * dampening;
          particle.mesh.position.z += particle.velocity.z * deltaTime * dampening;
          
          // Update rotation
          particle.mesh.rotation.x += particle.rotationSpeed.x * deltaTime * dampening;
          particle.mesh.rotation.y += particle.rotationSpeed.y * deltaTime * dampening;
          particle.mesh.rotation.z += particle.rotationSpeed.z * deltaTime * dampening;
          
          // Fade out as particle ages with exponential falloff - reduced opacity further
          const opacityFactor = Math.pow(1.0 - lifeProgress, 1.5);
          particle.mesh.material.opacity = 0.2 * opacityFactor; // Reduced from 0.35 to 0.2
          
          // Grow slightly as they disperse
          const scale = 1.0 + lifeProgress * 2.0; // More growth
          particle.mesh.scale.set(scale, scale, scale);
        }
      }
      
      // If all particles have expired, clean up
      if (!anyAlive && explosionProgress > 0.5) {
        this.cleanupDustEffect();
      }
    }
    
    /**
     * Cleans up dust particle effect resources
     */
    cleanupDustEffect() {
      if (!this.dustParticles || !this.dustParticles.particles) return;
      
      // Remove particles from scene
      this.scene.remove(this.dustParticles.dustGroup);
      
      // Dispose resources
      for (const particle of this.dustParticles.particles) {
        if (particle.mesh) {
          if (particle.mesh.geometry) particle.mesh.geometry.dispose();
          if (particle.mesh.material) particle.mesh.material.dispose();
        }
      }
      
      this.dustParticles = null;
    }
  
    /**
     * Removes the tumbleweed from the scene
     */
    remove() {
      this.scene.remove(this.group);
      
      // Clean up dust particles if they exist
      if (this.dustParticles) {
        this.cleanupDustEffect();
      }
      
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
    
    /**
     * Resets the tumbleweed for reuse
     */
    reset() {
      // Reset explosion state
      this.isExploding = false;
      
      // Reset fragment positions and rotations
      if (this.fragmentMeshes && this.fragmentMeshes.length > 0) {
        for (const fragment of this.fragmentMeshes) {
          // Restore original transform
          if (fragment.userData.originalPosition) {
            fragment.position.copy(fragment.userData.originalPosition);
          }
          
          if (fragment.userData.originalRotation) {
            fragment.rotation.copy(fragment.userData.originalRotation);
          }
          
          if (fragment.userData.originalQuaternion) {
            fragment.quaternion.copy(fragment.userData.originalQuaternion);
          }
          
          if (fragment.userData.originalScale) {
            fragment.scale.copy(fragment.userData.originalScale);
          }
          
          // Restore visibility
          fragment.visible = fragment.userData.originalVisibility !== undefined ? 
            fragment.userData.originalVisibility : true;
        }
      }
      
      // Clean up dust particles if they exist
      if (this.dustParticles) {
        this.cleanupDustEffect();
      }
      
      // Reset animation if it exists
      if (this.animations['tumble']) {
        this.animations['tumble'].reset();
        this.animations['tumble'].play();
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
      this.spawnInterval = 5 + Math.random() * 3; // Reduced from 12-18 seconds to 5-8 seconds
      
      // Preload the tumbleweed explosion sound
      this.preloadExplosionSound();
      
      // Initial spawn
      this.initialSpawn();
    }
  
    /**
     * Preloads the tumbleweed explosion sound using the correct method
     */
    preloadExplosionSound() {
      // Try different methods of registering the sound
      if (window.soundManager) {
        // If global sound manager exists
        window.soundManager.loadSound('tumbleweedexplode', 'sounds/tumbleweedexplode.mp3', 'impact');
      } else if (window.localPlayer && window.localPlayer.soundManager) {
        // If player sound manager exists
        window.localPlayer.soundManager.loadSound('tumbleweedexplode', 'sounds/tumbleweedexplode.mp3', 'impact');
      }
      
      // In case the sound manager isn't created yet, retry after a short delay
      setTimeout(() => {
        if (window.soundManager) {
          window.soundManager.loadSound('tumbleweedexplode', 'sounds/tumbleweedexplode.mp3', 'impact');
        } else if (window.localPlayer && window.localPlayer.soundManager) {
          window.localPlayer.soundManager.loadSound('tumbleweedexplode', 'sounds/tumbleweedexplode.mp3', 'impact');
        }
      }, 2000);
    }
  
    /**
     * Spawns initial tumbleweeds when the manager is created
     */
    initialSpawn() {
      // Spawn 1-3 tumbleweeds immediately
      const initialCount = 2 + Math.floor(Math.random() * 2); // Changed from 1-3 to 2-3
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
        
        // Reset tumbleweed state (fragments, etc.)
        tumbleweed.reset();
        
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
     * Checks if a ray intersects with any tumbleweed
     * @param {THREE.Raycaster} raycaster - Raycaster to use for intersection
     * @returns {Object} Hit information if it hit a tumbleweed, null otherwise
     */
    checkRayIntersection(raycaster) {
      // Check each tumbleweed for intersection
      for (let i = 0; i < this.tumbleweeds.length; i++) {
        const tumbleweed = this.tumbleweeds[i];
        
        // Skip if not loaded or already exploding
        if (!tumbleweed.isLoaded || tumbleweed.isExploding) continue;
        
        // Check for intersection with the hitbox sphere
        const intersection = raycaster.ray.intersectSphere(tumbleweed.hitbox, new THREE.Vector3());
        
        if (intersection) {
          // Hit the tumbleweed
          tumbleweed.hit();
          
          return {
            tumbleweed,
            point: intersection,
            distance: intersection.distanceTo(raycaster.ray.origin)
          };
        }
      }
      
      return null;
    }
  
    /**
     * Updates all tumbleweeds and handles spawning/removal
     * @param {number} deltaTime - Time elapsed since last frame
     */
    update(deltaTime) {
      // Update spawn timer
      this.spawnTimer += deltaTime;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0;
        this.spawnTumbleweed();
        // Set next spawn interval with reduced time
        this.spawnInterval = 5 + Math.random() * 3; // Reduced from 12-18 to 5-8 seconds
      }
      
      // Update all tumbleweeds and recycle those that are too far or exploded
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