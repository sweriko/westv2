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
 * Creates a muzzle flash effect at the given position.
 * @param {THREE.Vector3} position - Effect position.
 * @param {THREE.Vector3} direction - Firing direction.
 * @param {THREE.Scene} scene - The scene to add the effect.
 * @param {Object} options - Optional positioning overrides.
 */
export function createMuzzleFlash(position, direction, scene, options = null) {
  const flashGroup = new THREE.Group();
  
  // Get effect configuration - either from options or defaults
  let forwardOffset = 0.05;
  let scale = 1.0;
  let xOffset = 0;
  let yOffset = 0;
  
  // If we have options from the viewmodel, use those for positioning
  if (options) {
    forwardOffset = options.forward_offset !== undefined ? options.forward_offset : forwardOffset;
    scale = options.scale !== undefined ? options.scale : scale;
    xOffset = options.x_offset !== undefined ? options.x_offset : xOffset;
    yOffset = options.y_offset !== undefined ? options.y_offset : yOffset;
  }
  
  // Position the flash with the appropriate offsets
  const adjustedPosition = position.clone();
  
  // Apply direction-based forward offset
  if (direction) {
    const forwardDir = direction.clone().normalize().multiplyScalar(forwardOffset);
    adjustedPosition.add(forwardDir);
    
    // Apply lateral offsets if specified
    if (xOffset !== 0 || yOffset !== 0) {
      // Calculate right and up vectors
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      right.crossVectors(direction, up).normalize();
      
      // Recalculate up to ensure it's perpendicular
      up.crossVectors(right, direction).normalize();
      
      // Apply offsets
      if (xOffset !== 0) {
        adjustedPosition.add(right.multiplyScalar(xOffset));
      }
      
      if (yOffset !== 0) {
        adjustedPosition.add(up.multiplyScalar(yOffset));
      }
    }
  }
  
  flashGroup.position.copy(adjustedPosition);
  
  // Orient the flash group in the firing direction if provided
  if (direction) {
    flashGroup.lookAt(adjustedPosition.clone().add(direction));
  }
  
  scene.add(flashGroup);

  // Create a brighter and larger core for more visible muzzle flash
  const coreGeometry = new THREE.SphereGeometry(0.08 * scale, 8, 8);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xFF9C00, // Bright orange-yellow
    transparent: true,
    opacity: 1
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  // Make it more elongated in the z-direction (along the barrel)
  core.scale.z = 2.2;
  flashGroup.add(core);

  // Add a brighter point light for illumination
  const flashLight = new THREE.PointLight(0xFF9C00, 2.0, 2.5 * scale);
  flashLight.position.set(0, 0, 0);
  flashGroup.add(flashLight);

  // Slightly longer duration for better visibility
  const duration = 80; // milliseconds
  const startTime = performance.now();

  function animateFlash(timestamp) {
    const elapsed = timestamp - startTime;
    const progress = elapsed / duration;
    if (progress < 1) {
      // More dramatic scale pulsation 
      core.scale.z = 2.2 * (1 - progress * 0.6);
      
      // Smoother fade out
      const fadeOpacity = 1 - Math.pow(progress, 1.5);
      coreMaterial.opacity = Math.max(0, fadeOpacity);
      
      // Light intensity follows similar curve
      flashLight.intensity = 2.0 * (1 - Math.pow(progress, 1.2));
      
      requestAnimationFrame(animateFlash);
    } else {
      scene.remove(flashGroup);
      disposeHierarchy(flashGroup);
    }
  }
  requestAnimationFrame(animateFlash);
}

/**
 * Creates a smoke effect emanating from a given position.
 * @param {THREE.Vector3} position - Start position.
 * @param {THREE.Vector3} direction - Direction of smoke.
 * @param {THREE.Scene} scene - The scene to add the effect.
 */
