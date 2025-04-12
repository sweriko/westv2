// Import the SmokeRingEffect class 
import { SmokeRingEffect } from './smokeRingEffect.js';

/**
 * Recursively disposes geometry and material for the given object.
 * @param {THREE.Object3D} object - The object to dispose.
 */
function disposeHierarchy(object) {
  object.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(mat => mat.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}

/**
 * Helper for spring interpolation used in recoil recovery.
 * @param {number} start - The starting value.
 * @param {number} end - The target value.
 * @param {number} t - Normalized time.
 * @param {number} damping - Damping coefficient.
 * @param {number} frequency - Oscillation frequency.
 * @returns {number} - The interpolated value.
 */
function springInterpolation(start, end, t, damping, frequency) {
  const decay = Math.exp(-damping * t);
  return end + (start - end) * decay * (1 + (damping / frequency) * Math.sin(frequency * t));
}

/**
 * Creates a muzzle flash effect at the given position with the specified direction
 * @param {THREE.Vector3} position - Starting position of the muzzle flash
 * @param {THREE.Vector3} direction - Direction the flash should face
 * @param {THREE.Scene} scene - The scene to add the effect to
 * @param {Object} options - Optional configuration for the effect
 * @param {boolean} isPreloading - Whether this is being created for preloading
 * @returns {Object} The created flash group and meshes for preloading
 */
export function createMuzzleFlash(position, direction, scene, options = null, isPreloading = false) {
  // Skip on mobile devices
  if (window.isMobile && !isPreloading) {
    return;
  }
  
  // Create flash group
  const flashGroup = new THREE.Group();
  flashGroup.position.copy(position);
  
  // Make the flash face the direction of fire
  flashGroup.lookAt(position.clone().add(direction));
  
  // Add to scene
  scene.add(flashGroup);
  
  // Configure flash based on options
  const flashSize = (options && options.size) || 0.2;
  const flashColor = (options && options.color) || 0xFFF7D6;
  const flashDuration = (options && options.duration) || 0.05;
  
  // Create core flash - using MeshBasicMaterial without emissive properties
  const flashGeometry = new THREE.IcosahedronGeometry(flashSize, 1);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: flashColor,
    transparent: true,
    opacity: 0.9
  });
  const flash = new THREE.Mesh(flashGeometry, flashMaterial);
  
  // Position the flash slightly in front
  flash.position.z = 0.1;
  
  // Add some random rotation
  flash.rotation.x = Math.random() * Math.PI;
  flash.rotation.y = Math.random() * Math.PI;
  flash.rotation.z = Math.random() * Math.PI;
  
  // Add flash to group
  flashGroup.add(flash);
  
  // Add a glow for better visibility - using MeshBasicMaterial without emissive properties
  const glowGeometry = new THREE.IcosahedronGeometry(flashSize * 1.5, 0);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: flashColor,
    transparent: true,
    opacity: 0.5
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  
  // Position the glow slightly in front and larger
  glow.position.z = 0.05;
  glow.scale.set(1.5, 1.5, 0.5);
  
  // Add glow to group
  flashGroup.add(glow);
  
  // Create animation tracking variables
  const startTime = performance.now();
  const endTime = startTime + flashDuration * 1000;
  
  // Store references needed for the animation
  // This closure makes everything accessible to the animateFlash function
  const animation = { startTime, endTime, flash, glow, flashGroup };
  
  // Function to animate the flash
  function animateFlash(timestamp) {
    // Calculate how far through the animation we are (0 to 1)
    const elapsed = timestamp - animation.startTime;
    const duration = animation.endTime - animation.startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // If animation complete, remove from scene
    if (progress >= 1) {
      if (!isPreloading) {
        scene.remove(animation.flashGroup);
        animation.flash.geometry.dispose();
        animation.flash.material.dispose();
        animation.glow.geometry.dispose();
        animation.glow.material.dispose();
      }
      return false;
    }
    
    // Create a decay curve - quick fade out
    // Use quadratic easing for more visual pop at the start
    const opacityFactor = 1 - (progress * progress);
    
    // Update materials
    animation.flash.material.opacity = 0.9 * opacityFactor;
    animation.glow.material.opacity = 0.5 * opacityFactor;
    
    // Scale down as it fades
    const scaleFactor = 1 - progress * 0.3;
    animation.flashGroup.scale.set(scaleFactor, scaleFactor, 1);
    
    // Continue animation
    if (!isPreloading) {
      requestAnimationFrame(animateFlash);
    }
    return true;
  }
  
  // Start animation loop if not preloading (preloading will call this manually)
  if (!isPreloading) {
    requestAnimationFrame(animateFlash);
  }
  
  // Return objects needed for preloading
  return { flashGroup, flash, glow, animateFlash };
}

/**
 * Creates a smoke effect at the given position with the specified direction
 * @param {THREE.Vector3} position - Starting position of the smoke
 * @param {THREE.Vector3} direction - Direction the smoke should face
 * @param {THREE.Scene} scene - The scene to add the effect to
 * @param {boolean} isPreloading - Whether this is being created for preloading
 * @returns {Object} The created smoke group and particles for preloading
 */
