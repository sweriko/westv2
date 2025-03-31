import { initScene, updateFPS, scene } from './scene.js';
import { initInput } from './input.js';
import { SoundManager } from './soundManager.js';
import { Player } from './player.js';
import { networkManager } from './network.js';
import { MultiplayerManager } from './multiplayerManager.js';
import { Bullet } from './bullet.js';
import { ThirdPersonModel } from './playerModel.js';
import { PhysicsSystem } from './physics.js';
import { createMuzzleFlash, createSmokeEffect, createImpactEffect, preloadMuzzleFlash, preloadSmokeEffect, SmokeRingEffect } from './effects.js';
import { QuickDraw } from './quickDraw.js';
import { updateAmmoUI, updateHealthUI } from './ui.js';
import { Viewmodel } from './viewmodel.js';
import { initPlayerIdentity, verifyIdentityWithServer } from './playerIdentity.js';
import logger from './logger.js';
import { FlyingEagle } from './flyingEagle.js';

// Check if device is mobile
function isMobileDevice() {
  return (window.innerWidth <= 1024 || 'ontouchstart' in window || navigator.maxTouchPoints > 0 || 
         /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
}

// Set global flag for mobile
window.isMobile = isMobileDevice();

// Keep track of all bullets in the game, both local and remote
let bullets = [];

// Anti-cheat: Map bullets by ID for server authority
let bulletMap = new Map(); // bulletId -> Bullet object

// We'll keep references to local player, remote players, and a combined map
let localPlayer;
let remotePlayers = new Map();  // (playerId => ThirdPersonModel)
let playersMap = new Map();     // Master map including local + remote

// Scenes, camera, etc.
let renderer, camera;
let multiplayerManager;
let quickDraw;
let physics;
let lastTime = 0;

// Smoke ring effects
let smokeRings = [];
let maxSmokeRings = 10; // Limit to prevent performance issues

// Add a flag to track debug visualization mode
window.showHitZoneDebug = false;
window.showTownColliders = true; // Enable by default to help with debugging

// Create a global renderer object to allow camera switching
window.renderer = {
  instance: null,
  camera: null,
  setCamera: function(newCamera) {
    this.camera = newCamera;
  }
};

// Initialize the application
async function init() {
  try {
    // Initialize player identity before anything else
    const playerIdentity = await initPlayerIdentity();
    console.log(`Welcome back, ${playerIdentity.username}! Player ID: ${playerIdentity.id}`);
    
    // Verify identity with server (will be used in future server-side validation)
    const verificationResult = await verifyIdentityWithServer(playerIdentity);
    if (!verificationResult.verified) {
      console.warn('Identity verification failed, using local identity only');
    }
    
    // Expose player identity to window for easy access from other modules
    window.playerIdentity = playerIdentity;
    
    // Set debug mode flag
    window.debugMode = false; // Set to true to enable verbose console logging
    
    // Initialize logger UI if in debug mode
    if (window.debugMode) {
      const gameContainer = document.getElementById('gameContainer') || document.body;
      logger.createUI(gameContainer);
    }
    
    // Detect if we're on a mobile device
    window.isMobile = isMobileDevice();
    
    // Setup scene - use the scene from initScene instead of creating a new one
    const sceneSetup = initScene();
    camera = sceneSetup.camera;
    renderer = sceneSetup.renderer;
    
    // Set up global renderer access for camera switching
    window.renderer.instance = renderer;
    window.renderer.camera = camera;
    
    // Initialize physics system first so it's available for the scene
    physics = new PhysicsSystem();
    window.physics = physics; // Make physics globally accessible

    const soundManager = new SoundManager();
    
    // Load all sounds for everyone
    // Load shot sounds
    soundManager.loadSound("shot", "sounds/shot.mp3");
    soundManager.loadSound("aimclick", "sounds/aimclick.mp3");
    soundManager.loadSound("shellejection", "sounds/shellejection.mp3");
    soundManager.loadSound("reloading", "sounds/reloading.mp3");
    // Load the bell start sound for Quick Draw start signal
    soundManager.loadSound("bellstart", "sounds/bellstart.mp3");
    // Load impact sounds
    soundManager.loadSound("woodimpact", "sounds/woodimpact.mp3");
    soundManager.loadSound("fleshimpact", "sounds/fleshimpact.mp3");
    
    // Load footstep and jump sounds
    soundManager.loadSound("leftstep", "sounds/leftstep.mp3");
    soundManager.loadSound("rightstep", "sounds/rightstep.mp3");
    soundManager.loadSound("jump", "sounds/jump.mp3");
    
    // Load headshot marker sound
    soundManager.loadSound("headshotmarker", "sounds/headshotmarker.mp3");
    
    // Preload all visual effects to prevent FPS drops on first use - for all players now
    if (!window.isMobile) {
      console.log("Preloading visual effects...");
      // Preload muzzle flash effect
      preloadMuzzleFlash(scene);
      // Preload smoke effect
      preloadSmokeEffect(scene);
      
      // Initialize a smoke ring effect pool for reuse
      for (let i = 0; i < 3; i++) {
        const smokeRing = new SmokeRingEffect(scene);
        smokeRing.active = false;
        // Preload resources to prevent fps drop on first use
        smokeRing.preload();
        smokeRings.push(smokeRing);
      }
      
      // Simulate a complete dummy shot cycle in a hidden area
      // This ensures all shaders are compiled and resources are allocated
      console.log("Pre-rendering a dummy shot to warm up rendering pipeline...");
      const dummyPosition = new THREE.Vector3(0, -1000, 0);
      const dummyDirection = new THREE.Vector3(0, 0, 1);
      
      // Create all effects that happen during a shot
      createMuzzleFlash(dummyPosition, dummyDirection, scene);
      createSmokeEffect(dummyPosition, dummyDirection, scene);
      
      // Create a few impact effects of different types
      createImpactEffect(dummyPosition, dummyDirection, scene, 'wood');
      createImpactEffect(dummyPosition, dummyDirection, scene, 'metal');
      createImpactEffect(dummyPosition, dummyDirection, scene, 'dirt');
      
      // Create a dummy bullet - but don't track it since this is just preloading
      const dummyBullet = new Bullet(dummyPosition, dummyDirection);
      scene.add(dummyBullet.mesh);
      // Remove after a short delay
      setTimeout(() => {
        scene.remove(dummyBullet.mesh);
      }, 100);
    }
    
    // Initialize multiplayer manager
    multiplayerManager = new MultiplayerManager(scene, soundManager, remotePlayers);

    // Initialize the local player
    localPlayer = new Player({
      scene,
      camera,
      soundManager,
      onShoot: handleLocalPlayerShoot  // callback for local shooting
    });
    // Make localPlayer globally accessible for hit updates.
    window.localPlayer = localPlayer;

    // Initialize input
    initInput(renderer, localPlayer, soundManager);
    
    // Make scene globally accessible for physics visualization
    window.scene = scene;

    // Initialize Quick Draw game mode after the local player is created
    quickDraw = new QuickDraw(scene, localPlayer, networkManager, soundManager);
    
    // Initialize the QuickDraw game mode
    quickDraw.init();
    
    // Make quickDraw globally accessible for debugging
    window.quickDraw = quickDraw;
    
    // Share the main physics system with game modes
    quickDraw.physics = physics;
    
    // Make updateHealthUI globally accessible for the Quick Draw mode to use
    window.updateHealthUI = updateHealthUI;

    // Show connection status
    const networkStatus = document.createElement('div');
    networkStatus.id = 'network-status';
    networkStatus.textContent = 'Connecting...';
    document.getElementById('game-container').appendChild(networkStatus);

    // Update player count UI when server broadcasts the count.
    networkManager.onPlayerCount = (count) => {
      const playerCountEl = document.getElementById('player-count');
      if (playerCountEl) {
        playerCountEl.textContent = `Players: ${count}`;
      }
    };

    // Listen for network open/close
    networkManager.socket.addEventListener('open', () => {
      networkStatus.textContent = 'Connected';
      networkStatus.style.backgroundColor = 'rgba(0,128,0,0.5)';
      setTimeout(() => { networkStatus.style.opacity = '0'; }, 2000);
    });
    networkManager.socket.addEventListener('close', () => {
      networkStatus.textContent = 'Disconnected';
      networkStatus.style.backgroundColor = 'rgba(255,0,0,0.5)';
      networkStatus.style.opacity = '1';
    });

    // Listen for remote players shooting
    networkManager.onPlayerShoot = (playerId, bulletData, bulletId) => {
      handleRemotePlayerShoot(playerId, bulletData, bulletId);
    };

    // Anti-cheat: Listen for bullet impact notifications from server
    networkManager.onBulletImpact = (bulletId, hitType, targetId, position, hitZone) => {
      handleBulletImpact(bulletId, hitType, targetId, position, hitZone);
    };

    // Anti-cheat: Listen for position corrections from server
    networkManager.onPositionCorrection = (correctedPosition) => {
      if (localPlayer) {
        // Store the server position for reconciliation
        localPlayer.serverPosition = new THREE.Vector3(
          correctedPosition.x,
          correctedPosition.y,
          correctedPosition.z
        );
        localPlayer.isReconciling = true;
      }
    };
    
    // Anti-cheat: Listen for server-initiated respawn
    networkManager.onRespawn = (position, health, bullets) => {
      if (localPlayer) {
        // Set position
        localPlayer.group.position.copy(position);
        localPlayer.previousPosition.copy(position);
        
        // Update health and bullets
        localPlayer.health = health || 100;
        localPlayer.bullets = bullets || localPlayer.maxBullets;
        
        // Reset states
        localPlayer.isReloading = false;
        localPlayer.isAiming = false;
        localPlayer.velocity.y = 0;
        localPlayer.canAim = true;
        
        // Update UI
        updateHealthUI(localPlayer);
        updateAmmoUI(localPlayer);
      }
    };

    // Listen for updates to the remotePlayers map so we can refresh the master map
    multiplayerManager.onRemotePlayersUpdated = () => {
      updatePlayersMap();
      
      // If debug mode is on, make sure new players have hit zone debug boxes
      if (window.showHitZoneDebug && physics && physics.debugMode) {
        setTimeout(() => {
          if (physics.refreshHitZoneDebug && typeof physics.refreshHitZoneDebug === 'function') {
            physics.refreshHitZoneDebug();
          }
        }, 100);
      }
    };

    // Add a keyboard handler for showing town colliders (T key)
    window.addEventListener('keydown', function(event) {
      // Toggle town collider visualization with T key
      if (event.code === 'KeyT') {
        window.showTownColliders = !window.showTownColliders;
        
        // Show/hide collider meshes
        if (window.townColliders) {
          window.townColliders.forEach(({ node }) => {
            node.visible = window.showTownColliders;
          });
        }
        
        console.log(`Town collider visualization: ${window.showTownColliders ? 'ENABLED' : 'DISABLED'}`);
      }
      
      // Toggle debug mode with P key
      if (event.code === 'KeyP') {
        window.debugMode = !window.debugMode;
        
        // Synchronize physics debug mode with window debug mode
        if (physics) {
          physics.setDebugMode(window.debugMode);
        }
        
        // Set the hit zone debug flag
        window.showHitZoneDebug = window.debugMode;
        
        console.log(`Debug mode: ${window.debugMode ? 'ENABLED' : 'DISABLED'}`);
        
        // Update debug visualization
        updateDebugVisualization();
        
        // If turning on debug mode, update hit zone debug for all existing players with a delay
        if (window.debugMode) {
          setTimeout(() => {
            // First trigger hit zone debugging on the local player
            if (localPlayer && localPlayer.model && typeof localPlayer.model.createHitZoneVisualizers === 'function') {
              // Use the new method for visualization
              localPlayer.model.createHitZoneVisualizers(true);
            }
            
            // Then create debug boxes for all remote players
            for (const [playerId, remotePlayer] of remotePlayers.entries()) {
              if (remotePlayer && typeof remotePlayer.createHitZoneVisualizers === 'function') {
                // Use the new method
                remotePlayer.createHitZoneVisualizers(true);
              }
            }
            
            console.log("Hit zone debug boxes created for all players");
          }, 50);
        }
      }
    });

    // Make Bullet constructor globally available for hit zone debug creation
    window.Bullet = Bullet;
    
    // Install the improved hitbox system (after Bullet is globally available)
    initImprovedHitboxSystem();
    
    // Add debug command to console for troubleshooting
    window.printHitboxDebugInfo = function() {
      console.log("--- Hitbox System Debug Info ---");
      if (window.playersMap) {
        console.log(`Players map size: ${window.playersMap.size}`);
        window.playersMap.forEach((model, id) => {
          console.log(`Player ${id}:`, {
            hasCheckBulletHit: typeof model.checkBulletHit === 'function',
            headHitbox: model.headHitbox ? 'present' : 'missing',
            bodyHitbox: model.bodyHitbox ? 'present' : 'missing',
            limbsHitbox: model.limbsHitbox ? 'present' : 'missing'
          });
        });
      } else {
        console.log("Players map not found");
      }
    };
    
    // Create flying eagle that follows the camera
    window.flyingEagle = new FlyingEagle({
      scene: scene,
      camera: camera
    });

    // Start the animation loop
    animate(0);
    showGameInstructions();
    
  } catch (error) {
    console.error('Error during initialization:', error);
    // Handle initialization errors gracefully
    alert('There was an error starting the game. Please refresh the page to try again.');
  }
}

/**
 * The main animation loop.
 */
function animate(time) {
  requestAnimationFrame(animate);
  const deltaTime = (time - lastTime) / 1000;
  lastTime = time;

  // Update physics system
  if (physics) {
    physics.update(deltaTime);
  }

  // Update local player
  localPlayer.update(deltaTime);

  // Update remote players (animations, movement interpolation, etc.)
  multiplayerManager.update(deltaTime);
  
  // Update Quick Draw game mode
  if (quickDraw) {
    quickDraw.update(deltaTime);
    
    // Camera safety check for QuickDraw
    if (quickDraw.duelState === 'draw') {
      // In draw phase, ALWAYS use the player's camera directly
      if (localPlayer && localPlayer.camera) {
        // For render call below - temporarily save which camera to use
        window._renderWithCamera = localPlayer.camera;
        
        // Also update renderer references to be extra safe
        window.renderer.camera = localPlayer.camera;
        if (window.renderer.instance) {
          window.renderer.instance.camera = localPlayer.camera;
        }
      }
    }
  }

  // Update smoke ring effects
  for (let i = smokeRings.length - 1; i >= 0; i--) {
    // If the smoke ring is inactive after update, we can remove it
    // But keep at least 3 in the pool for reuse
    if (!smokeRings[i].update(deltaTime) && smokeRings.length > 3) {
      smokeRings[i].dispose();
      smokeRings.splice(i, 1);
    }
  }

  // Update bullets (both local & remote)
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    const result = bullet.update(deltaTime, null, scene, playersMap);
    if (!result.active) {
      // If bullet hit something or traveled too far
      if (result.hit && result.hit.type === 'player') {
        // Use logger for bullet hits
        if (window.logger) {
          window.logger.info(`Bullet hit player ${result.hit.playerId} in the ${result.hit.zone || 'body'} for ${result.hit.damage || 'unknown'} damage`);
        }
        
        // Set the last hit zone for server validation
        if (bullet.bulletId !== null && result.hit.zone) {
          bullet.setLastHitZone(result.hit.zone);
        }
      }
      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
      
      // Anti-cheat: Remove from bullet map if it has an ID
      if (bullet.bulletId !== null) {
        bulletMap.delete(bullet.bulletId);
      }
    }
  }

  // Update FPS display
  updateFPS(renderer, camera, deltaTime);

  // Update flying eagle if it exists
  if (window.flyingEagle) {
    // Only let the eagle control its own path when in aerial camera mode
    window.flyingEagle.update(deltaTime);
  }

  // CAMERA SELECTION LOGIC:
  // 1. First priority: Use special flag camera if set in QuickDraw draw phase
  // 2. Second priority: Use window.renderer.camera
  // 3. Fallback: Use default camera
  let renderCamera;
  
  if (window._renderWithCamera) {
    // Use the camera explicitly set by QuickDraw draw phase
    renderCamera = window._renderWithCamera;
    // Clear the flag after use
    window._renderWithCamera = null;
  } else if (window.renderer && window.renderer.camera) {
    // Use the window.renderer camera
    renderCamera = window.renderer.camera;
  } else {
    // Use default camera as last resort
    renderCamera = camera;
  }
  
  // Render with selected camera
  renderer.render(scene, renderCamera);
}

