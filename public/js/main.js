import { initScene, updateFPS, scene } from './scene.js';
import { initInput } from './input.js';
import { SoundManager } from './soundManager.js';
import { Player } from './player.js';
import { networkManager } from './network.js';
import { MultiplayerManager } from './multiplayerManager.js';
import { Bullet } from './bullet.js';
import { ThirdPersonModel } from './playerModel.js';
import { PhysicsSystem } from './physics.js';
import { createMuzzleFlash, createSmokeEffect, createImpactEffect, preloadMuzzleFlash, preloadSmokeEffect, SmokeRingEffect, DrunkennessEffect } from './effects.js';
import { QuickDraw } from './quickDraw.js';
import { updateAmmoUI, updateHealthUI } from './ui.js';
import { Viewmodel } from './viewmodel.js';
import { initPlayerIdentity, verifyIdentityWithServer } from './playerIdentity.js';
import logger from './logger.js';
import { FlyingEagle } from './flyingEagle.js';
import { initChat, handleChatMessage, addSystemMessage } from './chat.js';
import { initNpcManager, npcManager } from './npcManager.js';
console.log("NPC Manager module loaded");
import './viewmodel-config.js';

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
window.showTownColliders = false; // Disable for production

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
    // Start the init process without waiting for player identity
    
    // Set debug mode flag
    window.debugMode = false; // Disabled for production
    
    // Initialize logger UI if in debug mode
    if (window.debugMode) {
      const gameContainer = document.getElementById('gameContainer') || document.body;
      logger.createUI(gameContainer);
    }
    
    // Detect if we're on a mobile device
    window.isMobile = isMobileDevice();
    
    // Setup viewport detection and handling
    setupViewportHandling();
    
    // Initialize scene - use the scene from initScene instead of creating a new one
    const sceneSetup = initScene();
    camera = sceneSetup.camera;
    renderer = sceneSetup.renderer;
    
    // Initialize NPC manager with the scene
    const npcManagerInstance = initNpcManager(scene);
    
    // Make NPC manager globally accessible
    window.npcManager = npcManager;
    
    // Set up global renderer access for camera switching
    window.renderer.instance = renderer;
    window.renderer.camera = camera;
    
    // Initialize physics system first so it's available for the scene
    physics = new PhysicsSystem();
    window.physics = physics; // Make physics globally accessible

    const soundManager = new SoundManager();
    
    // Start loading sounds while the user is entering their name
    // Load shot sounds
    soundManager.loadSound("shot", "sounds/shot.mp3");
    soundManager.loadSound("revolverdraw", "sounds/revolverdraw.mp3");
    // replacing shellejection with the combined reloading sound
    soundManager.loadSound("reloading", "sounds/reloading.mp3");
    // Load the bell start sound for Quick Draw start signal
    soundManager.loadSound("bellstart", "sounds/bellstart.mp3");
    // Load impact sounds
    soundManager.loadSound("woodimpact", "sounds/woodimpact.mp3");
    soundManager.loadSound("fleshimpact", "sounds/fleshimpact.mp3");
    
    // Load footstep and jump sounds
    soundManager.loadSound("leftstep", "sounds/leftstep.mp3");
    soundManager.loadSound("rightstep", "sounds/rightstep.mp3");
    soundManager.loadSound("jumpup", "sounds/jumpup.mp3");
    soundManager.loadSound("jumpland", "sounds/jumpland.mp3");
    soundManager.loadSound("recoiljump", "sounds/recoiljump.mp3");
    
    // Load headshot marker sound
    soundManager.loadSound("headshotmarker", "sounds/headshotmarker.mp3");
    
    // Load hitmarker sound
    soundManager.loadSound("hitmarker", "sounds/hitmarker.mp3");
    
    // Load new sound effects
    soundManager.loadSound("dramatic", "sounds/dramatic.mp3");
    soundManager.loadSound("eaglescream", "sounds/eaglescream.mp3");
    soundManager.loadSound("eagledeath", "sounds/eagledeath.mp3");
    soundManager.loadSound("quickdrawending", "sounds/quickdrawending.mp3");
    soundManager.loadSound("playerfall", "sounds/playerfall.mp3");
    soundManager.loadSound("ambience", "sounds/ambience.mp3");
    
    // Load gun sounds
    soundManager.loadSound("shot", "sounds/shot.mp3");
    soundManager.loadSound("revolverdraw", "sounds/revolverdraw.mp3");
    soundManager.loadSound("reloading", "sounds/reloading.mp3");
    soundManager.loadSound("shotgunempty", "sounds/shotgunempty.mp3");
    soundManager.loadSound("revolverholstering", "sounds/revolverholstering.mp3");
    
    // Load shotgun sounds
    soundManager.loadSound("shotgundraw", "sounds/shotgundraw.mp3");
    soundManager.loadSound("shotgunshot", "sounds/shotgunshot.mp3");
    soundManager.loadSound("shotgunreloading", "sounds/shotgunreloading.mp3");
    soundManager.loadSound("shotgunholstering", "sounds/shotgunholstering.mp3");
    
    // Load impact sounds
    soundManager.loadSound("woodimpact", "sounds/woodimpact.mp3");
    
    // Start background ambient music loop
    setTimeout(() => {
      soundManager.playSound("ambience", 0, 0.4, true); // Play at lower volume in a loop
    }, 1000); // Slight delay to ensure the sound is loaded
    
    // In parallel, initialize player identity
    // This will show the name prompt for first-time users if needed
    // but won't block the rest of the initialization
    const playerIdentityPromise = initPlayerIdentity().then(playerIdentity => {
      console.log(`Welcome back, ${playerIdentity.username}! Player ID: ${playerIdentity.id}`);
      
      // Check if this was a first-time user to determine when to show instructions
      const isFirstTimeUser = playerIdentity.lastLogin === playerIdentity.createdAt;
      
      // Verify identity with server (will be used in future server-side validation)
      return verifyIdentityWithServer(playerIdentity).then(verificationResult => {
        if (!verificationResult.verified) {
          console.warn('Identity verification failed, using local identity only');
        }
        
        // Expose player identity to window for easy access from other modules
        window.playerIdentity = playerIdentity;
        
        return playerIdentity;
      });
    });

    // Preload all visual effects to prevent FPS drops on first use
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

    // Set up multiplayer manager to handle other players
    multiplayerManager = new MultiplayerManager(scene, soundManager, remotePlayers);
    
    // Wait for player identity to be resolved before continuing with network/player setup
    const playerIdentity = await playerIdentityPromise;
    
    // Initialize the phantom wallet adapter with network manager for NFT verification
    if (typeof phantomWalletAdapter !== 'undefined') {
      console.log('Initializing Phantom wallet adapter');
      phantomWalletAdapter.init(networkManager);
      
      // Listen for wallet connection events to apply skins
      document.addEventListener('walletConnected', (e) => {
        console.log('Wallet connected event received in main.js');
      });
    } else {
      console.warn('Phantom wallet adapter not available');
    }
    
    // Make multiplayerManager globally accessible
    window.multiplayerManager = multiplayerManager;

    // Create flying eagle that follows the camera
    window.flyingEagle = new FlyingEagle({
      scene: scene,
      camera: camera
    });
    
    // Set the default town center for the eagle to fly around
    const townCenter = new THREE.Vector3(0, 0, 0); // Center of the town
    window.flyingEagle.townCenter = townCenter;
    window.flyingEagle.setDefaultFlightPath();

    // Initialize the local player
    localPlayer = new Player({
      scene: scene,
      camera: camera,
      soundManager: soundManager,
      onShoot: handleLocalPlayerShoot  // callback for local shooting
    });
    // Make localPlayer globally accessible for hit updates.
    window.localPlayer = localPlayer;

    // Initialize UI elements - desktop weapon indicators
    createDesktopWeaponIndicators();
    
    // Initialize first-person controls
    const mobileControls = initInput(renderer, localPlayer, soundManager);
    
    // Make mobile controls globally accessible
    if (isMobileDevice()) {
      window.mobileControls = mobileControls;
    }
    
    // Make scene globally accessible for physics visualization
    window.scene = scene;

    // Function to check for nearby players for quickdraw on mobile
    window.checkNearestPlayerForQuickdraw = function(player) {
      if (!remotePlayers || !player) return null;
      
      const minDistance = 5; // Distance threshold to show invite button
      let nearestPlayer = null;
      let nearestDistance = Infinity;
      
      // Check all remote players
      for (const [id, remotePlayer] of remotePlayers.entries()) {
        // Skip if no position
        if (!remotePlayer || !remotePlayer.group || !remotePlayer.group.position) continue;
        
        // Calculate distance to remote player
        const distance = player.group.position.distanceTo(remotePlayer.group.position);
        
        // Update nearest player if closer
        if (distance < minDistance && distance < nearestDistance) {
          nearestPlayer = remotePlayer;
          nearestDistance = distance;
        }
      }
      
      return nearestPlayer;
    };

    // Initialize Quick Draw game mode after the local player is created
    quickDraw = new QuickDraw(scene, localPlayer, networkManager, soundManager);
    
    // Initialize drunkenness effect - pass both player and camera arguments
    const drunkennessEffect = new DrunkennessEffect(localPlayer, camera);
    console.log('Drunkenness effect initialized');
    
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
    
    // Train synchronization: Handle initial train state
    networkManager.onTrainInit = (data) => {
      // Import the train functions from scene.js
      import('./scene.js').then(sceneModule => {
        sceneModule.setTrainInitialState(data);
      });
    };
    
    // Train synchronization: Handle ongoing train state updates
    // We only process the first trainState message if we haven't received trainInit yet
    networkManager.onTrainState = (data) => {
      // Import the train functions from scene.js
      import('./scene.js').then(sceneModule => {
        sceneModule.updateTrainState(data);
      });
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

    // Handle local player death
    networkManager.onDeath = (killerId) => {
      console.log(`You were killed by player ${killerId}`);
      
      // Skip death message if in QuickDraw duel (defeat message is shown instead)
      if (window.quickDraw && window.quickDraw.inDuel) {
        console.log('In QuickDraw duel, skipping automatic death message');
        return;
      }
      
      // Show death message
      const deathMessage = document.createElement('div');
      deathMessage.innerText = 'YOU DIED';
      deathMessage.style.position = 'fixed';
      deathMessage.style.top = '50%';
      deathMessage.style.left = '50%';
      deathMessage.style.transform = 'translate(-50%, -50%)';
      deathMessage.style.color = '#FF0000';
      deathMessage.style.fontSize = '36px';
      deathMessage.style.fontWeight = 'bold';
      deathMessage.style.zIndex = '1000';
      document.getElementById('game-container').appendChild(deathMessage);
      
      // Create a red overlay effect
      const deathOverlay = document.createElement('div');
      deathOverlay.style.position = 'fixed';
      deathOverlay.style.top = '0';
      deathOverlay.style.left = '0';
      deathOverlay.style.width = '100%';
      deathOverlay.style.height = '100%';
      deathOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
      deathOverlay.style.zIndex = '999';
      document.getElementById('game-container').appendChild(deathOverlay);
      
      // Store original mouse handler for later restoration
      const origMouseMove = document.onmousemove;
      
      // Disable player controls during death animation
      if (localPlayer) {
        localPlayer.canMove = false;
        localPlayer.canAim = false;
        
        // Save original camera rotation
        const originalRotation = localPlayer.camera.rotation.clone();
        
        // Apply death camera rotation - rotate camera to look down at the ground
        // Start a smooth rotation animation from current position to looking down
        const deathCameraDuration = 1000; // 1 second for the rotation animation
        const startTime = Date.now();
        const targetRotationX = Math.PI / 2; // Looking down at the ground (90 degrees) instead of up
        
        // Create an animation function that rotates the camera over time
        const rotateCameraUp = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / deathCameraDuration, 1);
          
          // Use an easing function (ease-out) for smoother animation
          const easeOut = 1 - Math.pow(1 - progress, 2);
          
          // Interpolate between original and target rotation
          localPlayer.camera.rotation.x = originalRotation.x * (1 - easeOut) + targetRotationX * easeOut;
          
          // Continue the animation until complete
          if (progress < 1) {
            requestAnimationFrame(rotateCameraUp);
          }
        };
        
        // Start the camera rotation animation
        rotateCameraUp();
        
        // Disable mouse look temporarily to prevent camera movement
        document.onmousemove = (e) => {
          // Block mouse movement during death animation
          e.stopPropagation();
          return false;
        };
        
        // Play death animation on local player model if it exists
        if (localPlayer.model && typeof localPlayer.model.playDeathAnimation === 'function') {
          localPlayer.model.playDeathAnimation();
        }
        
        // Play death sound
        if (localPlayer.soundManager) {
          localPlayer.soundManager.playSound("playerfall", 0, 0.8);
        }
      }
      
      // Remove message and overlay after animation
      // Also restore mouse control
      setTimeout(() => {
        if (deathMessage.parentNode) {
          deathMessage.parentNode.removeChild(deathMessage);
        }
        if (deathOverlay.parentNode) {
          deathOverlay.parentNode.removeChild(deathOverlay);
        }
        
        // Restore mouse movement control
        document.onmousemove = origMouseMove;
      }, 2000); // Match the server respawn delay
    };
    
    // Handle when the local player kills someone
    networkManager.onKill = (targetId) => {
      console.log(`You killed player ${targetId}`);
      
      // Skip kill message if in QuickDraw duel (victory message is shown instead)
      if (window.quickDraw && window.quickDraw.inDuel) {
        console.log('In QuickDraw duel, skipping kill message');
        return;
      }
      
      // Show kill message
      const killMessage = document.createElement('div');
      killMessage.innerText = 'KILL!';
      killMessage.style.position = 'fixed';
      killMessage.style.top = '50%';
      killMessage.style.left = '50%';
      killMessage.style.transform = 'translate(-50%, -50%)';
      killMessage.style.color = '#00FF00';
      killMessage.style.fontSize = '36px';
      killMessage.style.fontWeight = 'bold';
      killMessage.style.zIndex = '1000';
      document.getElementById('game-container').appendChild(killMessage);
      
      // Remove message after a short time
      setTimeout(() => {
        if (killMessage.parentNode) {
          killMessage.parentNode.removeChild(killMessage);
        }
      }, 1500);
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
      
      // Reload weapon with the R key
      if (event.code === 'KeyR' && !quickDraw.inDuel) {
        localPlayer.startReload();
      }
      
      // No longer spawn bots with the B key as NPCs are now server-controlled
      if (event.code === 'KeyB' && !event.ctrlKey && !event.shiftKey) {
        console.log("NPCs are now server-controlled and cannot be spawned from the client");
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
    
    // Initialize chat system
    initChat(networkManager);
    
    // Set up chat message handler
    networkManager.onChatMessage = (senderId, username, message) => {
      // Ignore messages from ourselves to prevent duplicates
      if (senderId === localPlayer.id) return;
      
      // Only handle messages from other players
      handleChatMessage({ username, message });
    };

    // Listen for skin permission updates
    networkManager.handleMessage = (originalHandleMessage => {
      return function(message) {
        // Call the original handler first
        originalHandleMessage.call(this, message);
        
        // Handle skin permission updates
        if (message.type === 'skinPermissionUpdate') {
          // Store the skin permission update in a global cache to prevent duplicate processing
          if (!window.skinPermissionCache) {
            window.skinPermissionCache = new Map();
          }
          
          // Create a cache key for this update
          const updateKey = JSON.stringify(message.skins);
          
          // Check if we've already processed this exact update
          if (window.skinPermissionCache.has(updateKey)) {
            console.log('Skipping duplicate skin permission update');
            return;
          }
          
          // Store this update in the cache
          window.skinPermissionCache.set(updateKey, true);
          
          console.log('Received skin permission update:', message);
          
          // Update local player's skin permissions
          if (localPlayer && localPlayer.model) {
            console.log('Updating skin permissions for local player model');
            localPlayer.model.updateSkinPermissions(message.skins);
            
            // Apply banana skin if permission granted
            if (message.skins.bananaSkin) {
              console.log('Local player has bananaSkin permission, applying skin to model');
              localPlayer.model.updateSkin('bananaSkin');
            }
          } else {
            console.warn('Could not update local player model - model not available');
          }
          
          // Update viewmodel skin to match
          if (localPlayer && localPlayer.viewmodel) {
            console.log('Updating skin permissions for viewmodel');
            localPlayer.viewmodel.updateSkinPermissions(message.skins);
            
            // Apply banana skin if permission granted
            if (message.skins.bananaSkin) {
              console.log('Local player has bananaSkin permission, applying skin to viewmodel');
              localPlayer.viewmodel.updateSkin('bananaSkin');
            }
          } else {
            console.warn('Could not update viewmodel - viewmodel not available');
          }
        }
      };
    })(networkManager.handleMessage);
    
    // Set up separate handler for skin updates
    networkManager.onPlayerSkinUpdate = (message) => {
      // Create a cache key for this update
      const playerUpdateKey = `${message.playerId}_${JSON.stringify(message.skins)}`;
      
      // Check if we've already processed this exact update
      if (window.skinPermissionCache && window.skinPermissionCache.has(playerUpdateKey)) {
        console.log(`Skipping duplicate skin update for player ${message.playerId}`);
        return;
      }
      
      // Store this update in the cache
      if (!window.skinPermissionCache) {
        window.skinPermissionCache = new Map();
      }
      window.skinPermissionCache.set(playerUpdateKey, true);
      
      console.log('Received player skin update:', message);
      
      const remotePlayer = remotePlayers.get(message.playerId);
      if (remotePlayer) {
        console.log(`Updating skin permissions for remote player ${message.playerId}`);
        
        // First, update the permissions in the player model
        remotePlayer.updateSkinPermissions(message.skins);
        
        // Apply banana skin if permission granted
        if (message.skins.bananaSkin) {
          console.log(`Remote player ${message.playerId} has bananaSkin permission, applying skin`);
          
          // Force the skinPermission to be set directly as well (to avoid race condition)
          remotePlayer.skinPermissions.bananaSkin = true;
          
          // Apply the skin
          if (remotePlayer.activeSkin !== 'bananaSkin') {
            remotePlayer.updateSkin('bananaSkin');
          } else {
            console.log(`Skin already applied to player ${message.playerId}`);
          }
          
          // Store skin state to prevent redundant updates in the player model
          if (!remotePlayer._cachedNetworkData) {
            remotePlayer._cachedNetworkData = {};
          }
          remotePlayer._cachedNetworkData.skins = message.skins;
          remotePlayer._initialSkinApplied = true;
          remotePlayer._lastSkinUpdate = JSON.stringify(message.skins);
        }
      } else {
        console.warn(`Could not update remote player ${message.playerId} - player not found in remotePlayers map`);
      }
    };

    // Start the animation loop
    animate(0);
    
    // Show game instructions for all users, first-time users will see it after name entry
    showGameInstructions();
    
    // Done loading, hide the loading screen
    setTimeout(() => {
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.style.display = 'none';
      }
    }, 500);
    
  } catch (error) {
    console.error('Error during initialization:', error);
    // Show a user-friendly error message
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = 'Failed to initialize the game. Please try refreshing the page.';
    document.body.appendChild(errorElement);
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
  
  // Update nearby NPCs for interaction
  if (npcManager && npcManager.instance) {
    npcManager.instance.updateNearbyNpcs(localPlayer);
  }
  
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
    window.flyingEagle.update(deltaTime);
  }

  // Update NPCs through npc manager
  if (window.npcManager) {
    // NPC manager handles its own internal updates
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
  
  // Create an array to track local bullet IDs if it doesn't exist
  if (!window.localPlayer.lastFiredBulletIds) {
    window.localPlayer.lastFiredBulletIds = [];
  }
  
  // Add this bullet's ID to our tracking array (if it has one)
  if (bullet && bullet.bulletId) {
    window.localPlayer.lastFiredBulletIds.push(bullet.bulletId);
    
    // Keep the array size manageable (only store last 20 bullet IDs)
    if (window.localPlayer.lastFiredBulletIds.length > 20) {
      window.localPlayer.lastFiredBulletIds.shift();
    }
  }

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
  // Check if this is a shotgun pellet from the metadata
  const isShotgunPellet = bulletData.isShotgunPellet || false;
  
  // Skip effect creation if this is our own shot coming back from the server
  if (playerId === localPlayer.id) {
    // Just create the bullet with the server's ID without spawning effects again
    const startPos = new THREE.Vector3(bulletData.position.x, bulletData.position.y, bulletData.position.z);
    const dir = new THREE.Vector3(bulletData.direction.x, bulletData.direction.y, bulletData.direction.z);
    
    const bullet = new Bullet(startPos, dir, bulletId, isShotgunPellet);
    
    // Track this bullet ID so we can identify it when impact comes back
    if (!window.localPlayer.lastFiredBulletIds) {
      window.localPlayer.lastFiredBulletIds = [];
    }
    window.localPlayer.lastFiredBulletIds.push(bulletId);
    
    // Keep the array size manageable
    if (window.localPlayer.lastFiredBulletIds.length > 20) {
      window.localPlayer.lastFiredBulletIds.shift();
    }
    
    // Add to bullets array but skip the sound and effects
    bullet.isLocalBullet = true;
    bullet.sourcePlayerId = playerId;
    bullets.push(bullet);
    bulletMap.set(bulletId, bullet);
    
    return;
  }
  
  // For other players' shots, spawn the bullet with full effects
  const startPos = new THREE.Vector3(bulletData.position.x, bulletData.position.y, bulletData.position.z);
  const dir = new THREE.Vector3(bulletData.direction.x, bulletData.direction.y, bulletData.direction.z);
  
  spawnBullet(playerId, startPos, dir, bulletId, isShotgunPellet);
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
      
      // Only play headshot sound if it was a headshot from another player (not local)
      // Prevents double hitmarker sounds when a bullet is not found for a local hit
      const isFromLocalPlayer = (window.localPlayer && 
                              window.localPlayer.lastFiredBulletIds && 
                              window.localPlayer.lastFiredBulletIds.includes(bulletId));
      
      if (hitZone === 'head' && localPlayer && localPlayer.soundManager && !isFromLocalPlayer) {
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
 * @param {boolean} isShotgunPellet - Whether this bullet is a shotgun pellet
 * @returns {Bullet} The created bullet object
 */
function spawnBullet(sourcePlayerId, position, direction, bulletId = null, isShotgunPellet = false) {
  // For local player, determine if this is a shotgun pellet based on their weapon
  const isLocalShotgunPellet = sourcePlayerId === localPlayer.id && localPlayer.activeWeapon === 'shotgun';
  
  // Use the provided flag or infer from local player weapon
  const isPellet = isShotgunPellet || isLocalShotgunPellet;
  
  const bullet = new Bullet(position, direction, bulletId, isPellet);
  bullet.setSourcePlayer(sourcePlayerId);
  
  // Make shotgun pellets smaller
  if (isPellet) {
    bullet.mesh.scale.set(0.5, 0.5, 0.5);
  }
  
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

  // For shotgun pellets after the first one, skip visual effects to avoid overwhelming 
  // the system with too many effects at once
  const showEffects = !isPellet || (isPellet && bullets.length % 3 === 0);
  
  // Visual effects - only for non-pellets or occasionally for pellets
  if (showEffects) {
    createMuzzleFlash(position, direction, scene, muzzleFlashOptions);
    createSmokeEffect(position, direction, scene);
    
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
    
    // Sound effects - only play for non-pellets or the first pellet
    if (!isPellet || (isPellet && bullets.length <= 1)) {
      if (localPlayer.soundManager) {
        // Determine weapon type - try to get from source player or fallback to local player
        let weaponType = 'revolver'; // Default fallback
        
        // If it's the local player, use their active weapon
        if (sourcePlayerId === localPlayer.id) {
          weaponType = localPlayer.activeWeapon;
        } 
        // If it's a remote player, try to get their weapon type from the remote players map
        else if (remotePlayers && remotePlayers.has(sourcePlayerId)) {
          const remotePlayer = remotePlayers.get(sourcePlayerId);
          if (remotePlayer && remotePlayer.activeWeapon) {
            weaponType = remotePlayer.activeWeapon;
          }
        }
        
        // Use appropriate sound based on weapon type
        const soundName = weaponType === 'shotgun' ? "shotgunshot" : "shot";
        
        if (sourcePlayerId === localPlayer.id) {
          // Special handling for mobile to prevent audio duplication/sync issues
          if (window.isMobile) {
            // On mobile, use immediate playback with no delay and higher volume
            // This ensures only one clean sound plays
            localPlayer.soundManager.playSound(soundName, 0, 1.0);
          } else {
            // On desktop, play a non-spatialized gunshot for the local player
            localPlayer.soundManager.playSound(soundName, 50, 1.0);
          }
        } else if (!window.isMobile) {
          // For remote players on desktop, use full spatialized audio
          localPlayer.soundManager.playSoundAt(soundName, position, 50, 0.8);
        } else {
          // For remote players on mobile, use non-spatialized audio to prevent issues
          localPlayer.soundManager.playSound(soundName, 0, 0.8);
        }
      }
    }
  }
  
  // Return the bullet
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
  // Determine if on mobile or desktop
  const isMobile = window.isMobile || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Set dimensions based on device type
  const bannerWidth = isMobile ? '250px' : '1000px'; // Wider for desktop to accommodate two images
  const bannerHeight = isMobile ? '250px' : '500px';
  const startPosition = isMobile ? '-250px' : '-500px';
  
  // Create the instruction banner element
  const instructionBanner = document.createElement('div');
  instructionBanner.id = 'instruction-banner';
  instructionBanner.style.position = 'fixed';
  instructionBanner.style.left = '50%';
  instructionBanner.style.transform = 'translateX(-50%)';
  instructionBanner.style.width = bannerWidth;
  instructionBanner.style.height = bannerHeight;
  instructionBanner.style.zIndex = '2000';
  instructionBanner.style.transition = 'bottom 0.5s ease-out';
  instructionBanner.style.bottom = startPosition; // Start completely off-screen
  instructionBanner.style.display = 'flex'; // Use flex for side-by-side layout
  instructionBanner.style.justifyContent = 'center'; // Center the images
  
  if (isMobile) {
    // For mobile, just add the single mobile manual image
    const instructionImage = document.createElement('img');
    instructionImage.src = 'models/mobilemanual.png';
    instructionImage.style.width = '100%';
    instructionImage.style.height = '100%';
    instructionImage.style.objectFit = 'contain';
    instructionBanner.appendChild(instructionImage);
  } else {
    // For desktop, add both images side by side
    const desktopManualImage = document.createElement('img');
    desktopManualImage.src = 'models/desktopmanual.png';
    desktopManualImage.style.width = '50%';
    desktopManualImage.style.height = '100%';
    desktopManualImage.style.objectFit = 'contain';
    
    const trackpadManualImage = document.createElement('img');
    trackpadManualImage.src = 'models/trackpadmanual.png';
    trackpadManualImage.style.width = '50%';
    trackpadManualImage.style.height = '100%';
    trackpadManualImage.style.objectFit = 'contain';
    
    // Add both images to banner
    instructionBanner.appendChild(desktopManualImage);
    instructionBanner.appendChild(trackpadManualImage);
  }
  
  // Add banner to game container
  document.getElementById('game-container').appendChild(instructionBanner);
  
  // Animate the banner sliding in after a short delay
  setTimeout(() => {
    // Slide up to show the full image
    instructionBanner.style.bottom = '0px';
  }, 100);
  
  // Global function to remove instructions
  window.removeInstructions = () => {
    // Animate the banner sliding out
    instructionBanner.style.bottom = startPosition;
    
    // Remove from DOM after animation completes
    setTimeout(() => {
      if (instructionBanner.parentNode) {
        instructionBanner.parentNode.removeChild(instructionBanner);
      }
    }, 500);
  };
  
  // Add event listener to close banner on any click
  document.addEventListener('click', window.removeInstructions, {once: true});
  document.addEventListener('touchstart', window.removeInstructions, {once: true, passive: false});
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

/**
 * Setup viewport detection and handling, especially for iOS devices
 * where fullscreen is not available by default
 */
function setupViewportHandling() {
  // Store initial viewport dimensions
  updateViewportDimensions();
  
  // Listen for orientation changes and resize events
  window.addEventListener('orientationchange', () => {
    // Small delay to allow browser to complete orientation change
    setTimeout(updateViewportDimensions, 300);
  });
  
  window.addEventListener('resize', () => {
    updateViewportDimensions();
  });
  
  // Initial call to apply any needed viewport adjustments
  applyViewportAdjustments();
  
  // Add keyboard shortcut for toggling debug mode (Alt+D)
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'd') {
      window.debugMode = !window.debugMode;
      console.log(`Debug mode ${window.debugMode ? 'enabled' : 'disabled'}`);
      
      // When debug mode is enabled, show a small indicator
      let debugIndicator = document.getElementById('debug-indicator');
      if (window.debugMode) {
        if (!debugIndicator) {
          debugIndicator = document.createElement('div');
          debugIndicator.id = 'debug-indicator';
          debugIndicator.style.position = 'fixed';
          debugIndicator.style.top = '10px';
          debugIndicator.style.right = '10px';
          debugIndicator.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
          debugIndicator.style.color = 'white';
          debugIndicator.style.padding = '5px';
          debugIndicator.style.borderRadius = '3px';
          debugIndicator.style.fontSize = '12px';
          debugIndicator.style.zIndex = '1000';
          document.body.appendChild(debugIndicator);
        }
        debugIndicator.textContent = 'DEBUG MODE';
        debugIndicator.style.display = 'block';
      } else if (debugIndicator) {
        debugIndicator.style.display = 'none';
      }
    }
  });
}

