// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const app = express();

// Port default 8080 to match the Cloudflare Tunnel config
const PORT = process.env.PORT || 8080;

// Serve static files from "public"
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, clientTracking: true });

// Track connected players
const players = new Map();    // playerId -> { ws, sessionId, position, rotation, health, ... }
const sessions = new Set();   // tracks sessionIds to prevent duplicate connections
let nextPlayerId = 1;

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

  // Create initial player data with health
  players.set(playerId, {
    ws,
    sessionId,
    position: { x: 0, y: 1.6, z: 0 },
    rotation: { y: 0 },
    isAiming: false,
    isShooting: false,
    isReloading: false,
    health: 100,
    lastActivity: Date.now()
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
        health: p.health
      }))
  }));

  // Notify others that a new player joined
  broadcastToOthers(playerId, {
    type: 'playerJoined',
    id: playerId,
    position: players.get(playerId).position,
    rotation: players.get(playerId).rotation,
    health: players.get(playerId).health
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
            // Broadcast to others including current health
            broadcastToOthers(playerId, {
              type: 'playerUpdate',
              id: playerId,
              position: player.position,
              rotation: player.rotation,
              isAiming: player.isAiming,
              isShooting: player.isShooting,
              isReloading: player.isReloading,
              health: player.health
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
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Server shutting down...');
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