export function createSmokeEffect(position, direction, scene) {
  // Skip smoke effect on mobile devices
  if (window.isMobile) {
    return;
  }
  
  // Original smoke effect code for desktop
  const smokeGroup = new THREE.Group();
  smokeGroup.position.copy(position);
  scene.add(smokeGroup);

  // Create a small group of smoke particles
  const numParticles = 5;
  const particles = [];

  for (let i = 0; i < numParticles; i++) {
    const particleGeometry = new THREE.IcosahedronGeometry(0.01 + Math.random() * 0.02, 0);
    const particleMaterial = new THREE.MeshBasicMaterial({
      color: 0xCCCCCC,
      transparent: true,
      opacity: 0.7
    });
    
    const particle = new THREE.Mesh(particleGeometry, particleMaterial);
    
    // Randomize initial position slightly around gun muzzle
    particle.position.set(
      (Math.random() - 0.5) * 0.04,
      (Math.random() - 0.5) * 0.04,
      (Math.random() - 0.5) * 0.04
    );
    
    // Calculate movement direction (mostly forward along shooting direction)
    const particleDir = direction.clone();
    particleDir.x += (Math.random() - 0.5) * 0.2;  // Add some randomness
    particleDir.y += (Math.random() - 0.5) * 0.2;
    particleDir.z += (Math.random() - 0.5) * 0.2;
    particleDir.normalize();
    
    // Store particle properties
    particles.push({
      mesh: particle,
      velocity: particleDir.multiplyScalar(0.5 + Math.random() * 0.5),
      life: 0,
      maxLife: 0.5 + Math.random() * 0.5
    });
    
    smokeGroup.add(particle);
  }
  
  // Animation loop for smoke particles
  let startTime = null;
  function animateSmoke(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = (timestamp - startTime) / 1000; // Convert to seconds
    
    let allDead = true;
    
    for (const particle of particles) {
      particle.life += 0.016; // Approximate time step
      
      if (particle.life < particle.maxLife) {
        allDead = false;
        
        // Move particle based on velocity
        particle.mesh.position.add(particle.velocity.clone().multiplyScalar(0.016));
        
        // Slow down over time (air resistance)
        particle.velocity.multiplyScalar(0.96);
        
        // Expand slightly
        const scale = 1 + particle.life * 3;
        particle.mesh.scale.set(scale, scale, scale);
        
        // Fade out
        const lifeRatio = particle.life / particle.maxLife;
        if (lifeRatio > 0.7) {
          particle.mesh.material.opacity = 0.7 * (1 - (lifeRatio - 0.7) / 0.3);
        }
      } else {
        // Hide particle when dead
        particle.mesh.visible = false;
      }
    }
    
    if (!allDead) {
      requestAnimationFrame(animateSmoke);
    } else {
      // Clean up when all particles are dead
      scene.remove(smokeGroup);
      particles.forEach(particle => {
        if (particle.mesh.material) particle.mesh.material.dispose();
        if (particle.mesh.geometry) particle.mesh.geometry.dispose();
      });
    }
  }
  
  requestAnimationFrame(animateSmoke);
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
 * - If hitType is 'ground', "woodimpact.mp3" is played.
 * - If hitType is 'player', "fleshimpact.mp3" is played at the impact position.
 *
 * @param {THREE.Vector3} position - Impact position.
 * @param {THREE.Vector3} direction - Impact (bullet) direction.
 * @param {THREE.Scene} scene - The scene to add the effect.
 * @param {string} hitType - Type of impact: 'player', 'npc', or 'ground'.
 */
export function createImpactEffect(position, direction, scene, hitType) {
  const effectGroup = new THREE.Group();
  effectGroup.position.copy(position);
  scene.add(effectGroup);
  
  // Play impact sound based on hit type using positional audio
  if (window.localPlayer && window.localPlayer.soundManager) {
    if (hitType === 'ground') {
      window.localPlayer.soundManager.playSoundAt("woodimpact", position);
    } else if (hitType === 'player') {
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

  // Choose color: red for body impacts, brown for ground.
  const color = (hitType === 'ground') ? 0x8B4513 : 0xFF0000;

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
        if (hitType === 'ground') {
          p.velocity.y -= 0.005; // gravity effect on ground splatter
        }
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
  
  // Create a dummy position and direction far below the scene
  const dummyPosition = new THREE.Vector3(0, -1000, 0);
  const dummyDirection = new THREE.Vector3(0, 1, 0);
  
  // Create a smoke group
  const smokeGroup = new THREE.Group();
  smokeGroup.position.copy(dummyPosition);
  scene.add(smokeGroup);
  
  // Create particles with 0 opacity
  const numParticles = 5;
  const particles = [];
  
  for (let i = 0; i < numParticles; i++) {
    const particleGeometry = new THREE.IcosahedronGeometry(0.01 + Math.random() * 0.02, 0);
    const particleMaterial = new THREE.MeshBasicMaterial({
      color: 0xCCCCCC,
      transparent: true,
      opacity: 0 // Make it invisible
    });
    
    const particle = new THREE.Mesh(particleGeometry, particleMaterial);
    smokeGroup.add(particle);
    
    // Store particle properties
    particles.push({
      mesh: particle,
      velocity: dummyDirection.clone().multiplyScalar(0.5),
      life: 0,
      maxLife: 0.5
    });
  }
  
  // Remove and dispose after a short delay
  setTimeout(() => {
    // Clean up
    particles.forEach(p => {
      smokeGroup.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    });
    scene.remove(smokeGroup);
  }, 100);
}

/**
 * Preloads the muzzle flash effect by creating an invisible instance
 * @param {THREE.Scene} scene - The scene to add the preloaded effect
 */
export function preloadMuzzleFlash(scene) {
  // Skip on mobile devices
  if (window.isMobile) {
    return;
  }
  
  // Create a dummy position far below the scene
  const dummyPosition = new THREE.Vector3(0, -1000, 0);
  
  // Create flash group
  const flashGroup = new THREE.Group();
  flashGroup.position.copy(dummyPosition);
  scene.add(flashGroup);
  
  // Create core flash
  const flashGeometry = new THREE.IcosahedronGeometry(0.1, 0);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xFFF7D6,
    transparent: true,
    opacity: 0 // Make it invisible
  });
  const flash = new THREE.Mesh(flashGeometry, flashMaterial);
  flashGroup.add(flash);
  
  // Remove and dispose after a short delay
  setTimeout(() => {
    scene.remove(flashGroup);
    flashGeometry.dispose();
    flashMaterial.dispose();
  }, 100);
}

// Export the SmokeRingEffect class
export { SmokeRingEffect };