export function createSmokeEffect(position, direction, scene, isPreloading = false) {
  // Create a group for the smoke particles
  const smokeGroup = new THREE.Group();
  smokeGroup.position.copy(position);
  
  // Orient the smoke in the direction of fire
  smokeGroup.lookAt(position.clone().add(direction));
  
  // Add to scene
  scene.add(smokeGroup);
  
  // Generate a random number of particles
  const numParticles = Math.floor(5 + Math.random() * 3);
  const particles = [];
  
  // Create individual smoke particles
  for (let i = 0; i < numParticles; i++) {
    // Random size for each particle
    const size = 0.01 + Math.random() * 0.02;
    
    // Create geometry
    const particleGeometry = new THREE.IcosahedronGeometry(size, 0);
    
    // Smoke material - semi-transparent gray
    const particleMaterial = new THREE.MeshBasicMaterial({
      color: 0xCCCCCC,
      transparent: true,
      opacity: 0.3 + Math.random() * 0.4
    });
    
    // Create mesh
    const particle = new THREE.Mesh(particleGeometry, particleMaterial);
    
    // Random initial position with slight offset from center
    const offset = 0.03;
    particle.position.set(
      (Math.random() - 0.5) * offset,
      (Math.random() - 0.5) * offset,
      (Math.random() - 0.5) * offset
    );
    
    // Random rotation
    particle.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );
    
    // Add to group
    smokeGroup.add(particle);
    
    // Generate velocity for this particle
    // Base direction is the fire direction but with added spread
    const spread = 0.3;
    const vel = direction.clone().normalize();
    
    // Add some randomization to velocity
    vel.x += (Math.random() - 0.5) * spread;
    vel.y += (Math.random() - 0.5) * spread;
    vel.z += (Math.random() - 0.5) * spread;
    
    // Scale velocity by a random factor
    vel.multiplyScalar(0.3 + Math.random() * 0.5);
    
    // Store particle properties
    particles.push({
      mesh: particle,
      velocity: vel,
      life: 0,
      maxLife: 0.5 + Math.random() * 0.5
    });
  }
  
  // Animation variables
  const startTime = performance.now();
  const state = { particles, startTime, lastTime: startTime };
  
  // Function to animate the smoke particles
  function animateSmoke(timestamp) {
    // Calculate time delta
    const dt = (timestamp - state.lastTime) / 1000; // in seconds
    state.lastTime = timestamp;
    
    // Track if any particles are still alive
    let anyAlive = false;
    
    // Update each particle
    for (const particle of state.particles) {
      // Increase particle life
      particle.life += dt;
      
      // Check if particle is still alive
      if (particle.life < particle.maxLife) {
        anyAlive = true;
        
        // Calculate remaining life as a percentage
        const lifePercent = particle.life / particle.maxLife;
        
        // Move particle based on its velocity
        particle.mesh.position.x += particle.velocity.x * dt;
        particle.mesh.position.y += particle.velocity.y * dt;
        particle.mesh.position.z += particle.velocity.z * dt;
        
        // Slow down over time - apply drag
        particle.velocity.multiplyScalar(0.98);
        
        // Fade out as it ages
        particle.mesh.material.opacity = 0.5 * (1 - lifePercent);
        
        // Grow slightly larger
        const scale = 1 + lifePercent * 2;
        particle.mesh.scale.set(scale, scale, scale);
        
        // Rotate slowly for some movement
        particle.mesh.rotation.x += dt * 0.2;
        particle.mesh.rotation.y += dt * 0.1;
      } else {
        // Particle has expired, make it invisible
        particle.mesh.visible = false;
      }
    }
    
    // If all particles are dead and not preloading, remove the effect
    if (!anyAlive && !isPreloading) {
      // Clean up
      particles.forEach(p => {
        smokeGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      });
      scene.remove(smokeGroup);
      return false;
    }
    
    // Continue animation if needed
    if (!isPreloading) {
      requestAnimationFrame(animateSmoke);
    }
    return true;
  }
  
  // Start animation loop if not preloading (preloading will call this manually)
  if (!isPreloading) {
    requestAnimationFrame(animateSmoke);
  }
  
  // Return objects needed for preloading
  return { smokeGroup, particles, animateSmoke };
}

// Create global blood effect resources for reuse across all impacts
const BLOOD_POOL = {
  geometries: [],
  materials: [],
  particles: []
};

/**
 * Creates an impact effect when a bullet hits a target.
 * Generates realistic blood particles with varied splatter patterns and curved trajectories.
 * Optimized with object pooling and selective calculations.
 *
 * @param {THREE.Vector3} position - Impact position.
 * @param {THREE.Vector3} direction - Impact (bullet) direction.
 * @param {THREE.Scene} scene - The scene to add the effect.
 * @param {string} hitType - Type of impact: 'player', 'npc', or 'ground'.
 */
