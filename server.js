// server.js
console.log("Starting server initialization...");
const express = require('express');
console.log("Express loaded");
const http = require('http');
console.log("HTTP loaded");
const WebSocket = require('ws');
console.log("WebSocket loaded");
const url = require('url');
console.log("URL loaded");
const app = express();
console.log("Express app created");

// Port default 8080 to match your previous Cloudflare Tunnel config
const PORT = process.env.PORT || 8080;
console.log("Port set to", PORT);

// Serve static files from "public"
app.use(express.static('public'));
console.log("Static file serving configured");

const server = http.createServer(app);
console.log("HTTP server created");
const wss = new WebSocket.Server({ server, clientTracking: true });
console.log("WebSocket server created");

// Track connected players
const players = new Map();    // playerId -> { ws, sessionId, position, rotation, health, ... }
const sessions = new Set();   // tracks sessionIds to prevent duplicate connections
let nextPlayerId = 1;
console.log("Player tracking variables initialized");

// New: Track persistent player identities
const playerIdentities = new Map(); // clientId -> { username, playerId, lastSeen }
console.log("Player identity tracking initialized");

// Position history tracking to reduce unnecessary corrections
const playerPositionHistory = new Map(); // playerId -> array of recent positions
const POSITION_HISTORY_SIZE = 10; // Number of positions to track per player
const CORRECTION_COOLDOWN = 5000; // Minimum ms between position corrections
console.log("Position history tracking initialized");

// Track Quick Draw game mode queues and active duels
// Support for 5 concurrent lobbies
const MAX_ARENAS = 5;
const quickDrawQueues = Array(MAX_ARENAS).fill(null).map(() => []);  // Array of queues for each arena
const quickDrawDuels = new Map(); // Map of duelId -> { player1Id, player2Id, state, arenaIndex, ... }
console.log("Quick Draw game mode variables initialized");

// Anti-cheat: Game physics constants
const GAME_CONSTANTS = {
  // Weapon constraints
  BULLET_SPEED: 80,           // Bullet speed units/second
  MAX_BULLET_DISTANCE: 100,   // Maximum distance a bullet can travel
  WEAPON_COOLDOWN: 250,       // Minimum time between shots in ms
  RELOAD_TIME: 4000,          // Time required to reload in ms
  DAMAGE_PER_HIT: 20,         // Health points reduced per hit
  // Town boundaries
  TOWN_WIDTH: 60,             // Width of the town
  TOWN_LENGTH: 100,           // Length of the town
  // Physics update rate
  PHYSICS_UPDATE_INTERVAL: 16 // ms (approx 60fps)
};

// Anti-cheat: Active bullets map
const activeBullets = new Map(); // bulletId -> {sourcePlayerId, position, direction, timeCreated, etc}
let nextBulletId = 1;

// Anti-cheat: Timeout tracking (for rate limiting and cooldowns)
const playerTimeouts = new Map(); // playerId -> { lastShot, lastReload, lastTeleport, etc }

// Anti-cheat: Nonce tracking (for anti-replay protection)
const playerNonces = new Map(); // playerId -> Set of used nonces
const playerSequences = new Map(); // playerId -> last sequence number

// On new connection
wss.on('connection', (ws, req) => {
  // Parse parameters from query string
  const parameters = url.parse(req.url, true).query;
  const sessionId = parameters.sessionId;
  const clientId = parameters.clientId;
  const username = parameters.username;

  // If we already have this sessionId, reject as duplicate
  if (sessionId && sessions.has(sessionId)) {
    console.log(`Rejecting duplicate connection with sessionId: ${sessionId}`);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Duplicate connection detected',
      fatal: true
    }));
    return ws.close(1008, 'Duplicate connection');
  }

  if (sessionId) {
    sessions.add(sessionId);
  }

  const playerId = nextPlayerId++;
  console.log(`Player ${playerId} connected (sessionId: ${sessionId || 'none'}, username: ${username || 'Anonymous'})`);

  // Store player identity information if provided
  if (clientId) {
    playerIdentities.set(clientId, {
      username: username || 'Anonymous',
      playerId,
      lastSeen: Date.now()
    });
    console.log(`Associated player ${playerId} with clientId ${clientId} and username ${username || 'Anonymous'}`);
  }

  // Create initial player data with health and QuickDraw info
  players.set(playerId, {
    ws,
    sessionId,
    clientId,
    username: username || 'Anonymous',
    position: { x: 0, y: 1.6, z: 0 },
    rotation: { y: 0 },
    isAiming: false,
    isShooting: false,
    isReloading: false,
    health: 100,
    lastActivity: Date.now(),
    quickDrawLobbyIndex: -1, // -1 means not in any lobby
    inQuickDrawQueue: false,
    inQuickDrawDuel: false,
    quickDrawDuelId: null,
    // Additional player state
    bullets: 6,
    maxBullets: 6,
    lastUpdateTime: Date.now()
  });

  // Anti-cheat: Initialize timeout tracking
  playerTimeouts.set(playerId, {
    lastShot: 0,
    lastMovement: 0,
    lastReload: 0,
    lastPositionUpdate: 0,
    lastPositionCorrection: 0,
    reloadStartTime: 0,
    isReloading: false
  });

  // Anti-cheat: Initialize nonce/sequence tracking
  playerNonces.set(playerId, new Set());
  playerSequences.set(playerId, 0);

  // Send init data to this client (their ID + existing players)
  ws.send(JSON.stringify({
    type: 'init',
    id: playerId,
    players: Array.from(players.entries())
      .filter(([pid]) => pid !== playerId)
      .map(([pid, p]) => ({
        id: pid,
        position: p.position,
        rotation: p.rotation,
        isAiming: p.isAiming,
        isShooting: p.isShooting,
        isReloading: p.isReloading,
        health: p.health,
        username: p.username,
        quickDrawLobbyIndex: p.quickDrawLobbyIndex
      }))
  }));

  // Notify others that a new player joined
  broadcastToOthers(playerId, {
    type: 'playerJoined',
    id: playerId,
    position: players.get(playerId).position,
    rotation: players.get(playerId).rotation,
    health: players.get(playerId).health,
    username: players.get(playerId).username,
    quickDrawLobbyIndex: players.get(playerId).quickDrawLobbyIndex
  });

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Update lastActivity
      const player = players.get(playerId);
      if (!player) return;
      
      player.lastActivity = Date.now();

      // Anti-cheat: Sequence number validation
      if (data.sequenceNumber !== undefined) {
        const lastSequence = playerSequences.get(playerId) || 0;
        
        // Reject if sequence number is not greater than the last one
        if (data.sequenceNumber <= lastSequence) {
          console.log(`Rejecting message with old sequence number: ${data.sequenceNumber} (last: ${lastSequence})`);
          return sendErrorToPlayer(playerId, "Invalid sequence number", false);
        }
        
        // Update the last sequence number
        playerSequences.set(playerId, data.sequenceNumber);
      }

      // Anti-cheat: Nonce validation for critical actions
      if ((data.type === 'shoot' || data.type === 'playerHit') && data.nonce) {
        const playerNonceSet = playerNonces.get(playerId);
        
        // Check if nonce has been used before
        if (playerNonceSet && playerNonceSet.has(data.nonce)) {
          console.log(`Rejecting repeated nonce: ${data.nonce} from player ${playerId}`);
          return sendErrorToPlayer(playerId, "Duplicate nonce detected", false);
        }
        
        // Store the nonce
        if (playerNonceSet) {
          playerNonceSet.add(data.nonce);
          
          // Limit nonce set size to prevent memory issues
          if (playerNonceSet.size > 1000) {
            // Keep only the most recent 500 nonces
            const nonceArray = Array.from(playerNonceSet);
            const newNonceSet = new Set(nonceArray.slice(nonceArray.length - 500));
            playerNonces.set(playerId, newNonceSet);
          }
        }
      }

      switch (data.type) {
        case 'update':
          handlePlayerUpdate(playerId, data);
          break;

        case 'shoot':
          handlePlayerShoot(playerId, data);
          break;

        case 'playerHit':
          handlePlayerHit(playerId, data.targetId, data.hitData, data.bulletId);
          break;

        case 'reload':
          handlePlayerReload(playerId, data);
          break;

        case 'ping':
          // respond
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
          
        case 'quickDrawJoin':
          handleQuickDrawJoin(playerId, data.arenaIndex);
          break;
          
        case 'quickDrawLeave':
          handleQuickDrawLeave(playerId);
          break;
          
        case 'quickDrawReady':
          handleQuickDrawReady(playerId, data.arenaIndex);
          break;
          
        case 'quickDrawShoot':
          // Pass the hit zone and damage if provided
          handleQuickDrawShoot(
            playerId, 
            data.opponentId, 
            data.arenaIndex, 
            data.hitZone || 'body', 
            data.damage || 40
          );
          break;
          
        // Add new handlers for direct challenge system
        case 'quickDrawChallenge':
          handleQuickDrawChallenge(playerId, data.targetPlayerId);
          break;
          
        case 'quickDrawAccept':
          handleQuickDrawAcceptChallenge(playerId, data.challengerId);
          break;
          
        case 'quickDrawDecline':
          handleQuickDrawDeclineChallenge(playerId, data.challengerId);
          break;

        default:
          break;
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  // On close
  ws.on('close', () => {
    cleanupPlayer(playerId);
  });

  // On error
  ws.on('error', (err) => {
    console.error(`WebSocket error for player ${playerId}:`, err);
    cleanupPlayer(playerId);
  });

  // Update the global player count UI
  updatePlayerCount();
});