/**
 * Update the viewport dimensions when orientation or size changes
 */
function updateViewportDimensions() {
  // Get current viewport and device dimensions
  const visualWidth = window.innerWidth;
  const visualHeight = window.innerHeight;
  const deviceWidth = window.screen.width;
  const deviceHeight = window.screen.height;
  
  // Store these values globally for access by other modules
  window.viewportInfo = {
    visualWidth,
    visualHeight,
    deviceWidth,
    deviceHeight,
    isLandscape: visualWidth > visualHeight,
    // Calculate ratio of visual height to full device height
    viewportRatio: visualHeight / deviceHeight
  };
  
  // Log information for iOS devices
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
    console.log(`Viewport updated - Visual: ${visualWidth}x${visualHeight}, Device: ${deviceWidth}x${deviceHeight}`);
    
    if (window.viewportInfo.viewportRatio < 1) {
      console.log(`Unused screen space detected. Viewport ratio: ${window.viewportInfo.viewportRatio.toFixed(2)}`);
    }
  }
  
  // Apply adjustments based on new dimensions
  applyViewportAdjustments();
}

/**
 * Apply necessary adjustments based on viewport dimensions
 */
function applyViewportAdjustments() {
  // If we have a renderer, update the camera aspect ratio
  if (window.renderer && window.renderer.camera) {
    window.renderer.camera.aspect = window.innerWidth / window.innerHeight;
    window.renderer.camera.updateProjectionMatrix();
  }
  
  // Resize renderer if available
  if (window.renderer && window.renderer.instance) {
    window.renderer.instance.setSize(window.innerWidth, window.innerHeight);
  }
}