export function createImpactEffect(position, direction, scene, hitType) {
  // Skip ground impact effects completely
  if (hitType === 'ground') {
    return;
  }

  const effectGroup = new THREE.Group();
  effectGroup.position.copy(position);
  scene.add(effectGroup);
  
  // Play impact sound based on hit type using positional audio
  if (window.localPlayer && window.localPlayer.soundManager) {
    if (hitType === 'player' || hitType === 'npc') {
      // Calculate distance to local player to avoid playing impact on own body
      const localPlayerPos = window.localPlayer.group.position;
      const distToLocalPlayer = Math.sqrt(
        Math.pow(position.x - localPlayerPos.x, 2) + 
        Math.pow(position.z - localPlayerPos.z, 2)
      );
      
      // Only play flesh impact if not too close to local player
      if (distToLocalPlayer > 0.5) {
        window.localPlayer.soundManager.playSoundAt("fleshimpact", position);
      }
    }
  }

  // Blood effect settings
  const particleCount = 22; // Balance between visual quality and performance
  const particles = [];
  
  // More varied blood colors for visual interest
  const bloodColors = [
    0xCC0000, // Standard red
    0xAA0000, // Darker red
    0x880000, // Very dark red
    0xFF0000, // Bright red
    0xDD0000  // Medium red
  ];
  
  // Precomputed direction vector 
  const negatedDir = direction.clone().negate();
  
  // Create initial blood burst (center of impact)
  const burstSize = 0.04;
  const burstMaterial = new THREE.MeshBasicMaterial({
    color: 0xAA0000,
    transparent: true,
    opacity: 0.9,
    depthWrite: false
  });
  
  let burstGeom;
  if (BLOOD_POOL.geometries.length > 0) {
    burstGeom = BLOOD_POOL.geometries.pop();
  } else {
    burstGeom = new THREE.SphereGeometry(burstSize, 4, 3);
  }
  
  const burst = new THREE.Mesh(burstGeom, burstMaterial);
  effectGroup.add(burst);
  
  // Create impact direction-aligned disc for initial spray pattern
  const spraySize = 0.06;
  const sprayMaterial = new THREE.MeshBasicMaterial({
    color: 0x990000,
    transparent: true,
    opacity: 0.8,
    depthWrite: false
  });
  
  const sprayGeom = new THREE.CircleGeometry(spraySize, 8);
  const spray = new THREE.Mesh(sprayGeom, sprayMaterial);
  
  // Position spray slightly in front of impact point
  spray.position.copy(negatedDir.clone().multiplyScalar(0.01));
  
  // Orient spray to face away from impact direction
  spray.lookAt(spray.position.clone().add(negatedDir));
  
  effectGroup.add(spray);
  
  // Add burst and spray to particles for animation
  particles.push({
    mesh: burst,
    type: 'burst',
    velocity: new THREE.Vector3(0, 0, 0),
    life: 8,
    gravity: new THREE.Vector3(0, 0, 0)
  });
  
  particles.push({
    mesh: spray,
    type: 'spray',
    velocity: new THREE.Vector3(0, 0, 0),
    life: 12,
    gravity: new THREE.Vector3(0, 0, 0)
  });
  
  // Create blood droplets with varied patterns
  for (let i = 0; i < particleCount; i++) {
    // Get or create particle
    let particle, isNewParticle = false;
    let particleType = '';
    
    // Determine particle type (affects behavior)
    const randValue = Math.random();
    if (randValue < 0.6) {
      particleType = 'droplet'; // Small fast droplets
    } else if (randValue < 0.9) {
      particleType = 'medium'; // Medium sized drops
    } else {
      particleType = 'chunk'; // Large slow chunks
    }
    
    // Try to get a particle from the pool
    if (BLOOD_POOL.particles.length > 0) {
      particle = BLOOD_POOL.particles.pop();
      // Reset particle properties
      particle.visible = true;
      particle.scale.set(1, 1, 1);
      
      // Update material color
      const colorIndex = Math.floor(Math.random() * bloodColors.length);
      particle.material.color.setHex(bloodColors[colorIndex]);
      particle.material.opacity = 0.9;
    } else {
      // Create new particle if none in pool
      isNewParticle = true;
      
      // Size based on particle type
      let size;
      if (particleType === 'droplet') {
        size = 0.01 + Math.random() * 0.015;
      } else if (particleType === 'medium') {
        size = 0.02 + Math.random() * 0.02;
      } else {
        size = 0.025 + Math.random() * 0.025;
      }
      
      // Create geometry - varied for different particle types
      let geometry;
      if (BLOOD_POOL.geometries.length > 0) {
        geometry = BLOOD_POOL.geometries.pop();
      } else {
        if (particleType === 'chunk') {
          // Use icosahedron for chunks (more irregular shape)
          geometry = new THREE.IcosahedronGeometry(size, 0);
        } else {
          // Use sphere for droplets (smaller faces for better performance)
          geometry = new THREE.SphereGeometry(size, 3, 2);
        }
      }
      
      // Create material with varied color
      const colorIndex = Math.floor(Math.random() * bloodColors.length);
      const material = new THREE.MeshBasicMaterial({
        color: bloodColors[colorIndex],
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      });
      
      // Create the particle
      particle = new THREE.Mesh(geometry, material);
    }
    
    // Add particle to group
    effectGroup.add(particle);
    
    // Initial position offset for more natural spray formation
    // Offset more along the impact direction
    const dirComponent = 0.015 * Math.random(); 
    const radialComponent = 0.01;
    
    // Create a position that favors the impact direction
    particle.position.copy(negatedDir.clone().multiplyScalar(dirComponent));
    
    // Add randomness to position
    particle.position.x += (Math.random() - 0.5) * radialComponent;
    particle.position.y += (Math.random() - 0.5) * radialComponent;
    particle.position.z += (Math.random() - 0.5) * radialComponent;
    
    // Random rotation
    if (isNewParticle) {
      particle.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
    }
    
    // Create velocity vector based on particle type and impact direction
    const velocity = new THREE.Vector3();
    velocity.copy(negatedDir);
    
    // Speed varies by particle type
    let speed;
    let speedRandomness;
    
    if (particleType === 'droplet') {
      // Droplets move fastest with most randomness
      speed = 0.1;
      speedRandomness = 0.15;
    } else if (particleType === 'medium') {
      // Medium particles have moderate speed
      speed = 0.08;
      speedRandomness = 0.12;
    } else {
      // Chunks are slowest
      speed = 0.06;
      speedRandomness = 0.1;
    }
    
    // Apply speed
    const finalSpeed = speed + Math.random() * speedRandomness;
    velocity.multiplyScalar(finalSpeed);
    
    // Create spread pattern based on particle type
    const spread = particleType === 'droplet' ? 0.1 : 0.07;
    
    // Create a cone-shaped pattern mostly in the impact direction
    // but allow some particles to go more perpendicular for better spray effect
    const angleMultiplier = Math.random() < 0.3 ? 1.5 : 0.7;
    velocity.x += (Math.random() - 0.5) * spread * angleMultiplier;
    velocity.y += (Math.random() - 0.5) * spread * angleMultiplier;
    velocity.z += (Math.random() - 0.5) * spread * angleMultiplier;
    
    // Add some upward bias for more pleasing arcs
    if (Math.random() < 0.4) {
      velocity.y += 0.04 * Math.random();
    }
    
    // Different gravity strength based on particle type
    // Smaller particles affected more by air resistance
    let gravityStrength;
    if (particleType === 'droplet') {
      gravityStrength = 0.0035;
    } else if (particleType === 'medium') {
      gravityStrength = 0.0025;
    } else {
      gravityStrength = 0.002;
    }
    
    // Gravity vector always points down
    const gravity = new THREE.Vector3(0, -gravityStrength, 0);
    
    // Lifetimes vary by type
    let lifetime;
    if (particleType === 'droplet') {
      lifetime = 15 + Math.floor(Math.random() * 15);
    } else if (particleType === 'medium') {
      lifetime = 20 + Math.floor(Math.random() * 15);
    } else {
      lifetime = 25 + Math.floor(Math.random() * 15);
    }
    
    // Store particle info for animation
    particles.push({
      mesh: particle,
      velocity: velocity,
      gravity: gravity,
      life: lifetime,
      type: particleType,
      initialLife: lifetime,
      stretchAxis: new THREE.Vector3(),
      // Save initial position for trail calculation
      lastPos: particle.position.clone()
    });
  }

  // Duration in ms - allow more time for gravity arcs
  const duration = 600;
  const startTime = performance.now();
  let lastTime = startTime;

  // Function to animate the blood particles
  function animateEffect(currentTime) {
    // Time delta calculation
    const deltaTime = Math.min(currentTime - lastTime, 20) / 1000;
    lastTime = currentTime;
    
    const elapsed = currentTime - startTime;
    
    // Animation update
    let anyAlive = false;
    
    // Reduced physics frequency - helps performance 
    const dt = deltaTime * 60;
    
    // Update each particle in a single loop pass
    for (const particle of particles) {
      if (particle.life > 0) {
        anyAlive = true;
        
        // Different animation based on particle type
        if (particle.type === 'burst') {
          // Initial burst expands quickly then fades
          const lifeRatio = particle.life / 8;
          const scale = 1 + (1 - lifeRatio) * 3; 
          particle.mesh.scale.set(scale, scale, scale);
          particle.mesh.material.opacity = lifeRatio * 0.8;
        } 
        else if (particle.type === 'spray') {
          // Spray expands and fades
          const lifeRatio = particle.life / 12;
          const scale = 1 + (1 - lifeRatio) * 2;
          particle.mesh.scale.set(scale, scale, 1);
          particle.mesh.material.opacity = lifeRatio * 0.7;
        }
        else {
          // Save previous position for proper stretching
          particle.lastPos.copy(particle.mesh.position);
          
          // Apply gravity to velocity
          particle.velocity.add(particle.gravity);
          
          // Move particle based on velocity
          particle.mesh.position.x += particle.velocity.x;
          particle.mesh.position.y += particle.velocity.y;
          particle.mesh.position.z += particle.velocity.z;
          
          // Apply stretching in direction of movement
          // Only if moving fast enough
          const speedSq = particle.velocity.lengthSq();
          
          if (speedSq > 0.0005) {
            // Calculate movement vector
            particle.stretchAxis.subVectors(particle.mesh.position, particle.lastPos).normalize();
            
            // Different stretch factors based on type
            let stretchAmount;
            if (particle.type === 'droplet') {
              stretchAmount = 1 + speedSq * 35;
              // Extra stretch for small fast particles
              if (speedSq > 0.001) {
                stretchAmount *= 1.3;
              }
            } else if (particle.type === 'medium') {
              stretchAmount = 1 + speedSq * 25;
            } else {
              stretchAmount = 1 + speedSq * 15;
            }
            
            // Find dominant axis for optimized stretching
            const absX = Math.abs(particle.stretchAxis.x);
            const absY = Math.abs(particle.stretchAxis.y);
            const absZ = Math.abs(particle.stretchAxis.z);
            
            // Apply stretch primarily along dominant axis
            if (absX > absY && absX > absZ) {
              particle.mesh.scale.set(stretchAmount, 1, 1);
            } else if (absY > absX && absY > absZ) {
              particle.mesh.scale.set(1, stretchAmount, 1);
            } else {
              particle.mesh.scale.set(1, 1, stretchAmount);
            }
          }
          
          // Apply drag based on particle type
          let drag;
          if (particle.type === 'droplet') {
            drag = 0.97; // Less drag for small particles
          } else if (particle.type === 'medium') {
            drag = 0.96;
          } else {
            drag = 0.95; // More drag for larger chunks
          }
          
          particle.velocity.multiplyScalar(drag);
          
          // Fade out as particles get older
          const lifeRatio = particle.life / particle.initialLife;
          
          // Different fade behavior based on type
          if (particle.type === 'droplet' && lifeRatio < 0.5) {
            // Droplets fade faster
            particle.mesh.material.opacity = lifeRatio * 2 * 0.9;
          } else if (lifeRatio < 0.3) {
            // All particles fade in final phase
            particle.mesh.material.opacity = lifeRatio / 0.3 * 0.9;
          }
        }
        
        // Decrement life
        particle.life--;
      } else if (particle.mesh.visible) {
        // Hide expired particles
        particle.mesh.visible = false;
        
        // Return to pool for reuse
        if (particle.type !== 'burst' && particle.type !== 'spray' && 
            BLOOD_POOL.particles.length < 50) {
          BLOOD_POOL.particles.push(particle.mesh);
          effectGroup.remove(particle.mesh);
        }
      }
    }
    
    // Continue animation if any particles are alive and within duration
    if (anyAlive && elapsed < duration) {
      requestAnimationFrame(animateEffect);
    } else {
      // Clean up
      for (const particle of particles) {
        if (particle.type === 'burst' || particle.type === 'spray') {
          // Clean up spray and burst
          if (particle.mesh.geometry) {
            if (BLOOD_POOL.geometries.length < 10) {
              BLOOD_POOL.geometries.push(particle.mesh.geometry);
            } else {
              particle.mesh.geometry.dispose();
            }
          }
          if (particle.mesh.material) {
            particle.mesh.material.dispose();
          }
        } 
        else if (!BLOOD_POOL.particles.includes(particle.mesh)) {
          // Pool materials and geometries from other particles
          if (BLOOD_POOL.materials.length < 20 && particle.mesh.material) {
            BLOOD_POOL.materials.push(particle.mesh.material);
          } else if (particle.mesh.material) {
            particle.mesh.material.dispose();
          }
          
          if (BLOOD_POOL.geometries.length < 10 && particle.mesh.geometry) {
            BLOOD_POOL.geometries.push(particle.mesh.geometry);
          } else if (particle.mesh.geometry) {
            particle.mesh.geometry.dispose();
          }
        }
      }
      
      // Remove effect group
      scene.remove(effectGroup);
    }
  }
  
  // Start animation
  requestAnimationFrame(animateEffect);
}