// Handle player updates - removed speed/position validation
function handlePlayerUpdate(playerId, data) {
  const player = players.get(playerId);
  const timeouts = playerTimeouts.get(playerId);
  
  if (!player || !timeouts) return;
  
  const now = Date.now();
  
  // Anti-cheat: Basic rate limit for position updates only
  if (now - timeouts.lastPositionUpdate < 16) { // Max 60 updates per second
    return; // Silently ignore too frequent updates
  }
  timeouts.lastPositionUpdate = now;
  
  // Update player data
  if (data.position) {
    player.position = data.position;
  }
  
  // Update other player properties
  player.rotation = data.rotation || player.rotation;
  player.isAiming = data.isAiming !== undefined ? data.isAiming : player.isAiming;
  player.isReloading = data.isReloading !== undefined ? data.isReloading : player.isReloading;
  
  // Update QuickDraw lobby index if provided
  if (data.quickDrawLobbyIndex !== undefined) {
    player.quickDrawLobbyIndex = data.quickDrawLobbyIndex;
  }
  
  if (data.isSprinting !== undefined) {
    player.isSprinting = data.isSprinting;
  }
  
  // Broadcast valid update to others
  broadcastToOthers(playerId, {
    type: 'playerUpdate',
    id: playerId,
    position: player.position,
    rotation: player.rotation,
    isAiming: player.isAiming,
    isShooting: player.isShooting,
    isReloading: player.isReloading,
    health: player.health,
    username: player.username,
    quickDrawLobbyIndex: player.quickDrawLobbyIndex
  });
}

// Anti-cheat: Handle player shooting with validation and server-side trajectory
function handlePlayerShoot(playerId, data) {
  const player = players.get(playerId);
  const timeouts = playerTimeouts.get(playerId);
  
  if (!player || !timeouts) return;
  
  const now = Date.now();
  
  // Anti-cheat: Check if player has bullets
  if (player.bullets <= 0) {
    return sendErrorToPlayer(playerId, "Cannot shoot: out of ammo", false);
  }
  
  // Anti-cheat: Check if player is reloading
  if (player.isReloading) {
    return sendErrorToPlayer(playerId, "Cannot shoot while reloading", false);
  }
  
  // Anti-cheat: Enforce weapon cooldown
  if (now - timeouts.lastShot < GAME_CONSTANTS.WEAPON_COOLDOWN) {
    console.log(`Rate limit exceeded: Player ${playerId} attempted to shoot too quickly`);
    return sendErrorToPlayer(playerId, "Shooting too fast", false);
  }
  
  // Quick Draw gun lock validation
  if (player.inQuickDrawDuel && player.quickDrawDuelId) {
    const duel = quickDrawDuels.get(player.quickDrawDuelId);
    if (duel && duel.state !== 'draw') {
      return sendErrorToPlayer(playerId, "Cannot shoot before draw signal", false);
    }
  }
  
  // Validate bullet data
  if (!data.bulletData || !data.bulletData.position || !data.bulletData.direction) {
    return sendErrorToPlayer(playerId, "Invalid bullet data", false);
  }
  
  // Validate bullet direction (must be normalized)
  const direction = data.bulletData.direction;
  const dirMagnitude = Math.sqrt(direction.x*direction.x + direction.y*direction.y + direction.z*direction.z);
  
  if (Math.abs(dirMagnitude - 1) > 0.01) {
    console.log(`Invalid bullet direction: not normalized for player ${playerId} (magnitude: ${dirMagnitude.toFixed(2)})`);
    
    // Normalize the direction
    direction.x /= dirMagnitude;
    direction.y /= dirMagnitude;
    direction.z /= dirMagnitude;
  }
  
  // All validations passed, decrement bullet count
  player.bullets--;
  
  // Update lastShot timestamp
  timeouts.lastShot = now;
  
  // Create a server-side bullet
  const bulletId = nextBulletId++;
  
  const bullet = {
    id: bulletId,
    sourcePlayerId: playerId,
    position: data.bulletData.position,
    direction: direction,
    distanceTraveled: 0,
    maxDistance: GAME_CONSTANTS.MAX_BULLET_DISTANCE,
    speed: GAME_CONSTANTS.BULLET_SPEED,
    timeCreated: now,
    active: true
  };
  
  // Add to active bullets
  activeBullets.set(bulletId, bullet);
  
  // Notify clients of the shot
  broadcastToAll({
    type: 'playerShoot',
    id: playerId,
    bulletId: bulletId,
    bulletData: {
      position: data.bulletData.position,
      direction: direction
    }
  });
  
  // Update the player's shooting state
  player.isShooting = true;
  
  // Reset shooting state after a short delay
  setTimeout(() => {
    if (players.has(playerId)) {
      players.get(playerId).isShooting = false;
    }
  }, 100);
}

