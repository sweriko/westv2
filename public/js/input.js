/**
 * Initializes game input (keyboard + mouse) and pointer lock.
 * @param {THREE.WebGLRenderer} renderer - The renderer instance.
 * @param {Player} player - The local Player instance (first-person).
 * @param {SoundManager} soundManager - The SoundManager for audio feedback.
 */

import { isChatInputActive } from './chat.js';

export function initInput(renderer, player, soundManager) {
  // Track if device is mobile
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Create touch controls for mobile
  if (isMobile) {
    createMobileControls(player, soundManager);
    
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
    }
    // Left-click => Shoot (only if aiming)
    else if (event.button === 0) {
      if (player.isAiming && !player.isReloading) {
        player.shoot();
      }
    }
  });

  // Mouse up
  document.addEventListener('mouseup', (event) => {
    // Stop aiming on right-click release
    if (event.button === 2) {
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
  
  // Create shoot button (left side)
  const shootButton = document.createElement('div');
  shootButton.id = 'shoot-button';
  shootButton.className = 'mobile-button';
  shootButton.innerText = '🔫';
  
  // Create jump button (right side)
  const jumpButton = document.createElement('div');
  jumpButton.id = 'jump-button';
  jumpButton.className = 'mobile-button';
  jumpButton.innerText = '↑';
  
  // Create visual joystick hint for left side
  const leftControlHint = document.createElement('div');
  leftControlHint.id = 'left-control-hint';
  leftControlHint.className = 'control-hint';
  leftControlHint.style.bottom = '30px';
  leftControlHint.style.left = '30px';
  
  // Create visual joystick hint for right side
  const rightControlHint = document.createElement('div');
  rightControlHint.id = 'right-control-hint';
  rightControlHint.className = 'control-hint';
  rightControlHint.style.bottom = '30px';
  rightControlHint.style.right = '30px';
  
  // Create orientation message
  const orientationMsg = document.createElement('div');
  orientationMsg.id = 'orientation-message';
  orientationMsg.innerText = 'Please rotate to landscape mode';
  
  // Add elements to document
  document.body.appendChild(shootButton);
  document.body.appendChild(jumpButton);
  document.body.appendChild(leftControlHint);
  document.body.appendChild(rightControlHint);
  document.body.appendChild(orientationMsg);
  
  // Variables to track touch state
  let leftSideTouchId = null;
  let rightSideTouchId = null;
  let leftStartPos = { x: 0, y: 0 };
  let rightStartPos = { x: 0, y: 0 };
  let rightTouchStartTime = 0;
  let screenWidth = window.innerWidth;
  
  // Constants for sensitivity
  const MOVE_THRESHOLD = 10; // Minimum movement in pixels before registering movement
  const MOVE_SENSITIVITY = 0.15;  // Movement speed multiplier
  const LOOK_SENSITIVITY = 0.25;   // Look speed multiplier - further increased for mobile
  
  // Initial state of player
  player.moveForward = false;
  player.moveBackward = false;
  player.moveLeft = false;
  player.moveRight = false;
  player.isAiming = false;
  
  // Monitor player bullets to auto-reload
  const originalShoot = player.shoot;
  player.shoot = function() {
    const result = originalShoot.apply(this, arguments);
    
    // Auto-reload when out of bullets on mobile
    if (this.bullets <= 0 && !this.isReloading) {
      this.startReload();
    }
    
    return result;
  };
  
  // Touch start handler
  touchOverlay.addEventListener('touchstart', (e) => {
    // Dismiss any instructions/info banner that might be visible
    const instructionsElement = document.getElementById('instructions');
    if (instructionsElement && instructionsElement.parentNode) {
      instructionsElement.parentNode.removeChild(instructionsElement);
    }
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const x = touch.clientX;
      const y = touch.clientY;
      
      // Get the screen dimensions
      const screenHeight = window.innerHeight;
      
      // Define joystick areas - smaller hitboxes instead of full screen halves
      // Left joystick: Bottom left quarter of screen
      const leftJoystickArea = {
        x: 0,
        y: screenHeight * 0.4,
        width: screenWidth * 0.4,
        height: screenHeight * 0.6
      };
      
      // Right joystick: Bottom right quarter of screen
      const rightJoystickArea = {
        x: screenWidth * 0.6,
        y: screenHeight * 0.4,
        width: screenWidth * 0.4,
        height: screenHeight * 0.6
      };
      
      // Check if touch is in left joystick area
      if (x >= leftJoystickArea.x && 
          x <= leftJoystickArea.x + leftJoystickArea.width &&
          y >= leftJoystickArea.y && 
          y <= leftJoystickArea.y + leftJoystickArea.height) {
        
        if (leftSideTouchId === null) {
          leftSideTouchId = touch.identifier;
          leftStartPos.x = x;
          leftStartPos.y = y;
          
          // Visual feedback - highlight active control
          leftControlHint.style.borderColor = 'rgba(255, 255, 255, 0.7)';
          leftControlHint.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        }
      } 
      // Check if touch is in right joystick area
      else if (x >= rightJoystickArea.x && 
               x <= rightJoystickArea.x + rightJoystickArea.width &&
               y >= rightJoystickArea.y && 
               y <= rightJoystickArea.y + rightJoystickArea.height) {
        
        if (rightSideTouchId === null) {
          rightSideTouchId = touch.identifier;
          rightStartPos.x = x;
          rightStartPos.y = y;
          rightTouchStartTime = Date.now();
          
          // Visual feedback - highlight active control
          rightControlHint.style.borderColor = 'rgba(255, 255, 255, 0.7)';
          rightControlHint.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
          
          // Start aiming immediately on touch
          player.isAiming = true;
          
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
        }
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
        
        // Only apply movement if joystick is moved beyond threshold
        if (Math.abs(deltaX) > MOVE_THRESHOLD || Math.abs(deltaY) > MOVE_THRESHOLD) {
          // Forward/backward based on vertical movement
          player.moveForward = deltaY < -MOVE_THRESHOLD;
          player.moveBackward = deltaY > MOVE_THRESHOLD;
          
          // Left/right based on horizontal movement
          player.moveLeft = deltaX < -MOVE_THRESHOLD;
          player.moveRight = deltaX > MOVE_THRESHOLD;
        }
      }
      
      // Handle right side touch (looking)
      if (touch.identifier === rightSideTouchId) {
        const deltaX = touch.clientX - rightStartPos.x;
        const deltaY = touch.clientY - rightStartPos.y;
        
        // Apply camera rotation based on touch movement - increased sensitivity
        player.group.rotation.y -= deltaX * LOOK_SENSITIVITY * 0.01;
        player.camera.rotation.x -= deltaY * LOOK_SENSITIVITY * 0.01;
        
        // Limit vertical rotation to avoid flipping
        player.camera.rotation.x = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, player.camera.rotation.x)
        );
        
        // Update starting position to prevent continuous rotation
        rightStartPos.x = touch.clientX;
        rightStartPos.y = touch.clientY;
      }
    }
    e.preventDefault();
  });
  
  // Touch end handler
  touchOverlay.addEventListener('touchend', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      
      // Handle left side touch end
      if (touch.identifier === leftSideTouchId) {
        leftSideTouchId = null;
        
        // Reset movement flags
        player.moveForward = false;
        player.moveBackward = false;
        player.moveLeft = false;
        player.moveRight = false;
        
        // Reset visual feedback
        leftControlHint.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        leftControlHint.style.backgroundColor = 'transparent';
      }
      
      // Handle right side touch end
      if (touch.identifier === rightSideTouchId) {
        // Stop aiming but don't shoot
        player.isAiming = false;
        
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
        rightControlHint.style.backgroundColor = 'transparent';
        
        rightSideTouchId = null;
      }
    }
    e.preventDefault();
  });
  
  // Touch cancel handler (similar to touch end)
  touchOverlay.addEventListener('touchcancel', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      
      // Reset left side touch
      if (touch.identifier === leftSideTouchId) {
        leftSideTouchId = null;
        player.moveForward = false;
        player.moveBackward = false;
        player.moveLeft = false;
        player.moveRight = false;
        
        // Reset visual feedback
        leftControlHint.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        leftControlHint.style.backgroundColor = 'transparent';
      }
      
      // Reset right side touch
      if (touch.identifier === rightSideTouchId) {
        rightSideTouchId = null;
        player.isAiming = false;
        
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
        rightControlHint.style.backgroundColor = 'transparent';
      }
    }
    e.preventDefault();
  });
  
  // Shoot button handler
  shootButton.addEventListener('touchstart', (e) => {
    if (player.isAiming && !player.isReloading) {
      player.shoot();
    }
    e.preventDefault();
  });
  
  // Button event handlers  
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
  
  // Special handler for clicking on any instruction element to hide it
  document.addEventListener('touchstart', (e) => {
    const target = e.target;
    if (target.id === 'portal-instructions' || 
        target.id === 'proper-shootout-instructions' ||
        (target.parentElement && 
         (target.parentElement.id === 'portal-instructions' || 
          target.parentElement.id === 'proper-shootout-instructions'))) {
      
      // Hide the instruction element
      if (target.id) {
        document.getElementById(target.id).style.display = 'none';
      } else if (target.parentElement && target.parentElement.id) {
        document.getElementById(target.parentElement.id).style.display = 'none';
      }
      
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
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
    // Completely disable the effect on mobile devices
    drawCircle.style.display = 'none';
    drawCircle.style.opacity = '0';
    // Remove any existing animation classes
    drawCircle.classList.remove('draw-circle-animation');
    drawCircle.classList.remove('draw-circle-animation-mobile');
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