/**
 * Called whenever the local player fires.
 * Spawns a bullet locally and also notifies the server.
 * @param {THREE.Vector3} bulletStart 
 * @param {THREE.Vector3} shootDir 
 */
function handleLocalPlayerShoot(bulletStart, shootDir) {
  // Spawn bullet in our local game (client-side prediction)
  const bullet = spawnBullet(localPlayer.id, bulletStart, shootDir);

  // Send bullet data over network
  networkManager.sendShoot({
    position: {
      x: bulletStart.x,
      y: bulletStart.y,
      z: bulletStart.z
    },
    direction: {
      x: shootDir.x,
      y: shootDir.y,
      z: shootDir.z
    }
  });
  
  // Add this section to check for Quick Draw hit
  if (quickDraw && quickDraw.inDuel && quickDraw.duelState === 'draw' && quickDraw.duelOpponentId) {
    // We'll handle this in the bullet collision code instead
  }

  // Create smoke ring effect - only if not mobile
  if (!window.isMobile) {
    const availableSmokeRing = smokeRings.find(ring => !ring.active);
    if (availableSmokeRing) {
      // Get the effect positioning options from the viewmodel if available
      let smokeRingOptions = null;
      if (localPlayer.viewmodel && localPlayer.viewmodel.EFFECTS && localPlayer.viewmodel.EFFECTS.SMOKE_RING) {
        smokeRingOptions = localPlayer.viewmodel.EFFECTS.SMOKE_RING;
      }
      availableSmokeRing.create(bulletStart.clone(), shootDir.clone(), smokeRingOptions);
    }
  }
}

