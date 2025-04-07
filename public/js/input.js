/**
 * Initializes game input (keyboard + mouse) and pointer lock.
 * @param {THREE.WebGLRenderer} renderer - The renderer instance.
 * @param {Player} player - The local Player instance (first-person).
 * @param {SoundManager} soundManager - The SoundManager for audio feedback.
 * @returns {Object} The mobile controls interface if on mobile, otherwise null.
 */

import { isChatInputActive } from './chat.js';

export function initInput(renderer, player, soundManager) {
  // Track if device is mobile
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Variable to store the mobile controls interface
  let mobileControls = null;
  
  // Create touch controls for mobile
  if (isMobile) {
    mobileControls = createMobileControls(player, soundManager);
    
    // Hide all instruction elements on mobile
    hideInstructionsOnMobile();
  }
  
  // Request pointer lock on click (desktop only)
  document.body.addEventListener('click', () => {
    if (!isMobile && document.pointerLockElement !== renderer.domElement) {
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
    // Skip game input if chat is active
    if (isChatInputActive()) return;
    
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
      case 'KeyF':
        // Alternative aiming method - holding F to aim
        if (player.canAim && !player.isFAiming) {
          player.isFAiming = true;
          player.isAiming = true;
          
          // Optionally show arms in first-person
          if (player.arms) {
            player.arms.setVisible(true);
          }
          
          // Show and prepare crosshair for animation
          const crosshair = document.getElementById('crosshair');
          if (crosshair) {
            // Reset any existing animation classes
            crosshair.classList.remove('contract', 'expand', 'expanded');
            crosshair.style.display = 'block';
          }

          if (soundManager) {
            soundManager.playSound("aimclick");
          }
        }
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
    // Skip game input if chat is active
    if (isChatInputActive()) return;
    
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
      case 'KeyF':
        // Stop aiming when F is released (only if F aiming was active)
        if (player.isFAiming) {
          player.isFAiming = false;
          player.isAiming = false;
          
          if (player.arms) {
            player.arms.setVisible(false);
          }
          
          // Play contraction animation before hiding crosshair
          const crosshair = document.getElementById('crosshair');
          if (crosshair) {
            // Reset any existing classes
            crosshair.classList.remove('expand', 'expanded');
            
            // Add contraction animation
            crosshair.classList.add('contract');
            
            // Hide crosshair after animation completes
            setTimeout(() => {
              crosshair.style.display = 'none';
              crosshair.classList.remove('contract');
            }, 250); // Match animation duration
          }
        }
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
    if (event.button === 2) {
      if (player.canAim && !player.isFAiming) {
        // Traditional right-click aiming (only if not already F-aiming)
        player.isAiming = true;
        
        // Optionally show arms in first-person
        if (player.arms) {
          player.arms.setVisible(true);
        }
        
        // Show and prepare crosshair for animation
        const crosshair = document.getElementById('crosshair');
        if (crosshair) {
          // Reset any existing animation classes
          crosshair.classList.remove('contract', 'expand', 'expanded');
          crosshair.style.display = 'block';
          // Animation will be handled in updateAiming
        }

        if (soundManager) {
          soundManager.playSound("aimclick");
        }
      } else if (player.isFAiming) {
        // RMB pressed while F-aiming - prepare for shoot on release
        player.isFRmbPressed = true;
      }
    }
    // Left-click handling
    else if (event.button === 0) {
      if (player.isAiming && !player.isReloading) {
        // Only use hold-to-shoot when F key is being held (F-aiming mode)
        if (player.isFAiming) {
          // F is being held - use hold-to-shoot mode
          player.isLmbPressed = true;
        } else {
          // Standard aiming - shoot immediately on click
          player.shoot();
        }
      }
    }
  });

  // Mouse up
  document.addEventListener('mouseup', (event) => {
    // Handle right mouse button release
    if (event.button === 2) {
      if (player.isFAiming && player.isFRmbPressed) {
        // F + RMB shoot mechanic: shoot on RMB release while holding F
        player.isFRmbPressed = false;
        
        if (!player.isReloading) {
          player.shoot();
        }
      } else if (!player.isFAiming) {
        // Traditional right-click aim release (only if not F-aiming)
        player.isAiming = false;
        
        if (player.arms) {
          player.arms.setVisible(false);
        }
        
        // Play contraction animation before hiding crosshair
        const crosshair = document.getElementById('crosshair');
        if (crosshair) {
          // Reset any existing classes
          crosshair.classList.remove('expand', 'expanded');
          
          // Add contraction animation
          crosshair.classList.add('contract');
          
          // Hide crosshair after animation completes
          setTimeout(() => {
            crosshair.style.display = 'none';
            crosshair.classList.remove('contract');
          }, 250); // Match animation duration
        }
      }
    }
    // Left mouse button release
    else if (event.button === 0) {
      if (player.isLmbPressed && player.isAiming && !player.isReloading) {
        // Only shoot on release when in F-aiming mode
        if (player.isFAiming) {
          player.shoot();
        }
        player.isLmbPressed = false;
      }
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
    
    // Check for device orientation
    checkOrientation();
  });
  
  // Handle orientation change for mobile
  window.addEventListener('orientationchange', checkOrientation);
  
  // Initial orientation check
  checkOrientation();

  // Ensure fullscreen with no white bars
  ensureFullscreen();
  
  // Set up a resize listener to maintain fullscreen when orientation changes
  window.addEventListener('resize', ensureFullscreen);

  // Return the mobile controls interface if on mobile
  return mobileControls;
}

/**
 * Hide all instruction elements and portals on mobile
 */
function hideInstructionsOnMobile() {
  // Hide all instruction elements
  const instructionElements = [
    document.getElementById('portal-instructions'),
    document.getElementById('proper-shootout-instructions'),
    document.getElementById('reload-message'),
    document.getElementById('quick-draw-message'),
    document.getElementById('quick-draw-countdown'),
    document.getElementById('health-counter'),
    document.getElementById('health-bar-container')
  ];
  
  // Hide each element if it exists
  instructionElements.forEach(element => {
    if (element) {
      element.style.display = 'none';
    }
  });
  
  // Create a mutation observer to catch any new instruction elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node.nodeType === 1) { // Element node
            if (node.id && instructionElements.includes(node.id)) {
              node.style.display = 'none';
            } else if (node.className && node.className.includes('portal-instructions')) {
              node.style.display = 'none';
            }
          }
        }
      }
    });
  });
  
  // Start observing the document
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * Create touch controls for mobile devices with improved handling
 * @param {Player} player - The Player instance
 * @param {SoundManager} soundManager - The SoundManager instance for audio feedback
 */
