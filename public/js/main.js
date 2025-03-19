import { initScene, createNPC, updateNPC, updateFPS, scene } from './scene.js';
import { initInput } from './input.js';
import { SoundManager } from './soundManager.js';
import { Player } from './player.js';
import { networkManager } from './network.js';
import { MultiplayerManager } from './multiplayerManager.js';
import { Bullet } from './bullet.js';
import { createMuzzleFlash, createSmokeEffect, createShockwaveRing } from './effects.js';

// Keep track of all bullets in the game, both local and remote
let bullets = [];

// We'll keep references to local player, remote players, and a combined map
let localPlayer;
let remotePlayers = new Map();  // (playerId => ThirdPersonModel)
let playersMap = new Map();     // Master map including local + remote

// Scenes, camera, etc.
let renderer, camera, npc;
let multiplayerManager;
let lastTime = 0;

function init() {
  try {
    const sceneSetup = initScene();
    camera = sceneSetup.camera;
    renderer = sceneSetup.renderer;

    const soundManager = new SoundManager();
    soundManager.loadSound("shot1", "sounds/shot1.mp3");
    soundManager.loadSound("shot2", "sounds/shot2.mp3");
    soundManager.loadSound("aimclick", "sounds/aimclick.mp3");
    soundManager.loadSound("shellejection", "sounds/shellejection.mp3");
    soundManager.loadSound("reloading", "sounds/reloading.mp3");
    
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
    networkManager.onPlayerShoot = (playerId, bulletData) => {
      handleRemotePlayerShoot(playerId, bulletData);
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

  // Update local player
  localPlayer.update(deltaTime);

  // Update NPC using the imported updateNPC function
  updateNPC(npc, deltaTime);

  // Update remote players (animations, movement interpolation, etc.)
  multiplayerManager.update(deltaTime);

  // Update bullets (both local & remote)
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    const result = bullet.update(deltaTime, npc, scene, playersMap);
    if (!result.active) {
      // If bullet hit something or traveled too far
      if (result.hit && result.hit.type === 'player') {
        console.log(`Bullet hit player ${result.hit.playerId}`);
      }
      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
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
  // Spawn bullet in our local game
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
}

/**
 * Called whenever a remote player fires (based on network data).
 * @param {number} playerId 
 * @param {Object} bulletData 
 */
function handleRemotePlayerShoot(playerId, bulletData) {
  const startPos = new THREE.Vector3(bulletData.position.x, bulletData.position.y, bulletData.position.z);
  const dir = new THREE.Vector3(bulletData.direction.x, bulletData.direction.y, bulletData.direction.z);

  spawnBullet(playerId, startPos, dir);
}

/**
 * Actually spawns a bullet in the world, complete with muzzle flash, etc.
 * @param {string|number} sourcePlayerId 
 * @param {THREE.Vector3} position 
 * @param {THREE.Vector3} direction 
 */
function spawnBullet(sourcePlayerId, position, direction) {
  const bullet = new Bullet(position, direction);
  bullet.setSourcePlayer(sourcePlayerId);
  bullets.push(bullet);
  scene.add(bullet.mesh);

  // Visual effects
  createMuzzleFlash(position, scene);
  createSmokeEffect(position, direction, scene);
  createShockwaveRing(position, direction, scene);

  // Sound
  if (localPlayer.soundManager) {
    const shotSound = Math.random() < 0.5 ? "shot1" : "shot2";
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
  // Only add remote players so that the local (shooter’s) model isn’t processed in bullet collisions.
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
  
  instructions.innerHTML = 
    `<h2>Wild Western Shooter - Multiplayer</h2>
    <p>WASD: Move</p>
    <p>Right-click: Aim</p>
    <p>Left-click (while aiming): Shoot</p>
    <p>R: Reload</p>
    <p>Space: Jump</p>
    <p><strong>Click anywhere to start</strong></p>`;
  
  document.getElementById('game-container').appendChild(instructions);
  
  // Remove instructions on click
  document.addEventListener('click', () => {
    if (instructions.parentNode) {
      instructions.parentNode.removeChild(instructions);
    }
  }, { once: true });
}

init();