/**
 * Creates weapon indicator UI for desktop
 */
function createDesktopWeaponIndicators() {
  if (isMobileDevice()) return; // Mobile has its own indicators
  
  // Add styles for weapon indicators
  const style = document.createElement('style');
  style.textContent = `
    .desktop-weapon-indicator {
      position: fixed;
      left: 20px;
      width: 40px;
      height: 40px;
      background-color: rgba(0, 0, 0, 0.6);
      border: 2px solid rgba(255, 255, 255, 0.5);
      border-radius: 5px;
      margin-bottom: 5px;
      opacity: 0.7;
      transition: opacity 0.3s, border-color 0.3s, box-shadow 0.3s;
      cursor: pointer;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .desktop-weapon-indicator:hover {
      opacity: 1;
    }
    .desktop-weapon-indicator.active {
      border-color: #ffcc00 !important;
      box-shadow: 0 0 10px #ffcc00;
      opacity: 1;
    }
    #revolver-indicator-desktop {
      bottom: 150px;
    }
    #shotgun-indicator-desktop {
      bottom: 120px;
    }
    .weapon-number {
      position: absolute;
      top: -8px;
      right: -8px;
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      font-size: 12px;
      padding: 2px 5px;
      border-radius: 10px;
      font-family: 'Courier New', monospace;
    }
  `;
  document.head.appendChild(style);
  
  // Create container for both indicators
  const container = document.createElement('div');
  container.id = 'desktop-weapon-indicators';
  
  // Create revolver indicator
  const revolverIndicator = document.createElement('div');
  revolverIndicator.id = 'revolver-indicator-desktop';
  revolverIndicator.className = 'desktop-weapon-indicator active';
  
  // Add revolver icon (same as mobile)
  const revolverImg = document.createElement('img');
  revolverImg.src = 'models/revolverindicator.png';
  revolverImg.style.width = '80%';
  revolverImg.style.height = '80%';
  revolverImg.style.objectFit = 'contain';
  revolverIndicator.appendChild(revolverImg);
  
  // Add number indicator
  const revolverNum = document.createElement('div');
  revolverNum.className = 'weapon-number';
  revolverNum.textContent = '1';
  revolverIndicator.appendChild(revolverNum);
  
  // Create shotgun indicator
  const shotgunIndicator = document.createElement('div');
  shotgunIndicator.id = 'shotgun-indicator-desktop';
  shotgunIndicator.className = 'desktop-weapon-indicator';
  
  // Add shotgun icon (same as mobile)
  const shotgunImg = document.createElement('img');
  shotgunImg.src = 'models/shotgunindicator.png';
  shotgunImg.style.width = '80%';
  shotgunImg.style.height = '80%';
  shotgunImg.style.objectFit = 'contain';
  shotgunIndicator.appendChild(shotgunImg);
  
  // Add number indicator
  const shotgunNum = document.createElement('div');
  shotgunNum.className = 'weapon-number';
  shotgunNum.textContent = '2';
  shotgunIndicator.appendChild(shotgunNum);
  
  // Add click handlers
  revolverIndicator.addEventListener('click', () => {
    if (window.localPlayer) {
      window.localPlayer.switchWeapon('revolver');
    }
  });
  
  shotgunIndicator.addEventListener('click', () => {
    if (window.localPlayer) {
      window.localPlayer.switchWeapon('shotgun');
    }
  });
  
  // Add to DOM
  document.body.appendChild(revolverIndicator);
  document.body.appendChild(shotgunIndicator);
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