function createMobileControls(player, soundManager) {
  // Position constants for easy adjustment
  const CONSTANTS = {
    // Jump button positioning
    JUMP_BUTTON: {
      BOTTOM: 100,  // Distance from bottom edge
      RIGHT: 40,   // Distance from right edge
      SIZE: 60     // Button size
    },
    // Left control hint (movement joystick)
    LEFT_JOYSTICK: {
      BOTTOM: 30,  // Distance from bottom edge
      LEFT: 90,    // Distance from left edge
      SIZE: 120    // Joystick size
    },
    // Right control hint (aim/shoot joystick)
    RIGHT_JOYSTICK: {
      BOTTOM: 30,  // Distance from bottom edge
      RIGHT: 135,   // Distance from right edge
      SIZE: 100    // Joystick size
    },
    // Camera area - not using a dedicated button, instead using the area above the aim joystick
    CAMERA_AREA: {
      Y_OFFSET: 130,  // Distance above the aim joystick
      HEIGHT: 150,    // Height of the camera area
      WIDTH: 120      // Width of the camera area (matching the aim joystick)
    },
    // Sensitivities
    MOVE_THRESHOLD: 10,                // Minimum movement in pixels before registering movement
    MOVE_SENSITIVITY: 0.15,            // Movement speed multiplier
    LOOK_SENSITIVITY: 0.4,             // Look speed multiplier for aiming
    CAMERA_ROTATION_SENSITIVITY: 0.7   // Camera rotation sensitivity for view changes
  };

  // Single large invisible overlay for touch input
  const touchOverlay = document.createElement('div');
  touchOverlay.id = 'touch-overlay';
  touchOverlay.style.position = 'fixed';
  touchOverlay.style.top = '0';
  touchOverlay.style.left = '0';
  touchOverlay.style.width = '100%';
  touchOverlay.style.height = '100%';
  touchOverlay.style.zIndex = '999';
  touchOverlay.style.touchAction = 'none'; // Prevents browser handling of touches
  touchOverlay.style.backgroundColor = 'transparent';
  document.body.appendChild(touchOverlay);
  
  // Create jump button
  const jumpButton = document.createElement('div');
  jumpButton.id = 'jump-button';
  jumpButton.className = 'mobile-button';
  jumpButton.innerText = '↑';
  jumpButton.style.position = 'fixed';
  jumpButton.style.bottom = `${CONSTANTS.JUMP_BUTTON.BOTTOM}px`;
  jumpButton.style.right = `${CONSTANTS.JUMP_BUTTON.RIGHT}px`;
  jumpButton.style.width = `${CONSTANTS.JUMP_BUTTON.SIZE}px`;
  jumpButton.style.height = `${CONSTANTS.JUMP_BUTTON.SIZE}px`;
  jumpButton.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
  jumpButton.style.border = '2px solid rgba(255, 255, 255, 0.5)';
  jumpButton.style.borderRadius = '50%';
  jumpButton.style.display = 'flex';
  jumpButton.style.justifyContent = 'center';
  jumpButton.style.alignItems = 'center';
  jumpButton.style.fontSize = '24px';
  jumpButton.style.fontWeight = 'bold';
  jumpButton.style.color = 'white';
  jumpButton.style.zIndex = '1000'; // Ensure it's above other elements
  
  // Create reload button (initially hidden, shows when out of ammo)
  const reloadButton = document.createElement('div');
  reloadButton.id = 'reload-button';
  reloadButton.className = 'mobile-button';
  reloadButton.innerText = 'R';
  reloadButton.style.position = 'fixed';
  reloadButton.style.top = '50%';
  reloadButton.style.left = '50%';
  reloadButton.style.transform = 'translate(-50%, -50%)';
  reloadButton.style.width = '80px';
  reloadButton.style.height = '80px';
  reloadButton.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
  reloadButton.style.border = '2px solid rgba(255, 255, 255, 0.7)';
  reloadButton.style.borderRadius = '50%';
  reloadButton.style.display = 'none'; // Hidden by default
  reloadButton.style.justifyContent = 'center';
  reloadButton.style.alignItems = 'center';
  reloadButton.style.fontSize = '28px';
  reloadButton.style.fontWeight = 'bold';
  reloadButton.style.color = 'white';
  reloadButton.style.zIndex = '1002';
  
  // Create quickdraw invite button (initially hidden, shows when near players)
  const inviteButton = document.createElement('div');
  inviteButton.id = 'invite-button';
  inviteButton.className = 'mobile-button';
  inviteButton.innerText = 'E';
  inviteButton.style.position = 'fixed';
  inviteButton.style.bottom = '140px';
  inviteButton.style.right = '30px';
  inviteButton.style.width = '70px';
  inviteButton.style.height = '70px';
  inviteButton.style.backgroundColor = 'rgba(0, 255, 0, 0.5)';
  inviteButton.style.border = '2px solid rgba(255, 255, 255, 0.7)';
  inviteButton.style.borderRadius = '50%';
  inviteButton.style.display = 'none'; // Hidden by default
  inviteButton.style.justifyContent = 'center';
  inviteButton.style.alignItems = 'center';
  inviteButton.style.fontSize = '28px';
  inviteButton.style.fontWeight = 'bold';
  inviteButton.style.color = 'white';
  inviteButton.style.zIndex = '1002';
  
  // Create quickdraw accept button (initially hidden, shows when receiving invites)
  const acceptButton = document.createElement('div');
  acceptButton.id = 'accept-button';
  acceptButton.className = 'mobile-button';
  acceptButton.innerHTML = '<span style="font-size: 14px; position: absolute; top: -20px; color: white;">accept</span>A';
  acceptButton.style.position = 'fixed';
  acceptButton.style.top = '40%';
  acceptButton.style.left = '40%';
  acceptButton.style.width = '70px';
  acceptButton.style.height = '70px';
  acceptButton.style.backgroundColor = 'rgba(0, 255, 0, 0.5)';
  acceptButton.style.border = '2px solid rgba(255, 255, 255, 0.7)';
  acceptButton.style.borderRadius = '50%';
  acceptButton.style.display = 'none'; // Hidden by default
  acceptButton.style.justifyContent = 'center';
  acceptButton.style.alignItems = 'center';
  acceptButton.style.fontSize = '28px';
  acceptButton.style.fontWeight = 'bold';
  acceptButton.style.color = 'white';
  acceptButton.style.zIndex = '1003';
  
  // Create quickdraw decline button (initially hidden, shows when receiving invites)
  const declineButton = document.createElement('div');
  declineButton.id = 'decline-button';
  declineButton.className = 'mobile-button';
  declineButton.innerHTML = '<span style="font-size: 14px; position: absolute; top: -20px; color: white;">decline</span>D';
  declineButton.style.position = 'fixed';
  declineButton.style.top = '40%';
  declineButton.style.left = '60%';
  declineButton.style.width = '70px';
  declineButton.style.height = '70px';
  declineButton.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
  declineButton.style.border = '2px solid rgba(255, 255, 255, 0.7)';
  declineButton.style.borderRadius = '50%';
  declineButton.style.display = 'none'; // Hidden by default
  declineButton.style.justifyContent = 'center';
  declineButton.style.alignItems = 'center';
  declineButton.style.fontSize = '28px';
  declineButton.style.fontWeight = 'bold';
  declineButton.style.color = 'white';
  declineButton.style.zIndex = '1003';
  
  // Create visual joystick hint for movement (left side)
  const leftControlHint = document.createElement('div');
  leftControlHint.id = 'left-control-hint';
  leftControlHint.className = 'control-hint';
  leftControlHint.style.position = 'fixed';
  leftControlHint.style.bottom = `${CONSTANTS.LEFT_JOYSTICK.BOTTOM}px`;
  leftControlHint.style.left = `${CONSTANTS.LEFT_JOYSTICK.LEFT}px`;
  leftControlHint.style.width = `${CONSTANTS.LEFT_JOYSTICK.SIZE}px`;
  leftControlHint.style.height = `${CONSTANTS.LEFT_JOYSTICK.SIZE}px`;
  leftControlHint.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
  leftControlHint.style.borderRadius = '50%';
  leftControlHint.style.border = '2px dashed rgba(255, 255, 255, 0.3)';
  leftControlHint.style.zIndex = '998';
  leftControlHint.style.pointerEvents = 'none';
  
  // Create inner knob for left joystick (walk)
  const leftJoystickKnob = document.createElement('div');
  leftJoystickKnob.id = 'left-joystick-knob';
  leftJoystickKnob.className = 'joystick-knob';
  leftJoystickKnob.style.position = 'absolute';
  leftJoystickKnob.style.width = `${CONSTANTS.LEFT_JOYSTICK.SIZE * 0.4}px`; // 40% of the size of the outer circle
  leftJoystickKnob.style.height = `${CONSTANTS.LEFT_JOYSTICK.SIZE * 0.4}px`;
  leftJoystickKnob.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
  leftJoystickKnob.style.borderRadius = '50%';
  leftJoystickKnob.style.top = '50%';
  leftJoystickKnob.style.left = '50%';
  leftJoystickKnob.style.transform = 'translate(-50%, -50%)';
  leftJoystickKnob.style.zIndex = '999';
  leftJoystickKnob.style.pointerEvents = 'none';
  leftControlHint.appendChild(leftJoystickKnob);
  
  // Create visual joystick hint for aiming (right side)
  const rightControlHint = document.createElement('div');
  rightControlHint.id = 'right-control-hint';
  rightControlHint.className = 'control-hint';
  rightControlHint.style.position = 'fixed';
  rightControlHint.style.bottom = `${CONSTANTS.RIGHT_JOYSTICK.BOTTOM}px`;
  rightControlHint.style.right = `${CONSTANTS.RIGHT_JOYSTICK.RIGHT}px`;
  rightControlHint.style.width = `${CONSTANTS.RIGHT_JOYSTICK.SIZE}px`;
  rightControlHint.style.height = `${CONSTANTS.RIGHT_JOYSTICK.SIZE}px`;
  rightControlHint.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
  rightControlHint.style.borderRadius = '50%';
  rightControlHint.style.border = '2px dashed rgba(255, 255, 255, 0.3)';
  rightControlHint.style.zIndex = '998';
  rightControlHint.style.pointerEvents = 'none';
  
  // Create inner knob for right joystick (aim)
  const rightJoystickKnob = document.createElement('div');
  rightJoystickKnob.id = 'right-joystick-knob';
  rightJoystickKnob.className = 'joystick-knob';
  rightJoystickKnob.style.position = 'absolute';
  rightJoystickKnob.style.width = `${CONSTANTS.RIGHT_JOYSTICK.SIZE * 0.4}px`; // 40% of the size of the outer circle
  rightJoystickKnob.style.height = `${CONSTANTS.RIGHT_JOYSTICK.SIZE * 0.4}px`;
  rightJoystickKnob.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
  rightJoystickKnob.style.borderRadius = '50%';
  rightJoystickKnob.style.top = '50%';
  rightJoystickKnob.style.left = '50%';
  rightJoystickKnob.style.transform = 'translate(-50%, -50%)';
  rightJoystickKnob.style.zIndex = '999';
  rightJoystickKnob.style.pointerEvents = 'none';
  
  // Add bullet image to right joystick knob
  const bulletImg = document.createElement('img');
  bulletImg.src = 'models/aimjoystick.png';
  bulletImg.style.width = '70%';
  bulletImg.style.height = '70%';
  bulletImg.style.position = 'absolute';
  bulletImg.style.top = '50%';
  bulletImg.style.left = '50%';
  bulletImg.style.transform = 'translate(-50%, -50%)';
  bulletImg.style.pointerEvents = 'none';
  rightJoystickKnob.appendChild(bulletImg);
  
  rightControlHint.appendChild(rightJoystickKnob);
  
  // Create visual indicator for the camera area (above the aim joystick)
  const cameraControlHint = document.createElement('div');
  cameraControlHint.id = 'camera-control-hint';
  cameraControlHint.style.position = 'fixed';
  cameraControlHint.style.top = '0';
  cameraControlHint.style.left = '0';
  cameraControlHint.style.width = '100%';
  cameraControlHint.style.height = '100%';
  cameraControlHint.style.backgroundColor = 'transparent';
  cameraControlHint.style.border = 'none';
  cameraControlHint.style.zIndex = '900'; // Below other controls
  cameraControlHint.style.pointerEvents = 'none';
  cameraControlHint.innerText = '';
  
  // Create orientation message
  const orientationMsg = document.createElement('div');
  orientationMsg.id = 'orientation-message';
  orientationMsg.innerText = 'Please rotate to landscape mode';
  orientationMsg.style.position = 'fixed';
  orientationMsg.style.top = '0';
  orientationMsg.style.left = '0';
  orientationMsg.style.width = '100%';
  orientationMsg.style.height = '100%';
  orientationMsg.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  orientationMsg.style.color = 'white';
  orientationMsg.style.display = 'flex';
  orientationMsg.style.justifyContent = 'center';
  orientationMsg.style.alignItems = 'center';
  orientationMsg.style.fontSize = '24px';
  orientationMsg.style.zIndex = '2000';
  orientationMsg.style.display = 'none';
  
  // Add elements to document
  document.body.appendChild(jumpButton);
  document.body.appendChild(reloadButton);
  document.body.appendChild(inviteButton);
  document.body.appendChild(acceptButton);
  document.body.appendChild(declineButton);
  document.body.appendChild(leftControlHint);
  document.body.appendChild(rightControlHint);
  document.body.appendChild(cameraControlHint);
  document.body.appendChild(orientationMsg);
  
  // Variables to track touch state
  let leftSideTouchId = null;
  let rightSideTouchId = null;
  let cameraTouchId = null;
  let leftStartPos = { x: 0, y: 0 };
  let rightStartPos = { x: 0, y: 0 };
  let cameraStartPos = { x: 0, y: 0 };
  let rightTouchStartTime = 0;
  let screenWidth = window.innerWidth;
  let isAimingWithTouch = false;
  
  // Initial state of player
  player.moveForward = false;
  player.moveBackward = false;
  player.moveLeft = false;
  player.moveRight = false;
  player.isAiming = false;
  
  // Mobile users should be sprinting by default
  player.isSprinting = true;
  
  // Override auto-reload with manual reload for mobile
  const originalShoot = player.shoot;
  player.shoot = function() {
    const result = originalShoot.apply(this, arguments);
    
    // Show reload button when out of bullets instead of auto-reloading
    if (this.bullets <= 0 && !this.isReloading) {
      reloadButton.style.display = 'flex';
    }
    
    return result;
  };
  
  // Function to check if player is near another player for quickdraw
  function checkForNearbyPlayers() {
    // This function should be called from the game loop to show/hide the invite button
    // For now, we'll just add the interface - the actual implementation will need
    // to be connected to the multiplayer system
  }
  
  // Function to handle incoming quickdraw invites
  function showQuickdrawInvite() {
    acceptButton.style.display = 'flex';
    declineButton.style.display = 'flex';
  }
  
  // Function to hide quickdraw invite buttons
  function hideQuickdrawInvite() {
    acceptButton.style.display = 'none';
    declineButton.style.display = 'none';
  }
  
  // Ensure audio context is resumed for mobile
  function ensureAudioContextResumed() {
    if (soundManager && soundManager.audioContext && 
        soundManager.audioContext.state !== 'running') {
      // Resume the audio context on first user interaction
      soundManager.audioContext.resume().then(() => {
        console.log('AudioContext resumed successfully');
        // Play a silent sound to fully activate audio
        if (soundManager.buffers['aimclick']) {
          const silentSound = soundManager.playSound('aimclick', 0, 0.01);
          if (silentSound && silentSound.gainNode) {
            silentSound.gainNode.gain.value = 0.01;
          }
        }
      }).catch(err => {
        console.error('Failed to resume AudioContext:', err);
      });
    }
  }
  
  // Touch start handler
  touchOverlay.addEventListener('touchstart', (e) => {
    // Ensure audio is activated on first touch
    ensureAudioContextResumed();
    
    // Dismiss any instructions/info banner that might be visible
    const instructionsElement = document.getElementById('instructions');
    if (instructionsElement && instructionsElement.parentNode) {
      instructionsElement.parentNode.removeChild(instructionsElement);
    }
    
    // Get joystick element positions for accurate activation areas
    const leftJoystickRect = leftControlHint.getBoundingClientRect();
    const rightJoystickRect = rightControlHint.getBoundingClientRect();
    const jumpButtonRect = jumpButton.getBoundingClientRect();
    
    // Get chat area if it exists
    let chatRect = null;
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      chatRect = chatContainer.getBoundingClientRect();
    }
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const x = touch.clientX;
      const y = touch.clientY;
      
      // Get the screen dimensions
      const screenHeight = window.innerHeight;
      
      // Skip if touch is on jump button to avoid interfering with its handler
      if (x >= jumpButtonRect.left && 
          x <= jumpButtonRect.right &&
          y >= jumpButtonRect.top && 
          y <= jumpButtonRect.bottom) {
        continue;
      }
      
      // Skip if touch is in chat area
      if (chatRect && 
          x >= chatRect.left && 
          x <= chatRect.right && 
          y >= chatRect.top && 
          y <= chatRect.bottom) {
        continue;
      }
      
      // Check if touch is in left joystick area (movement)
      if (x >= leftJoystickRect.left && 
          x <= leftJoystickRect.right &&
          y >= leftJoystickRect.top && 
          y <= leftJoystickRect.bottom) {
        
        if (leftSideTouchId === null) {
          leftSideTouchId = touch.identifier;
          leftStartPos.x = x;
          leftStartPos.y = y;
          
          // Visual feedback - highlight active control
          leftControlHint.style.borderColor = 'rgba(255, 255, 255, 0.7)';
          leftControlHint.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
          
          // Do not move the entire joystick anymore
          // Just keep it in place and let only the knob move
        }
      } 
      // Check if touch is in right joystick area (aim/shoot)
      else if (x >= rightJoystickRect.left && 
               x <= rightJoystickRect.right &&
               y >= rightJoystickRect.top && 
               y <= rightJoystickRect.bottom) {
        
        if (rightSideTouchId === null) {
          rightSideTouchId = touch.identifier;
          rightStartPos.x = x;
          rightStartPos.y = y;
          rightTouchStartTime = Date.now();
          
          // Visual feedback - highlight active control
          rightControlHint.style.borderColor = 'rgba(255, 255, 255, 0.7)';
          rightControlHint.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
          
          // Do not move the entire joystick anymore
          // Just keep it in place and let only the knob move
          
          // Start aiming immediately on touch
          player.isAiming = true;
          isAimingWithTouch = true;
          player.isLmbPressed = true; // Mark that touch is being held for shooting
          
          // Show and prepare crosshair for animation
          const crosshair = document.getElementById('crosshair');
          if (crosshair) {
            // Reset any existing animation classes
            crosshair.classList.remove('contract', 'expand', 'expanded');
            crosshair.style.display = 'block';
          }
          
          if (soundManager) {
            soundManager.playSound("aimclick");
          }
        }
      }
      // If not on any specific control, use touch for camera control
      else if (cameraTouchId === null) {
        cameraTouchId = touch.identifier;
        cameraStartPos.x = x;
        cameraStartPos.y = y;
      }
    }
    e.preventDefault();
  });
  
  // Touch move handler
  touchOverlay.addEventListener('touchmove', (e) => {
    // Dismiss any instructions/info banner that might be visible
    const instructionsElement = document.getElementById('instructions');
    if (instructionsElement && instructionsElement.parentNode) {
      instructionsElement.parentNode.removeChild(instructionsElement);
    }
    
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      
      // Handle left side touch (movement)
      if (touch.identifier === leftSideTouchId) {
        const deltaX = touch.clientX - leftStartPos.x;
        const deltaY = touch.clientY - leftStartPos.y;
        
        // Move the joystick knob
        const leftJoystickKnob = document.getElementById('left-joystick-knob');
        if (leftJoystickKnob) {
          // Calculate the distance from center
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          // Get the max distance the knob can move (radius of outer circle - radius of knob)
          const maxDistance = CONSTANTS.LEFT_JOYSTICK.SIZE * 0.3; // 30% of the outer circle size
          
          if (distance > 0) {
            // Normalize the position to the max distance
            const normalizedDistance = Math.min(distance, maxDistance);
            const normalizedX = deltaX * (normalizedDistance / distance);
            const normalizedY = deltaY * (normalizedDistance / distance);
            
            // Move the knob from center position
            leftJoystickKnob.style.transform = `translate(calc(-50% + ${normalizedX}px), calc(-50% + ${normalizedY}px))`;
          }
        }
        
        // Only apply movement if joystick is moved beyond threshold
        if (Math.abs(deltaX) > CONSTANTS.MOVE_THRESHOLD || Math.abs(deltaY) > CONSTANTS.MOVE_THRESHOLD) {
          // Forward/backward based on vertical movement
          player.moveForward = deltaY < -CONSTANTS.MOVE_THRESHOLD;
          player.moveBackward = deltaY > CONSTANTS.MOVE_THRESHOLD;
          
          // Left/right based on horizontal movement
          player.moveLeft = deltaX < -CONSTANTS.MOVE_THRESHOLD;
          player.moveRight = deltaX > CONSTANTS.MOVE_THRESHOLD;
        }
      }
      
      // Handle right side touch (aiming + camera rotation)
      if (touch.identifier === rightSideTouchId) {
        const deltaX = touch.clientX - rightStartPos.x;
        const deltaY = touch.clientY - rightStartPos.y;
        
        // Move the joystick knob
        const rightJoystickKnob = document.getElementById('right-joystick-knob');
        if (rightJoystickKnob) {
          // Calculate the distance from center
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          // Get the max distance the knob can move (radius of outer circle - radius of knob)
          const maxDistance = CONSTANTS.RIGHT_JOYSTICK.SIZE * 0.3; // 30% of the outer circle size
          
          if (distance > 0) {
            // Normalize the position to the max distance
            const normalizedDistance = Math.min(distance, maxDistance);
            const normalizedX = deltaX * (normalizedDistance / distance);
            const normalizedY = deltaY * (normalizedDistance / distance);
            
            // Move the knob from center position
            rightJoystickKnob.style.transform = `translate(calc(-50% + ${normalizedX}px), calc(-50% + ${normalizedY}px))`;
          }
        }
        
        // Apply camera rotation - allow for 360° movement
        player.group.rotation.y -= deltaX * CONSTANTS.LOOK_SENSITIVITY * 0.01;
        player.camera.rotation.x -= deltaY * CONSTANTS.LOOK_SENSITIVITY * 0.01;
        
        // Limit vertical rotation to avoid flipping
        player.camera.rotation.x = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, player.camera.rotation.x)
        );
        
        // Update starting position to prevent continuous rotation
        rightStartPos.x = touch.clientX;
        rightStartPos.y = touch.clientY;
      }
      
      // Handle camera area touch (separate from aiming)
      if (touch.identifier === cameraTouchId) {
        const deltaX = touch.clientX - cameraStartPos.x;
        const deltaY = touch.clientY - cameraStartPos.y;
        
        // Apply full 360° camera rotation based on touch movement
        player.group.rotation.y -= deltaX * CONSTANTS.CAMERA_ROTATION_SENSITIVITY * 0.01;
        player.camera.rotation.x -= deltaY * CONSTANTS.CAMERA_ROTATION_SENSITIVITY * 0.01;
        
        // Limit vertical rotation to avoid flipping
        player.camera.rotation.x = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, player.camera.rotation.x)
        );
        
        // Update starting position to prevent continuous rotation
        cameraStartPos.x = touch.clientX;
        cameraStartPos.y = touch.clientY;
      }
    }
    e.preventDefault();
  });
  
  // Touch end handler
  touchOverlay.addEventListener('touchend', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      
      // Handle left side touch end (movement)
      if (touch.identifier === leftSideTouchId) {
        leftSideTouchId = null;
        
        // Reset movement flags
        player.moveForward = false;
        player.moveBackward = false;
        player.moveLeft = false;
        player.moveRight = false;
        
        // Reset visual feedback
        leftControlHint.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        leftControlHint.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
        
        // Reset joystick knob position
        const leftJoystickKnob = document.getElementById('left-joystick-knob');
        if (leftJoystickKnob) {
          leftJoystickKnob.style.transform = 'translate(-50%, -50%)';
        }
      }
      
      // Handle right side touch end (shooting on release)
      if (touch.identifier === rightSideTouchId) {
        // Shoot when releasing the touch if still aiming
        if (isAimingWithTouch && player.isAiming && !player.isReloading) {
          player.shoot();
        }
        player.isLmbPressed = false;
        
        // Stop aiming
        player.isAiming = false;
        isAimingWithTouch = false;
        
        // Play contraction animation before hiding crosshair
        const crosshair = document.getElementById('crosshair');
        if (crosshair) {
          // Reset any existing classes
          crosshair.classList.remove('expand', 'expanded');
          
          // Add contraction animation
          crosshair.classList.add('contract');
          
          // Hide crosshair after animation completes
          setTimeout(() => {
            crosshair.style.display = 'none';
            crosshair.classList.remove('contract');
          }, 250); // Match animation duration
        }
        
        // Reset visual feedback
        rightControlHint.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        rightControlHint.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
        
        // Reset joystick knob position
        const rightJoystickKnob = document.getElementById('right-joystick-knob');
        if (rightJoystickKnob) {
          rightJoystickKnob.style.transform = 'translate(-50%, -50%)';
        }
        
        rightSideTouchId = null;
      }
      
      // Handle camera touch end
      if (touch.identifier === cameraTouchId) {
        cameraTouchId = null;
      }
    }
    e.preventDefault();
  });
  
  // Touch cancel handler - similar updates
  touchOverlay.addEventListener('touchcancel', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      
      // Reset left side touch (movement)
      if (touch.identifier === leftSideTouchId) {
        leftSideTouchId = null;
        player.moveForward = false;
        player.moveBackward = false;
        player.moveLeft = false;
        player.moveRight = false;
        
        // Reset visual feedback
        leftControlHint.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        leftControlHint.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
        
        // Reset joystick knob position
        const leftJoystickKnob = document.getElementById('left-joystick-knob');
        if (leftJoystickKnob) {
          leftJoystickKnob.style.transform = 'translate(-50%, -50%)';
        }
      }
      
      // Reset right side touch (aiming)
      if (touch.identifier === rightSideTouchId) {
        rightSideTouchId = null;
        player.isAiming = false;
        isAimingWithTouch = false;
        
        // Clear any pressed state
        if (player.isLmbPressed) {
          player.isLmbPressed = false;
        }
        
        // Reset visual feedback
        rightControlHint.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        rightControlHint.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
        
        // Reset joystick knob position
        const rightJoystickKnob = document.getElementById('right-joystick-knob');
        if (rightJoystickKnob) {
          rightJoystickKnob.style.transform = 'translate(-50%, -50%)';
        }
        
        // Play contraction animation before hiding crosshair
        const crosshair = document.getElementById('crosshair');
        if (crosshair) {
          // Reset any existing classes
          crosshair.classList.remove('expand', 'expanded');
          
          // Add contraction animation
          crosshair.classList.add('contract');
          
          // Hide crosshair after animation completes
          setTimeout(() => {
            crosshair.style.display = 'none';
            crosshair.classList.remove('contract');
          }, 250);
        }
      }
      
      // Reset camera rotation touch
      if (touch.identifier === cameraTouchId) {
        cameraTouchId = null;
      }
    }
    e.preventDefault();
  });
  
  // Reload button handler
  reloadButton.addEventListener('touchstart', (e) => {
    if (!player.isReloading && player.bullets < player.maxBullets) {
      player.startReload();
      reloadButton.style.display = 'none';
    }
    e.preventDefault();
  });
  
  // Quickdraw invite button handler
  inviteButton.addEventListener('touchstart', (e) => {
    // Send quickdraw invite to nearby player
    if (window.quickDraw && typeof window.quickDraw.sendChallenge === 'function') {
      window.quickDraw.sendChallenge();
    }
    e.preventDefault();
  });
  
  // Quickdraw accept button handler
  acceptButton.addEventListener('touchstart', (e) => {
    // Accept quickdraw invite
    if (window.quickDraw && typeof window.quickDraw.acceptChallenge === 'function') {
      window.quickDraw.acceptChallenge();
    }
    hideQuickdrawInvite();
    e.preventDefault();
  });
  
  // Quickdraw decline button handler
  declineButton.addEventListener('touchstart', (e) => {
    // Decline quickdraw invite
    if (window.quickDraw && typeof window.quickDraw.declineChallenge === 'function') {
      window.quickDraw.declineChallenge();
    }
    hideQuickdrawInvite();
    e.preventDefault();
  });
  
  // Jump button handler
  jumpButton.addEventListener('touchstart', (e) => {
    if (player.canJump) {
      player.velocity.y = player.isSprinting ? 15 : 10;
      player.canJump = false;
    }
    e.preventDefault();
  });
  
  // Handle window resize to update the screen width calculation
  window.addEventListener('resize', () => {
    screenWidth = window.innerWidth;
  });
  
  // Return methods to be called from the game loop
  return {
    checkForNearbyPlayers: function(nearbyPlayersExist) {
      // Show/hide the invite button based on whether there are nearby players
      inviteButton.style.display = nearbyPlayersExist ? 'flex' : 'none';
    },
    showQuickdrawInvite: showQuickdrawInvite,
    hideQuickdrawInvite: hideQuickdrawInvite,
    // Export constants so they can be adjusted externally if needed
    getConstants: function() {
      return CONSTANTS;
    }
  };
}