// Anti-cheat: Handle player reload with validation
function handlePlayerReload(playerId, data) {
  const player = players.get(playerId);
  const timeouts = playerTimeouts.get(playerId);
  
  if (!player || !timeouts) return;
  
  const now = Date.now();
  
  // Check if player is already reloading
  if (player.isReloading) {
    return sendErrorToPlayer(playerId, "Already reloading", false);
  }
  
  // Check if player has full ammo
  if (player.bullets >= player.maxBullets) {
    return sendErrorToPlayer(playerId, "Ammo already full", false);
  }
  
  // Start reload process
  player.isReloading = true;
  timeouts.isReloading = true;
  timeouts.reloadStartTime = now;
  
  // Notify all players about reload start
  broadcastToAll({
    type: 'playerUpdate',
    id: playerId,
    isReloading: true
  });
  
  // Schedule reload completion
  setTimeout(() => {
    if (!players.has(playerId)) return;
    
    const timeouts = playerTimeouts.get(playerId);
    if (!timeouts) return;
    
    // Check if player is still reloading (could have been cancelled)
    if (timeouts.isReloading) {
      const player = players.get(playerId);
      
      // Complete reload
      player.bullets = player.maxBullets;
      player.isReloading = false;
      timeouts.isReloading = false;
      
      // Notify all players about reload completion
      broadcastToAll({
        type: 'playerUpdate',
        id: playerId,
        isReloading: false,
        bullets: player.maxBullets
      });
    }
  }, GAME_CONSTANTS.RELOAD_TIME);
}

// Anti-cheat: Handle player hit validation
function handlePlayerHit(playerId, targetId, hitData, bulletId) {
  console.log(`Player ${playerId} claims hit on player ${targetId}`);
  
  // Basic validation
  if (!players.has(playerId) || !players.has(targetId)) {
    console.log(`Hit claim invalid - player ${playerId} or target ${targetId} not found`);
    return;
  }
  
  const player = players.get(playerId);
  const target = players.get(targetId);
  
  // Check if bullet ID is valid, if provided
  if (bulletId && !activeBullets.has(bulletId)) {
    console.log(`Invalid bullet ID: ${bulletId}`);
    return sendErrorToPlayer(playerId, "Invalid bullet ID", false);
  }
  
  // Track hit timestamps to prevent double-counting hits
  // Initialize hit tracking structure if not already present
  if (!player.recentHits) {
    player.recentHits = new Map();
  }
  
  // Check for duplicate/too frequent hits on the same target
  const now = Date.now();
  const lastHitTime = player.recentHits.get(targetId) || 0;
  const hitDebounceTime = 300; // 300ms minimum between hits on same target
  
  if (now - lastHitTime < hitDebounceTime) {
    console.log(`Hit debounced: Player ${playerId} hit ${targetId} too quickly after last hit (${now - lastHitTime}ms)`);
    return; // Silently ignore too-frequent hits
  }
  
  // Update last hit time for this target
  player.recentHits.set(targetId, now);
  
  // ADDED: Check if this is a quickdraw duel hit
  // If the players are in a quickdraw duel, handle it using the quickdraw logic
  if (player.inQuickDrawDuel && target.inQuickDrawDuel && player.quickDrawDuelId === target.quickDrawDuelId) {
    const duel = quickDrawDuels.get(player.quickDrawDuelId);
    if (duel && duel.state === 'draw') {
      console.log(`Handling hit as part of QuickDraw duel ${player.quickDrawDuelId}`);
      // Calculate damage based on hit zone
      let finalDamage = 40; // Default body shot
      
      if (hitData.hitZone === 'head') {
        finalDamage = 100; // One-shot kill for headshots
      } else if (hitData.hitZone === 'limbs') {
        finalDamage = Math.round(40 * 0.6); // Reduced damage for limb shots
      } else if (hitData.hitZone === 'body') {
        finalDamage = 40; // Standard body shot damage
      }
      
      // Use the quickdraw handler with the appropriate damage and hit zone
      handleQuickDrawShoot(playerId, targetId, undefined, hitData.hitZone, finalDamage);
      return;
    }
  }
  
  // Rest of original hit handling for non-quickdraw hits
  // Get bullet data if available
  let bullet = null;
  if (bulletId && activeBullets.has(bulletId)) {
    bullet = activeBullets.get(bulletId);
  }
  
  // Calculate damage based on hit zone (if available)
  let damage = GAME_CONSTANTS.DAMAGE_PER_HIT;
  if (hitData.hitZone === 'head') {
    damage = 100; // One-shot kill for headshots
  } else if (hitData.hitZone === 'body') {
    damage = 40; // Standard body shot
  } else if (hitData.hitZone === 'limbs') {
    damage = 20; // Reduced damage for limbs
  }
  
  // Apply damage to target
  target.health = Math.max(0, target.health - damage);
  
  // Notify both target and shooter
  if (target.ws && target.ws.readyState === WebSocket.OPEN) {
    target.ws.send(JSON.stringify({
      type: 'hit',
      sourceId: playerId,
      hitData: hitData,
      hitZone: hitData.hitZone,
      health: target.health
    }));
  }
  
  if (player.ws && player.ws.readyState === WebSocket.OPEN) {
    player.ws.send(JSON.stringify({
      type: 'playerHit',
      targetId: targetId,
      sourceId: playerId,
      hitPosition: hitData.position,
      health: target.health,
      hitZone: hitData.hitZone,
      damage: damage
    }));
  }
  
  // Broadcast hit to other players for visual effects
  broadcastToOthers([playerId, targetId], {
    type: 'playerHit',
    targetId: targetId,
    sourceId: playerId,
    hitPosition: hitData.position,
    health: target.health,
    hitZone: hitData.hitZone,
    damage: damage
  });
  
  // Check if target has been defeated
  if (target.health <= 0) {
    handlePlayerDeath(targetId, playerId);
  }
}

