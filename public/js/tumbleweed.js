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
      
      // Initialize properties
      this.initProperties();
      
      // Create group and add to scene
      this.group = new THREE.Group();
      this.group.position.copy(this.position);
      this.isLoaded = false;
      scene.add(this.group);
      
      // Load the model
      this.loadTumbleweedModel();
    }
  
    initProperties() {
      // Speed variables
      this.baseSpeed = 0.05 + Math.random() * 0.03;
      this.currentSpeed = this.baseSpeed;
      this.targetSpeed = this.currentSpeed;
      this.minSpeedMultiplier = 0.5;
      this.maxSpeedMultiplier = 1.8;
      this.speedChangeTimer = 0;
      this.speedChangeInterval = 2 + Math.random() * 3;
      
      // Bounce variables
      this.baseHeight = 0.2;
      this.bounceHeight = 0.5 + Math.random() * 0.8;
      this.currentBounceHeight = 0;
      this.isBouncing = Math.random() < 0.7;
      this.targetBounceHeight = this.isBouncing ? this.bounceHeight : 0;
      this.bounceFrequency = 0.3 + Math.random() * 0.3;
      this.bounceTime = Math.random() * Math.PI * 2;
      this.bouncePhaseTimer = 0;
      this.bouncePhaseInterval = 3 + Math.random() * 5;
      
      // Transition rates
      this.speedTransitionRate = 0.5;
      this.bounceTransitionRate = 0.2;
      
      // Animation properties
      this.animationMixer = null;
      this.animations = {};
      this.rotationAxis = new THREE.Vector3(0, 1, 0);
      this.rotationSpeed = 0.5 + Math.random() * 0.5;
      this.lastBounceHeight = 0;
      
      // Distance properties
      this.maxDistance = 800;
      this.distanceTraveled = 0;
      
      // Collision properties
      this.hitbox = new THREE.Sphere(this.position.clone(), 2.0);
      this.isExploding = false;
      this.explosionStartTime = 0;
      this.explosionDuration = 3.0;
      this.fragmentMeshes = [];
      this.fragmentVelocities = [];
      this.fragmentRotations = [];
      this.fragmentGroundTime = [];
      this.dustParticles = null;
    }
  
    /**
     * Loads the tumbleweed model and animations
     */
    loadTumbleweedModel() {
      // Try to use preloaded model first
      if (window.preloadedModels && (window.preloadedModels.tumbleweed || window.preloadedModels.tumbleweed_clone)) {
        try {
          const preloadedModel = window.preloadedModels.tumbleweed_clone || window.preloadedModels.tumbleweed;
          const gltf = {
            scene: preloadedModel.scene.clone(),
            animations: preloadedModel.animations
          };
          
          this.setupModel(gltf);
          return;
        } catch (e) {
          console.error('Error using preloaded tumbleweed model:', e);
        }
      }
      
      // Fall back to loading model from file
      new THREE.GLTFLoader().load(
        'models/tumbleweed.glb', 
        gltf => this.setupModel(gltf),
        undefined,
        error => console.error('Error loading tumbleweed.glb model:', error)
      );
    }
    
    setupModel(gltf) {
      this.model = gltf.scene;
      this.model.position.set(0, 0, 0);
      
      // Scale model
      const scale = 1.5 + Math.random() * 1.0;
      this.model.scale.set(scale, scale, scale);
      
      this.group.add(this.model);
      
      // Setup materials and shadows
      this.model.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          
          if (child.material) {
            if (child.isSkinnedMesh) child.material.skinning = true;
            child.material.needsUpdate = true;
          }
        }
      });
      
      // Set up animations
      if (gltf.animations && gltf.animations.length > 0) {
        this.setupAnimations(gltf.animations);
      }
      
      this.storeFragmentMeshes();
      this.isLoaded = true;
    }
    
    /**
     * Store references to fragment meshes
     */
    storeFragmentMeshes() {
      this.fragmentMeshes = [];
      
      this.model.traverse(child => {
        if (child.isMesh && child.name && child.name.match(/fragment[1-8]/i)) {
          this.fragmentMeshes.push(child);
          
          // Store original transform data
          child.userData = {
            originalPosition: child.position.clone(),
            originalRotation: child.rotation.clone(),
            originalQuaternion: child.quaternion.clone(),
            originalScale: child.scale.clone(),
            originalVisibility: child.visible
          };
        }
      });
    }
  
    /**
     * Sets up animations from the loaded model
     * @param {Array} animations - The animations from the GLB file
     */
    setupAnimations(animations) {
      if (!animations || animations.length === 0) return;
      
      this.animationMixer = new THREE.AnimationMixer(this.model);
      
      animations.forEach(animation => {
        this.animations[animation.name] = this.animationMixer.clipAction(animation);
        
        if (animation.name === 'tumble') {
          const anim = this.animations[animation.name];
          anim.setLoop(THREE.LoopRepeat);
          anim.clampWhenFinished = false;
          anim.fadeIn(0.5);
          anim.zeroSlopeAtEnd = true;
          anim.zeroSlopeAtStart = true;
          anim.play();
        }
      });
    }
    
    /**
     * Handles collision with a bullet
     * @returns {boolean} True if hit was successful
     */
    hit() {
      if (!this.isLoaded || this.isExploding) return false;
      this.explode();
      return true;
    }
    
    /**
     * Start the explosion/shattering effect
     */
    explode() {
      if (!this.isLoaded || this.isExploding) return;
      
      this.isExploding = true;
      this.explosionStartTime = performance.now() / 1000.0;
      
      if (this.animations['tumble']) {
        this.animations['tumble'].stop();
      }
      
      this.playExplosionSound();
      this.setupFragmentPhysics();
      this.createDustEffect();
    }
    
    playExplosionSound() {
      const soundSources = [
        window.soundManager,
        window.localPlayer?.soundManager
      ];
      
      const soundSource = soundSources.find(s => s);
      if (!soundSource) return;
      
      if (!soundSource.buffers['tumbleweedexplode']) {
        soundSource.loadSound('tumbleweedexplode', 'sounds/tumbleweedexplode.mp3', 'impact');
      }
      
      soundSource.playSound('tumbleweedexplode', 0, 0.8 + Math.random() * 0.4, false);
    }
    
    setupFragmentPhysics() {
      this.fragmentVelocities = [];
      this.fragmentRotations = [];
      this.fragmentGroundTime = [];
      
      for (let i = 0; i < this.fragmentMeshes.length; i++) {
        const angle = Math.random() * Math.PI * 2;
        const upwardBias = 0.3 + Math.random() * 0.5;
        
        const velocity = new THREE.Vector3(
          Math.cos(angle) * (0.15 + Math.random() * 0.25),
          upwardBias,
          Math.sin(angle) * (0.15 + Math.random() * 0.25)
        );
        
        const rotation = new THREE.Vector3(
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5
        );
        
        this.fragmentVelocities.push(velocity);
        this.fragmentRotations.push(rotation);
        this.fragmentGroundTime.push(0);
      }
    }
    
    /**
     * Creates a dust particle effect for the tumbleweed explosion
     */
    createDustEffect() {
      if (window.effects && window.effects.createSmokeEffect) {
        this.dustParticles = window.effects.createSmokeEffect(
          this.group.position.clone(),
          new THREE.Vector3(0, 1, 0),
          this.scene
        );
        return;
      }
      
      // Create custom particle system
      const numParticles = 25;
      const dustGroup = new THREE.Group();
      dustGroup.position.copy(this.group.position);
      this.scene.add(dustGroup);
      
      const particles = [];
      
      for (let i = 0; i < numParticles; i++) {
        const size = 0.08 + Math.random() * 0.25;
        const geometry = i % 5 === 0 ? 
          new THREE.IcosahedronGeometry(size, 1) : 
          new THREE.IcosahedronGeometry(size, 0);
        
        const colorVariation = Math.random();
        const dustColor = new THREE.Color(
          0.6 + colorVariation * 0.2,
          0.5 + colorVariation * 0.2,
          0.4 + colorVariation * 0.15
        );
        
        const material = new THREE.MeshBasicMaterial({
          color: dustColor,
          transparent: true,
          opacity: 0.15 + Math.random() * 0.2,
          depthWrite: false
        });
        
        const particle = new THREE.Mesh(geometry, material);
        
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 0.5;
        const isGroundDust = Math.random() < 0.4;
        
        particle.position.set(
          Math.cos(angle) * radius,
          isGroundDust ? 0.05 + Math.random() * 0.1 : 0.1 + Math.random() * 0.4,
          Math.sin(angle) * radius
        );
        
        particle.rotation.set(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        );
        
        dustGroup.add(particle);
        
        const vel = new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          isGroundDust ? 0.05 + Math.random() * 0.15 : 0.2 + Math.random() * 0.4,
          (Math.random() - 0.5) * 0.5
        );
        
        particles.push({
          mesh: particle,
          velocity: vel,
          rotationSpeed: new THREE.Vector3(
            (Math.random() - 0.5) * 1.5,
            (Math.random() - 0.5) * 1.5,
            (Math.random() - 0.5) * 1.5
          ),
          life: 0,
          maxLife: isGroundDust ? 1.5 + Math.random() * 1.0 : 1.0 + Math.random() * 1.5,
          isGroundDust
        });
      }
      
      this.dustParticles = { dustGroup, particles };
    }
  
    /**
     * Updates the tumbleweed's position and animation
     * @param {number} deltaTime - Time elapsed since last frame
     */
    update(deltaTime) {
      if (!this.isLoaded) return false;
      
      const cappedDelta = Math.min(deltaTime, 0.1);
      this.hitbox.center.copy(this.group.position);
      
      return this.isExploding ? 
        this.updateExploding(cappedDelta) : 
        this.updateNormal(cappedDelta);
    }
    
    updateNormal(deltaTime) {
      // Update speed
      this.updateSpeed(deltaTime);
      
      // Update bounce
      this.updateBounce(deltaTime);
      
      // Update animation
      if (this.animationMixer) {
        this.animationMixer.update(deltaTime);
      }
      
      // Calculate movement
      const movement = this.direction.clone().multiplyScalar(this.currentSpeed);
      
      // Update position
      this.group.position.x += movement.x;
      this.group.position.z += movement.z;
      
      // Calculate bounce offset
      const bounceWave = Math.abs(Math.sin(this.bounceTime));
      const smoothBounceOffset = bounceWave * this.currentBounceHeight;
      this.lastBounceHeight = smoothBounceOffset;
      
      // Apply vertical position
      this.group.position.y = this.baseHeight + smoothBounceOffset;
      
      // Update distance traveled
      this.distanceTraveled += movement.length();
      
      // Update orientation
      this.group.lookAt(this.group.position.clone().add(this.direction));
      
      return this.distanceTraveled > this.maxDistance;
    }
    
    updateSpeed(deltaTime) {
      // Update speed change timer
      this.speedChangeTimer += deltaTime;
      if (this.speedChangeTimer >= this.speedChangeInterval) {
        this.speedChangeTimer = 0;
        this.targetSpeed = this.baseSpeed * (this.minSpeedMultiplier + Math.random() * (this.maxSpeedMultiplier - this.minSpeedMultiplier));
        this.speedChangeInterval = 2 + Math.random() * 3;
      }
      
      // Smooth transition to target speed
      const speedDiff = this.targetSpeed - this.currentSpeed;
      if (Math.abs(speedDiff) > 0.0001) {
        const step = Math.min(Math.abs(speedDiff), this.speedTransitionRate * deltaTime);
        this.currentSpeed += Math.sign(speedDiff) * step;
      }
    }
    
    updateBounce(deltaTime) {
      // Update bounce phase timer
      this.bouncePhaseTimer += deltaTime;
      if (this.bouncePhaseTimer >= this.bouncePhaseInterval) {
        this.bouncePhaseTimer = 0;
        this.isBouncing = Math.random() < 0.7;
        this.targetBounceHeight = this.isBouncing ? this.bounceHeight : 0;
        this.bouncePhaseInterval = 3 + Math.random() * 5;
      }
      
      // Smooth transition to target bounce height
      const bounceDiff = this.targetBounceHeight - this.currentBounceHeight;
      if (Math.abs(bounceDiff) > 0.0001) {
        const step = Math.min(Math.abs(bounceDiff), this.bounceTransitionRate * deltaTime);
        this.currentBounceHeight += Math.sign(bounceDiff) * step;
      }
      
      // Update bounce time
      this.bounceTime += deltaTime * this.bounceFrequency * Math.PI * 2;
    }
    
    updateExploding(deltaTime) {
      const currentTime = performance.now() / 1000.0;
      const explosionTime = currentTime - this.explosionStartTime;
      const explosionProgress = Math.min(explosionTime / this.explosionDuration, 1.0);
      
      // Update fragments
      this.updateFragments(deltaTime);
      
      // Update dust particles
      this.updateDustEffect(deltaTime, explosionProgress);
      
      // Return true when explosion is complete
      return explosionTime > this.explosionDuration;
    }
    
    updateFragments(deltaTime) {
      for (let i = 0; i < this.fragmentMeshes.length; i++) {
        const fragment = this.fragmentMeshes[i];
        const velocity = this.fragmentVelocities[i];
        const rotation = this.fragmentRotations[i];
        
        const isOnGround = fragment.position.y <= 0.05;
        
        if (isOnGround) {
          // Ground logic
          this.fragmentGroundTime[i] += deltaTime;
          fragment.position.y = 0.05;
          
          velocity.y = 0;
          velocity.x *= 0.7;
          velocity.z *= 0.7;
          
          if (this.fragmentGroundTime[i] > 0.2) {
            rotation.set(0, 0, 0);
          } else {
            rotation.x *= 0.7;
            rotation.z *= 0.7;
          }
          
          if (this.fragmentGroundTime[i] > 1.5) {
            const sinkProgress = Math.min((this.fragmentGroundTime[i] - 1.5) / 0.8, 1.0);
            fragment.position.y = 0.05 * (1.0 - sinkProgress);
            
            if (fragment.material && fragment.material.opacity !== undefined) {
              fragment.material.opacity = 1.0 - sinkProgress;
              fragment.material.transparent = true;
            }
          }
        } else {
          // Air logic
          velocity.y -= deltaTime * 0.9;
          
          fragment.position.x += velocity.x * deltaTime * 8;
          fragment.position.y += velocity.y * deltaTime * 8;
          fragment.position.z += velocity.z * deltaTime * 8;
          
          fragment.rotation.x += rotation.x * deltaTime;
          fragment.rotation.y += rotation.y * deltaTime;
          fragment.rotation.z += rotation.z * deltaTime;
          
          velocity.x *= 0.95;
          velocity.z *= 0.95;
          
          this.fragmentGroundTime[i] = 0;
        }
      }
    }
    
    updateDustEffect(deltaTime, explosionProgress) {
      if (!this.dustParticles) return;
      if (!this.dustParticles.particles) return;
      
      let anyAlive = false;
      
      for (const particle of this.dustParticles.particles) {
        particle.life += deltaTime;
        
        if (particle.life >= particle.maxLife) {
          particle.mesh.visible = false;
          continue;
        }
        
        anyAlive = true;
        const lifeProgress = particle.life / particle.maxLife;
        
        if (particle.isGroundDust) {
          this.updateGroundDustParticle(particle, deltaTime, lifeProgress);
        } else {
          this.updateAirborneDustParticle(particle, deltaTime, lifeProgress);
        }
      }
      
      if (!anyAlive && explosionProgress > 0.5) {
        this.cleanupDustEffect();
      }
    }
    
    updateGroundDustParticle(particle, deltaTime, lifeProgress) {
      particle.velocity.y -= deltaTime * 0.1;
      
      if (particle.mesh.position.y < 0.02) {
        particle.mesh.position.y = 0.02;
        particle.velocity.y = Math.max(0, particle.velocity.y);
      }
      
      const groundDampening = 1.0 - lifeProgress * 0.7;
      
      particle.mesh.position.x += particle.velocity.x * deltaTime * groundDampening * 1.5;
      particle.mesh.position.y += particle.velocity.y * deltaTime * groundDampening;
      particle.mesh.position.z += particle.velocity.z * deltaTime * groundDampening * 1.5;
      
      particle.mesh.rotation.x += particle.rotationSpeed.x * deltaTime * 0.5;
      particle.mesh.rotation.y += particle.rotationSpeed.y * deltaTime * 0.5;
      particle.mesh.rotation.z += particle.rotationSpeed.z * deltaTime * 0.5;
      
      const opacityFactor = lifeProgress < 0.6 ? 0.5 : 0.5 - (lifeProgress - 0.6) * 2.5;
      particle.mesh.material.opacity = 0.25 * opacityFactor;
      
      const scale = 1.0 + lifeProgress * 2.5;
      particle.mesh.scale.set(scale, scale * 0.6, scale);
    }
    
    updateAirborneDustParticle(particle, deltaTime, lifeProgress) {
      particle.velocity.y -= deltaTime * 0.2;
      
      const dampening = 1.0 - lifeProgress * 0.5;
      
      particle.mesh.position.x += particle.velocity.x * deltaTime * dampening;
      particle.mesh.position.y += particle.velocity.y * deltaTime * dampening;
      particle.mesh.position.z += particle.velocity.z * deltaTime * dampening;
      
      particle.mesh.rotation.x += particle.rotationSpeed.x * deltaTime * dampening;
      particle.mesh.rotation.y += particle.rotationSpeed.y * deltaTime * dampening;
      particle.mesh.rotation.z += particle.rotationSpeed.z * deltaTime * dampening;
      
      const opacityFactor = Math.pow(1.0 - lifeProgress, 1.5);
      particle.mesh.material.opacity = 0.2 * opacityFactor;
      
      const scale = 1.0 + lifeProgress * 2.0;
      particle.mesh.scale.set(scale, scale, scale);
    }
    
    cleanupDustEffect() {
      if (!this.dustParticles || !this.dustParticles.particles) return;
      
      this.scene.remove(this.dustParticles.dustGroup);
      
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
      
      if (this.dustParticles) {
        this.cleanupDustEffect();
      }
      
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
      this.isExploding = false;
      
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
          
          fragment.visible = fragment.userData.originalVisibility !== undefined ? 
            fragment.userData.originalVisibility : true;
        }
      }
      
      if (this.dustParticles) {
        this.cleanupDustEffect();
      }
      
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
      this.tumbleweedPool = [];
      
      this.maxTumbleweeds = 5;
      this.spawnTimer = 0;
      this.spawnInterval = 5 + Math.random() * 3;
      
      this.preloadExplosionSound();
      this.initialSpawn();
    }
  
    preloadExplosionSound() {
      const tryLoadSound = (soundManager) => {
        if (soundManager) {
          soundManager.loadSound('tumbleweedexplode', 'sounds/tumbleweedexplode.mp3', 'impact');
        }
      };
      
      tryLoadSound(window.soundManager);
      tryLoadSound(window.localPlayer?.soundManager);
      
      // Retry a few times in case sound manager isn't loaded yet
      let retryCount = 0;
      const maxRetries = 5;
      
      const retryLoad = () => {
        if (retryCount >= maxRetries) return;
        
        tryLoadSound(window.soundManager);
        tryLoadSound(window.localPlayer?.soundManager);
        
        if ((window.soundManager?.buffers?.tumbleweedexplode) || 
            (window.localPlayer?.soundManager?.buffers?.tumbleweedexplode)) {
          return;
        }
        
        retryCount++;
        setTimeout(retryLoad, 1000);
      };
      
      setTimeout(retryLoad, 1000);
    }
  
    initialSpawn() {
      const initialCount = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < initialCount; i++) {
        this.spawnTumbleweed();
      }
    }
  
    getTumbleweed(position, direction) {
      let tumbleweed;
      
      if (this.tumbleweedPool.length > 0) {
        tumbleweed = this.tumbleweedPool.pop();
        
        // Reset tumbleweed
        tumbleweed.position.copy(position);
        tumbleweed.direction.copy(direction);
        tumbleweed.group.position.copy(position);
        tumbleweed.distanceTraveled = 0;
        tumbleweed.currentSpeed = tumbleweed.baseSpeed;
        tumbleweed.targetSpeed = tumbleweed.currentSpeed;
        tumbleweed.currentBounceHeight = 0;
        tumbleweed.targetBounceHeight = tumbleweed.isBouncing ? tumbleweed.bounceHeight : 0;
        tumbleweed.rotationSpeed = 0.5 + Math.random() * 0.5;
        
        tumbleweed.reset();
        this.scene.add(tumbleweed.group);
      } else {
        tumbleweed = new Tumbleweed(this.scene, position, direction);
      }
      
      return tumbleweed;
    }
  
    spawnTumbleweed() {
      if (this.tumbleweeds.length >= this.maxTumbleweeds) return;
      
      // Calculate spawn position
      const angle = Math.random() * Math.PI * 2;
      const townSize = Math.max(this.townDimensions.width, this.townDimensions.length);
      const distance = townSize * (0.8 + Math.random() * 0.5);
      
      const position = new THREE.Vector3(
        Math.cos(angle) * distance,
        0.5,
        Math.sin(angle) * distance
      );
      
      // Calculate direction
      let directionAngle;
      
      if (Math.random() < 0.8) {
        // 80% chance to cross through town
        directionAngle = angle + Math.PI + (Math.random() - 0.5) * Math.PI / 3;
      } else {
        // 20% chance for random direction
        directionAngle = angle + Math.PI + (Math.random() - 0.5) * Math.PI;
      }
      
      const direction = new THREE.Vector3(
        Math.cos(directionAngle),
        0,
        Math.sin(directionAngle)
      ).normalize();
      
      // Create and add tumbleweed
      const tumbleweed = this.getTumbleweed(position, direction);
      this.tumbleweeds.push(tumbleweed);
    }
  
    recycleTumbleweed(tumbleweed, index) {
      this.tumbleweeds.splice(index, 1);
      this.scene.remove(tumbleweed.group);
      this.tumbleweedPool.push(tumbleweed);
    }
    
    checkRayIntersection(raycaster) {
      for (let i = 0; i < this.tumbleweeds.length; i++) {
        const tumbleweed = this.tumbleweeds[i];
        
        if (!tumbleweed.isLoaded || tumbleweed.isExploding) continue;
        
        const intersection = raycaster.ray.intersectSphere(tumbleweed.hitbox, new THREE.Vector3());
        
        if (intersection) {
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
  
    update(deltaTime) {
      // Update spawn timer
      this.spawnTimer += deltaTime;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0;
        this.spawnTumbleweed();
        this.spawnInterval = 5 + Math.random() * 3;
      }
      
      // Update all tumbleweeds
      for (let i = this.tumbleweeds.length - 1; i >= 0; i--) {
        const shouldRemove = this.tumbleweeds[i].update(deltaTime);
        
        if (shouldRemove) {
          this.recycleTumbleweed(this.tumbleweeds[i], i);
        }
      }
    }
    
    dispose() {
      // Remove all tumbleweeds
      this.tumbleweeds.forEach(tumbleweed => tumbleweed.remove());
      this.tumbleweeds = [];
      
      // Remove all pooled tumbleweeds
      this.tumbleweedPool.forEach(tumbleweed => tumbleweed.remove());
      this.tumbleweedPool = [];
    }
  } 