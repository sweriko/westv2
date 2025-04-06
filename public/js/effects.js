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
 * Applies a realistic recoil effect.
 * @param {Player} player - The player instance.
 */
export function applyRecoil(player) {
  const originalAimOffset = player.aimOffset.clone();
  const originalFOV = player.camera.fov;
  const originalCameraPos = player.camera.position.clone();
  const originalRotation = player.camera.rotation.clone();

  // Initial recoil changes.
  player.camera.rotation.x -= 0.08;
  player.camera.rotation.z += 0.01;
  player.aimOffset.z += 0.4;
  player.aimOffset.y += 0.15;
  player.aimOffset.x += 0.05;
  player.camera.fov -= 5;
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
      player.camera.rotation.x = originalRotation.x + step.cameraX;
      player.camera.rotation.z = originalRotation.z + step.cameraZ;
      player.aimOffset.z = originalAimOffset.z + step.offsetZ;
      player.aimOffset.y = originalAimOffset.y + step.offsetY;
      player.aimOffset.x = originalAimOffset.x + step.offsetX;
    }, step.time);
  });

  let shakeIntensity = 0.03;
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