// Anti-cheat: Bullet-player collision detection
function isPlayerHitByBullet(player, bullet) {
  // Calculate player hitbox (simple cylinder)
  const playerRadius = 0.6;  // Increased horizontal radius to match client's bodyWidth
  const playerHeight = 2.0;  // vertical height
  
  // Calculate distance from bullet to player (horizontal only)
  const dx = bullet.position.x - player.position.x;
  const dz = bullet.position.z - player.position.z;
  const horizontalDist = Math.sqrt(dx * dx + dz * dz);
  
  // Check if bullet is within player's horizontal radius
  if (horizontalDist > playerRadius) {
    return false;
  }
  
  // Check if bullet is within player's vertical bounds
  const bulletY = bullet.position.y;
  const playerBottom = player.position.y - 1.6; // Adjust based on your coordinate system
  const playerTop = playerBottom + playerHeight;
  
  // Add some tolerance to vertical bounds
  const tolerance = 0.2;
  if (bulletY < playerBottom - tolerance || bulletY > playerTop + tolerance) {
    return false;
  }
  
  // Bullet is inside player's hitbox
  return true;
}

// Anti-cheat: Handle player death
function handlePlayerDeath(playerId, killedById) {
  const player = players.get(playerId);
  if (!player) return;
  
  console.log(`Player ${playerId} was killed by player ${killedById}`);
  
  // Skip handling if player is in QuickDraw duel
  // QuickDraw duels handle their own death/end conditions
  if (player.inQuickDrawDuel) {
    console.log(`Player ${playerId} is in a QuickDraw duel - skipping regular death handling`);
    return;
  }
  
  // Respawn the player
  respawnPlayer(playerId);
}

// Anti-cheat: Respawn a player
function respawnPlayer(playerId) {
  const player = players.get(playerId);
  if (!player) return;
  
  // Reset player state
  player.health = 100;
  player.bullets = player.maxBullets;
  player.isReloading = false;
  player.isAiming = false;
  player.isShooting = false;
  
  // Generate random spawn position within town
  const spawnX = (Math.random() - 0.5) * GAME_CONSTANTS.TOWN_WIDTH * 0.8;
  const spawnY = 1.6;
  const spawnZ = (Math.random() - 0.5) * GAME_CONSTANTS.TOWN_LENGTH * 0.8;
  
  // Set spawn position
  player.position = { x: spawnX, y: spawnY, z: spawnZ };
  
  // Reset QuickDraw-related state if not in a duel
  if (!player.inQuickDrawDuel) {
    player.quickDrawLobbyIndex = -1;
  }
  
  // Notify the player they're respawning
  if (player.ws.readyState === WebSocket.OPEN) {
    player.ws.send(JSON.stringify({
      type: 'respawn',
      position: player.position,
      health: player.health,
      bullets: player.bullets
    }));
  }
  
  // Broadcast the respawn to all players
  broadcastToAll({
    type: 'playerUpdate',
    id: playerId,
    position: player.position,
    health: player.health,
    isReloading: false,
    isAiming: false
  });
}

// Anti-cheat: Check if position is within town boundaries
function isPositionInTown(position) {
  return (
    position.x >= -GAME_CONSTANTS.TOWN_WIDTH / 2 &&
    position.x <= GAME_CONSTANTS.TOWN_WIDTH / 2 &&
    position.z >= -GAME_CONSTANTS.TOWN_LENGTH / 2 &&
    position.z <= GAME_CONSTANTS.TOWN_LENGTH / 2
  );
}

// Anti-cheat: Check if position is in arena
function isPositionInArena(position, arenaIndex) {
  // Define arena positions and radius
  const arenaRadius = 15;
  
  // Calculate arena center position based on index
  const spacingX = 50;
  const baseZ = GAME_CONSTANTS.TOWN_LENGTH + 50;
  
  const offsetX = (arenaIndex - 2) * spacingX; // Center on zero, spread outward
  const arenaCenter = { x: offsetX, y: 0, z: baseZ };
  
  // Check if point is inside arena (horizontally)
  const dx = position.x - arenaCenter.x;
  const dz = position.z - arenaCenter.z;
  const horizontalDist = Math.sqrt(dx * dx + dz * dz);
  
  return horizontalDist < arenaRadius;
}

// Anti-cheat: Send position correction to player
function sendPositionCorrection(playerId, correctPosition) {
  const player = players.get(playerId);
  if (!player || player.ws.readyState !== WebSocket.OPEN) return;
  
  const now = Date.now();
  const timeouts = playerTimeouts.get(playerId);
  
  // Skip if we've recently sent a correction
  if (timeouts && timeouts.lastPositionCorrection && 
      now - timeouts.lastPositionCorrection < CORRECTION_COOLDOWN) {
    return;
  }
  
  // Calculate distance between current position and correction
  const currentPos = player.position;
  const distance = Math.sqrt(
    Math.pow(currentPos.x - correctPosition.x, 2) +
    Math.pow(currentPos.y - correctPosition.y, 2) +
    Math.pow(currentPos.z - correctPosition.z, 2)
  );
  
  // Only send significant corrections (>5 units) to avoid unnecessary resets
  if (distance > 5) {
    console.log(`Sending position correction to player ${playerId}, distance: ${distance.toFixed(2)}`);
    
    // Update last correction time
    if (timeouts) {
      timeouts.lastPositionCorrection = now;
    }
    
    player.ws.send(JSON.stringify({
      type: 'positionCorrection',
      position: correctPosition
    }));
  }
}

// Anti-cheat: Send error message to player
function sendErrorToPlayer(playerId, message, fatal = false) {
  const player = players.get(playerId);
  if (!player || player.ws.readyState !== WebSocket.OPEN) return;
  
  player.ws.send(JSON.stringify({
    type: 'error',
    message: message,
    fatal: fatal
  }));
}