/**
 * Apply recoil effect to the player's camera.
 * @param {Player} player - The player instance.
 * @param {number} multiplier - Recoil strength multiplier (default: 1.0).
 */
export function applyRecoil(player, multiplier = 1.0) {
  const originalAimOffset = player.aimOffset.clone();
  const originalFOV = player.camera.fov;
  const originalCameraPos = player.camera.position.clone();
  const originalRotation = player.camera.rotation.clone();

  // Initial recoil changes.
  player.camera.rotation.x -= 0.08 * multiplier;
  player.camera.rotation.z += 0.01 * multiplier;
  player.aimOffset.z += 0.4 * multiplier;
  player.aimOffset.y += 0.15 * multiplier;
  player.aimOffset.x += 0.05 * multiplier;
  player.camera.fov -= 5 * multiplier;
  player.camera.updateProjectionMatrix();

  const recoilSteps = [
    { time: 20, cameraX: -0.04, cameraZ: 0.005, offsetZ: 0.2, offsetY: 0.08, offsetX: 0.03 },
    { time: 40, cameraX: -0.06, cameraZ: 0.008, offsetZ: 0.3, offsetY: 0.12, offsetX: 0.04 },
    { time: 60, cameraX: -0.03, cameraZ: 0.006, offsetZ: 0.25, offsetY: 0.1, offsetX: 0.02 },
    { time: 80, cameraX: -0.02, cameraZ: 0.004, offsetZ: 0.18, offsetY: 0.07, offsetX: 0.01 },
    { time: 100, cameraX: -0.01, cameraZ: 0.002, offsetZ: 0.1, offsetY: 0.05, offsetX: 0.005 }
  ];

  recoilSteps.forEach(step => {
    setTimeout(() => {
      player.camera.rotation.x = originalRotation.x + step.cameraX * multiplier;
      player.camera.rotation.z = originalRotation.z + step.cameraZ * multiplier;
      player.aimOffset.z = originalAimOffset.z + step.offsetZ * multiplier;
      player.aimOffset.y = originalAimOffset.y + step.offsetY * multiplier;
      player.aimOffset.x = originalAimOffset.x + step.offsetX * multiplier;
    }, step.time);
  });

  let shakeIntensity = 0.03 * multiplier;
  const shakeDecay = 0.9;
  const shakeInterval = setInterval(() => {
    if (shakeIntensity > 0.002) {
      player.camera.position.x = originalCameraPos.x + (Math.random() - 0.5) * shakeIntensity;
      player.camera.position.y = originalCameraPos.y + (Math.random() - 0.5) * shakeIntensity;
      shakeIntensity *= shakeDecay;
    } else {
      clearInterval(shakeInterval);
      player.camera.position.copy(originalCameraPos);
    }
  }, 16);

  let progress = 0;
  const duration = 400;
  const startTime = performance.now();

  function recoverFromRecoil(timestamp) {
    progress = (timestamp - startTime) / duration;
    if (progress < 1) {
      const t = progress * 4;
      player.camera.rotation.x = springInterpolation(
        player.camera.rotation.x,
        originalRotation.x,
        t,
        0.4,
        8
      );
      player.camera.rotation.z = springInterpolation(
        player.camera.rotation.z,
        originalRotation.z,
        t,
        0.4,
        8
      );
      player.aimOffset.x = springInterpolation(
        player.aimOffset.x,
        originalAimOffset.x,
        t,
        0.4,
        8
      );
      player.aimOffset.y = springInterpolation(
        player.aimOffset.y,
        originalAimOffset.y,
        t,
        0.4,
        8
      );
      player.aimOffset.z = springInterpolation(
        player.aimOffset.z,
        originalAimOffset.z,
        t,
        0.4,
        8
      );
      player.camera.fov = THREE.MathUtils.lerp(
        player.camera.fov,
        originalFOV,
        progress * 0.3
      );
      player.camera.updateProjectionMatrix();
      requestAnimationFrame(recoverFromRecoil);
    } else {
      player.camera.rotation.copy(originalRotation);
      player.aimOffset.copy(originalAimOffset);
      player.camera.fov = originalFOV;
      player.camera.updateProjectionMatrix();
      player.camera.position.copy(originalCameraPos);
    }
  }
  requestAnimationFrame(recoverFromRecoil);
}