/**
 * Called whenever a remote player fires (based on network data).
 * @param {number} playerId 
 * @param {Object} bulletData 
 * @param {string|number} bulletId - Server-assigned bullet ID
 */
function handleRemotePlayerShoot(playerId, bulletData, bulletId) {
  const startPos = new THREE.Vector3(bulletData.position.x, bulletData.position.y, bulletData.position.z);
  const dir = new THREE.Vector3(bulletData.direction.x, bulletData.direction.y, bulletData.direction.z);
  
  spawnBullet(playerId, startPos, dir, bulletId);
}

/**
 * Handles a bullet impact notification from the server.
 * @param {string|number} bulletId - The bullet ID
 * @param {string} hitType - Type of impact (player, npc, ground, etc.)
 * @param {string|number|null} targetId - Target ID (for player hits)
 * @param {Object} position - Impact position {x, y, z}
 * @param {string} hitZone - Hit zone (head, body, limbs)
 */
function handleBulletImpact(bulletId, hitType, targetId, position, hitZone) {
  // Convert position to THREE.Vector3 if provided
  let impactPosition = null;
  if (position) {
    impactPosition = new THREE.Vector3(position.x, position.y, position.z);
  }
  
  // Find the bullet in our bullet map
  const bullet = bulletMap.get(bulletId);
  
  if (bullet) {
    // Store hit zone information for potential headshot sound
    if (hitZone) {
      bullet.setLastHitZone(hitZone);
    }
    
    // Create appropriate visual effect and deactivate bullet
    const result = bullet.handleServerImpact(hitType, targetId, impactPosition, scene);
    
    // Find and remove bullet from main array
    const bulletIndex = bullets.findIndex(b => b === bullet);
    if (bulletIndex !== -1) {
      scene.remove(bullet.mesh);
      bullets.splice(bulletIndex, 1);
    }
    
    // Remove from bullet map
    bulletMap.delete(bulletId);
  } else {
    // Use logger instead of console.log
    if (window.logger) {
      window.logger.debug(`Bullet ${bulletId} not found for impact event`);
    }
    
    // If we don't have the bullet object, still create visual effect at impact position
    if (impactPosition) {
      // Create a default direction vector (upward)
      const defaultDir = new THREE.Vector3(0, 1, 0);
      createImpactEffect(impactPosition, defaultDir, scene, hitType);
      
      // Play headshot sound if it was a headshot
      if (hitZone === 'head' && localPlayer && localPlayer.soundManager) {
        // For headshots, play both a spatialized and a direct sound for better feedback
        // Direct non-spatialized sound for clear feedback
        localPlayer.soundManager.playSound("headshotmarker", 100, 0.8);
        // Spatial sound for immersion
        localPlayer.soundManager.playSoundAt("headshotmarker", impactPosition, 100, 0.5, false);
      }
    }
  }
}

