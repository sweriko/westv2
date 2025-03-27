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
  // Skip on mobile devices
  if (window.isMobile && !isPreloading) {
    return;
  }
  
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

/**
 * Creates an impact effect when a bullet hits a target.
 * Instead of a red disk, this new effect emits particles in the opposite direction
 * of the bullet's travel. When the bullet hits a body (player or NPC), the particles
 * are red (blood). When it hits the ground/solid, the particles are brown (splatter).
 *
 * The particle velocities have been reduced so that they stay near the impact point.
 *
 * Additionally, this function now plays an impact sound:
 * - If hitType is 'player', "fleshimpact.mp3" is played at the impact position.
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
    if (hitType === 'player') {
      // Calculate distance to local player to avoid playing impact on own body
      const localPlayerPos = window.localPlayer.group.position;
      const distToLocalPlayer = Math.sqrt(
        Math.pow(position.x - localPlayerPos.x, 2) + 
        Math.pow(position.z - localPlayerPos.z, 2)
      );
      
      // Only play flesh impact if not too close to local player (prevents self-impacts)
      if (distToLocalPlayer > 0.5) {
        window.localPlayer.soundManager.playSoundAt("fleshimpact", position);
      }
    }
  }

  // Choose color: red for body impacts
  const color = 0xFF0000;

  const particleCount = 15;
  const particles = [];
  for (let i = 0; i < particleCount; i++) {
    const size = 0.03 * (0.8 + Math.random() * 0.4);
    const particleGeometry = new THREE.SphereGeometry(size, 4, 4);
    const particleMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 1
    });
    const particle = new THREE.Mesh(particleGeometry, particleMaterial);
    effectGroup.add(particle);
    // Use a reduced speed so particles stay close to the impact spot.
    const velocity = direction.clone().negate();
    const speed = 0.05 + Math.random() * 0.05;
    velocity.multiplyScalar(speed);
    velocity.x += (Math.random() - 0.5) * 0.05;
    velocity.y += (Math.random() - 0.5) * 0.05;
    velocity.z += (Math.random() - 0.5) * 0.05;
    particles.push({ mesh: particle, velocity: velocity, life: 30 + Math.floor(Math.random() * 20) });
  }

  const duration = 500; // in ms
  const startTime = performance.now();

  function animateEffect() {
    const elapsed = performance.now() - startTime;
    const t = elapsed / duration;
    for (const p of particles) {
      if (p.life > 0) {
        p.mesh.position.add(p.velocity);
        p.mesh.material.opacity = Math.max(1 - t, 0);
        p.life--;
      }
    }
    if (elapsed < duration) {
      requestAnimationFrame(animateEffect);
    } else {
      scene.remove(effectGroup);
      effectGroup.traverse(child => {
        if (child.isMesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });
    }
  }
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
  // Skip on mobile devices
  if (window.isMobile) {
    return;
  }
  
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
  // Skip on mobile devices
  if (window.isMobile) {
    return;
  }
  
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