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
    quickDrawDuelId: null
  });

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
      if (player) {
        player.lastActivity = Date.now();
      }

      switch (data.type) {
        case 'update':
          // Update local state (do not allow client to change health directly)
          if (player) {
            player.position = data.position || player.position;
            player.rotation = data.rotation || player.rotation;
            player.isAiming = data.isAiming !== undefined ? data.isAiming : player.isAiming;
            player.isShooting = data.isShooting !== undefined ? data.isShooting : player.isShooting;
            player.isReloading = data.isReloading !== undefined ? data.isReloading : player.isReloading;
            
            // Update QuickDraw lobby index if provided
            if (data.quickDrawLobbyIndex !== undefined) {
              player.quickDrawLobbyIndex = data.quickDrawLobbyIndex;
            }
            
            // Broadcast to others including current health and Quick Draw info
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
          break;

        case 'shoot':
          // Notify others that this player fired
          broadcastToOthers(playerId, {
            type: 'playerShoot',
            id: playerId,
            bulletData: data.bulletData
          });
          break;

        case 'playerHit':
          // data.targetId, data.hitData
          const targetId = parseInt(data.targetId);
          console.log(`Player ${targetId} was hit by player ${playerId}`);
          const targetPlayer = players.get(targetId);
          if (targetPlayer && targetPlayer.ws.readyState === WebSocket.OPEN) {
            // Reduce health by a fixed amount (e.g., 20)
            targetPlayer.health = Math.max(targetPlayer.health - 20, 0);
            // Inform the target
            targetPlayer.ws.send(JSON.stringify({
              type: 'hit',
              sourceId: playerId,
              hitData: data.hitData,
              health: targetPlayer.health
            }));
          }
          // Broadcast a "playerHit" to everyone with updated health
          broadcastToAll({
            type: 'playerHit',
            targetId: data.targetId,
            sourceId: playerId,
            hitPosition: data.hitData.position,
            health: targetPlayer ? targetPlayer.health : 0
          });
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
          handleQuickDrawShoot(playerId, data.opponentId, data.arenaIndex);
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
  
  if (!playerData || playerData.inQuickDrawQueue || playerData.inQuickDrawDuel) {
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
 */
function handleQuickDrawShoot(playerId, targetId, arenaIndex) {
    playerId = Number(playerId);
    targetId = Number(targetId);
    
    console.log(`Quick Draw shoot: Player ${playerId} shot player ${targetId} in arena ${arenaIndex + 1}`);
    
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
    
    console.log(`Quick Draw shoot ACCEPTED: Player ${playerId} hit player ${targetId}. Ending duel ${duelId} with ${playerId} as winner`);
    
    // End the duel with this player as the winner
    endQuickDrawDuel(duelId, playerId);
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