/**
 * Actually spawns a bullet in the world, complete with muzzle flash, etc.
 * @param {string|number} sourcePlayerId 
 * @param {THREE.Vector3} position 
 * @param {THREE.Vector3} direction 
 * @param {string|number} bulletId - Optional server-assigned ID (for remote bullets)
 * @returns {Bullet} The created bullet object
 */
function spawnBullet(sourcePlayerId, position, direction, bulletId = null) {
  const bullet = new Bullet(position, direction, bulletId);
  bullet.setSourcePlayer(sourcePlayerId);
  bullets.push(bullet);
  scene.add(bullet.mesh);
  
  // Anti-cheat: Store bullet in map if it has a bulletId
  if (bulletId !== null) {
    bulletMap.set(bulletId, bullet);
  }

  // Get the effect positioning options from the local player viewmodel if available
  let muzzleFlashOptions = null;
  let smokeEffectOptions = null;
  
  // Only use viewmodel options for the local player's effects
  if (sourcePlayerId === localPlayer.id && localPlayer.viewmodel && localPlayer.viewmodel.EFFECTS) {
    if (localPlayer.viewmodel.EFFECTS.MUZZLE_FLASH) {
      muzzleFlashOptions = localPlayer.viewmodel.EFFECTS.MUZZLE_FLASH;
    }
    if (localPlayer.viewmodel.EFFECTS.SMOKE_RING) {
      smokeEffectOptions = localPlayer.viewmodel.EFFECTS.SMOKE_RING;
    }
  }

  // Visual effects
  createMuzzleFlash(position, direction, scene, muzzleFlashOptions);
  createSmokeEffect(position, direction, scene);
  
  // Only add smoke ring effects if not on mobile
  if (!window.isMobile) {
    // Add smoke ring effect
    let smokeRing = null;
    
    // Try to reuse an inactive smoke ring first
    for (let i = 0; i < smokeRings.length; i++) {
      if (!smokeRings[i].active) {
        smokeRing = smokeRings[i];
        break;
      }
    }
    
    // If no inactive smoke ring found, create a new one if under the limit
    if (!smokeRing && smokeRings.length < maxSmokeRings) {
      smokeRing = new SmokeRingEffect(scene);
      smokeRings.push(smokeRing);
    }
    
    // Activate the smoke ring
    if (smokeRing) {
      smokeRing.create(position, direction, smokeEffectOptions);
    }
  }

  // Sound: play the single shot sound
  if (localPlayer.soundManager) {
    if (sourcePlayerId === localPlayer.id) {
      // Play a non-spatialized gunshot for the local player to sound more immediate
      localPlayer.soundManager.playSound("shot", 50, 1.0);
      
      // Also play a quieter spatialized version for better immersion
      localPlayer.soundManager.playSoundAt("shot", position, 50, 0.5);
    } else {
      // For remote players, use full spatialized audio
      localPlayer.soundManager.playSoundAt("shot", position, 50, 0.8);
    }
  }

  return bullet;
}

