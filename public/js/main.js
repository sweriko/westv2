import { initScene, createNPC, updateNPC, updateFPS, scene } from './scene.js';
import { initInput } from './input.js';
import { SoundManager } from './soundManager.js';
import { Player } from './player.js';
import { networkManager } from './network.js';
import { MultiplayerManager } from './multiplayerManager.js';
import { Bullet } from './bullet.js';
import { createMuzzleFlash, createSmokeEffect, createShockwaveRing, createImpactEffect, SmokeRingEffect } from './effects.js';
import { QuickDraw } from './quickDraw.js';
import { updateAmmoUI, updateHealthUI } from './ui.js';
import { PhysicsSystem } from './physics.js';

// Keep track of all bullets in the game, both local and remote
let bullets = [];

// Anti-cheat: Map bullets by ID for server authority
let bulletMap = new Map(); // bulletId -> Bullet object

// We'll keep references to local player, remote players, and a combined map
let localPlayer;
let remotePlayers = new Map();  // (playerId => ThirdPersonModel)
let playersMap = new Map();     // Master map including local + remote

// Scenes, camera, etc.
let renderer, camera, npc;
let multiplayerManager;
let quickDraw;
let physics;
let lastTime = 0;

// Smoke ring effects
let smokeRings = [];
let maxSmokeRings = 10; // Limit to prevent performance issues

function init() {
  try {
    const sceneSetup = initScene();
    camera = sceneSetup.camera;
    renderer = sceneSetup.renderer;

    const soundManager = new SoundManager();
    // Load shot sounds
    soundManager.loadSound("shot2", "sounds/shot2.mp3");
    soundManager.loadSound("shot3", "sounds/shot3.mp3");
    soundManager.loadSound("shot5", "sounds/shot5.mp3");
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
    
    // Initialize physics system
    physics = new PhysicsSystem();
    window.physics = physics; // Make physics globally accessible

    // Create town boundary if dimensions are available
    if (window.townDimensions) {
      physics.createTownBoundary(
        window.townDimensions.width,
        window.townDimensions.length,
        5 // Height of the barrier
      );
    }
    
    // Initialize a smoke ring effect pool for reuse
    for (let i = 0; i < 3; i++) {
      const smokeRing = new SmokeRingEffect(scene);
      smokeRing.active = false;
      smokeRings.push(smokeRing);
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

    // Create an NPC target
    npc = createNPC(scene);

    // Initialize input
    initInput(renderer, localPlayer, soundManager);
    
    // Make scene globally accessible for physics visualization
    window.scene = scene;

    // Initialize Quick Draw game mode after the local player is created
    quickDraw = new QuickDraw(scene, localPlayer, networkManager, soundManager);
    
    // Share the main physics system with QuickDraw
    quickDraw.physics = physics;
    
    // Debug toggle for physics visualization (press P)
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyP') {
        if (physics) {
          const isDebugMode = !physics.debugMode;
          physics.setDebugMode(isDebugMode);
          console.log(`Physics debug mode: ${isDebugMode ? 'ENABLED' : 'DISABLED'}`);
          
          // If turning on debug mode, update hit zone debug for all existing players
          if (isDebugMode) {
            // Create debug boxes for all remote players
            for (const [playerId, remotePlayer] of remotePlayers.entries()) {
              // Force a collision check to create debug boxes
              const dummyBullet = new Bullet(
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 1, 0)
              );
              dummyBullet.checkPlayerHitZones(remotePlayer, new THREE.Vector3(0, 0, 0));
            }
          }
        }
      }
    });
    
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
    };

    // Start the animation loop
    animate(0);
    showGameInstructions();
    
  } catch (error) {
    console.error('Initialization failed:', error);
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

  // Update NPC using the imported updateNPC function
  updateNPC(npc, deltaTime);

  // Update remote players (animations, movement interpolation, etc.)
  multiplayerManager.update(deltaTime);
  
  // Update Quick Draw game mode
  if (quickDraw) {
    quickDraw.update(deltaTime);
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
    const result = bullet.update(deltaTime, npc, scene, playersMap);
    if (!result.active) {
      // If bullet hit something or traveled too far
      if (result.hit && result.hit.type === 'player') {
        console.log(`Bullet hit player ${result.hit.playerId} in the ${result.hit.zone || 'body'} for ${result.hit.damage || 'unknown'} damage`);
        
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

  // Render
  renderer.render(scene, camera);
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
    console.log(`Bullet ${bulletId} not found for impact event`);
    
    // If we don't have the bullet object, still create visual effect at impact position
    if (impactPosition) {
      // Create a default direction vector (upward)
      const defaultDir = new THREE.Vector3(0, 1, 0);
      createImpactEffect(impactPosition, defaultDir, scene, hitType);
      
      // Play headshot sound if it was a headshot
      if (hitZone === 'head' && localPlayer && localPlayer.soundManager) {
        localPlayer.soundManager.playSound("headshotmarker", 100);
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

  // Visual effects
  createMuzzleFlash(position, scene);
  createSmokeEffect(position, direction, scene);
  createShockwaveRing(position, direction, scene);
  
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
    smokeRing.create(position, direction);
  }

  // Sound: randomly choose one of the three shot sounds
  if (localPlayer.soundManager) {
    const shotSounds = ["shot2", "shot3", "shot5"];
    const randomIndex = Math.floor(Math.random() * shotSounds.length);
    const shotSound = shotSounds[randomIndex];
    localPlayer.soundManager.playSound(shotSound);
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
    <p>P: Toggle physics debug visualization</p>
    <p><strong>Click anywhere to start</strong></p>
    <p><strong>New:</strong> Find the Quick Draw portal near spawn to duel other players!</p>
    <p><strong>Town Boundary:</strong> You must stay within the town limits and can only access the duel arena through the portal.</p>
    <p><strong>Hit Zones:</strong> Headshots deal 100 damage, body shots 40, and limb shots 20.</p>`;
  
  document.getElementById('game-container').appendChild(instructions);
  
  // Remove instructions on click
  document.addEventListener('click', () => {
    if (instructions.parentNode) {
      instructions.parentNode.removeChild(instructions);
    }
  }, { once: true });
}

// Handle window unload to cleanup physics resources
window.addEventListener('beforeunload', () => {
  if (quickDraw && quickDraw.physics) {
    quickDraw.physics.cleanup();
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

init();