/**
 * Initializes game input (keyboard + mouse) and pointer lock.
 * @param {THREE.WebGLRenderer} renderer - The renderer instance.
 * @param {Player} player - The local Player instance (first-person).
 * @param {SoundManager} soundManager - The SoundManager for audio feedback.
 */
export function initInput(renderer, player, soundManager) {
  // Request pointer lock on click
  document.body.addEventListener('click', () => {
    if (document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock();
    }
  });

  // Mouse look
  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === renderer.domElement) {
      const movementX = event.movementX || 0;
      const movementY = event.movementY || 0;

      // Slightly lower sensitivity when aiming
      const sensitivity = player.isAiming ? 0.001 : 0.002;

      // Yaw
      player.group.rotation.y -= movementX * sensitivity;

      // Pitch (limit to avoid flipping)
      player.camera.rotation.x -= movementY * sensitivity;
      player.camera.rotation.x = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, player.camera.rotation.x)
      );
    }
  });

  // Keyboard down
  document.addEventListener('keydown', (event) => {
    switch (event.code) {
      case 'KeyW':
        player.moveForward = true;
        break;
      case 'KeyS':
        player.moveBackward = true;
        break;
      case 'KeyA':
        player.moveLeft = true;
        break;
      case 'KeyD':
        player.moveRight = true;
        break;
      case 'Space':
        if (player.canJump) {
          // If sprinting, jump higher
          player.velocity.y = player.isSprinting ? 15 : 10;
          player.canJump = false;
        }
        break;
      case 'KeyR':
        // Start reload
        player.startReload();
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        // Enable sprinting
        player.isSprinting = true;
        break;
      default:
        break;
    }
  });

  // Keyboard up
  document.addEventListener('keyup', (event) => {
    switch (event.code) {
      case 'KeyW':
        player.moveForward = false;
        break;
      case 'KeyS':
        player.moveBackward = false;
        break;
      case 'KeyA':
        player.moveLeft = false;
        break;
      case 'KeyD':
        player.moveRight = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        // Disable sprinting
        player.isSprinting = false;
        break;
      default:
        break;
    }
  });

  // Mouse down
  document.addEventListener('mousedown', (event) => {
    // Right-click => Aim (only if canAim is true)
    if (event.button === 2 && player.canAim) {
      player.isAiming = true;
      player.revolver.group.visible = true;
      // Optionally show arms in first-person
      if (player.arms) {
        player.arms.setVisible(true);
      }
      // Show crosshair when aiming
      document.getElementById('crosshair').style.display = 'block';

      if (soundManager) {
        soundManager.playSound("aimclick");
      }
    }
    // Left-click => Shoot (only if aiming)
    else if (event.button === 0) {
      if (player.revolver.group.visible && !player.isReloading) {
        player.shoot();
      }
    }
  });

  // Mouse up
  document.addEventListener('mouseup', (event) => {
    // Stop aiming on right-click release
    if (event.button === 2) {
      player.isAiming = false;
      player.revolver.group.visible = false;
      if (player.arms) {
        player.arms.setVisible(false);
      }
      // Hide crosshair when not aiming
      document.getElementById('crosshair').style.display = 'none';
    }
  });

  // Prevent context menu on right-click
  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  // Handle window resize
  window.addEventListener('resize', () => {
    player.camera.aspect = window.innerWidth / window.innerHeight;
    player.camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}