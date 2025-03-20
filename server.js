// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const app = express();

// Port default 8080 to match your previous Cloudflare Tunnel config
const PORT = process.env.PORT || 8080;

// Serve static files from "public"
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, clientTracking: true });

// Track connected players
const players = new Map();    // playerId -> { ws, sessionId, position, rotation, health, ... }
const sessions = new Set();   // tracks sessionIds to prevent duplicate connections
let nextPlayerId = 1;

// Track Quick Draw game mode queues and active duels
// Support for 5 concurrent lobbies
const MAX_ARENAS = 5;
const quickDrawQueues = Array(MAX_ARENAS).fill(null).map(() => []);  // Array of queues for each arena
const quickDrawDuels = new Map(); // Map of duelId -> { player1Id, player2Id, state, arenaIndex, ... }

// Track Proper Shootout game mode
const properShootoutLobbies = new Map(); // lobbyId -> { players: Set(), scores: Map() }
let nextLobbyId = 1;
const MAX_SHOOTOUT_PLAYERS = 10;
const SHOOTOUT_WIN_SCORE = 10;
const SHOOTOUT_MAP_CENTER = { x: 0, z: -100 }; // Coordinates matching the client map center
const SHOOTOUT_MAP_DIMENSIONS = { width: 50, length: 50 };

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
  // Parse sessionId from query string
  const parameters = url.parse(req.url, true).query;
  const sessionId = parameters.sessionId;

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
  console.log(`Player ${playerId} connected (sessionId: ${sessionId || 'none'})`);

  // Create initial player data with health and QuickDraw info
  players.set(playerId, {
    ws,
    sessionId,
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
    // Proper Shootout info
    inProperShootout: false,
    properShootoutLobbyId: null,
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
          handlePlayerHit(playerId, data);
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
          
        case 'properShootoutJoin':
          handleProperShootoutJoin(playerId);
          break;
          
        case 'properShootoutLeave':
          handleProperShootoutLeave(playerId);
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
function handlePlayerHit(playerId, data) {
  if (!data.targetId) return;
  
  const targetId = parseInt(data.targetId);
  const sourcePlayer = players.get(playerId);
  const targetPlayer = players.get(targetId);
  
  if (!sourcePlayer || !targetPlayer) return;
  
  // Anti-cheat: Validate the hit using server-side bullets
  let validHit = false;
  let bulletId = null;
  
  // If bulletId is provided, validate against that specific bullet
  if (data.bulletId) {
    const bullet = activeBullets.get(data.bulletId);
    if (bullet && bullet.sourcePlayerId === playerId && bullet.active) {
      // Check if the bullet is close enough to the target
      validHit = isPlayerHitByBullet(targetPlayer, bullet);
      if (validHit) {
        bulletId = data.bulletId;
      }
    }
  } else {
    // Otherwise, check all active bullets from this player
    for (const [bid, bullet] of activeBullets.entries()) {
      if (bullet.sourcePlayerId === playerId && bullet.active) {
        if (isPlayerHitByBullet(targetPlayer, bullet)) {
          validHit = true;
          bulletId = bid;
          break;
        }
      }
    }
  }
  
  // If no valid hit was found, reject the hit claim
  if (!validHit) {
    console.log(`Rejecting invalid hit claim from player ${playerId} on ${targetId}`);
    return sendErrorToPlayer(playerId, "Invalid hit claim", false);
  }
  
  console.log(`Player ${targetId} was hit by player ${playerId}'s bullet ${bulletId}`);
  
  // Mark the bullet as inactive
  if (bulletId !== null) {
    const bullet = activeBullets.get(bulletId);
    if (bullet) {
      bullet.active = false;
    }
  }
  
  // Calculate damage based on hit zone if provided
  let damage = GAME_CONSTANTS.DAMAGE_PER_HIT; // Default damage
  const hitZone = data.hitData && data.hitData.hitZone ? data.hitData.hitZone : null;
  
  if (hitZone) {
    if (hitZone === 'head') {
      damage = 100; // Headshot is always lethal
    } else if (hitZone === 'body') {
      damage = 40; // Body shot deals 40 damage
    } else if (hitZone === 'limbs') {
      damage = 20; // Limb shot deals 20 damage
    }
  } else if (data.hitData && data.hitData.damage) {
    // If explicit damage is provided, use that
    damage = data.hitData.damage;
  }
  
  // Apply hit effects: reduce health
  targetPlayer.health = Math.max(targetPlayer.health - damage, 0);
  
  // Inform the target
  if (targetPlayer.ws.readyState === WebSocket.OPEN) {
    targetPlayer.ws.send(JSON.stringify({
      type: 'hit',
      sourceId: playerId,
      hitData: data.hitData,
      health: targetPlayer.health,
      hitZone: hitZone
    }));
  }
  
  // Broadcast the hit to everyone
  broadcastToAll({
    type: 'playerHit',
    targetId: targetId,
    sourceId: playerId,
    hitPosition: data.hitData ? data.hitData.position : null,
    health: targetPlayer.health,
    bulletId: bulletId,
    hitZone: hitZone,
    damage: damage
  });
  
  // Check for player death
  if (targetPlayer.health <= 0) {
    handlePlayerDeath(targetId, playerId);
  }
}

// Anti-cheat: Bullet-player collision detection
function isPlayerHitByBullet(player, bullet) {
  // Calculate player hitbox (simple cylinder)
  const playerRadius = 0.5;  // horizontal radius
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
  
  if (bulletY < playerBottom || bulletY > playerTop) {
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
  
  // If player is in Quick Draw duel, end the duel
  if (player.inQuickDrawDuel && player.quickDrawDuelId) {
    const duel = quickDrawDuels.get(player.quickDrawDuelId);
    if (duel) {
      endQuickDrawDuel(player.quickDrawDuelId, killedById);
    }
  }
  
  // If player was in Proper Shootout, handle kill scoring
  if (player.inProperShootout && player.properShootoutLobbyId) {
    const lobbyId = player.properShootoutLobbyId;
    const lobby = properShootoutLobbies.get(lobbyId);
    const killer = players.get(killedById);
    
    if (lobby && killer && killer.inProperShootout && killer.properShootoutLobbyId === lobbyId) {
      // Increment killer's score
      const currentKills = lobby.scores.get(killedById) || 0;
      const newKills = currentKills + 1;
      lobby.scores.set(killedById, newKills);
      
      // Notify lobby about the kill
      notifyLobbyPlayers(lobbyId, {
        type: 'properShootoutKill',
        killerId: killedById,
        victimId: playerId,
        scores: getScoresArray(lobby)
      });
      
      // Check if killer reached win condition
      if (newKills >= SHOOTOUT_WIN_SCORE) {
        // End the match
        notifyLobbyPlayers(lobbyId, {
          type: 'properShootoutEnd',
          winnerId: killedById,
          scores: getScoresArray(lobby)
        });
        
        // Reset the lobby
        resetProperShootoutLobby(lobbyId);
      }
    }
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
  
  // If in Proper Shootout, use map-specific spawn
  if (player.inProperShootout) {
    const spawnPos = generateRandomShootoutPosition();
    player.position = spawnPos;
  } else {
    // Generate random spawn position within town
    const spawnX = (Math.random() - 0.5) * GAME_CONSTANTS.TOWN_WIDTH * 0.8;
    const spawnY = 1.6;
    const spawnZ = (Math.random() - 0.5) * GAME_CONSTANTS.TOWN_LENGTH * 0.8;
    
    // Set spawn position
    player.position = { x: spawnX, y: spawnY, z: spawnZ };
  }
  
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
  
  player.ws.send(JSON.stringify({
    type: 'positionCorrection',
    position: correctPosition
  }));
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
    
    // Proper Shootout cleanup
    if (player.inProperShootout && player.properShootoutLobbyId) {
      removePlayerFromShootoutLobby(playerId, player.properShootoutLobbyId);
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
  for (const [pid, pl] of players.entries()) {
    if (pl.ws.readyState === WebSocket.OPEN) {
      pl.ws.send(JSON.stringify(data));
    }
  }
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
  
  if (!playerData || playerData.inQuickDrawQueue || playerData.inQuickDrawDuel || playerData.inProperShootout) {
    return; // Invalid state
  }
  
  // Add to the specific queue
  playerData.inQuickDrawQueue = true;
  playerData.quickDrawLobbyIndex = arenaIndex;
  quickDrawQueues[arenaIndex].push(playerId);
  
  // Notify the player they joined the queue
  playerData.ws.send(JSON.stringify({
    type: 'quickDrawJoin',
    arenaIndex: arenaIndex
  }));
  
  // Check if we have enough players in this queue to start a match
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
 * @param {number} arenaIndex - The arena index for the duel
 * @param {string} hitZone - The hit zone ('head', 'body', 'limbs')
 * @param {number} damage - The damage amount
 */
function handleQuickDrawShoot(playerId, targetId, arenaIndex, hitZone = 'body', damage = 40) {
    playerId = Number(playerId);
    targetId = Number(targetId);
    
    console.log(`Quick Draw shoot: Player ${playerId} shot player ${targetId} in arena ${arenaIndex + 1} (${hitZone}, ${damage} damage)`);
    
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
    
    // Verify arena index matches
    if (arenaIndex !== undefined && duel.arenaIndex !== arenaIndex) {
        console.error(`Arena index mismatch: expected ${duel.arenaIndex}, got ${arenaIndex}`);
        return;
    }
    
    if (duel.state !== 'draw') {
        console.log(`Quick Draw shoot rejected: Duel ${duelId} not in 'draw' state, current state: ${duel.state}`);
        return; // Can only shoot in 'draw' state
    }
    
    // Make sure the target is the opponent in this duel
    const isValidTarget = (duel.player1Id === playerId && duel.player2Id === targetId) ||
                          (duel.player2Id === playerId && duel.player1Id === targetId);
    
    if (!isValidTarget) {
        console.log(`Quick Draw shoot rejected: Invalid target ${targetId} for player ${playerId} in duel ${duelId}`);
        return; // Not shooting at the opponent
    }
    
    // Get the target player to check their health
    const targetPlayer = players.get(targetId);
    if (!targetPlayer) {
        console.log(`Quick Draw shoot rejected: Target player ${targetId} not found`);
        return;
    }
    
    console.log(`Quick Draw shoot ACCEPTED: Player ${playerId} hit player ${targetId} in duel ${duelId}`);
    
    // Calculate damage based on hit zone if not explicitly provided
    let finalDamage = damage;
    if (!finalDamage) {
        if (hitZone === 'head') {
            finalDamage = 100; // Headshot is fatal
        } else if (hitZone === 'body') {
            finalDamage = 40;  // Body shot
        } else if (hitZone === 'limbs') {
            finalDamage = 20;  // Limb shot
        } else {
            finalDamage = 40;  // Default to body shot damage
        }
    }
    
    // Apply the damage to the target player
    const previousHealth = targetPlayer.health;
    targetPlayer.health = Math.max(targetPlayer.health - finalDamage, 0);
    console.log(`Applied ${finalDamage} damage to player ${targetId}. Health reduced from ${previousHealth} to ${targetPlayer.health}`);
    
    // Notify the hit player
    if (targetPlayer.ws.readyState === WebSocket.OPEN) {
        targetPlayer.ws.send(JSON.stringify({
            type: 'hit',
            sourceId: playerId,
            hitData: { 
                position: targetPlayer.position, 
                hitZone: hitZone,
                damage: finalDamage
            },
            health: targetPlayer.health,
            hitZone: hitZone
        }));
    }
    
    // Broadcast hit to all players
    broadcastToAll({
        type: 'playerHit',
        targetId: targetId,
        sourceId: playerId,
        hitPosition: targetPlayer.position,
        health: targetPlayer.health,
        hitZone: hitZone,
        damage: finalDamage
    });
    
    // Only end the duel if the target's health is 0
    if (targetPlayer.health <= 0) {
        console.log(`Player ${targetId} was killed. Ending duel ${duelId} with ${playerId} as winner`);
        endQuickDrawDuel(duelId, playerId);
    } else {
        console.log(`Player ${targetId} was hit but survived with ${targetPlayer.health} health. Duel continues.`);
        // Don't end the duel, just let the game continue
    }
}

/**
 * End a Quick Draw duel.
 * @param {string} duelId - The ID of the duel to end
 * @param {number|null} winnerId - The ID of the winning player or null if draw/aborted
 */
function endQuickDrawDuel(duelId, winnerId) {
  const duel = quickDrawDuels.get(duelId);
  
  if (!duel) {
    return; // Invalid duel
  }
  
  const arenaIndex = duel.arenaIndex;
  console.log(`Ending duel ${duelId} in arena ${arenaIndex + 1} with winner ${winnerId || 'none'}`);
  
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
    
    // Notify player 1 of the result
    player1.ws.send(JSON.stringify({
      type: 'quickDrawEnd',
      winnerId: winnerId
    }));
    
    // If player 1 lost, set their health to 0
    if (winnerId && winnerId !== duel.player1Id) {
      player1.health = 0;
    }
  }
  
  if (player2) {
    player2.inQuickDrawDuel = false;
    player2.quickDrawDuelId = null;
    
    // Notify player 2 of the result
    player2.ws.send(JSON.stringify({
      type: 'quickDrawEnd',
      winnerId: winnerId
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
 * Handle a player joining a Proper Shootout match
 * @param {number} playerId - The player's ID
 */
function handleProperShootoutJoin(playerId) {
  const player = players.get(playerId);
  
  if (!player) {
    return; // Invalid player
  }
  
  console.log(`Player ${playerId} requested to join Proper Shootout match`);
  
  // Check if player is already in a game mode
  if (player.inQuickDrawQueue || player.inQuickDrawDuel || player.inProperShootout) {
    return sendErrorToPlayer(playerId, "Already in a game mode", false);
  }
  
  // Find a lobby with space or create a new one
  let lobbyId = null;
  let lobby = null;
  
  // Look for existing lobbies with space
  for (const [id, existingLobby] of properShootoutLobbies.entries()) {
    if (existingLobby.players.size < MAX_SHOOTOUT_PLAYERS) {
      lobbyId = id;
      lobby = existingLobby;
      break;
    }
  }
  
  // Create a new lobby if none found
  if (!lobbyId) {
    lobbyId = `lobby_${nextLobbyId++}`;
    lobby = {
      id: lobbyId,
      players: new Set(),
      scores: new Map(), // playerId -> kills
      startTime: Date.now()
    };
    properShootoutLobbies.set(lobbyId, lobby);
    console.log(`Created new Proper Shootout lobby: ${lobbyId}`);
  }
  
  // Add player to lobby
  lobby.players.add(playerId);
  lobby.scores.set(playerId, 0);
  
  // Update player state
  player.inProperShootout = true;
  player.properShootoutLobbyId = lobbyId;
  
  // Reset player health
  player.health = 100;
  
  // Generate random spawn position
  const spawnPos = generateRandomShootoutPosition();
  
  // Send join confirmation to player with spawn position
  player.ws.send(JSON.stringify({
    type: 'properShootoutJoin',
    lobbyId: lobbyId,
    position: spawnPos,
    scores: getScoresArray(lobby)
  }));
  
  // Notify other players in the lobby
  notifyLobbyPlayers(lobbyId, {
    type: 'properShootoutPlayerJoin',
    playerId: playerId,
    scores: getScoresArray(lobby)
  }, playerId);
  
  console.log(`Player ${playerId} joined Proper Shootout lobby ${lobbyId}`);
}

/**
 * Handle a player leaving a Proper Shootout match
 * @param {number} playerId - The player's ID
 */
function handleProperShootoutLeave(playerId) {
  const player = players.get(playerId);
  
  if (!player || !player.inProperShootout) {
    return; // Invalid state
  }
  
  const lobbyId = player.properShootoutLobbyId;
  const lobby = properShootoutLobbies.get(lobbyId);
  
  if (lobby) {
    removePlayerFromShootoutLobby(playerId, lobbyId);
  }
  
  // Update player state
  player.inProperShootout = false;
  player.properShootoutLobbyId = null;
  
  // Send leave confirmation to player
  player.ws.send(JSON.stringify({
    type: 'properShootoutLeave'
  }));
  
  console.log(`Player ${playerId} left Proper Shootout lobby ${lobbyId}`);
}

/**
 * Remove a player from a Proper Shootout lobby and update lobby state
 * @param {number} playerId - The player's ID
 * @param {string} lobbyId - The lobby ID
 */
function removePlayerFromShootoutLobby(playerId, lobbyId) {
  const lobby = properShootoutLobbies.get(lobbyId);
  
  if (!lobby) {
    return;
  }
  
  // Remove player from lobby
  lobby.players.delete(playerId);
  lobby.scores.delete(playerId);
  
  // Notify other players in the lobby
  notifyLobbyPlayers(lobbyId, {
    type: 'properShootoutPlayerLeave',
    playerId: playerId,
    scores: getScoresArray(lobby)
  });
  
  // If lobby is empty, remove it
  if (lobby.players.size === 0) {
    properShootoutLobbies.delete(lobbyId);
    console.log(`Removed empty Proper Shootout lobby: ${lobbyId}`);
  }
}

/**
 * Generate a random position within the Proper Shootout map
 * @returns {Object} - Random position {x, y, z}
 */
function generateRandomShootoutPosition() {
  const x = SHOOTOUT_MAP_CENTER.x + (Math.random() - 0.5) * (SHOOTOUT_MAP_DIMENSIONS.width - 5);
  const y = 1.6; // Player height
  const z = SHOOTOUT_MAP_CENTER.z + (Math.random() - 0.5) * (SHOOTOUT_MAP_DIMENSIONS.length - 5);
  
  return { x, y, z };
}

/**
 * Notify all players in a lobby about an event
 * @param {string} lobbyId - The lobby ID
 * @param {Object} data - The message data to send
 * @param {number} excludeId - Optional player ID to exclude
 */
function notifyLobbyPlayers(lobbyId, data, excludeId = null) {
  const lobby = properShootoutLobbies.get(lobbyId);
  
  if (!lobby) {
    return;
  }
  
  for (const playerId of lobby.players) {
    if (excludeId !== null && playerId === excludeId) {
      continue;
    }
    
    const player = players.get(playerId);
    if (player && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(data));
    }
  }
}

/**
 * Convert lobby scores map to array for sending to clients
 * @param {Object} lobby - The lobby object
 * @returns {Array} - Array of {playerId, kills}
 */
function getScoresArray(lobby) {
  const scores = [];
  
  for (const [playerId, kills] of lobby.scores.entries()) {
    scores.push({
      playerId,
      kills
    });
  }
  
  return scores;
}

/**
 * Reset a Proper Shootout lobby after a match ends
 * @param {string} lobbyId - The lobby ID
 */
function resetProperShootoutLobby(lobbyId) {
  const lobby = properShootoutLobbies.get(lobbyId);
  
  if (!lobby) {
    return;
  }
  
  // Create a new lobby with the same ID
  const newLobby = {
    id: lobbyId,
    players: new Set(), // Start with no players
    scores: new Map(),
    startTime: Date.now()
  };
  
  properShootoutLobbies.set(lobbyId, newLobby);
  
  // Remove players from the old lobby, they'll need to rejoin
  for (const playerId of lobby.players) {
    const player = players.get(playerId);
    if (player) {
      player.inProperShootout = false;
      player.properShootoutLobbyId = null;
    }
  }
  
  console.log(`Reset Proper Shootout lobby: ${lobbyId}`);
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
    
    // Check for collisions with terrain (ground or town boundary)
    if (bullet.position.y <= 0.1) {
      // Hit ground
      bullet.active = false;
      broadcastBulletImpact(bulletId, 'ground', null, bullet.position);
      continue;
    }
    
    // Check town boundaries (if not in a Quick Draw arena)
    if (!isPositionInTown(bullet.position)) {
      // Only check arena boundaries if source player is in a duel
      const sourcePlayer = players.get(bullet.sourcePlayerId);
      if (!sourcePlayer || !sourcePlayer.inQuickDrawDuel) {
        bullet.active = false;
        broadcastBulletImpact(bulletId, 'boundary', null, bullet.position);
        continue;
      }
    }
    
    // Check for collisions with players
    for (const [playerId, player] of players.entries()) {
      // Skip collision with bullet owner
      if (playerId === bullet.sourcePlayerId) continue;
      
      // Skip collisions across arena boundary
      const bulletSourcePlayer = players.get(bullet.sourcePlayerId);
      const targetInDuel = player.inQuickDrawDuel;
      const sourceInDuel = bulletSourcePlayer ? bulletSourcePlayer.inQuickDrawDuel : false;
      
      // Only allow hits if both in same state (both in arena or both outside)
      if (targetInDuel !== sourceInDuel) {
        continue;
      }
      
      // Check for collision
      if (isPlayerHitByBullet(player, bullet)) {
        bullet.active = false;
        
        // Calculate damage based on hit position (simplified for server-side)
        // This is a simplified version; the client sends more detailed hit zone info
        let damage = GAME_CONSTANTS.DAMAGE_PER_HIT;
        let hitZone = 'body'; // Default to body hit
        
        // Very basic hit zone detection based on bullet height
        const playerBottom = player.position.y - 1.6;
        const playerTop = playerBottom + 2.0;
        const relativeHeight = (bullet.position.y - playerBottom) / (playerTop - playerBottom);
        
        if (relativeHeight > 0.8) {
          hitZone = 'head';
          damage = 100; // Headshot is fatal
        } else if (relativeHeight > 0.4) {
          hitZone = 'body';
          damage = 40; // Body shot
        } else {
          hitZone = 'limbs';
          damage = 20; // Limb shot
        }
        
        // Handle the hit
        player.health = Math.max(player.health - damage, 0);
        
        // Notify the hit player
        if (player.ws.readyState === WebSocket.OPEN) {
          player.ws.send(JSON.stringify({
            type: 'hit',
            sourceId: bullet.sourcePlayerId,
            bulletId: bulletId,
            health: player.health,
            hitZone: hitZone
          }));
        }
        
        // Broadcast hit to all players
        broadcastBulletImpact(bulletId, 'player', playerId, bullet.position, hitZone);
        
        // Check for player death
        if (player.health <= 0) {
          handlePlayerDeath(playerId, bullet.sourcePlayerId);
        }
        
        break;
      }
    }
  }
  
  // Clean up inactive bullets
  for (const [bulletId, bullet] of activeBullets.entries()) {
    if (!bullet.active) {
      activeBullets.delete(bulletId);
    }
  }
}

// Anti-cheat: Broadcast bullet impact to all players
function broadcastBulletImpact(bulletId, hitType, targetId, position, hitZone) {
  broadcastToAll({
    type: 'bulletImpact',
    bulletId: bulletId,
    hitType: hitType,
    targetId: targetId,
    position: position,
    hitZone: hitZone
  });
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
  
  // If the environment variable USE_NGROK is set to 'true', start an ngrok tunnel.
  if (process.env.USE_NGROK === 'true') {
    // Dynamically require ngrok so it is only used when needed.
    const ngrok = require('ngrok');
    (async function() {
      try {
        // Connect ngrok to the same port that the server is running on.
        const url = await ngrok.connect({
          addr: PORT,
          // You can add additional ngrok options here (e.g., authtoken, subdomain, region)
        });
        console.log(`ngrok tunnel established at ${url}`);
      } catch (error) {
        console.error('Error starting ngrok tunnel:', error);
      }
    })();
  }
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