// Cleanup a disconnected or stale player
function cleanupPlayer(playerId) {
  const player = players.get(playerId);
  if (player) {
    console.log(`Player ${playerId} disconnected`);
    if (player.sessionId) {
      sessions.delete(player.sessionId);
    }
    
    // Quick Draw cleanup
    if (player.inQuickDrawQueue && player.quickDrawLobbyIndex >= 0) {
      // Remove from the appropriate queue
      const queueIndex = player.quickDrawLobbyIndex;
      if (queueIndex >= 0 && queueIndex < MAX_ARENAS) {
        const queue = quickDrawQueues[queueIndex];
        const index = queue.indexOf(playerId);
        if (index !== -1) {
          queue.splice(index, 1);
        }
      }
    }
    
    if (player.inQuickDrawDuel && player.quickDrawDuelId) {
      // End any active duel
      const duel = quickDrawDuels.get(player.quickDrawDuelId);
      if (duel) {
        // The other player wins by default
        const winnerId = duel.player1Id === playerId ? duel.player2Id : duel.player1Id;
        endQuickDrawDuel(player.quickDrawDuelId, winnerId);
      }
    }
    
    players.delete(playerId);
    
    // Anti-cheat: Clean up associated data
    playerTimeouts.delete(playerId);
    playerNonces.delete(playerId);
    playerSequences.delete(playerId);

    // Notify all that the player left
    broadcastToAll({
      type: 'playerLeft',
      id: playerId
    });

    updatePlayerCount();
  }
}

// Broadcast a "playerCount" update to all
function updatePlayerCount() {
  broadcastToAll({
    type: 'playerCount',
    count: players.size
  });
}

// Broadcast to all except a given playerId
function broadcastToOthers(excludeId, data) {
  for (const [pid, pl] of players.entries()) {
    if (pid === excludeId) continue;
    if (pl.ws.readyState === WebSocket.OPEN) {
      pl.ws.send(JSON.stringify(data));
    }
  }
}

// Broadcast to all players
function broadcastToAll(data) {
  players.forEach((player, id) => {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(data));
    }
  });
}

/**
 * Handle a player joining a specific Quick Draw queue.
 * @param {number} playerId - The player's ID
 * @param {number} arenaIndex - The arena index to join (0-4)
 */
function handleQuickDrawJoin(playerId, arenaIndex) {
  // Validate arena index
  if (arenaIndex < 0 || arenaIndex >= MAX_ARENAS) {
    console.error(`Invalid arena index: ${arenaIndex}`);
    return;
  }
  
  console.log(`Player ${playerId} joined Quick Draw queue for arena ${arenaIndex + 1}`);
  const playerData = players.get(playerId);
  
  if (!playerData || playerData.inQuickDrawQueue || playerData.inQuickDrawDuel) {
    return; // Invalid state
  }
  
  // Add to the specific queue
  quickDrawQueues[arenaIndex].push(playerId);
  
  // Update player state
  playerData.inQuickDrawQueue = true;
  playerData.quickDrawLobbyIndex = arenaIndex;
  
  // Notify the player and everyone else
  if (playerData.ws.readyState === WebSocket.OPEN) {
    playerData.ws.send(JSON.stringify({
      type: 'joinedQuickDrawQueue',
      arenaIndex: arenaIndex
    }));
  }
  
  // Broadcast to all players
  broadcastToAll({
    type: 'playerUpdate',
    id: playerId,
    quickDrawLobbyIndex: arenaIndex
  });
  
  // Check if we can now start a duel
  checkQuickDrawQueue(arenaIndex);
}

/**
 * Handle a player leaving the Quick Draw queue.
 * @param {number} playerId - The player's ID
 */
function handleQuickDrawLeave(playerId) {
  const playerData = players.get(playerId);
  
  if (!playerData || !playerData.inQuickDrawQueue) {
    return; // Invalid state
  }
  
  // Get the arena index
  const arenaIndex = playerData.quickDrawLobbyIndex;
  if (arenaIndex >= 0 && arenaIndex < MAX_ARENAS) {
    console.log(`Player ${playerId} left Quick Draw queue for arena ${arenaIndex + 1}`);
    
    // Remove from appropriate queue
    const index = quickDrawQueues[arenaIndex].indexOf(playerId);
    if (index !== -1) {
      quickDrawQueues[arenaIndex].splice(index, 1);
    }
  }
  
  // Reset player state
  playerData.inQuickDrawQueue = false;
  playerData.quickDrawLobbyIndex = -1;
}

/**
 * Check if we have enough players in a specific Quick Draw queue to start a match.
 * @param {number} arenaIndex - The arena index to check
 */
function checkQuickDrawQueue(arenaIndex) {
  if (arenaIndex < 0 || arenaIndex >= MAX_ARENAS) {
    return; // Invalid arena index
  }
  
  const queue = quickDrawQueues[arenaIndex];
  
  if (queue.length < 2) {
    return; // Not enough players in this queue
  }
  
  // Get the two players who have been waiting the longest
  const player1Id = queue.shift();
  const player2Id = queue.shift();
  
  // Make sure both players are still connected
  const player1 = players.get(player1Id);
  const player2 = players.get(player2Id);
  
  if (!player1 || !player2) {
    // Put the valid player back in the queue
    if (player1) queue.push(player1Id);
    if (player2) queue.push(player2Id);
    return;
  }
  
  // Create a new duel
  const duelId = `duel_${arenaIndex}_${player1Id}_${player2Id}`;
  quickDrawDuels.set(duelId, {
    id: duelId,
    arenaIndex: arenaIndex,
    player1Id,
    player2Id,
    state: 'starting',
    startTime: Date.now()
  });
  
  // Mark players as in a duel
  player1.inQuickDrawQueue = false;
  player1.inQuickDrawDuel = true;
  player1.quickDrawDuelId = duelId;
  
  player2.inQuickDrawQueue = false;
  player2.inQuickDrawDuel = true;
  player2.quickDrawDuelId = duelId;
  
  // Reset player health to full at the start of the duel
  player1.health = 100;
  player2.health = 100;
  
  // Notify players of the match
  player1.ws.send(JSON.stringify({
    type: 'quickDrawMatch',
    opponentId: player2Id,
    position: 'left', // Player 1 spawns on the left
    arenaIndex: arenaIndex
  }));
  
  player2.ws.send(JSON.stringify({
    type: 'quickDrawMatch',
    opponentId: player1Id,
    position: 'right', // Player 2 spawns on the right
    arenaIndex: arenaIndex
  }));
  
  console.log(`Started Quick Draw duel ${duelId} between players ${player1Id} and ${player2Id} in arena ${arenaIndex + 1}`);
}

/**
 * Handle a player being ready in a Quick Draw duel.
 * @param {number} playerId - The player's ID
 * @param {number} arenaIndex - The arena index for the duel
 */