/**
 * Preloads the smoke effect by creating a disposable instance
 * This forces Three.js to compile shaders and cache necessary resources
 * @param {THREE.Scene} scene - The scene where the preloaded effect will be created
 */
export function preloadSmokeEffect(scene) {
  // Create a dummy position far below the scene where it won't be visible
  const dummyPosition = new THREE.Vector3(0, -1000, 0);
  const dummyDirection = new THREE.Vector3(0, 1, 0);
  
  // Create a fully realized smoke effect to warm up all rendering pathways
  // This will ensure the first visible effect doesn't cause frame drops
  const smokeEffect = createSmokeEffect(dummyPosition, dummyDirection, scene, true);
  
  // Force a few animation frames to ensure shaders are compiled
  const fakeTimestamps = [0, 16, 32, 48, 64, 80, 96];
  let frameIndex = 0;
  
  function simulateFrames() {
    if (frameIndex < fakeTimestamps.length) {
      // Manually advance the animation
      smokeEffect.animateSmoke(performance.now() + fakeTimestamps[frameIndex]);
      frameIndex++;
      setTimeout(simulateFrames, 0); // Use setTimeout to avoid blocking the main thread
    } else {
      // Clean up after simulation is complete
      setTimeout(() => {
        scene.remove(smokeEffect.smokeGroup);
        smokeEffect.particles.forEach(p => {
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
        });
      }, 100);
    }
  }
  
  // Start simulating frames immediately
  simulateFrames();
}

/**
 * Preloads the muzzle flash effect by creating a full instance and running its animation
 * @param {THREE.Scene} scene - The scene to add the preloaded effect
 */
export function preloadMuzzleFlash(scene) {
  // Create a dummy position far below the scene
  const dummyPosition = new THREE.Vector3(0, -1000, 0);
  const dummyDirection = new THREE.Vector3(0, 1, 0);
  
  // Create a full muzzle flash effect - and capture the returned animation function
  const flashEffect = createMuzzleFlash(dummyPosition, dummyDirection, scene, null, true);
  
  // Force a few animation frames to ensure shaders are compiled
  const fakeTimestamps = [0, 16, 32, 48, 64];
  let frameIndex = 0;
  
  function simulateFrames() {
    if (frameIndex < fakeTimestamps.length) {
      // Manually advance the animation using the function from the returned effect
      flashEffect.animateFlash(performance.now() + fakeTimestamps[frameIndex]);
      frameIndex++;
      setTimeout(simulateFrames, 0); // Use setTimeout to avoid blocking the main thread
    } else {
      // Clean up after simulation is complete
      setTimeout(() => {
        scene.remove(flashEffect.flashGroup);
        if (flashEffect.flash) {
          flashEffect.flash.geometry.dispose();
          flashEffect.flash.material.dispose();
        }
        if (flashEffect.glow) {
          flashEffect.glow.geometry.dispose();
          flashEffect.glow.material.dispose();
        }
      }, 100);
    }
  }
  
  // Start simulating frames immediately
  simulateFrames();
}

// Export the SmokeRingEffect class
export { SmokeRingEffect };

/**
 * DrunkennessEffect - Creates a drunkenness camera effect
 * with various visual and motion effects that intensify and fade over time
 */