/**
 * Rebuilds a master map of all remote players.
 * This map is passed to bullet collision checks so bullets can hit any remote player.
 */
function updatePlayersMap() {
  playersMap.clear();
  // Only add remote players so that the local (shooter's) model isn't processed in bullet collisions.
  for (const [pid, remoteModel] of remotePlayers.entries()) {
    playersMap.set(pid, remoteModel);
  }
}

function showGameInstructions() {
  const instructions = document.createElement('div');
  instructions.id = 'instructions';
  instructions.style.position = 'absolute';
  instructions.style.top = '50%';
  instructions.style.left = '50%';
  instructions.style.transform = 'translate(-50%, -50%)';
  instructions.style.color = 'white';
  instructions.style.backgroundColor = 'rgba(0,0,0,0.7)';
  instructions.style.padding = '20px';
  instructions.style.borderRadius = '10px';
  instructions.style.maxWidth = '500px';
  instructions.style.textAlign = 'center';
  instructions.style.zIndex = '1000';
  
  instructions.innerHTML = `
    <h2>Wild Western Shooter - Multiplayer</h2>
    <p>WASD: Move</p>
    <p>Shift: Sprint</p>
    <p>Right-click: Aim</p>
    <p>Left-click (while aiming): Shoot</p>
    <p>R: Reload</p>
    <p>Space: Jump</p>
    <p>P: Toggle hit zone debug visualization</p>
    <p><strong>Touch anywhere to start</strong></p>
    <p><strong>New:</strong> Find the Quick Draw portal near spawn to duel other players!</p>
    <p><strong>Hit Zones:</strong> Headshots deal 100 damage, body shots 40, and limb shots 20.</p>`;
  
  document.getElementById('game-container').appendChild(instructions);
  
  // Add a clear dismiss button for mobile
  const dismissButton = document.createElement('button');
  dismissButton.textContent = '✕';
  dismissButton.style.position = 'absolute';
  dismissButton.style.top = '10px';
  dismissButton.style.right = '10px';
  dismissButton.style.background = 'transparent';
  dismissButton.style.border = 'none';
  dismissButton.style.color = 'white';
  dismissButton.style.fontSize = '24px';
  dismissButton.style.cursor = 'pointer';
  dismissButton.style.zIndex = '1001';
  dismissButton.style.padding = '5px 10px';
  dismissButton.style.touchAction = 'manipulation';
  instructions.appendChild(dismissButton);
  
  // Global function to remove instructions
  window.removeInstructions = () => {
    if (instructions.parentNode) {
      instructions.parentNode.removeChild(instructions);
    }
  };
  
  // Make both the background and the button clickable/tappable to dismiss
  dismissButton.addEventListener('click', window.removeInstructions);
  dismissButton.addEventListener('touchstart', window.removeInstructions, {passive: false});
  instructions.addEventListener('click', window.removeInstructions);
  instructions.addEventListener('touchstart', window.removeInstructions, {passive: false});
  
  // Add global event listeners to dismiss on any interaction
  document.addEventListener('touchstart', window.removeInstructions, {once: true, passive: false});
  
  // Prevent instructions from blocking renderer initialization on mobile
  if (window.isMobile) {
    // Auto-dismiss after 10 seconds on mobile
    setTimeout(window.removeInstructions, 7000);
  }
}