function handleQuickDrawReady(playerId, arenaIndex) {
  const playerData = players.get(playerId);
  
  if (!playerData || !playerData.inQuickDrawDuel) {
    return; // Invalid state
  }
  
  const duelId = playerData.quickDrawDuelId;
  const duel = quickDrawDuels.get(duelId);
  
  if (!duel) {
    return; // Invalid duel
  }
  
  // Verify arena index matches
  if (arenaIndex !== undefined && duel.arenaIndex !== arenaIndex) {
    console.error(`Arena index mismatch: expected ${duel.arenaIndex}, got ${arenaIndex}`);
    return;
  }
  
  // Mark this player as ready
  if (duel.player1Id === playerId) {
    duel.player1Ready = true;
  } else if (duel.player2Id === playerId) {
    duel.player2Ready = true;
  }
  
  // If both players are ready, start the duel sequence
  if (duel.player1Ready && duel.player2Ready) {
    startQuickDrawDuel(duelId);
  }
}

/**
 * Start the Quick Draw duel sequence.
 * @param {string} duelId - The duel ID
 */
function startQuickDrawDuel(duelId) {
  const duel = quickDrawDuels.get(duelId);
  
  if (!duel) {
    return; // Invalid duel
  }
  
  duel.state = 'ready';
  
  const player1 = players.get(duel.player1Id);
  const player2 = players.get(duel.player2Id);
  
  if (!player1 || !player2) {
    endQuickDrawDuel(duelId, null); // End duel if either player disconnected
    return;
  }
  
  // Show "READY?" message to both players
  player1.ws.send(JSON.stringify({ type: 'quickDrawReady' }));
  player2.ws.send(JSON.stringify({ type: 'quickDrawReady' }));
  
  // After 1 second, start the countdown
  setTimeout(() => {
    if (quickDrawDuels.has(duelId)) {
      duel.state = 'countdown';
      player1.ws.send(JSON.stringify({ type: 'quickDrawCountdown' }));
      player2.ws.send(JSON.stringify({ type: 'quickDrawCountdown' }));
      
      // Set a random time for the draw signal (1-8 seconds)
      const drawTime = 1000 + Math.floor(Math.random() * 7000);
      duel.drawTimeout = setTimeout(() => {
        if (quickDrawDuels.has(duelId)) {
          sendDrawSignal(duelId);
        }
      }, drawTime);
    }
  }, 1000);
}

/**
 * Send the "DRAW!" signal to both players.
 * @param {string} duelId - The duel ID
 */
function sendDrawSignal(duelId) {
  const duel = quickDrawDuels.get(duelId);
  
  if (!duel) {
    return; // Invalid duel
  }
  
  duel.state = 'draw';
  duel.drawTime = Date.now();
  
  const player1 = players.get(duel.player1Id);
  const player2 = players.get(duel.player2Id);
  
  if (!player1 || !player2) {
    endQuickDrawDuel(duelId, null); // End duel if either player disconnected
    return;
  }
  
  // Send draw signal to both players
  player1.ws.send(JSON.stringify({ type: 'quickDrawDraw' }));
  player2.ws.send(JSON.stringify({ type: 'quickDrawDraw' }));
  
  console.log(`Draw signal sent for duel ${duelId} in arena ${duel.arenaIndex + 1}`);
}

/**
 * Handle a player shooting in a Quick Draw duel.
 * @param {number} playerId - The player's ID
 * @param {number} targetId - The target player's ID
 * @param {number} arenaIndex - The arena index for the duel (optional for direct duels)
 * @param {string} hitZone - The hit zone ('head', 'body', 'limbs')
 * @param {number} damage - The damage amount
 */
function handleQuickDrawShoot(playerId, targetId, arenaIndex, hitZone = 'body', damage = 40) {
    playerId = Number(playerId);
    targetId = Number(targetId);
    
    console.log(`Quick Draw shoot: Player ${playerId} shot player ${targetId} (${hitZone}, ${damage} damage)`);
    
    const playerData = players.get(playerId);
    
    if (!playerData || !playerData.inQuickDrawDuel) {
        console.log(`Quick Draw shoot rejected: Player ${playerId} not in a duel`);
        return; // Invalid state
    }
    
    const duelId = playerData.quickDrawDuelId;
    const duel = quickDrawDuels.get(duelId);
    
    if (!duel) {
        console.log(`Quick Draw shoot rejected: Duel ${duelId} not found`);
        return; // Invalid duel
    }
    
    // For direct duels, no arena index check is needed
    if (!duel.isDirect && arenaIndex !== undefined && duel.arenaIndex !== arenaIndex) {
        console.error(`Arena index mismatch: expected ${duel.arenaIndex}, got ${arenaIndex}`);
        return;
    }
    
    // Verify that the target is the opponent in this duel
    if ((duel.player1Id === playerId && duel.player2Id !== targetId) ||
        (duel.player2Id === playerId && duel.player1Id !== targetId)) {
        console.log(`Quick Draw shoot rejected: Target ${targetId} is not the opponent in duel ${duelId}`);
        return;
    }
    
    // Verify the duel is in the 'draw' state
    if (duel.state !== 'draw') {
        console.log(`Quick Draw shoot rejected: Duel ${duelId} not in 'draw' state (${duel.state})`);
        return;
    }
    
    // Add hit debouncing to prevent double counting - track the last hit time
    // Initialize the lastHitTime map on the duel object if it doesn't exist
    if (!duel.lastHitTime) {
        duel.lastHitTime = new Map();
    }
    
    const now = Date.now();
    const lastHitTime = duel.lastHitTime.get(targetId) || 0;
    const hitDebounceTime = 300; // 300ms minimum time between hits
    
    if (now - lastHitTime < hitDebounceTime) {
        console.log(`Quick Draw shoot debounced: Too soon after last hit (${now - lastHitTime}ms)`);
        return; // Ignore rapid-fire hit reports that are too close together
    }
    
    // Update the last hit time for this target
    duel.lastHitTime.set(targetId, now);
    
    // Calculate reaction time
    const reactionTime = now - duel.drawTime;
    
    // Calculate damage based on hit zone
    let finalDamage = damage;
    if (hitZone === 'head') {
        finalDamage = 100; // One-shot kill for headshots
    } else if (hitZone === 'limbs') {
        finalDamage = Math.round(damage * 0.6); // Reduced damage for limb shots
    } else if (hitZone === 'body') {
        finalDamage = 40; // Standard body shot damage
    }
    
    // Apply damage to target
    const targetPlayer = players.get(targetId);
    if (!targetPlayer) {
        console.log(`Target player ${targetId} not found`);
        return;
    }
    
    // Get current health before applying damage
    const currentHealth = targetPlayer.health || 100;
    
    // Calculate new health after damage
    const newHealth = Math.max(0, currentHealth - finalDamage);
    
    // Debug info for health calculation
    console.log(`[DEBUG] Health calculation: ${currentHealth} - ${finalDamage} = ${newHealth}`);
    
    // Store the new health
    targetPlayer.health = newHealth;
    
    console.log(`Player ${targetId} hit for ${finalDamage} damage, health now ${targetPlayer.health}`);
    
    // Send health update to both players
    if (targetPlayer.ws && targetPlayer.ws.readyState === WebSocket.OPEN) {
        console.log(`Sending health update to target: ${targetId} - health: ${newHealth}`);
        targetPlayer.ws.send(JSON.stringify({
            type: 'playerHealthUpdate',
            playerId: targetId,
            health: newHealth,
            damage: finalDamage,
            hitBy: playerId
        }));
    }
    
    if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
        console.log(`Sending health update to shooter: ${playerId} - target health: ${newHealth}`);
        playerData.ws.send(JSON.stringify({
            type: 'playerHealthUpdate',
            playerId: targetId, 
            health: newHealth,
            damage: finalDamage,
            hitBy: playerId
        }));
    }
    
    // Only end the duel if target's health is 0 or less
    if (newHealth <= 0) {
        console.log(`Player ${targetId} defeated in duel - health reduced to 0`);
        // End the duel with shooter as winner
        endQuickDrawDuel(duelId, playerId);
    } else {
        console.log(`Player ${targetId} was hit but still has ${newHealth} health - duel continues`);
    }
}