export class DrunkennessEffect {
  constructor(player, camera) {
    this.player = player;
    this.camera = camera;
    this.active = false;
    this.startTime = 0;
    // Adjust timing as requested - total 30s
    this.duration = 30000; // 30 seconds total
    this.intensifyDuration = 5000; // 5 seconds to intensify
    this.fullIntensityDuration = 20000; // 20 seconds at full intensity
    this.fadeoutDuration = 5000; // 5 seconds to fade out
    this.lastUpdate = 0;
    
    // Original camera values to restore
    this.originalFOV = 0;
    this.originalPosition = new THREE.Vector3();
    this.originalRotation = new THREE.Euler();
    
    // Effect parameters - smoother intensity
    this.maxIntensity = 1.2; // More moderate intensity
    this.currentIntensity = 0;
    
    // Camera wobble parameters - slower frequency for more sway
    this.wobblePhase = 0;
    this.wobbleFrequency = 1.2; // Reduced from 2.5 to 1.2 for slower sway
    this.maxPositionWobble = 0.25; // Increased from 0.13 for more intense swaying
    this.maxRotationWobble = 0.12; // Increased from 0.06 for more intense swaying
    
    // Camera smoothing parameters
    this.targetCameraPosition = new THREE.Vector3();
    this.targetCameraRotation = new THREE.Euler();
    this.cameraLerpFactor = 0.1; // Adjust for smoother/faster transitions
    this.lastPlayerInput = new THREE.Euler();
    
    // Movement jitter parameters
    this.jitterAmount = 0;
    this.jitterDecay = 0.9;
    this.directionShiftAmount = 0;
    this.directionShiftPhase = 0;
    
    // Visual effects
    this.effectsContainer = null;
    this.doubleVisionEnabled = false;
    this.doubleVisionCanvas = null;
    this.doubleVisionCtx = null;
    this.doubleVisionOffset = 0;
    
    // Create visual effects container
    this.createVisualEffects();
    
    // Set to window for access from other modules
    window.drunkennessEffect = this;
  }
  
  /**
   * Creates the DOM elements for visual effects
   */
  createVisualEffects() {
    // Create container for visual effects - minimal approach
    this.effectsContainer = document.createElement('div');
    this.effectsContainer.id = 'drunkenness-effects';
    this.effectsContainer.style.position = 'absolute';
    this.effectsContainer.style.top = '0';
    this.effectsContainer.style.left = '0';
    this.effectsContainer.style.width = '100%';
    this.effectsContainer.style.height = '100%';
    this.effectsContainer.style.pointerEvents = 'none';
    this.effectsContainer.style.zIndex = '10';
    this.effectsContainer.style.display = 'none';
    this.effectsContainer.style.background = 'transparent';
    
    // Create filter layer with NO filters
    this.filterLayer = document.createElement('div');
    this.filterLayer.id = 'drunkenness-filter';
    this.filterLayer.style.position = 'absolute';
    this.filterLayer.style.top = '0';
    this.filterLayer.style.left = '0';
    this.filterLayer.style.width = '100%';
    this.filterLayer.style.height = '100%';
    this.filterLayer.style.backgroundColor = 'rgba(0,0,0,0)';
    this.filterLayer.style.backdropFilter = 'none';
    this.filterLayer.style.pointerEvents = 'none';
    this.filterLayer.style.mixBlendMode = 'normal';
    
    // Add filter layer to container
    this.effectsContainer.appendChild(this.filterLayer);
    
    // Add container to document
    document.body.appendChild(this.effectsContainer);
    
    // Double vision canvas will be created on demand
    this.doubleVisionEnabled = false;
    this.doubleVisionCanvas = null;
    this.doubleVisionCtx = null;
  }
  
  /**
   * Activates the drunkenness effect
   */
  activate() {
    if (this.active) return; // Already active
    
    console.log('Activating drunkenness effect');
    
    // Store original camera values
    this.originalFOV = this.camera.fov;
    this.originalPosition.copy(this.camera.position);
    this.originalRotation.copy(this.camera.rotation);
    
    // Reset effect parameters
    this.currentIntensity = 0;
    this.wobblePhase = 0;
    this.jitterAmount = 0;
    this.directionShiftPhase = 0;
    
    // Start the effect
    this.active = true;
    this.startTime = performance.now();
    this.lastUpdate = this.startTime;
    
    // Show visual effects container
    this.effectsContainer.style.display = 'block';
    
    // Start update loop
    this.update();
  }
  
  /**
   * Deactivates the drunkenness effect and cleans up all elements
   */
  deactivate() {
    if (!this.active) return;
    
    console.log('Deactivating drunkenness effect');
    
    // Restore original camera values
    this.camera.fov = this.originalFOV;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.originalPosition);
    this.camera.rotation.copy(this.originalRotation);
    
    // Hide effects container
    this.effectsContainer.style.display = 'none';
    
    // THOROUGH CLEANUP OF ALL ELEMENTS:
    
    // 1. Remove all style elements
    const styleElements = [
      document.getElementById('drunk-chromatic-aberration'),
      document.getElementById('drunk-brightness-fix')
    ];
    
