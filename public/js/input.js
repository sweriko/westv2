/**
 * Initializes game input and pointer lock.
 * @param {THREE.WebGLRenderer} renderer - The renderer.
 * @param {Player} player - The player instance.
 * @param {SoundManager} soundManager - The sound manager.
 */
export function initInput(renderer, player, soundManager) {
    document.body.addEventListener('click', () => {
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      }
    });
    
    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement === renderer.domElement) {
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;
        let sensitivity = player.isAiming ? 0.001 : 0.002;
        player.group.rotation.y -= movementX * sensitivity;
        player.camera.rotation.x -= movementY * sensitivity;
        player.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.camera.rotation.x));
      }
    });
    
    document.addEventListener('keydown', (event) => {
      switch(event.code) {
        case 'KeyW': player.moveForward = true; break;
        case 'KeyS': player.moveBackward = true; break;
        case 'KeyA': player.moveLeft = true; break;
        case 'KeyD': player.moveRight = true; break;
        case 'Space': if (player.canJump) { player.velocity.y = 10; player.canJump = false; } break;
        case 'KeyR': player.startReload(); break;
      }
    });
    
    document.addEventListener('keyup', (event) => {
      switch(event.code) {
        case 'KeyW': player.moveForward = false; break;
        case 'KeyS': player.moveBackward = false; break;
        case 'KeyA': player.moveLeft = false; break;
        case 'KeyD': player.moveRight = false; break;
      }
    });
    
    document.addEventListener('mousedown', (event) => {
      if (event.button === 2) {
        player.isAiming = true;
        player.revolver.group.visible = true;
        document.getElementById('crosshair').style.display = 'block';
        if (soundManager) {
          soundManager.playSound("aimclick");
        }
      } else if (event.button === 0) {
        if (player.revolver.group.visible) {
          player.shoot();
        }
      }
    });
    
    document.addEventListener('mouseup', (event) => {
      if (event.button === 2) {
        player.isAiming = false;
        player.revolver.group.visible = false;
        document.getElementById('crosshair').style.display = 'none';
      }
    });
    
    document.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });
    
    window.addEventListener('resize', () => {
      player.camera.aspect = window.innerWidth / window.innerHeight;
      player.camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
  