/**
 * End a Quick Draw duel and notify players of the result.
 * @param {string} duelId - The duel ID
 * @param {number} winnerId - The winner's player ID (if any)
 */
function endQuickDrawDuel(duelId, winnerId) {
  const duel = quickDrawDuels.get(duelId);
  
  if (!duel) {
    return; // Invalid duel
  }
  
  console.log(`Ending Quick Draw duel ${duelId} with winner: ${winnerId || 'none'}`);
  
  // Clear any pending timeouts
  if (duel.drawTimeout) {
    clearTimeout(duel.drawTimeout);
  }
  
  // Get the players
  const player1 = players.get(duel.player1Id);
  const player2 = players.get(duel.player2Id);
  
  // Update player states
  if (player1) {
    player1.inQuickDrawDuel = false;
    player1.quickDrawDuelId = null;
    
    // Notify player 1 of the result and restore position
    player1.ws.send(JSON.stringify({
      type: 'quickDrawEnd',
      winnerId: winnerId,
      returnPosition: player1.preQuickDrawPosition
    }));
    
    // If player 1 lost, set their health to 0
    if (winnerId && winnerId !== duel.player1Id) {
      player1.health = 0;
    }
  }
  
  if (player2) {
    player2.inQuickDrawDuel = false;
    player2.quickDrawDuelId = null;
    
    // Notify player 2 of the result and restore position
    player2.ws.send(JSON.stringify({
      type: 'quickDrawEnd',
      winnerId: winnerId,
      returnPosition: player2.preQuickDrawPosition
    }));
    
    // If player 2 lost, set their health to 0
    if (winnerId && winnerId !== duel.player2Id) {
      player2.health = 0;
    }
  }
  
  // Remove the duel
  quickDrawDuels.delete(duelId);
}

/**
 * Handle a player challenging another player to a Quick Draw duel.
 * @param {number} playerId - The player's ID
 * @param {number} targetPlayerId - The target player's ID
 */
function handleQuickDrawChallenge(playerId, targetPlayerId) {
  const player = players.get(playerId);
  const targetPlayer = players.get(targetPlayerId);
  
  if (!player || !targetPlayer) {
    return; // Invalid players
  }
  
  if (player.inQuickDrawQueue || player.inQuickDrawDuel) {
    return; // Challenger can't be in another game mode
  }
  
  if (targetPlayer.inQuickDrawQueue || targetPlayer.inQuickDrawDuel) {
    return; // Target can't be in another game mode
  }
  
  console.log(`Player ${playerId} challenged player ${targetPlayerId} to a Quick Draw duel`);
  
  // Send challenge to target player
  targetPlayer.ws.send(JSON.stringify({
    type: 'quickDrawChallengeReceived',
    challengerId: playerId,
    challengerPosition: player.position
  }));
}

/**
 * Generate random positions on the main street for a Quick Draw duel.
 * This ensures players spawn in the open street and not inside buildings.
 * @returns {Object} An object containing two positions and their facing rotations
 */
function generateQuickDrawStreetPositions() {
  // Define the street strip boundaries (narrow middle strip of town)
  const streetMinX = -8;   // Much narrower X bounds (middle strip only)
  const streetMaxX = 8;
  const streetMinZ = -30;  // Keep Z bounds the same
  const streetMaxZ = 30;
  
  // CRITICAL FIX: Set correct player eye level height 
  // The client expects player feet at y=0, with eye level at 1.6 to 2.7 units above that
  // This was causing players to spawn half-sunk into the ground
  const groundLevel = 0.0;  // Ground level is always at 0
  const eyeLevel = 3.5;     // Must be high enough to ensure feet are above ground
  
  console.log(`[DEBUG] QuickDraw duel - Setting player eye level to ${eyeLevel} (feet at ${eyeLevel-2.72})`);
  
  // Generate a random position within the street bounds
  const midX = streetMinX + Math.random() * (streetMaxX - streetMinX);
  const midZ = streetMinZ + Math.random() * (streetMaxZ - streetMinZ);
  
  // Generate a random normalized direction vector
  const angle = Math.random() * Math.PI * 2;
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);
  
  // Create two positions 10 meters apart along this direction
  const position1 = {
    x: midX - dirX * 5, // 5 meters in one direction from midpoint
    y: eyeLevel,        // Position at eye level
    z: midZ - dirZ * 5
  };
  
  const position2 = {
    x: midX + dirX * 5, // 5 meters in the opposite direction
    y: eyeLevel,        // Position at eye level
    z: midZ + dirZ * 5
  };
  
  // Calculate the vector from player1 to player2
  const dx = position2.x - position1.x;
  const dz = position2.z - position1.z;
  
  // Calculate angle from positive Z axis (which is the "forward" direction in THREE.js)
  // Add Math.PI (180 degrees) to make players FACE each other instead of facing away
  const rotation1 = Math.atan2(dx, dz) + Math.PI;
  
  // For player2, we need to calculate the angle from the positive Z axis to the vector pointing to player1
  // This is the opposite direction, so we use negative dx and dz, plus 180 degrees correction
  const rotation2 = Math.atan2(-dx, -dz) + Math.PI;
  
  // Log explicit debug information with degree conversion
  console.log(`[DEBUG] Duel positions:`);
  console.log(`  Player1: (${position1.x.toFixed(2)}, ${position1.y.toFixed(2)}, ${position1.z.toFixed(2)}) facing ${rotation1.toFixed(4)} radians (${(rotation1 * 180 / Math.PI).toFixed(1)}°)`);
  console.log(`  Player2: (${position2.x.toFixed(2)}, ${position2.y.toFixed(2)}, ${position2.z.toFixed(2)}) facing ${rotation2.toFixed(4)} radians (${(rotation2 * 180 / Math.PI).toFixed(1)}°)`);
  console.log(`  Direction vector: (${dx.toFixed(2)}, ${dz.toFixed(2)}), length: ${Math.sqrt(dx*dx + dz*dz).toFixed(2)}`);
  
  return {
    position1: position1,
    position2: position2,
    rotation1: rotation1,
    rotation2: rotation2
  };
}