/**
 * Check device orientation and display warning if not in landscape mode on mobile
 */
function checkOrientation() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile) {
    const orientationMsg = document.getElementById('orientation-message');
    
    // Check if we're in portrait mode
    if (window.innerHeight > window.innerWidth) {
      orientationMsg.style.display = 'flex';
    } else {
      orientationMsg.style.display = 'none';
    }
  }
}

// Function to update health display - modified to handle missing health counter
function updateHealthDisplay(health, maxHealth) {
  // Skip the health counter update since we removed it from the UI
  
  // Only update health bar if it exists
  const healthBar = document.getElementById('health-bar');
  if (healthBar) {
    const healthPercent = Math.max(0, health / maxHealth * 100);
    healthBar.style.width = `${healthPercent}%`;
    
    // Change color based on health level
    if (healthPercent > 66) {
      healthBar.style.backgroundColor = '#4CAF50'; // Green
    } else if (healthPercent > 33) {
      healthBar.style.backgroundColor = '#FFC107'; // Yellow
    } else {
      healthBar.style.backgroundColor = '#F44336'; // Red
    }
  }
}

function isMobileDevice() {
  return (window.innerWidth <= 1024 || 'ontouchstart' in window || navigator.maxTouchPoints > 0);
}

// This function ensures the game takes up the full screen space with no white bars
function ensureFullscreen() {
  // Set body and html to full viewport dimensions
  document.documentElement.style.width = '100%';
  document.documentElement.style.height = '100%';
  document.body.style.width = '100%';
  document.body.style.height = '100%';
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.overflow = 'hidden';
  document.body.style.backgroundColor = '#000';
  document.body.style.position = 'fixed';
  
  // Set game container to full viewport
  const gameContainer = document.getElementById('game-container');
  if (gameContainer) {
    gameContainer.style.position = 'fixed';
    gameContainer.style.top = '0';
    gameContainer.style.left = '0';
    gameContainer.style.right = '0';
    gameContainer.style.bottom = '0';
    gameContainer.style.width = '100%';
    gameContainer.style.height = '100%';
    gameContainer.style.margin = '0';
    gameContainer.style.padding = '0';
    gameContainer.style.overflow = 'hidden';
    gameContainer.style.backgroundColor = '#000';
  }
  
  // Make sure canvas fills the screen
  const canvas = document.querySelector('canvas');
  if (canvas) {
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.right = '0';
    canvas.style.bottom = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.margin = '0';
    canvas.style.padding = '0';
    canvas.style.display = 'block';
    canvas.style.backgroundColor = '#000';
    
    // iOS Safari specific fixes
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      // Fix for iOS notch and home indicator
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
      
      // Prevent elastic scrolling
      document.addEventListener('touchmove', (e) => {
        if (e.scale !== 1) {
          e.preventDefault();
        }
      }, { passive: false });
      
      // Force scroll to top on resize/orientation change
      window.addEventListener('resize', () => {
        window.scrollTo(0, 0);
        document.body.style.height = window.innerHeight + 'px';
        canvas.style.height = window.innerHeight + 'px';
      });
      
      // Initial height fix
      setTimeout(() => {
        window.scrollTo(0, 0);
        document.body.style.height = window.innerHeight + 'px';
        canvas.style.height = window.innerHeight + 'px';
      }, 300);
    }
  }
}

/**
 * Create optimized smoke effect for mobile
 * @param {HTMLElement} drawCircle - The draw circle element
 */
function createOptimizedSmokeEffect(drawCircle) {
  if (isMobileDevice()) {
    // Use mobile-optimized version
    drawCircle.style.display = 'block';
    drawCircle.style.width = '150px';
    drawCircle.style.height = '150px';
    drawCircle.style.borderWidth = '4px';
    drawCircle.style.opacity = '0.7';
    drawCircle.style.boxShadow = '0 0 10px rgba(255, 0, 0, 0.5)';
    // Remove desktop animation and add mobile-optimized animation
    drawCircle.classList.remove('draw-circle-animation');
    drawCircle.classList.add('draw-circle-animation-mobile');
  } else {
    // Desktop full version
    drawCircle.style.display = 'block';
    drawCircle.style.width = '300px';
    drawCircle.style.height = '300px';
    drawCircle.style.borderWidth = '8px';
    drawCircle.style.opacity = '1';
    drawCircle.style.boxShadow = '0 0 20px #FF0000';
    drawCircle.classList.add('draw-circle-animation');
  }
}

// Export the smoke effect function so it can be used in game logic
export { createOptimizedSmokeEffect };