/**
 * Updates debug visualization for all players.
 * Called when debug mode is toggled.
 */
function updateDebugVisualization() {
  // Local player visualization
  if (localPlayer && localPlayer.model) {
    if (typeof localPlayer.model.createHitZoneVisualizers === 'function') {
      localPlayer.model.createHitZoneVisualizers(window.debugMode);
    }
    
    // Clean up old helpers if debug mode is off
    if (!window.debugMode) {
      const helpers = ["headHelper", "bodyHelper", "leftLegHelper", "rightLegHelper"];
      
      helpers.forEach(helper => {
        if (localPlayer.model[helper]) {
          localPlayer.model.group.remove(localPlayer.model[helper]);
          localPlayer.model[helper] = null;
        }
      });
    }
  }
  
  // Remote players visualization
  if (remotePlayers && remotePlayers.size > 0) {
    remotePlayers.forEach((model, id) => {
      if (model && typeof model.createHitZoneVisualizers === 'function') {
        model.createHitZoneVisualizers(window.debugMode);
        
        // Clean up old helpers if debug mode is off
        if (!window.debugMode) {
          const helpers = ["headHelper", "bodyHelper", "leftLegHelper", "rightLegHelper"];
          
          helpers.forEach(helper => {
            if (model[helper]) {
              model.group.remove(model[helper]);
              model[helper] = null;
            }
          });
        }
      }
    });
  }
  
  // Also check the playersMap (which might contain additional players)
  if (window.playersMap) {
    window.playersMap.forEach((model, id) => {
      if (model && typeof model.createHitZoneVisualizers === 'function' &&
          !remotePlayers.has(id)) { // Only process if not already processed above
        model.createHitZoneVisualizers(window.debugMode);
        
        // Clean up old helpers if debug mode is off
        if (!window.debugMode) {
          const helpers = ["headHelper", "bodyHelper", "leftLegHelper", "rightLegHelper"];
          
          helpers.forEach(helper => {
            if (model[helper]) {
              model.group.remove(model[helper]);
              model[helper] = null;
            }
          });
        }
      }
    });
  }
  
  // Sync physics debug state
  if (physics) {
    physics.setDebugMode(window.debugMode);
  }
}