/**
 * Handle a player accepting a Quick Draw challenge
 * @param {number} playerId - The accepting player's ID
 * @param {number} challengerId - The challenging player's ID
 */
function handleQuickDrawAcceptChallenge(playerId, challengerId) {
  const player = players.get(playerId);
  const challenger = players.get(challengerId);
  
  if (!player || !challenger) {
    return; // Invalid players
  }
  
  if (player.inQuickDrawQueue || player.inQuickDrawDuel ||
      challenger.inQuickDrawQueue || challenger.inQuickDrawDuel) {
    return; // Players can't be in another game mode
  }
  
  console.log(`Player ${playerId} accepted a Quick Draw challenge from player ${challengerId}`);
  
  // Notify challenger that the challenge was accepted
  challenger.ws.send(JSON.stringify({
    type: 'quickDrawChallengeAccepted',
    targetId: playerId
  }));
  
  // Generate controlled street positions for the duel
  const spawnPositions = generateQuickDrawStreetPositions();
  
  // Create a new duel
  const duelId = `duel_direct_${challengerId}_${playerId}`;
  quickDrawDuels.set(duelId, {
    id: duelId,
    player1Id: challengerId,
    player2Id: playerId,
    state: 'starting',
    startTime: Date.now(),
    isDirect: true
  });
  
  // Mark players as in a duel
  challenger.inQuickDrawQueue = false;
  challenger.inQuickDrawDuel = true;
  challenger.quickDrawDuelId = duelId;
  
  player.inQuickDrawQueue = false;
  player.inQuickDrawDuel = true;
  player.quickDrawDuelId = duelId;
  
  // Reset player health to full at the start of the duel
  challenger.health = 100;
  player.health = 100;
  
  // Store original positions to return players after the duel
  challenger.preQuickDrawPosition = { ...challenger.position };
  player.preQuickDrawPosition = { ...player.position };
  
  // Notify players of the match
  challenger.ws.send(JSON.stringify({
    type: 'quickDrawMatch',
    opponentId: playerId,
    isDirect: true,
    startPosition: spawnPositions.position1,
    startRotation: spawnPositions.rotation1,
    movementLocked: true
  }));
  
  player.ws.send(JSON.stringify({
    type: 'quickDrawMatch',
    opponentId: challengerId,
    isDirect: true,
    startPosition: spawnPositions.position2,
    startRotation: spawnPositions.rotation2,
    movementLocked: true
  }));
  
  console.log(`Started direct Quick Draw duel ${duelId} between players ${challengerId} and ${playerId}`);
}

/**
 * Handle a player declining a Quick Draw challenge
 * @param {number} playerId - The declining player's ID
 * @param {number} challengerId - The challenging player's ID
 */
function handleQuickDrawDeclineChallenge(playerId, challengerId) {
  const player = players.get(playerId);
  const challenger = players.get(challengerId);
  
  if (!player || !challenger) {
    return; // Invalid players
  }
  
  console.log(`Player ${playerId} declined a Quick Draw challenge from player ${challengerId}`);
  
  // Notify challenger that the challenge was declined
  challenger.ws.send(JSON.stringify({
    type: 'quickDrawChallengeDeclined',
    targetId: playerId
  }));
}

// Anti-cheat: Server-side bullet physics update
function updateBullets() {
  const now = Date.now();
  
  // Update each active bullet
  for (const [bulletId, bullet] of activeBullets.entries()) {
    if (!bullet.active) continue;
    
    // Calculate time since last update
    const deltaTime = (now - bullet.timeCreated) / 1000;
    
    // Calculate new position
    const distanceThisFrame = bullet.speed * deltaTime;
    bullet.position.x += bullet.direction.x * distanceThisFrame;
    bullet.position.y += bullet.direction.y * distanceThisFrame;
    bullet.position.z += bullet.direction.z * distanceThisFrame;
    
    // Update total distance traveled
    bullet.distanceTraveled += distanceThisFrame;
    
    // Check if bullet has traveled too far
    if (bullet.distanceTraveled >= bullet.maxDistance) {
      bullet.active = false;
      continue;
    }
  }
  
  // Clean up inactive bullets
  for (const [bulletId, bullet] of activeBullets.entries()) {
    if (!bullet.active) {
      activeBullets.delete(bulletId);
    }
  }
}

// Heartbeat to remove stale connections
const HEARTBEAT_INTERVAL = 30000; // 30s
const CONNECTION_TIMEOUT = 60000; // 60s

setInterval(() => {
  const now = Date.now();
  for (const [id, player] of players.entries()) {
    if (now - player.lastActivity > CONNECTION_TIMEOUT) {
      console.log(`Removing stale connection for player ${id}`);
      if (player.ws.readyState === WebSocket.OPEN) {
        player.ws.close(1000, 'Connection timeout');
      }
      cleanupPlayer(id);
    } else if (player.ws.readyState === WebSocket.OPEN) {
      // keep alive
      player.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }
}, HEARTBEAT_INTERVAL);

// Anti-cheat: Run physics update loop
setInterval(updateBullets, GAME_CONSTANTS.PHYSICS_UPDATE_INTERVAL);

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Server shutting down...');
  
  // End all Quick Draw duels
  for (const duelId of quickDrawDuels.keys()) {
    endQuickDrawDuel(duelId, null);
  }
  
  for (const [id, player] of players.entries()) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.close(1000, 'Server shutting down');
    }
  }
  server.close(() => {
    console.log('Server shutdown complete.');
    process.exit(0);
  });
});