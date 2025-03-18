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
   * @param {THREE.Scene} scene - The scene to add the effect.
   */
  export function createMuzzleFlash(position, scene) {
    const flashGroup = new THREE.Group();
    flashGroup.position.copy(position);
    scene.add(flashGroup);
  
    const coreGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 1
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    flashGroup.add(core);
  
    const middleGeometry = new THREE.SphereGeometry(0.08, 8, 8);
    const middleMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFF00,
      transparent: true,
      opacity: 0.8
    });
    const middle = new THREE.Mesh(middleGeometry, middleMaterial);
    middle.scale.x = 1.5;
    flashGroup.add(middle);
  
    const outerGeometry = new THREE.SphereGeometry(0.12, 8, 8);
    const outerMaterial = new THREE.MeshBasicMaterial({
      color: 0xFF6B00,
      transparent: true,
      opacity: 0.5
    });
    const outer = new THREE.Mesh(outerGeometry, outerMaterial);
    outer.scale.x = 2;
    flashGroup.add(outer);
  
    const particleCount = 8;
    for (let i = 0; i < particleCount; i++) {
      const particleGeometry = new THREE.SphereGeometry(0.02, 4, 4);
      const particleMaterial = new THREE.MeshBasicMaterial({
        color: 0xFFFF00,
        transparent: true,
        opacity: 0.7
      });
      const particle = new THREE.Mesh(particleGeometry, particleMaterial);
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.05 + Math.random() * 0.1;
      particle.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        (Math.random() - 0.5) * 0.1
      );
      flashGroup.add(particle);
    }
  
    const flashLight = new THREE.PointLight(0xFF9900, 1, 2);
    flashLight.position.set(0, 0, 0);
    flashGroup.add(flashLight);
  
    const duration = 100;
    const startTime = performance.now();
  
    function animateFlash(timestamp) {
      const elapsed = timestamp - startTime;
      const progress = elapsed / duration;
      if (progress < 1) {
        core.scale.multiplyScalar(0.95);
        const fadeOpacity = 1 - progress;
        coreMaterial.opacity = fadeOpacity;
        middleMaterial.opacity = fadeOpacity * 0.8;
        outerMaterial.opacity = fadeOpacity * 0.5;
        flashLight.intensity = 1 - progress;
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
    const particleCount = 30;
    const particles = [];
    const smokeGroup = new THREE.Group();
    smokeGroup.position.copy(position);
    scene.add(smokeGroup);
  
    const smokeColors = [
      new THREE.Color(0.9, 0.9, 0.9),
      new THREE.Color(0.8, 0.8, 0.8),
      new THREE.Color(0.7, 0.7, 0.7),
      new THREE.Color(0.6, 0.6, 0.6)
    ];
  
    for (let i = 0; i < particleCount; i++) {
      const size = 0.01 + Math.random() * 0.03;
      const smokeGeometry = new THREE.SphereGeometry(size, 6, 6);
      const colorIndex = Math.floor(Math.random() * smokeColors.length);
      const smokeColor = smokeColors[colorIndex];
      const smokeMaterial = new THREE.MeshBasicMaterial({
        color: smokeColor,
        transparent: true,
        opacity: 0.3 + Math.random() * 0.4
      });
      const smokeParticle = new THREE.Mesh(smokeGeometry, smokeMaterial);
      smokeParticle.position.set(
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.05
      );
      let particleDir = direction.clone();
      particleDir.x += (Math.random() - 0.5) * 0.6;
      particleDir.y += (Math.random() - 0.5) * 0.2 + 0.2;
      particleDir.z += (Math.random() - 0.5) * 0.6;
      particleDir.normalize();
      const speed = 0.02 + Math.random() * 0.08;
      const velocity = particleDir.multiplyScalar(speed);
      const rotationSpeed = {
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.02,
        z: (Math.random() - 0.5) * 0.02
      };
      smokeGroup.add(smokeParticle);
      particles.push({
        mesh: smokeParticle,
        velocity: velocity,
        rotationSpeed: rotationSpeed,
        life: 40 + Math.floor(Math.random() * 60),
        maxLife: 40 + Math.floor(Math.random() * 60),
        size: size,
        growth: 0.005 + Math.random() * 0.01
      });
    }
  
    const interval = setInterval(() => {
      let allDead = true;
      particles.forEach(p => {
        if (p.life > 0) {
          p.mesh.position.add(p.velocity);
          p.velocity.multiplyScalar(0.98);
          p.velocity.x += (Math.random() - 0.5) * 0.001;
          p.velocity.z += (Math.random() - 0.5) * 0.001;
          p.velocity.y += 0.0008;
          p.mesh.rotation.x += p.rotationSpeed.x;
          p.mesh.rotation.y += p.rotationSpeed.y;
          p.mesh.rotation.z += p.rotationSpeed.z;
          const scale = p.size + (p.growth * (p.maxLife - p.life));
          p.mesh.scale.set(scale, scale, scale);
          const lifeRatio = p.life / p.maxLife;
          p.mesh.material.opacity = lifeRatio * 0.5;
          p.life--;
          allDead = false;
        } else {
          smokeGroup.remove(p.mesh);
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
        }
      });
      if (allDead) {
        clearInterval(interval);
        scene.remove(smokeGroup);
      }
    }, 16);
  }
  
  /**
   * Creates a shockwave ring effect in the shooting direction.
   * @param {THREE.Vector3} position - Effect start position.
   * @param {THREE.Vector3} direction - Firing direction.
   * @param {THREE.Scene} scene - The scene to add the effect.
   */
  export function createShockwaveRing(position, direction, scene) {
    const shockwaveGroup = new THREE.Group();
    shockwaveGroup.position.copy(position);
    shockwaveGroup.lookAt(position.clone().add(direction));
    scene.add(shockwaveGroup);
  
    const distortionGeometry = new THREE.CircleGeometry(0.08, 32);
    const distortionMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending
    });
    const distortion = new THREE.Mesh(distortionGeometry, distortionMaterial);
    shockwaveGroup.add(distortion);
  
    const lineCount = 18;
    const speedLines = [];
    const speedLineColors = [0xFFFFFF, 0xFFFF00, 0xFF9900, 0xFF6600];
  
    for (let i = 0; i < lineCount; i++) {
      const lineLength = 0.2 + Math.random() * 0.6;
      const lineWidth = 0.003 + Math.random() * 0.005;
      const lineGeometry = new THREE.BoxGeometry(lineWidth, lineWidth, lineLength);
      lineGeometry.translate(0, 0, lineLength / 2);
      const colorIndex = Math.floor(Math.random() * speedLineColors.length);
      const lineColor = speedLineColors[colorIndex];
      const lineMaterial = new THREE.MeshBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending
      });
      const line = new THREE.Mesh(lineGeometry, lineMaterial);
      const spreadAngle = 15 * (Math.PI / 180);
      line.rotation.x = (Math.random() - 0.5) * spreadAngle;
      line.rotation.y = (Math.random() - 0.5) * spreadAngle;
      line.scale.z = 0.1;
      shockwaveGroup.add(line);
      speedLines.push({
        mesh: line,
        material: lineMaterial,
        maxLength: 1 + Math.random() * 2,
        speed: 0.8 + Math.random() * 0.4,
        delay: Math.random() * 50
      });
    }
  
    const particleCount = 12;
    const particles = [];
  
    for (let i = 0; i < particleCount; i++) {
      const particleGeometry = new THREE.SphereGeometry(0.01, 4, 4);
      const particleMaterial = new THREE.MeshBasicMaterial({
        color: 0xFFFF00,
        transparent: true,
        opacity: 0.6
      });
      const particle = new THREE.Mesh(particleGeometry, particleMaterial);
      const angle = Math.random() * Math.PI * 0.25;
      const radius = 0.02 + Math.random() * 0.06;
      particle.position.z = Math.cos(angle) * radius;
      const circleAngle = Math.random() * Math.PI * 2;
      particle.position.x = Math.sin(angle) * Math.cos(circleAngle) * radius;
      particle.position.y = Math.sin(angle) * Math.sin(circleAngle) * radius;
      const velocity = new THREE.Vector3(
        particle.position.x * (0.5 + Math.random() * 0.5),
        particle.position.y * (0.5 + Math.random() * 0.5),
        0.05 + Math.random() * 0.1
      );
      shockwaveGroup.add(particle);
      particles.push({
        mesh: particle,
        velocity: velocity,
        life: 10 + Math.floor(Math.random() * 15)
      });
    }
  
    const flashLight = new THREE.PointLight(0xFF9900, 1, 2);
    flashLight.position.set(0, 0, 0);
    shockwaveGroup.add(flashLight);
  
    const duration = 350;
    const startTime = performance.now();
  
    function animateShockwave(timestamp) {
      const elapsed = timestamp - startTime;
      const progress = elapsed / duration;
      if (progress < 1) {
        speedLines.forEach(line => {
          if (elapsed > line.delay) {
            const lineProgress = Math.min((elapsed - line.delay) / (duration - line.delay), 1);
            if (lineProgress < 0.5) {
              const scaleProgress = lineProgress * 2;
              line.mesh.scale.z = line.maxLength * scaleProgress;
            } else {
              line.material.opacity = 0.7 * (1 - ((lineProgress - 0.5) * 2));
            }
          }
        });
        const distortionScale = 1 + progress * 5;
        distortion.scale.set(distortionScale, distortionScale, 1);
        distortionMaterial.opacity = 0.2 * (1 - progress);
  
        particles.forEach(p => {
          if (p.life > 0) {
            p.mesh.position.add(p.velocity);
            p.mesh.material.opacity = (p.life / 25) * 0.6;
            p.life--;
          } else {
            shockwaveGroup.remove(p.mesh);
          }
        });
  
        flashLight.intensity = 1 - progress;
        requestAnimationFrame(animateShockwave);
      } else {
        scene.remove(shockwaveGroup);
        disposeHierarchy(shockwaveGroup);
      }
    }
    requestAnimationFrame(animateShockwave);
  }
  
  /**
   * Creates an impact effect when a bullet hits a target.
   * @param {THREE.Vector3} position - Impact position.
   * @param {THREE.Vector3} direction - Impact direction.
   * @param {THREE.Scene} scene - The scene to add the effect.
   */
  export function createImpactEffect(position, direction, scene) {
    const impactGroup = new THREE.Group();
    impactGroup.position.copy(position);
    scene.add(impactGroup);
  
    const flashGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    impactGroup.add(flash);
  
    const ringGeometry = new THREE.RingGeometry(0.05, 0.06, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xFF0000,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.lookAt(position.clone().add(direction.clone().negate()));
    impactGroup.add(ring);
  
    const particleCount = 25;
    const particles = [];
    const particleTypes = [
      { color: 0xFF0000, size: 0.03, gravity: 0.02 },
      { color: 0xA00000, size: 0.02, gravity: 0.015 },
      { color: 0x800000, size: 0.025, gravity: 0.018 }
    ];
  
    for (let i = 0; i < particleCount; i++) {
      const type = particleTypes[Math.floor(Math.random() * particleTypes.length)];
      const particleGeometry = new THREE.SphereGeometry(type.size * (0.7 + Math.random() * 0.6), 4, 4);
      const particleMaterial = new THREE.MeshBasicMaterial({
        color: type.color,
        transparent: true,
        opacity: 0.8
      });
      const particle = new THREE.Mesh(particleGeometry, particleMaterial);
      const particleDir = direction.clone().negate();
      particleDir.x += (Math.random() - 0.5) * 1.5;
      particleDir.y += (Math.random() - 0.5) * 1.5;
      particleDir.z += (Math.random() - 0.5) * 1.5;
      particleDir.normalize();
      const speed = 0.05 + Math.random() * 0.2;
      const velocity = particleDir.clone().multiplyScalar(speed);
      impactGroup.add(particle);
      const rotationSpeed = {
        x: (Math.random() - 0.5) * 0.2,
        y: (Math.random() - 0.5) * 0.2,
        z: (Math.random() - 0.5) * 0.2
      };
      particles.push({
        mesh: particle,
        velocity: velocity,
        rotationSpeed: rotationSpeed,
        gravity: type.gravity,
        life: 30 + Math.floor(Math.random() * 30)
      });
    }
  
    const splatterGeometry = new THREE.CircleGeometry(0.2 + Math.random() * 0.2, 16);
    const splatterMaterial = new THREE.MeshBasicMaterial({
      color: 0x800000,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    const splatter = new THREE.Mesh(splatterGeometry, splatterMaterial);
    splatter.position.copy(direction.clone().negate().multiplyScalar(0.05));
    splatter.lookAt(position.clone().add(direction.clone().negate()));
    splatter.rotation.z = Math.random() * Math.PI * 2;
    splatter.scale.x = 0.7 + Math.random() * 0.6;
    splatter.scale.y = 0.7 + Math.random() * 0.6;
    impactGroup.add(splatter);
  
    const duration = 1000;
    const startTime = performance.now();
  
    function animateImpact(timestamp) {
      const elapsed = timestamp - startTime;
      const progress = elapsed / duration;
      if (progress < 1) {
        flash.scale.multiplyScalar(0.95);
        flashMaterial.opacity = 0.8 * (1 - progress);
        const ringScale = 1 + progress * 8;
        ring.scale.set(ringScale, ringScale, 1);
        ringMaterial.opacity = 0.7 * (1 - progress);
        particles.forEach(p => {
          if (p.life > 0) {
            p.mesh.position.add(p.velocity);
            p.velocity.y -= p.gravity;
            p.velocity.multiplyScalar(0.96);
            p.mesh.rotation.x += p.rotationSpeed.x;
            p.mesh.rotation.y += p.rotationSpeed.y;
            p.mesh.rotation.z += p.rotationSpeed.z;
            p.mesh.material.opacity = (p.life / 60) * 0.8;
            p.life--;
          } else {
            impactGroup.remove(p.mesh);
          }
        });
        if (splatter.material.opacity > 0.1) {
          splatter.material.opacity = 0.8 * (1 - progress * 0.5);
        }
        requestAnimationFrame(animateImpact);
      } else {
        scene.remove(impactGroup);
        disposeHierarchy(impactGroup);
      }
    }
    requestAnimationFrame(animateImpact);
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
   * Enhanced shell ejection with realistic physics.
   * @param {Player} player - The player instance.
   * @param {THREE.Scene} scene - The scene to add the shell.
   * @param {SoundManager} soundManager - For playing sound effects.
   */
  export function ejectShell(player, scene, soundManager) {
    const shellGroup = new THREE.Group();
  
    const shellGeometry = new THREE.CylinderGeometry(0.01, 0.015, 0.04, 8);
    const shellMaterial = new THREE.MeshStandardMaterial({
      color: 0xD4AF37,
      metalness: 0.8,
      roughness: 0.2
    });
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    shellGroup.add(shell);
  
    const primerGeometry = new THREE.CircleGeometry(0.006, 8);
    const primerMaterial = new THREE.MeshStandardMaterial({
      color: 0xA0A0A0,
      metalness: 0.7,
      roughness: 0.3
    });
    const primer = new THREE.Mesh(primerGeometry, primerMaterial);
    primer.position.y = -0.02;
    primer.rotation.x = Math.PI / 2;
    shellGroup.add(primer);
  
    const shellStart = player.revolver.getBarrelTipWorldPosition();
    shellGroup.position.copy(shellStart);
    shellGroup.position.x += 0.05;
    shellGroup.position.y -= 0.02;
    scene.add(shellGroup);
  
    const physics = {
      velocity: new THREE.Vector3(
        0.8 + Math.random() * 0.4,
        0.5 + Math.random() * 0.3,
        (Math.random() - 0.5) * 0.2
      ),
      rotationSpeed: new THREE.Vector3(
        Math.random() * 0.2,
        Math.random() * 0.2,
        Math.random() * 0.2
      ),
      gravity: 0.015,
      drag: 0.99
    };
  
    const duration = 2000;
    const startTime = performance.now();
  
    function animateShell(timestamp) {
      const elapsed = timestamp - startTime;
      if (elapsed < duration) {
        shellGroup.position.x += physics.velocity.x * 0.016;
        shellGroup.position.y += physics.velocity.y * 0.016;
        shellGroup.position.z += physics.velocity.z * 0.016;
        physics.velocity.y -= physics.gravity;
        physics.velocity.multiplyScalar(physics.drag);
        shellGroup.rotation.x += physics.rotationSpeed.x;
        shellGroup.rotation.y += physics.rotationSpeed.y;
        shellGroup.rotation.z += physics.rotationSpeed.z;
  
        // Bounce logic on ground impact.
        if (shellGroup.position.y < 0.02 && physics.velocity.y < 0) {
          physics.velocity.y = -physics.velocity.y * 0.6;
          physics.velocity.x *= 0.8;
          physics.velocity.z *= 0.8;
          shellGroup.position.y = 0.02;
          physics.rotationSpeed.x = Math.random() * 0.4;
          physics.rotationSpeed.z = Math.random() * 0.4;
        }
        requestAnimationFrame(animateShell);
      } else {
        scene.remove(shellGroup);
        shellGeometry.dispose();
        shellMaterial.dispose();
        primerGeometry.dispose();
        primerMaterial.dispose();
      }
    }
    requestAnimationFrame(animateShell);
  }
  