// Handle window unload to cleanup game mode resources
window.addEventListener('beforeunload', () => {
  if (quickDraw) {
    quickDraw.cleanup();
  }
  
  if (physics) {
    physics.cleanup();
  }
  
  // Clean up smoke rings
  for (let i = 0; i < smokeRings.length; i++) {
    smokeRings[i].dispose();
  }
  smokeRings = [];
});

/**
 * Initializes the improved hitbox detection system.
 * This completely overwrites the old checkPlayerHitZones method in Bullet.prototype.
 */
function initImprovedHitboxSystem() {
  if (!window.Bullet || !window.Bullet.prototype) {
    console.error("Cannot install improved hitbox system - Bullet class not available");
    return false;
  }

  // Store a reference to the original method for backup
  const originalCheckPlayerHitZones = window.Bullet.prototype.checkPlayerHitZones;

  // Replace the checkPlayerHitZones method with our improved version
  window.Bullet.prototype.checkPlayerHitZones = function(playerObj, bulletPos) {
    // Better local player detection (handle both Player objects and models)
    if (playerObj === localPlayer) {
      if (localPlayer.model && typeof localPlayer.model.checkBulletHit === 'function') {
        return localPlayer.model.checkBulletHit(bulletPos);
      }
    }
    
    // For ThirdPersonModel players, use their built-in hit detection
    if (playerObj && typeof playerObj.checkBulletHit === 'function') {
      return playerObj.checkBulletHit(bulletPos);
    }
    
    // For remote players in the players map
    if (window.playersMap && playerObj.id) {
      const playerModel = window.playersMap.get(playerObj.id);
      if (playerModel && typeof playerModel.checkBulletHit === 'function') {
        return playerModel.checkBulletHit(bulletPos);
      }
    }
    
    // Local player might have a model reference
    if (playerObj.model && typeof playerObj.model.checkBulletHit === 'function') {
      return playerObj.model.checkBulletHit(bulletPos);
    }
    
    // Special case for QuickDraw mode
    if (window.quickDraw && window.quickDraw.inDuel) {
      const opponentId = window.quickDraw.duelOpponentId;
      if (opponentId && window.playersMap) {
        const opponentModel = window.playersMap.get(opponentId.toString());
        if (opponentModel && typeof opponentModel.checkBulletHit === 'function') {
          return opponentModel.checkBulletHit(bulletPos);
        }
      }
    }
    
    // Last resort: fall back to original implementation
    console.warn("Using fallback hit detection for player", playerObj);
    return originalCheckPlayerHitZones.call(this, playerObj, bulletPos);
  };

  // We also need to disable the old hitzone debug visualization
  // This will prevent the old hitboxes from appearing during gameplay
  window.Bullet.prototype.createHitZoneDebugBoxes = function() {
    // Do nothing - this effectively disables the old debug boxes
  };

  console.log("✅ Improved hitbox system successfully installed");
  return true;
}

// Call init() to start the application
init().catch(err => {
  console.error('Error during initialization:', err);
  // Show error to user
  const errorElement = document.createElement('div');
  errorElement.style.position = 'fixed';
  errorElement.style.top = '10px';
  errorElement.style.left = '10px';
  errorElement.style.color = 'red';
  errorElement.style.backgroundColor = 'rgba(0,0,0,0.7)';
  errorElement.style.padding = '10px';
  errorElement.style.borderRadius = '5px';
  errorElement.textContent = 'Failed to initialize the game. Please refresh the page.';
  document.body.appendChild(errorElement);
});