    styleElements.forEach(element => {
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    
    // 2. Remove all overlay elements
    const overlayElements = [
      document.querySelector('.drunk-red-overlay'),
      document.querySelector('.drunk-cyan-overlay')
    ];
    
    overlayElements.forEach(element => {
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    
    // 3. Remove double vision canvas
    if (this.doubleVisionCanvas && this.doubleVisionCanvas.parentNode) {
      this.doubleVisionCanvas.parentNode.removeChild(this.doubleVisionCanvas);
      this.doubleVisionCanvas = null;
      this.doubleVisionCtx = null;
    }
    this.doubleVisionEnabled = false;
    
    // End the effect
    this.active = false;
  }
  
  /**
   * Updates the drunkenness effect
   */
  update() {
    if (!this.active) return;
    
    const now = performance.now();
    const deltaTime = (now - this.lastUpdate) / 1000; // in seconds
    this.lastUpdate = now;
    
    // Calculate elapsed time and overall progress
    const elapsed = now - this.startTime;
    
    // Check if effect should end
    if (elapsed >= this.duration) {
      this.deactivate();
      return;
    }
    
    // Calculate intensity based on phase of effect
    if (elapsed < this.intensifyDuration) {
      // Intensifying phase - increase intensity
      this.currentIntensity = (elapsed / this.intensifyDuration) * this.maxIntensity;
    } else if (elapsed < this.intensifyDuration + this.fullIntensityDuration) {
      // Full intensity phase - maintain max intensity
      this.currentIntensity = this.maxIntensity;
    } else {
      // Fadeout phase - decrease intensity
      const fadeOutElapsed = elapsed - (this.intensifyDuration + this.fullIntensityDuration);
      this.currentIntensity = this.maxIntensity * (1 - (fadeOutElapsed / this.fadeoutDuration));
    }
    
    // Capture player's input before applying drunk effects
    this.capturePlayerInput();
    
    // Calculate wobble effect target values
    this.calculateWobbleTargets(deltaTime);
    
    // Smoothly blend camera movement
    this.smoothCameraBlend(deltaTime);
    
    // Apply movement jitter effect
    this.applyMovementJitter(deltaTime);
    
    // Update visual effects
    this.updateVisualEffects();
    
    // Continue update loop
    requestAnimationFrame(() => this.update());
  }
  
  /**
   * Captures the player's current input to blend with drunk wobble
   */
  capturePlayerInput() {
    // Store player's intended camera rotation
    this.lastPlayerInput.copy(this.camera.rotation);
  }
  
  /**
   * Calculates the wobble effect target values
   * @param {number} deltaTime - Time since last update in seconds
   */
  calculateWobbleTargets(deltaTime) {
    // Update wobble phase - slower progression
    this.wobblePhase += deltaTime * this.wobbleFrequency;
    
    // Calculate wobble offsets using smoother sine waves
    const posXOffset = Math.sin(this.wobblePhase * 0.8) 
      * this.maxPositionWobble * this.currentIntensity;
    
    const posYOffset = Math.sin(this.wobblePhase * 0.9) 
      * this.maxPositionWobble * this.currentIntensity;
    
    const posZOffset = Math.sin(this.wobblePhase * 0.7) 
      * this.maxPositionWobble * this.currentIntensity;
    
    // Set target position with wobble applied
    this.targetCameraPosition.set(
      this.originalPosition.x + posXOffset,
      this.originalPosition.y + posYOffset,
      this.originalPosition.z + posZOffset
    );
    
    // Calculate rotation wobble
    const rotYOffset = Math.sin(this.wobblePhase * 0.7)
      * this.maxRotationWobble * this.currentIntensity;
    
    const rotZOffset = Math.sin(this.wobblePhase * 0.8)
      * this.maxRotationWobble * 1.5 * this.currentIntensity;
    
    // Set target rotation with wobble applied, respecting player X rotation
    this.targetCameraRotation.set(
      this.lastPlayerInput.x, // Keep player's up/down look intact
      this.originalRotation.y + rotYOffset,
      this.originalRotation.z + rotZOffset
    );
    
    // Calculate FOV effect
    const fovOffset = Math.sin(this.wobblePhase * 0.4) * 5 * this.currentIntensity;
    this.camera.fov = this.originalFOV + fovOffset;
    this.camera.updateProjectionMatrix();
  }
  
  /**
   * Smoothly blends camera between player input and drunk wobble
   * @param {number} deltaTime - Time since last update in seconds
   */
  smoothCameraBlend(deltaTime) {
    // Adjust lerp factor based on intensity and deltaTime
    const lerpStrength = this.cameraLerpFactor * (1 + this.currentIntensity * 2);
    const lerpFactor = Math.min(1.0, lerpStrength * deltaTime * 60); // Normalize for 60fps
    
    // Smoothly interpolate position
    this.camera.position.lerp(this.targetCameraPosition, lerpFactor);
    
    // Smoothly interpolate Y and Z rotation while preserving player X rotation
    // We only lerp Y and Z because X is controlled directly by player look
    this.camera.rotation.y = THREE.MathUtils.lerp(
      this.camera.rotation.y,
      this.targetCameraRotation.y,
      lerpFactor
    );
    
    this.camera.rotation.z = THREE.MathUtils.lerp(
      this.camera.rotation.z,
      this.targetCameraRotation.z,
      lerpFactor
    );
  }
  
  /**
   * Applies movement jitter to player controls
   * @param {number} deltaTime - Time since last update in seconds
   */
  applyMovementJitter(deltaTime) {
    if (!this.player) return;
    
    // Update direction shift phase - slower
    this.directionShiftPhase += deltaTime * 0.6; // Reduced from 0.9
    
    // Calculate direction shift with smoother curve
    this.directionShiftAmount = Math.sin(this.directionShiftPhase) 
      * 0.6 * this.currentIntensity; // Reduced from 0.8
    
    // Apply random jitter to movement
    if (this.player.isMoving && typeof this.player.isMoving === 'function' && this.player.isMoving()) {
      // Apply random movement jitter - reduced intensity
      const jitterX = (Math.random() - 0.5) * 0.25 * this.currentIntensity; // Reduced from 0.35
      const jitterZ = (Math.random() - 0.5) * 0.25 * this.currentIntensity; // Reduced from 0.35
      
      // Apply jitter to velocity
      if (this.player.velocity) {
        if (this.player.moveForward || this.player.moveBackward) {
          this.player.velocity.x += jitterX;
        }
        if (this.player.moveLeft || this.player.moveRight) {
          this.player.velocity.z += jitterZ;
        }
      }
      
      // Apply direction shift (makes the player veer slightly left/right when moving)
      if (this.player.moveForward || this.player.moveBackward || 
          this.player.moveLeft || this.player.moveRight) {
        this.player.group.rotation.y += this.directionShiftAmount * deltaTime;
      }
      
      // Occasionally apply a rotation push - reduced frequency
      if (Math.random() < 0.02 * this.currentIntensity) { // Reduced from 0.03
        this.player.group.rotation.y += (Math.random() - 0.5) * 0.1 * this.currentIntensity; // Reduced from 0.15
      }
    }
  }
  
  /**
   * Updates visual effects based on current intensity
   */
  updateVisualEffects() {
    // EMERGENCY FIX: Remove all filters/effects that could cause darkening
    
    // Remove any existing overlay elements that might be causing darkening
    const overlaysToRemove = [
      document.querySelector('.drunk-red-overlay'), 
      document.querySelector('.drunk-cyan-overlay'),
      document.querySelector('.drunk-chromatic-red'),
      document.querySelector('.drunk-chromatic-blue')
    ];
    
    overlaysToRemove.forEach(overlay => {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    
    // Remove any existing style elements that might be adding filters
    const stylesToRemove = [
      document.getElementById('drunk-chromatic-aberration'),
      document.getElementById('drunk-brightness-fix')
    ];
    
    stylesToRemove.forEach(style => {
      if (style && style.parentNode) {
        style.parentNode.removeChild(style);
      }
    });
    
    // Set filter layer to completely transparent
    this.filterLayer.style.backgroundColor = 'rgba(0,0,0,0)';
    this.filterLayer.style.backdropFilter = 'none';
    
    // Add chromatic aberration effect as actual DOM elements
    if (this.currentIntensity > 0.1) {
      const gameCanvas = document.querySelector('canvas');
      if (gameCanvas) {
        const aberrationAmount = this.currentIntensity * 10; // Increased intensity
        const redOffset = Math.sin(this.wobblePhase * 0.7) * aberrationAmount;
        const blueOffset = Math.sin(this.wobblePhase * 0.9) * -aberrationAmount; // Opposite direction
        
        // Create red channel overlay
        const redOverlay = document.createElement('div');
        redOverlay.className = 'drunk-chromatic-red';
        redOverlay.style.position = 'absolute';
        redOverlay.style.top = '0';
        redOverlay.style.left = '0';
        redOverlay.style.width = '100%';
        redOverlay.style.height = '100%';
        redOverlay.style.pointerEvents = 'none';
        redOverlay.style.zIndex = '90';
        redOverlay.style.opacity = '0.5';
        redOverlay.style.mixBlendMode = 'screen';
        redOverlay.style.backgroundColor = 'transparent';
        
        // Clone the game canvas into this div
        const redClone = gameCanvas.cloneNode(true);
        redClone.style.position = 'absolute';
        redClone.style.filter = 'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><filter id="red"><feColorMatrix type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"/></filter></svg>#red\')';
        redClone.style.transform = `translate(${redOffset}px, 0)`;
        redClone.style.opacity = '0.8';
        redOverlay.appendChild(redClone);
        
        // Create blue channel overlay
        const blueOverlay = document.createElement('div');
        blueOverlay.className = 'drunk-chromatic-blue';
        blueOverlay.style.position = 'absolute';
        blueOverlay.style.top = '0';
        blueOverlay.style.left = '0';
        blueOverlay.style.width = '100%';
        blueOverlay.style.height = '100%';
        blueOverlay.style.pointerEvents = 'none';
        blueOverlay.style.zIndex = '91';
        blueOverlay.style.opacity = '0.5';
        blueOverlay.style.mixBlendMode = 'screen';
        blueOverlay.style.backgroundColor = 'transparent';
        
        // Clone the game canvas into this div
        const blueClone = gameCanvas.cloneNode(true);
        blueClone.style.position = 'absolute';
        blueClone.style.filter = 'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><filter id="blue"><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter></svg>#blue\')';
        blueClone.style.transform = `translate(${blueOffset}px, 0)`;
        blueClone.style.opacity = '0.8';
        blueOverlay.appendChild(blueClone);
        
        // Add the overlays to document
        document.body.appendChild(redOverlay);
        document.body.appendChild(blueOverlay);
      }
    }
    
    // Simplified double vision effect without CSS filters
    // Only show double vision above certain intensity
    if (this.currentIntensity > 0.1) {
      // Calculate double vision offset based on intensity
      const baseOffset = this.currentIntensity * 25; // Increased from 15 for more intense effect
      const wobbleOffset = Math.sin(this.wobblePhase) * 10 * this.currentIntensity; // Increased from 5 for more intense effect
      this.doubleVisionOffset = baseOffset + wobbleOffset;
      
      // Get game canvas for double vision effect
      const gameCanvas = document.querySelector('canvas');
      if (gameCanvas && !this.doubleVisionEnabled) {
        // Create a very simple double vision using plain canvas
        // (without any filter that could cause darkening)
        this.doubleVisionCanvas = document.createElement('canvas');
        this.doubleVisionCanvas.width = window.innerWidth;
        this.doubleVisionCanvas.height = window.innerHeight;
        this.doubleVisionCanvas.style.position = 'absolute';
        this.doubleVisionCanvas.style.top = '0';
        this.doubleVisionCanvas.style.left = '0';
        this.doubleVisionCanvas.style.width = '100%';
        this.doubleVisionCanvas.style.height = '100%';
        this.doubleVisionCanvas.style.pointerEvents = 'none';
        this.doubleVisionCanvas.style.opacity = '0.2';
        this.doubleVisionCanvas.style.zIndex = '100';
        this.doubleVisionCanvas.style.mixBlendMode = 'lighten';
        
        // Only add the canvas once
        document.body.appendChild(this.doubleVisionCanvas);
        this.doubleVisionCtx = this.doubleVisionCanvas.getContext('2d');
        this.doubleVisionEnabled = true;
      }
      
      // Draw the double vision effect if canvas is ready
      if (this.doubleVisionEnabled && this.doubleVisionCtx && gameCanvas) {
        // Clear previous content
        this.doubleVisionCtx.clearRect(0, 0, this.doubleVisionCanvas.width, this.doubleVisionCanvas.height);
        
        // Use simple drawImage for offset vision, with no compositing
        this.doubleVisionCtx.drawImage(
          gameCanvas, 
          this.doubleVisionOffset, 
          -this.doubleVisionOffset / 2
        );
        
        // Force canvas to be fully visible
        this.doubleVisionCanvas.style.display = 'block';
      }
    } else if (this.doubleVisionEnabled) {
      // Hide double vision canvas when intensity is too low
      if (this.doubleVisionCanvas) {
        this.doubleVisionCanvas.style.display = 'none';
      }
      this.doubleVisionEnabled = false;
    }
    
    // Add a single style element that ONLY forces brightness to 100%
    const brightnessStyle = document.createElement('style');
    brightnessStyle.id = 'drunk-brightness-fix';
    brightnessStyle.textContent = `
      * { filter: brightness(100%) !important; }
      body { filter: brightness(100%) !important; }
      canvas { filter: brightness(100%) !important; }
      div { filter: brightness(100%) !important; }
      #game-container { filter: brightness(100%) !important; }
      #game-container * { filter: brightness(100%) !important; }
    `;
    document.head.appendChild(brightnessStyle);
  }
}