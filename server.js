// server.js
require('dotenv').config();
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
// Native fetch is available in Node.js v22, no need to require node-fetch

// Add Telegram Bot API support
const TelegramBot = require('node-telegram-bot-api');
console.log("Telegram Bot API loaded");

// Use environment variable for the bot token from Replit Secrets
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 1517919597; // Numeric ID for @erikszo

// Initialize the Telegram bot
const telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
console.log("Telegram bot initialized");

// Function to send Telegram notifications
function sendTelegramNotification(message) {
  try {
    telegramBot.sendMessage(TELEGRAM_CHAT_ID, message)
      .then(() => {
        console.log(`Notification sent to ${TELEGRAM_CHAT_ID}: ${message}`);
      })
      .catch((error) => {
        console.error(`Failed to send Telegram notification: ${error.message}`);
      });
  } catch (error) {
    console.error(`Error in Telegram notification: ${error.message}`);
  }
}

// Standard HTTP port for the server
const PORT = process.env.PORT || 80;
console.log("Port set to", PORT);

// Serve static files from "public"
app.use(express.static('public'));
console.log("Static file serving configured");

// Add a specific route for the wallet demo page
app.get('/wallet', (req, res) => {
  res.sendFile(__dirname + '/public/wallet-demo.html');
  console.log("Wallet demo page requested");
});

const server = http.createServer(app);
console.log("HTTP server created");
const wss = new WebSocket.Server({ server, clientTracking: true });
console.log("WebSocket server created");

// Track connected players
const players = new Map();    // playerId -> { ws, sessionId, position, rotation, health, ... }
const sessions = new Set();   // tracks sessionIds to prevent duplicate connections
let nextPlayerId = 1;
console.log("Player tracking variables initialized");

// Track bot players (new)
const botPlayers = new Map(); // botId -> { position, rotation, health, ... }
console.log("Bot player tracking initialized");

// NPC system - Server-controlled NPCs
const npcs = new Map(); // npcId -> { id, position, rotation, health, isWalking, path, etc. }
let nextNpcId = 1;
console.log("Server-controlled NPC system initialized");

// New: Track persistent player identities
const playerIdentities = new Map(); // clientId -> { username, playerId, token, lastSeen }
console.log("Player identity tracking initialized");

// Production mode
const isDevMode = false;
console.log(`Server running in ${isDevMode ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);

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

// Add NFT verification configuration
// Hardcoded NFT token address for now (this would be a specific NFT or collection address)
const SPECIAL_SKIN_NFT_ADDRESS = "3j4UKuFb7FDQ4ZNSbSujiak6Ps7AQVE9ynnLHorArzGz"; // Replace with actual Solana NFT mint address
// You can add additional NFT addresses here
const SPECIAL_SKIN_NFT_ADDRESSES = [
  "3j4UKuFb7FDQ4ZNSbSujiak6Ps7AQVE9ynnLHorArzGz",
  "81FNAomj6H5r2VJ3e5J6NLDShqiUaEbMwVuCssYpVm9E",
  "58NysJG5K18zgLMN4uKVJ8HhetwwGz5fUDBCk52UfMtA",
  "EsT86r7ZRAeqGaczHidEH8byaWjt4zgAWDLqRgNSN3i5",
  // Add more NFT mint addresses here
];
const HELIUS_API_KEY = process.env.HELIUS_API_KEY; // Helius API key
const HELIUS_API_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Map to store wallet to skin permission mappings
const walletSkins = new Map(); // walletAddress -> { skins: { skinId: true }, ... }

/**
 * Checks if a wallet owns a specific NFT or any from a list via Helius API
 * @param {string} walletAddress - The wallet address to check
 * @param {string|string[]} nftAddresses - Single NFT mint address or array of NFT mint addresses to verify ownership
 * @returns {Promise<boolean>} Whether the wallet owns any of the NFTs
 */
async function checkNftOwnership(walletAddress, nftAddresses) {
  try {
    // Convert single address to array if needed
    const addresses = Array.isArray(nftAddresses) ? nftAddresses : [nftAddresses];
    
    console.log(`Checking if wallet ${walletAddress} owns any of ${addresses.length} NFTs`);
    
    const response = await fetch(HELIUS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'helius-test',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1,
          limit: 100,
        },
      }),
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('Helius API error:', data.error);
      return false;
    }
    
    // Check if the wallet owns any of the NFTs
    const assets = data.result.items;
    const ownsNft = assets.some(asset => addresses.includes(asset.id));
    
    console.log(`Wallet ${walletAddress} ${ownsNft ? 'owns' : 'does not own'} one of the specified NFTs`);
    
    return ownsNft;
  } catch (error) {
    console.error('Error checking NFT ownership:', error);
    return false;
  }
}

/**
 * Updates the player's skin based on wallet NFT ownership
 * @param {string} playerId - The player ID
 * @param {string} walletAddress - The wallet address
 */
async function updatePlayerSkin(playerId, walletAddress) {
  try {
    // Check if the wallet owns any of the special NFTs
    const ownsSpecialSkin = await checkNftOwnership(walletAddress, SPECIAL_SKIN_NFT_ADDRESSES);
    
    // Update the player's skin permissions
    walletSkins.set(walletAddress, {
      skins: {
        bananaSkin: ownsSpecialSkin
      }
    });
    
    // Get the player from the players map
    const player = players.get(playerId);
    if (!player) return;
    
    // Update the player data with skin information
    player.skins = {
      bananaSkin: ownsSpecialSkin
    };
    
    // Broadcast the skin update to all players
    broadcastToAll({
      type: 'playerSkinUpdate',
      playerId: playerId,
      skins: {
        bananaSkin: ownsSpecialSkin
      }
    });
    
    // Send confirmation to the player
    player.ws.send(JSON.stringify({
      type: 'skinPermissionUpdate',
      skins: {
        bananaSkin: ownsSpecialSkin
      }
    }));
    
    console.log(`Updated skin permissions for player ${playerId} (wallet: ${walletAddress}): bananaSkin=${ownsSpecialSkin}`);
  } catch (error) {
    console.error(`Error updating player skin for ${playerId}:`, error);
  }
}

// Create helper function for sanitizing text to prevent XSS
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  
  // Remove potentially dangerous content first
  text = text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
    
  // Limit length for usernames
  if (text.length > 20) {
    text = text.substring(0, 20);
  }
  
  // Perform HTML escaping
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// On new connection
wss.on('connection', (ws, req) => {
  // Parse parameters from query string
  const parameters = url.parse(req.url, true).query;
  const sessionId = parameters.sessionId;
  const clientId = parameters.clientId;
  let username = parameters.username;
  const token = parameters.token;
  const walletAddress = parameters.walletAddress; // New: Get wallet address if provided
  
  // Sanitize username to prevent XSS
  username = sanitizeText(username || 'Anonymous');

  // Check if this is a development mode connection
  const isDev = isDevMode && (parameters.dev === 'true' || parameters.newplayer === 'true');
  
  if (isDev) {
    console.log("Development mode connection detected");
  }

  // If we already have this sessionId, reject as duplicate
  // Skip this check for development mode connections
  if (sessionId && sessions.has(sessionId) && !isDev) {
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

  // Verify player identity if clientId and token provided
  // Skip verification for development mode connections
  if (clientId && token && !isDev) {
    const storedIdentity = playerIdentities.get(clientId);
    
    // If we have this player's identity stored already
    if (storedIdentity) {
      // Check if token matches
      if (storedIdentity.token !== token) {
        console.log(`Token mismatch for clientId: ${clientId}`);
        ws.send(JSON.stringify({
          type: 'authFailure',
          reason: 'invalidToken',
          message: 'Invalid authentication token'
        }));
        return ws.close(1008, 'Authentication failure');
      }
      
      // Update the stored player identity
      storedIdentity.lastSeen = Date.now();
      storedIdentity.username = sanitizeText(username || storedIdentity.username);
      
      // Use the existing player ID for this client
      const playerId = storedIdentity.playerId;
      console.log(`Recognized returning player ${playerId} (clientId: ${clientId}, username: ${sanitizeText(username || storedIdentity.username)})`);
      
      // Send Telegram notification for returning player
      if (!isDev) {
        sendTelegramNotification(`🔄 Player reconnected: ${sanitizeText(username || storedIdentity.username)} (ID: ${playerId})`);
      }
      
      // Initialize player with recognized identity
      initializePlayer(ws, playerId, sessionId, clientId, sanitizeText(username || storedIdentity.username), token, isDev);
      return;
    }
  }

  // If we reach here, it's a new player or unrecognized returning player
  const playerId = nextPlayerId++;
  console.log(`Player ${playerId} connected (sessionId: ${sessionId || 'none'}, username: ${username}, isDev: ${isDev})`);

  // Store player identity information if provided (unless in dev mode with newplayer=true)
  if (clientId && !isDev) {
    playerIdentities.set(clientId, {
      username: username,
      playerId,
      token: token || '',
      lastSeen: Date.now()
    });
    console.log(`Associated player ${playerId} with clientId ${clientId} and username ${username}`);
    
    // Send Telegram notification for new player
    sendTelegramNotification(`🎮 New player joined: ${username} (ID: ${playerId})`);
  }

  // Initialize the new player
  initializePlayer(ws, playerId, sessionId, clientId, username, token, isDev);
});

// Extract player initialization to a separate function
function initializePlayer(ws, playerId, sessionId, clientId, username, token, isDev = false) {
  // Create initial player data with health and QuickDraw info
  players.set(playerId, {
    ws,
    sessionId,
    clientId,
    username,
    isDev, // Store dev mode flag for reference
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
    lastUpdateTime: Date.now(),
    // Initialize skin data for new players
    skins: {
      bananaSkin: false // Default to no special skin
    }
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
  // FIXED: Ensure we don't include the player's own ID in the list of players sent
  ws.send(JSON.stringify({
    type: 'init',
    id: playerId,
    players: Array.from(players.entries())
      .filter(([pid]) => pid !== playerId) // Make sure to exclude the player's own ID
      .map(([pid, p]) => ({
        id: pid,
        position: p.position,
        rotation: p.rotation,
        isAiming: p.isAiming,
        isShooting: p.isShooting,
        isReloading: p.isReloading,
        health: p.health,
        username: p.username,
        quickDrawLobbyIndex: p.quickDrawLobbyIndex,
        skins: p.skins || { bananaSkin: false } // Include skin information for existing players
      }))
  }));

  // Send initial train state
  sendInitialTrainState(ws);

  // Notify others that a new player joined
  broadcastToOthers(playerId, {
    type: 'playerJoined',
    id: playerId,
    position: players.get(playerId).position,
    rotation: players.get(playerId).rotation,
    health: players.get(playerId).health,
    username: players.get(playerId).username,
    quickDrawLobbyIndex: players.get(playerId).quickDrawLobbyIndex,
    skins: players.get(playerId).skins // Include skins in the join message
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
            data.damage || 40,
            data.hitDetected || false
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

        // Handle chat messages
        case 'chat':
          handleChatMessage(playerId, data.message);
          break;

        // Handle bot player updates
        case 'bot_update':
          handleBotUpdate(data);
          break;
        
        // Handle bot player removal
        case 'bot_remove':
          handleBotRemove(data);
          break;

        // Handle wallet connection from client
        case 'walletConnect':
          if (!data.walletAddress) {
            console.error(`Invalid wallet connection from player ${playerId}: No wallet address provided`);
            return;
          }
          
          const player = players.get(playerId);
          if (!player) {
            console.error(`Wallet connection received for unknown player ${playerId}`);
            return;
          }
          
          console.log(`Player ${playerId} connected wallet: ${data.walletAddress}`);
          
          // Update player record with wallet address
          player.walletAddress = data.walletAddress;
          
          // Check NFT ownership and update skin permissions
          updatePlayerSkin(playerId, data.walletAddress);
          break;

        // Handle train state request
        case 'requestTrainState':
          console.log(`Player ${playerId} requested train state`);
          sendInitialTrainState(player.ws);
          return;

        default:
          break;
      }
    } catch (err) {
      console.error(`Error handling message from player ${playerId}:`, err);
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
}

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
  
  // Update player data - town boundary check removed to allow players to explore freely
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
  
  // Handle shotgun pellets - generate multiple projectiles with spread
  const isShotgun = player.activeWeapon === 'shotgun';
  const bulletCount = isShotgun ? 10 : 1; // 10 pellets for shotgun, 1 for revolver
  
  // If multiple bullets come from revolver in a single shot, it's likely cheating
  if (!isShotgun && data.bulletData.pelletCount && data.bulletData.pelletCount > 1) {
    console.log(`Potential cheating detected: Player ${playerId} tried to fire multiple revolver bullets at once`);
    return sendErrorToPlayer(playerId, "Invalid bullet count for weapon type", true);
  }
  
  // Create server-side bullets (one bullet for revolver, multiple pellets for shotgun)
  for (let i = 0; i < bulletCount; i++) {
    const bulletId = nextBulletId++;
    
    // For shotgun, apply spread to each pellet except the first one (which uses the original aim direction)
    let pelletDirection = { ...direction };
    
    if (isShotgun && i > 0) {
      // Apply realistic shotgun spread
      const spread = 0.08; // Match client-side spread value
      pelletDirection = {
        x: direction.x + (Math.random() - 0.5) * spread,
        y: direction.y + (Math.random() - 0.5) * spread,
        z: direction.z + (Math.random() - 0.5) * spread
      };
      
      // Normalize the direction after applying spread
      const pelletDirMag = Math.sqrt(
        pelletDirection.x * pelletDirection.x + 
        pelletDirection.y * pelletDirection.y + 
        pelletDirection.z * pelletDirection.z
      );
      
      pelletDirection.x /= pelletDirMag;
      pelletDirection.y /= pelletDirMag;
      pelletDirection.z /= pelletDirMag;
    }
    
    const bullet = {
      id: bulletId,
      sourcePlayerId: playerId,
      position: data.bulletData.position,
      direction: pelletDirection,
      distanceTraveled: 0,
      maxDistance: GAME_CONSTANTS.MAX_BULLET_DISTANCE,
      speed: GAME_CONSTANTS.BULLET_SPEED,
      timeCreated: now,
      active: true,
      isShotgunPellet: isShotgun,
      pelletIndex: i
    };
    
    // Add to active bullets
    activeBullets.set(bulletId, bullet);
    
    // For the first bullet/pellet or if it's a revolver shot, notify all clients
    // For shotgun pellets after the first, only notify about first pellet to save bandwidth
    if (i === 0 || !isShotgun) {
      broadcastToAll({
        type: 'playerShoot',
        id: playerId,
        bulletId: bulletId,
        bulletData: {
          position: data.bulletData.position,
          direction: pelletDirection,
          isShotgunPellet: isShotgun
        }
      });
    }
  }
  
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
  console.log(`Player ${playerId} claims hit on player/npc ${targetId}`);
  
  // Basic validation
  const isPlayerTarget = players.has(targetId);
  const isNpcTarget = npcs.has(targetId);
  
  if (!players.has(playerId) || (!isPlayerTarget && !isNpcTarget)) {
    console.log(`Hit claim invalid - player ${playerId} or target ${targetId} not found`);
    return;
  }
  
  const player = players.get(playerId);
  
  // Get target (player or NPC)
  let target;
  let isNpc = false;
  
  if (isPlayerTarget) {
    target = players.get(targetId);
  } else if (isNpcTarget) {
    target = npcs.get(targetId);
    isNpc = true;
  }
  
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
  
  // If this is a shotgun hit, use a shorter debounce time to allow multiple pellets to hit
  const isShotgunHit = player.activeWeapon === 'shotgun' || 
                      (bulletId && activeBullets.has(bulletId) && activeBullets.get(bulletId).isShotgunPellet);
  
  // Use a shorter debounce time for shotgun pellets (50ms) vs regular bullets (300ms)
  const hitDebounceTime = isShotgunHit ? 50 : 300;
  
  if (now - lastHitTime < hitDebounceTime) {
    console.log(`Hit debounced: Player ${playerId} hit ${targetId} too quickly after last hit (${now - lastHitTime}ms)`);
    return; // Silently ignore too-frequent hits
  }
  
  // Update last hit time for this target
  player.recentHits.set(targetId, now);
  
  // ADDED: Check if this is a quickdraw duel hit
  // If the players are in a quickdraw duel, handle it using the quickdraw logic
  if (!isNpc && player.inQuickDrawDuel && target.inQuickDrawDuel && player.quickDrawDuelId === target.quickDrawDuelId) {
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
      handleQuickDrawShoot(playerId, targetId, undefined, hitData.hitZone, finalDamage, true);
      return;
    }
  }
  
  // Rest of original hit handling for non-quickdraw hits
  // Get bullet data if available
  let bullet = null;
  if (bulletId && activeBullets.has(bulletId)) {
    bullet = activeBullets.get(bulletId);
  }
  
  // Calculate damage based on hit zone and weapon type
  let damage = GAME_CONSTANTS.DAMAGE_PER_HIT;
  
  // Check if this is a shotgun pellet hit
  const isShotgunPellet = player.activeWeapon === 'shotgun' || 
                         (bullet && bullet.isShotgunPellet);
  
  if (isShotgunPellet) {
    // Shotgun pellet damage
    if (hitData.hitZone === 'head') {
      damage = 10; // Per pellet headshot damage
    } else {
      damage = 5;  // Per pellet body/limb damage
    }
  } else {
    // Regular bullet damage
    if (hitData.hitZone === 'head') {
      damage = 100; // One-shot kill for headshots
    } else if (hitData.hitZone === 'body') {
      damage = 40; // Standard body shot
    } else if (hitData.hitZone === 'limbs') {
      damage = 20; // Reduced damage for limbs
    }
  }
  
  // Apply damage to target
  target.health = Math.max(0, target.health - damage);
  
  // If NPC was hit and survived, make them fight back
  if (isNpc && target.health > 0) {
    handleNpcAttacked(targetId, playerId);
  }
  
  // Notify both target and shooter
  if (!isNpc && target.ws && target.ws.readyState === WebSocket.OPEN) {
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
      damage: damage,
      isNpc: isNpc
    }));
  }
  
  // Broadcast hit to other players for visual effects
  broadcastToOthers([playerId, isNpc ? null : targetId], {
    type: 'playerHit',
    targetId: targetId,
    sourceId: playerId,
    hitPosition: hitData.position,
    health: target.health,
    hitZone: hitData.hitZone,
    damage: damage,
    isNpc: isNpc
  });
  
  // Check if target has been defeated
  if (target.health <= 0) {
    if (isNpc) {
      handleNpcDeath(targetId, playerId);
    } else {
      handlePlayerDeath(targetId, playerId);
    }
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
  
  // Send death notification to all clients
  broadcastToAll({
    type: 'playerDeath',
    id: playerId,
    killedById: killedById
  });
  
  // Send death notification to the killed player
  if (player.ws && player.ws.readyState === WebSocket.OPEN) {
    player.ws.send(JSON.stringify({
      type: 'death',
      killerId: killedById
    }));
  }
  
  // Send kill notification to the killer
  const killer = players.get(killedById);
  if (killer && killer.ws && killer.ws.readyState === WebSocket.OPEN) {
    killer.ws.send(JSON.stringify({
      type: 'kill',
      targetId: playerId
    }));
  }
  
  // Delay respawn to allow death animation to complete
  setTimeout(() => {
    // Check if player is still connected
    if (players.has(playerId)) {
      respawnPlayer(playerId);
    }
  }, 2000); // 2 second delay for death animation
}

// Anti-cheat: Respawn a player
function respawnPlayer(playerId) {
  const player = players.get(playerId);
  if (!player) return;
  
  // Reset player state
  player.health = 100;
  
  // Reset weapon state based on active weapon
  if (!player.activeWeapon) {
    player.activeWeapon = 'revolver'; // Default if not set
  }
  
  // Define weapon capacities
  const weaponCapacity = {
    revolver: 6,
    shotgun: 2
  };
  
  // Set max bullets based on active weapon
  player.maxBullets = weaponCapacity[player.activeWeapon] || 6;
  
  // Reset ammo to maximum
  player.bullets = player.maxBullets;
  
  // Reset states
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
      bullets: player.bullets,
      maxBullets: player.maxBullets,
      activeWeapon: player.activeWeapon
    }));
  }
  
  // Broadcast the respawn to all players
  broadcastToAll({
    type: 'playerUpdate',
    id: playerId,
    position: player.position,
    health: player.health,
    isReloading: false,
    isAiming: false,
    isDying: false,             // Explicitly reset death animation state
    resetAnimationState: true,  // Special flag to trigger animation reset on clients
    activeWeapon: player.activeWeapon
  });
}

// Anti-cheat: Check if position is within town boundaries
function isPositionInTown(position) {
  // Modified to always return true, allowing players to leave town
  return true;
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
  
  if (!player) return;
  
  console.log(`Cleaning up player ${playerId}`);
  
  // If this player has a clientId, update their lastSeen time
  if (player.clientId) {
    const identity = playerIdentities.get(player.clientId);
    if (identity) {
      identity.lastSeen = Date.now();
      console.log(`Updated lastSeen for identity ${player.clientId}`);
    }
  }
  
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
  playerPositionHistory.delete(playerId);
  
  // Send Telegram notification for player disconnect
  if (player.username && !player.isDev) {
    sendTelegramNotification(`👋 Player left: ${player.username} (ID: ${playerId})`);
  }

  // Notify all that the player left
  broadcastToAll({
    type: 'playerLeft',
    id: playerId
  });

  updatePlayerCount();
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
    // Skip if this is the excluded player ID (could be a number or an array of numbers)
    if (Array.isArray(excludeId) ? excludeId.includes(pid) : pid === excludeId) continue;
    
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
  
  duel.state = 'countdown';
  
  const player1 = players.get(duel.player1Id);
  const player2 = players.get(duel.player2Id);
  
  if (!player1 || !player2) {
    endQuickDrawDuel(duelId, null); // End duel if either player disconnected
    return;
  }
  
  // Send Telegram notification for Quick Draw duel
  sendTelegramNotification(`🤠 Quick Draw duel started between ${player1.username} and ${player2.username} in arena ${duel.arenaIndex + 1}`);
  
  // Send countdown signal immediately
  player1.ws.send(JSON.stringify({ type: 'quickDrawCountdown' }));
  player2.ws.send(JSON.stringify({ type: 'quickDrawCountdown' }));
  
  // Set a random time for the draw signal (1-5 seconds)
  const drawTime = 1000 + Math.floor(Math.random() * 4000);
  duel.drawTimeout = setTimeout(() => {
    if (quickDrawDuels.has(duelId)) {
      sendDrawSignal(duelId);
    }
  }, drawTime);
}

/**
 * Update the game state to "draw" phase without sending a visual message.
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
  
  // Send draw signal to both players without visual text
  player1.ws.send(JSON.stringify({ type: 'quickDrawDraw' }));
  player2.ws.send(JSON.stringify({ type: 'quickDrawDraw' }));
  
  console.log(`Draw signal sent for duel ${duelId}`);
}

/**
 * Handle a player shooting in a Quick Draw duel.
 * @param {number} playerId - The player's ID
 * @param {number} targetId - The target player's ID
 * @param {number} arenaIndex - The arena index for the duel (optional for direct duels)
 * @param {string} hitZone - The hit zone ('head', 'body', 'limbs')
 * @param {number} damage - The damage amount
 */
function handleQuickDrawShoot(playerId, targetId, arenaIndex, hitZone = 'body', damage = 40, hitDetected = false) {
    playerId = Number(playerId);
    targetId = Number(targetId);
    
    console.log(`Quick Draw shoot: Player ${playerId} shot player ${targetId} (${hitZone}, ${damage} damage, hitDetected: ${hitDetected})`);
    
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
    
    // If hitDetected is false and it's not a miss, don't apply damage
    if (!hitDetected && hitZone !== 'miss') {
        console.log(`Quick Draw shot without proper hit detection from player ${playerId} - ignoring damage`);
        
        // Send a debug message to the client
        if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
            playerData.ws.send(JSON.stringify({
                type: 'debug',
                message: 'Shot ignored - hit detection failed'
            }));
        }
        
        // Consider this a miss
        hitZone = 'miss';
        damage = 0;
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
    
    // If it's a miss, don't apply damage
    if (hitZone === 'miss') {
        console.log(`Player ${playerId} missed - no damage applied`);
        
        // Send miss notification to both players
        const missData = {
            type: 'quickDrawMiss',
            playerId: playerId,
            targetId: targetId
        };
        
        if (playerData.ws && playerData.ws.readyState === WebSocket.OPEN) {
            playerData.ws.send(JSON.stringify(missData));
        }
        
        const targetPlayer = players.get(targetId);
        if (targetPlayer && targetPlayer.ws && targetPlayer.ws.readyState === WebSocket.OPEN) {
            targetPlayer.ws.send(JSON.stringify(missData));
        }
        
        return;
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
        
        // Send death flag to all other players to trigger death animation
        broadcastToOthers(targetId, {
            type: 'playerUpdate',
            id: targetId,
            position: targetPlayer.position,
            rotation: targetPlayer.rotation,
            health: 0,
            isDying: true // Trigger death animation on client
        });
        
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
  
  // Get player objects for notification
  const player1 = players.get(duel.player1Id);
  const player2 = players.get(duel.player2Id);
  
  // Determine the winner username for notification
  let winnerUsername = 'Unknown';
  let loserUsername = 'Unknown';
  
  if (winnerId) {
    // If we have a winner, determine usernames
    if (winnerId === duel.player1Id && player1) {
      winnerUsername = player1.username;
      loserUsername = player2 ? player2.username : 'Disconnected player';
    } else if (winnerId === duel.player2Id && player2) {
      winnerUsername = player2.username;
      loserUsername = player1 ? player1.username : 'Disconnected player';
    }
    
    // Send Telegram notification about duel result
    sendTelegramNotification(`🏆 Quick Draw duel ended: ${winnerUsername} defeated ${loserUsername} in arena ${duel.arenaIndex + 1}`);
  } else {
    // No winner (both disconnected or other reason)
    sendTelegramNotification(`🚫 Quick Draw duel ended with no winner in arena ${duel.arenaIndex + 1}`);
  }
  
  console.log(`Ending Quick Draw duel ${duelId} with winner: ${winnerId || 'none'}`);
  
  // Clear any pending timeouts
  if (duel.drawTimeout) {
    clearTimeout(duel.drawTimeout);
  }
  
  // First notify players of the duel result
  if (player1 && player1.ws.readyState === WebSocket.OPEN) {
    player1.inQuickDrawDuel = false;
    player1.quickDrawDuelId = null;
    player1.quickDrawLobbyIndex = -1;
    
    // Send standard QuickDraw end notification
    player1.ws.send(JSON.stringify({
      type: 'quickDrawEnd',
      winnerId: winnerId
    }));
    
    // If this player lost, also send death notification
    if (winnerId && winnerId !== duel.player1Id) {
      // Set loser's health to 0
      player1.health = 0;
      
      // Send death notification (same as regular deaths)
      player1.ws.send(JSON.stringify({
        type: 'death',
        killerId: winnerId
      }));
      
      // Broadcast death animation to all clients
      broadcastToAll({
        type: 'playerDeath',
        id: duel.player1Id,
        killedById: winnerId
      });
    }
    
    // If this player won, send kill notification
    if (winnerId && winnerId === duel.player1Id) {
      player1.ws.send(JSON.stringify({
        type: 'kill',
        targetId: duel.player2Id
      }));
    }
  }
  
  if (player2 && player2.ws.readyState === WebSocket.OPEN) {
    player2.inQuickDrawDuel = false;
    player2.quickDrawDuelId = null;
    player2.quickDrawLobbyIndex = -1;
    
    // Send standard QuickDraw end notification
    player2.ws.send(JSON.stringify({
      type: 'quickDrawEnd',
      winnerId: winnerId
    }));
    
    // If this player lost, also send death notification
    if (winnerId && winnerId !== duel.player2Id) {
      // Set loser's health to 0
      player2.health = 0;
      
      // Send death notification (same as regular deaths)
      player2.ws.send(JSON.stringify({
        type: 'death',
        killerId: winnerId
      }));
      
      // Broadcast death animation to all clients
      broadcastToAll({
        type: 'playerDeath',
        id: duel.player2Id,
        killedById: winnerId
      });
    }
    
    // If this player won, send kill notification
    if (winnerId && winnerId === duel.player2Id) {
      player2.ws.send(JSON.stringify({
        type: 'kill',
        targetId: duel.player1Id
      }));
    }
  }
  
  // Wait for animation to complete before sending respawn
  setTimeout(() => {
    // Respawn both players in their new positions
    if (player1 && players.has(duel.player1Id)) {
      respawnPlayer(duel.player1Id);
    }
    
    if (player2 && players.has(duel.player2Id)) {
      respawnPlayer(duel.player2Id);
    }
    
    // Finally, remove the duel from the active duels map
    quickDrawDuels.delete(duelId);
    
    // Update arena status
    const arenaIndex = duel.arenaIndex;
    if (arenaIndex !== undefined) {
      arenaInUse[arenaIndex] = false;
    }
    
  }, 2000); // 2 second delay for death animation, same as regular kills
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
  // Define the town boundaries
  const townWidth = GAME_CONSTANTS.TOWN_WIDTH;
  const townLength = GAME_CONSTANTS.TOWN_LENGTH;
  
  // Fixed eye level height
  const eyeLevel = 2.72;
  
  console.log(`[DEBUG] QuickDraw duel - Setting player eye level to ${eyeLevel} (feet should be at ground level)`);
  
  // Create 5 parallel lanes with realistic spacing for a line formation
  const numLanes = 5;
  const laneSpacing = 3.0; // 3 meters between each lane - realistic spacing for people standing side by side
  const totalLineWidth = (numLanes - 1) * laneSpacing; // Total width of the line formation
  const startX = -totalLineWidth / 2; // Center the formation in the town
  
  // Choose a random lane (0-4)
  const laneIndex = Math.floor(Math.random() * numLanes);
  const laneX = startX + (laneIndex * laneSpacing);
  
  console.log(`[DEBUG] Chosen quickdraw lane ${laneIndex + 1} of ${numLanes} at X=${laneX.toFixed(2)}`);
  
  // Position at north/south of the chosen lane, maintaining the same Z position for all lanes
  // This creates a straight line of duelists on each side
  const position1 = {
    x: laneX,
    y: eyeLevel,
    z: -20 // North line position
  };
  
  const position2 = {
    x: laneX,
    y: eyeLevel,
    z: 20 // South line position
  };
  
  // Calculate vector from player1 to player2
  const dx = position2.x - position1.x;
  const dz = position2.z - position1.z;
  
  // Calculate angle from positive Z axis (which is the "forward" direction in THREE.js)
  // Add Math.PI (180 degrees) to make players FACE each other instead of facing away
  const rotation1 = Math.atan2(dx, dz) + Math.PI;
  
  // For player2, we need to calculate the angle from the positive Z axis to the vector pointing to player1
  // This is the opposite direction, so we use negative dx and dz, plus 180 degrees correction
  const rotation2 = Math.atan2(-dx, -dz) + Math.PI;
  
  // Log positions
  console.log(`[DEBUG] DUEL POSITIONS (LANE ${laneIndex + 1} SPAWN):`);
  console.log(`  Player1: (${position1.x.toFixed(2)}, ${position1.y.toFixed(2)}, ${position1.z.toFixed(2)}) facing ${rotation1.toFixed(4)} radians (${(rotation1 * 180 / Math.PI).toFixed(1)}°)`);
  console.log(`  Player2: (${position2.x.toFixed(2)}, ${position2.y.toFixed(2)}, ${position2.z.toFixed(2)}) facing ${rotation2.toFixed(4)} radians (${(rotation2 * 180 / Math.PI).toFixed(1)}°)`);
  console.log(`  Lane ${laneIndex + 1} of ${numLanes}, Line Formation Width: ${totalLineWidth.toFixed(2)}m`);
  console.log(`  Exact distance between players: 40.00 meters, Vector: (${dx.toFixed(2)}, ${dz.toFixed(2)})`);
  
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
  
  // Extra debugging to verify positions are correct in match notification
  console.log(`[POSITION DEBUG] Match notification positions sent:
    Challenger(${challengerId}): (${spawnPositions.position1.x}, ${spawnPositions.position1.y}, ${spawnPositions.position1.z})
    Player(${playerId}): (${spawnPositions.position2.x}, ${spawnPositions.position2.y}, ${spawnPositions.position2.z})
    Should be distance: ${Math.sqrt(
      Math.pow(spawnPositions.position1.x - spawnPositions.position2.x, 2) +
      Math.pow(spawnPositions.position1.z - spawnPositions.position2.z, 2)
    ).toFixed(2)} meters
  `);
  
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

/**
 * Handle chat messages from players and broadcast them
 * @param {number} playerId - The ID of the player sending the message 
 * @param {string} message - The chat message
 */
function handleChatMessage(playerId, message) {
  // Get player info
  const player = players.get(playerId);
  if (!player) return;
  
  // Rate limiting - max one message per 2 seconds
  const now = Date.now();
  const timeouts = playerTimeouts.get(playerId);
  if (timeouts) {
    if (!timeouts.lastChat) {
      timeouts.lastChat = 0;
    }
    
    // Rate limiting
    if (now - timeouts.lastChat < 2000) {
      console.log(`Chat rate limited for player ${playerId}`);
      return;
    }
    
    timeouts.lastChat = now;
  }
  
  // Validate and sanitize message
  if (!message || typeof message !== 'string') return;
  
  // Limit message length (chat messages can be longer than usernames)
  if (message.length > 60) {
    message = message.substring(0, 60);
  }
  
  // Sanitize the message
  message = sanitizeText(message);
  
  console.log(`Chat message from ${player.username} (${playerId}): ${message}`);
  
  // Broadcast the message to all players
  broadcastToAll({
    type: 'chatMessage',
    senderId: playerId,
    username: player.username,
    message: message
  });
}

// Handle bot player updates
function handleBotUpdate(data) {
  // This function is deprecated as NPCs are now server-controlled
  console.log("Warning: Client attempted to update bot state. Ignoring as NPCs are now server-controlled.");
}

// Handle bot player removal
function handleBotRemove(data) {
  // This function is deprecated as NPCs are now server-controlled
  console.log("Warning: Client attempted to remove bot. Ignoring as NPCs are now server-controlled.");
}

/**
 * Creates a new NPC with the given properties
 * @param {Object} npcData - NPC configuration data
 * @returns {string} The ID of the created NPC
 */
function createNpc(npcData = {}) {
  const id = `npc_${nextNpcId++}`;
  const defaultPosition = { x: 0, y: 2.72, z: 0 };
  
  // Create NPC data structure
  const npc = {
    id: id,
    username: sanitizeText(npcData.name || 'Town NPC'),
    position: npcData.position ? {...npcData.position} : {...defaultPosition},
    // Always store a deep copy of the spawn position
    originalSpawnPosition: npcData.originalSpawnPosition ? 
      {...npcData.originalSpawnPosition} : 
      (npcData.position ? {...npcData.position} : {...defaultPosition}),
    rotation: npcData.rotation || { y: 0 },
    health: npcData.health || 100,
    isWalking: false,
    isAiming: false,
    isShooting: false,
    isIdle: true,
    walkSpeed: npcData.walkSpeed || 1.5,
    lastUpdateTime: Date.now(),
    lastBroadcastTime: 0,
    
    // Path configuration
    path: npcData.path || {
      points: [
        { x: -5, y: 2.72, z: 0 },
        { x: 5, y: 2.72, z: 0 }
      ],
      currentTarget: 0,
      pauseTime: npcData.pauseTime || 2000,
      lastPauseTime: 0,
      isPaused: false,
      pauseTimer: 0
    }
  };
  
  // Log spawn position for debugging
  console.log(`Creating NPC ${id} at position (${npc.position.x}, ${npc.position.y}, ${npc.position.z})`);
  console.log(`Original spawn position set to (${npc.originalSpawnPosition.x}, ${npc.originalSpawnPosition.y}, ${npc.originalSpawnPosition.z})`);
  
  // Store NPC in the collection
  npcs.set(id, npc);
  
  // Broadcast to all clients that a new NPC has joined
  broadcastToAll({
    type: 'playerJoined',
    id: id,
    username: npc.username,
    position: npc.position,
    rotation: npc.rotation,
    health: npc.health,
    isWalking: npc.isWalking,
    isAiming: npc.isAiming,
    isShooting: npc.isShooting,
    isNpc: true  // Mark as NPC for clients
  });
  
  console.log(`Created server-controlled NPC: ${id} (${npc.username})`);
  return id;
}

/**
 * Update an existing NPC's state
 * @param {string} npcId - The ID of the NPC to update
 * @param {Object} updateData - The data to update
 */
function updateNpc(npcId, updateData) {
  const npc = npcs.get(npcId);
  if (!npc) return;
  
  // Update NPC properties
  Object.keys(updateData).forEach(key => {
    npc[key] = updateData[key];
  });
  
  // Broadcast the update to all clients
  broadcastNpcState(npcId);
}

/**
 * Remove an NPC from the game
 * @param {string} npcId - The ID of the NPC to remove
 */
function removeNpc(npcId) {
  if (!npcs.has(npcId)) return;
  
  // Remove the NPC from our collection
  npcs.delete(npcId);
  
  // Broadcast to all clients that the NPC has left
  broadcastToAll({
    type: 'playerLeft',
    id: npcId
  });
  
  console.log(`Removed server-controlled NPC: ${npcId}`);
}

/**
 * Broadcast an NPC's current state to all clients
 * @param {string} npcId - The ID of the NPC to broadcast
 */
function broadcastNpcState(npcId) {
  const npc = npcs.get(npcId);
  if (!npc) return;
  
  // Only broadcast at a reasonable rate to reduce network traffic
  const currentTime = Date.now();
  if (currentTime - npc.lastBroadcastTime < 100) return;
  npc.lastBroadcastTime = currentTime;
  
  // Create the update data packet
  const updateData = {
    type: 'playerUpdate',
    id: npc.id,
    username: npc.username,
    position: npc.position,
    rotation: npc.rotation,
    health: npc.health,
    isWalking: npc.isWalking,
    isAiming: npc.isAiming,
    isShooting: npc.isShooting,
    isNpc: true  // Mark as NPC
  };
  
  // Broadcast to all clients
  broadcastToAll(updateData);
}

/**
 * Update the walking behavior for an NPC
 * @param {string} npcId - The ID of the NPC to update
 */
function updateNpcWalkingBehavior(npcId) {
  const npc = npcs.get(npcId);
  if (!npc) return;
  
  const currentTime = Date.now();
  const deltaTime = (currentTime - npc.lastUpdateTime) / 1000;
  npc.lastUpdateTime = currentTime;
  
  // Handle paused state
  if (npc.path.isPaused) {
    npc.path.pauseTimer += deltaTime * 1000;
    
    // Resume walking after pause time
    if (npc.path.pauseTimer >= npc.path.pauseTime) {
      npc.path.isPaused = false;
      npc.path.pauseTimer = 0;
      npc.isWalking = true;
      npc.isIdle = false;
    } else {
      // Stay in idle state while paused
      if (!npc.isIdle) {
        npc.isIdle = true;
        npc.isWalking = false;
      }
      return; // Exit early for paused NPCs - preserves initial rotation
    }
  }
  
  // Get current target and position
  const pathPoints = npc.path.points;
  const currentTargetIndex = npc.path.currentTarget;
  const targetPoint = pathPoints[currentTargetIndex];
  
  // Calculate direction and distance to target
  const directionX = targetPoint.x - npc.position.x;
  const directionZ = targetPoint.z - npc.position.z;
  const distanceSquared = directionX * directionX + directionZ * directionZ;
  
  // Check if we've reached the target (within 0.1 units)
  if (distanceSquared < 0.1) {
    // We've reached the target point, move to next one
    npc.path.currentTarget = (currentTargetIndex + 1) % pathPoints.length;
    
    // Pause at the target point before moving to next one
    npc.path.isPaused = true;
    npc.path.pauseTimer = 0;
    npc.path.lastPauseTime = currentTime;
    
    // Update animation state
    npc.isWalking = false;
    npc.isIdle = true;
  } else {
    // Normalize direction
    const distance = Math.sqrt(distanceSquared);
    const normalizedDirX = directionX / distance;
    const normalizedDirZ = directionZ / distance;
    
    // Move towards the target
    const moveSpeed = npc.walkSpeed * deltaTime;
    
    // Calculate new position
    npc.position.x += normalizedDirX * moveSpeed;
    npc.position.z += normalizedDirZ * moveSpeed;
    
    // Calculate rotation to face direction of movement (add Math.PI to face forward)
    npc.rotation.y = Math.atan2(normalizedDirX, normalizedDirZ) + Math.PI;
    
    // Ensure walking animation is playing
    if (!npc.isWalking) {
      npc.isWalking = true;
      npc.isIdle = false;
    }
  }
}

/**
 * Spawn a town NPC with a predefined path
 * @param {string} name - NPC name
 * @returns {string} - The created NPC's ID
 */
function spawnTownNpc(name = "Town Resident") {
  // Create a realistic path around town
  const townPath = [
    { x: -5, y: 2.72, z: -2 },
    { x: -3, y: 2.72, z: -10 },
    { x: 3, y: 2.72, z: -10 },
    { x: 5, y: 2.72, z: -2 },
    { x: 5, y: 2.72, z: 5 },
    { x: 0, y: 2.72, z: 8 },
    { x: -5, y: 2.72, z: 5 }
  ];
  
  // Randomize the starting position along the path
  const randomStart = Math.floor(Math.random() * townPath.length);
  const position = {
    x: townPath[randomStart].x,
    y: townPath[randomStart].y,
    z: townPath[randomStart].z
  };
  
  // Create the path configuration
  const path = {
    points: townPath,
    currentTarget: (randomStart + 1) % townPath.length,
    pauseTime: 2000,
    isPaused: false,
    pauseTimer: 0,
    lastPauseTime: 0
  };
  
  // Create the NPC with slightly randomized walk speed
  const walkSpeed = 1.2 + (Math.random() * 0.6); // 1.2 to 1.8
  
  return createNpc({
    name: name,
    position: position,
    originalSpawnPosition: {...position}, // Explicitly store original spawn position
    walkSpeed: walkSpeed,
    path: path
  });
}

// Setup NPC update interval
const NPC_UPDATE_INTERVAL = 16; // ms (approximately 60 fps)
setInterval(() => {
  // Update all NPCs
  npcs.forEach((npc, npcId) => {
    // If NPC is following a target, update movement to follow the player
    if (npc.isFollowingTarget && npc.targetPlayer && players.has(npc.targetPlayer)) {
      updateNpcFollowBehavior(npcId);
    } 
    // If NPC is returning to spawn
    else if (npc.isReturningToSpawn) {
      updateNpcReturnBehavior(npcId);
    }
    // Normal path following
    else {
      updateNpcWalkingBehavior(npcId);
    }
    
    broadcastNpcState(npcId);
  });
}, NPC_UPDATE_INTERVAL);

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} The angle in radians
 */
function degToRad(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Update the behavior for an NPC that is following and attacking a player
 * @param {string} npcId - The ID of the NPC to update
 */
function updateNpcFollowBehavior(npcId) {
  const npc = npcs.get(npcId);
  if (!npc || !npc.targetPlayer || !players.has(npc.targetPlayer)) return;
  
  const currentTime = Date.now();
  const deltaTime = (currentTime - npc.lastUpdateTime) / 1000;
  npc.lastUpdateTime = currentTime;
  
  // Get target player
  const targetPlayer = players.get(npc.targetPlayer);
  
  // Calculate direction and distance to player
  const directionX = targetPlayer.position.x - npc.position.x;
  const directionZ = targetPlayer.position.z - npc.position.z;
  const distanceSquared = directionX * directionX + directionZ * directionZ;
  
  // Only move if we're not too close to the player (keep some distance for shooting)
  const optimalDistance = 8; // Keep 8 units away for shooting
  
  if (distanceSquared > optimalDistance * optimalDistance) {
    // We're too far, move closer
    // Normalize direction
    const distance = Math.sqrt(distanceSquared);
    const normalizedDirX = directionX / distance;
    const normalizedDirZ = directionZ / distance;
    
    // Move towards the player at increased speed
    const moveSpeed = (npc.walkSpeed * 3.5) * deltaTime;
    
    // Calculate new position
    npc.position.x += normalizedDirX * moveSpeed;
    npc.position.z += normalizedDirZ * moveSpeed;
    
    // Set walking animation
    if (!npc.isWalking) {
      npc.isWalking = true;
      npc.isIdle = false;
    }
  } else if (distanceSquared < (optimalDistance * 0.7) * (optimalDistance * 0.7)) {
    // We're too close, back up a bit
    // Normalize direction (away from player)
    const distance = Math.sqrt(distanceSquared);
    const normalizedDirX = -directionX / distance;
    const normalizedDirZ = -directionZ / distance;
    
    // Back away from the player at increased speed
    const moveSpeed = (npc.walkSpeed * 1.2) * deltaTime;
    
    // Calculate new position
    npc.position.x += normalizedDirX * moveSpeed;
    npc.position.z += normalizedDirZ * moveSpeed;
    
    // Set walking animation
    if (!npc.isWalking) {
      npc.isWalking = true;
      npc.isIdle = false;
    }
  } else {
    // We're at a good distance, just stop moving
    npc.isWalking = false;
    npc.isIdle = true;
  }
  
  // Always face the player
  npc.rotation.y = Math.atan2(directionX, directionZ) + Math.PI;
}

/**
 * Update the behavior for an NPC that is returning to its spawn position
 * @param {string} npcId - The ID of the NPC to update
 */
function updateNpcReturnBehavior(npcId) {
  const npc = npcs.get(npcId);
  if (!npc) return;
  
  const currentTime = Date.now();
  const deltaTime = (currentTime - npc.lastUpdateTime) / 1000;
  npc.lastUpdateTime = currentTime;
  
  // Get spawn position (either stored value or first point in path)
  const spawnPosition = npc.originalSpawnPosition || 
    (npc.path && npc.path.points && npc.path.points.length > 0 ? npc.path.points[0] : npc.position);
  
  // Calculate direction and distance to spawn
  const directionX = spawnPosition.x - npc.position.x;
  const directionZ = spawnPosition.z - npc.position.z;
  const distanceSquared = directionX * directionX + directionZ * directionZ;
  
  // Check if we've reached the spawn point (within 0.5 units)
  if (distanceSquared < 0.5) {
    // We've reached the spawn, resume normal path behavior
    npc.isReturningToSpawn = false;
    npc.isWalking = false;
    npc.isIdle = true;
    
    // Reset to the first point in the path
    if (npc.path && npc.path.points && npc.path.points.length > 0) {
      npc.path.currentTarget = 0;
      npc.path.isPaused = true;
      npc.path.pauseTimer = 0;
    }
    
    // Restore original rotation if available
    if (npc.originalRotation) {
      npc.rotation = {...npc.originalRotation};
      console.log(`NPC ${npcId} restored original rotation: y=${npc.rotation.y}`);
      npc.originalRotation = null;
    }
    
    console.log(`NPC ${npcId} (${npc.username}) reached spawn position`);
  } else {
    // Still need to move towards spawn
    // Normalize direction
    const distance = Math.sqrt(distanceSquared);
    const normalizedDirX = directionX / distance;
    const normalizedDirZ = directionZ / distance;
    
    // Move towards the spawn at increased speed
    const moveSpeed = (npc.walkSpeed * 1.5) * deltaTime;
    
    // Calculate new position
    npc.position.x += normalizedDirX * moveSpeed;
    npc.position.z += normalizedDirZ * moveSpeed;
    
    // Calculate rotation to face direction of movement
    npc.rotation.y = Math.atan2(normalizedDirX, normalizedDirZ) + Math.PI;
    
    // Set walking animation
    if (!npc.isWalking) {
      npc.isWalking = true;
      npc.isIdle = false;
    }
  }
}

/**
 * Handle NPC fighting back when attacked
 * @param {string} npcId - The ID of the NPC that was attacked
 * @param {string} attackerId - The ID of the player who attacked the NPC
 */
function handleNpcAttacked(npcId, attackerId) {
  const npc = npcs.get(npcId);
  const attacker = players.get(attackerId);
  
  if (!npc || !attacker) return;
  
  // Check if NPC is already targeting a different player
  if (npc.targetPlayer && npc.targetPlayer !== attackerId) {
    console.log(`NPC ${npcId} (${npc.username}) switching target from ${npc.targetPlayer} to ${attackerId}`);
    npc.targetPlayer = attackerId;
  }
  // Start fighting the attacker if not already fighting
  else if (!npc.targetPlayer) {
    console.log(`NPC ${npcId} (${npc.username}) is now fighting player ${attackerId}`);
    
    // Set the attacker as target
    npc.targetPlayer = attackerId;
    npc.lastShotTime = 0;
    
    // Start aiming at player
    npc.isAiming = true;
    
    // Store original path and rotation to restore when combat ends
    npc.originalPath = JSON.parse(JSON.stringify(npc.path));
    npc.originalRotation = {...npc.rotation}; // Store original rotation
    
    // Set NPC to follow mode instead of path following
    npc.isFollowingTarget = true;
    npc.isWalking = true;
    npc.isIdle = false;
    
    // Broadcast NPC state update to show it's now aiming
    broadcastNpcState(npcId);
    
    // Start shooting interval (store it in the NPC object)
    npc.shootIntervalId = setInterval(() => {
      // Check if NPC still exists and is targeting someone
      if (!npcs.has(npcId) || !npc.targetPlayer) {
        if (npc.shootIntervalId) {
          clearInterval(npc.shootIntervalId);
          npc.shootIntervalId = null;
        }
        return;
      }
      
      // Check if target player still exists
      if (!players.has(npc.targetPlayer)) {
        // Target player left, stop fighting
        npc.targetPlayer = null;
        npc.isAiming = false;
        npc.isShooting = false;
        npc.isFollowingTarget = false;
        
        // Restore original path
        if (npc.originalPath) {
          npc.path = npc.originalPath;
          npc.originalPath = null;
        }
        
        // Make NPC return to spawn position with original rotation
        makeNpcReturnToSpawn(npcId);
        
        if (npc.shootIntervalId) {
          clearInterval(npc.shootIntervalId);
          npc.shootIntervalId = null;
        }
        return;
      }
      
      // Shoot at player once per second
      const now = Date.now();
      if (now - npc.lastShotTime >= 1000) {
        npcShootAtPlayer(npcId, npc.targetPlayer);
        npc.lastShotTime = now;
      }
    }, 100); // Check interval faster than shooting rate for responsiveness
  }
}

/**
 * Make an NPC shoot at a player
 * @param {string} npcId - The ID of the NPC
 * @param {string} targetPlayerId - The ID of the target player
 */
function npcShootAtPlayer(npcId, targetPlayerId) {
  const npc = npcs.get(npcId);
  const targetPlayer = players.get(targetPlayerId);
  
  if (!npc || !targetPlayer) return;
  
  // Calculate direction from NPC to player
  const dirX = targetPlayer.position.x - npc.position.x;
  const dirY = targetPlayer.position.y - npc.position.y + 0.5; // Aim for upper body
  const dirZ = targetPlayer.position.z - npc.position.z;
  
  // Normalize direction
  const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
  const normalizedDir = {
    x: dirX / length,
    y: dirY / length,
    z: dirZ / length
  };
  
  // Update NPC rotation to face the player
  npc.rotation.y = Math.atan2(normalizedDir.x, normalizedDir.z) + Math.PI;
  
  // Set NPC as shooting for animation
  npc.isShooting = true;
  broadcastNpcState(npcId);
  
  // Create bullet data for visual effects
  const bulletPosition = {
    x: npc.position.x,
    y: npc.position.y - 1, // Lower gun height
    z: npc.position.z
  };
  
  // Create a server-side bullet
  const bulletId = nextBulletId++;
  const now = Date.now();
  
  const bullet = {
    id: bulletId,
    sourcePlayerId: npcId,  // Use NPC ID as source
    position: bulletPosition,
    direction: normalizedDir,
    distanceTraveled: 0,
    maxDistance: GAME_CONSTANTS.MAX_BULLET_DISTANCE,
    speed: GAME_CONSTANTS.BULLET_SPEED,
    timeCreated: now,
    active: true
  };
  
  // Add to active bullets
  activeBullets.set(bulletId, bullet);
  
  // Broadcast gunshot to all clients for visual and audio effects
  broadcastToAll({
    type: 'playerShoot', // Match the player shoot event type exactly
    id: npcId,
    bulletId: bulletId,
    bulletData: {
      position: bulletPosition,
      direction: normalizedDir
    },
    isNpc: true
  });
  
  // Wait for animation to play, then reset
  setTimeout(() => {
    if (npcs.has(npcId)) {
      npc.isShooting = false;
      broadcastNpcState(npcId);
    }
  }, 300);
  
  // Determine if hit (50% chance for body shot)
  const hitChance = 0.5;
  const hit = Math.random() < hitChance;
  
  if (hit) {
    // Create hit data
    const hitData = {
      hitZone: 'body',
      position: { 
        x: targetPlayer.position.x,
        y: targetPlayer.position.y,
        z: targetPlayer.position.z
      }
    };
    
    // Apply damage to player (40 damage for body shot)
    targetPlayer.health = Math.max(0, targetPlayer.health - 40);
    
    // Notify player of hit
    if (targetPlayer.ws && targetPlayer.ws.readyState === WebSocket.OPEN) {
      targetPlayer.ws.send(JSON.stringify({
        type: 'hit',
        sourceId: npcId,
        hitData: {
          position: hitData.position,
          hitZone: 'body',
          damage: 40 // Explicitly include damage value
        },
        hitZone: 'body',
        health: targetPlayer.health,
        isNpc: true,
        damage: 40 // Include damage at top level for backwards compatibility
      }));
    }
    
    // Broadcast hit to all players for visual effects
    broadcastToAll({
      type: 'playerHit',
      targetId: targetPlayerId,
      sourceId: npcId,
      hitPosition: hitData.position,
      health: targetPlayer.health,
      hitZone: 'body',
      damage: 40,
      isNpc: true
    });
    
    // Check if player died
    if (targetPlayer.health <= 0) {
      handlePlayerDeath(targetPlayerId, npcId);
      
      // NPC no longer has a target
      npc.targetPlayer = null;
      npc.isAiming = false;
      
      // Set NPC to return to original spawn position
      makeNpcReturnToSpawn(npcId);
    }
  }
}

/**
 * Make an NPC return to its original spawn position
 * @param {string} npcId - The ID of the NPC
 */
function makeNpcReturnToSpawn(npcId) {
  const npc = npcs.get(npcId);
  if (!npc) return;
  
  console.log(`NPC ${npcId} (${npc.username}) returning to spawn position`);
  
  // Clear any existing combat state
  npc.targetPlayer = null;
  npc.isAiming = false;
  npc.isShooting = false;
  
  // Set flag for returning mode
  npc.isReturningToSpawn = true;
  npc.isFollowingTarget = false;
  npc.isWalking = true;
  npc.isIdle = false;
  
  // Restore original path for when we get back to spawn
  if (npc.originalPath) {
    npc.path = JSON.parse(JSON.stringify(npc.originalPath));
    npc.originalPath = null;
  }
  
  // Broadcast state update
  broadcastNpcState(npcId);
}

/**
 * Handle NPC death
 * @param {string} npcId - The ID of the NPC that died
 * @param {string} killedById - The ID of the player who killed the NPC
 */
function handleNpcDeath(npcId, killedById) {
  const npc = npcs.get(npcId);
  if (!npc) return;
  
  console.log(`NPC ${npcId} (${npc.username}) was killed by player ${killedById}`);
  
  // Clean up any shooting interval
  if (npc.shootIntervalId) {
    clearInterval(npc.shootIntervalId);
    npc.shootIntervalId = null;
  }
  
  // Ensure we have the original spawn position
  // First check explicitly stored original position
  let spawnPosition;
  
  if (npc.originalSpawnPosition) {
    spawnPosition = {...npc.originalSpawnPosition};
    console.log(`Using stored originalSpawnPosition: (${spawnPosition.x}, ${spawnPosition.y}, ${spawnPosition.z})`);
  } 
  // If not available, check the first point in the original path
  else if (npc.originalPath && npc.originalPath.points && npc.originalPath.points.length > 0) {
    spawnPosition = {...npc.originalPath.points[0]};
    console.log(`Using first point from originalPath: (${spawnPosition.x}, ${spawnPosition.y}, ${spawnPosition.z})`);
  } 
  // As a last resort, use the first point in the current path
  else if (npc.path && npc.path.points && npc.path.points.length > 0) {
    spawnPosition = {...npc.path.points[0]};
    console.log(`Using first point from current path: (${spawnPosition.x}, ${spawnPosition.y}, ${spawnPosition.z})`);
  } 
  // If all else fails, use current position (shouldn't happen)
  else {
    spawnPosition = {...npc.position};
    console.log(`FALLBACK: Using current position: (${spawnPosition.x}, ${spawnPosition.y}, ${spawnPosition.z})`);
  }
  
  // Get original rotation
  let originalRotation;
  
  if (npc.originalRotation) {
    originalRotation = {...npc.originalRotation};
    console.log(`Using stored originalRotation: y=${originalRotation.y}`);
  } else {
    originalRotation = {...npc.rotation};
    console.log(`Using current rotation: y=${originalRotation.y}`);
  }
  
  // Store NPC data for respawning
  const npcData = {
    name: npc.username,
    // Explicitly set both position and originalSpawnPosition
    position: spawnPosition,
    originalSpawnPosition: spawnPosition,
    rotation: originalRotation,
    originalRotation: originalRotation,
    walkSpeed: npc.walkSpeed,
    // If we have an original path, use that instead of the current path
    path: npc.originalPath ? JSON.parse(JSON.stringify(npc.originalPath)) : JSON.parse(JSON.stringify(npc.path))
  };
  
  console.log(`NPC will respawn at position: (${spawnPosition.x}, ${spawnPosition.y}, ${spawnPosition.z}) with rotation y=${originalRotation.y}`);
  
  // Send death notification to all clients
  broadcastToAll({
    type: 'playerDeath',
    id: npcId,
    killedById: killedById,
    isNpc: true
  });
  
  // Send kill notification to the killer
  const killer = players.get(killedById);
  if (killer && killer.ws && killer.ws.readyState === WebSocket.OPEN) {
    killer.ws.send(JSON.stringify({
      type: 'kill',
      targetId: npcId,
      isNpc: true
    }));
  }
  
  // Remove the NPC temporarily
  removeNpc(npcId);
  
  // Respawn the NPC after a delay
  setTimeout(() => {
    const newNpcId = createNpc(npcData);
    console.log(`NPC ${npcId} respawned as ${newNpcId} at position (${npcData.position.x}, ${npcData.position.y}, ${npcData.position.z}) with rotation y=${npcData.rotation.y}`);
  }, 5000); // 5 second respawn delay
}

// Spawn initial NPCs when server starts
setTimeout(() => {
  try {
    // Create the sheriff with static position (standing still)
    const sheriffPosition = { x: 14, y: 2.73, z: 20 }; // Position sheriff somewhere in town
    createNpc({
      name: "Sheriff",
      position: sheriffPosition,
      originalSpawnPosition: {...sheriffPosition},
      rotation: { y: degToRad(90) }, // Facing east (90 degrees)
      path: {
        points: [sheriffPosition], // Single point path = standing still
        currentTarget: 0,
        pauseTime: 1000000, // Very long pause time to keep idle
        isPaused: true, // Start in paused mode
        pauseTimer: 0,
        lastPauseTime: 0
      }
    });
    
    // Create the bartender with static position (standing still)
    const bartenderPosition = { x: -33, y: 2.92, z: 15 }; // Position bartender in middle of town
    createNpc({
      name: "Bartender",
      position: bartenderPosition,
      originalSpawnPosition: {...bartenderPosition},
      rotation: { y: degToRad(270) }, // Facing south (180 degrees)
      path: {
        points: [bartenderPosition], // Single point path = standing still
        currentTarget: 0,
        pauseTime: 1000000, // Very long pause time to keep idle
        isPaused: true, // Start in paused mode
        pauseTimer: 0,
        lastPauseTime: 0
      }
    });
    
    // Create "notabot" NPC with path along the length of the town (rotated 90°)
    const fixedX = -15; // Center X position in town
    const startZ = -40; // North end of town
    const endZ = 40; // South end of town
    const notabotY = 2.72; // Standard ground level
    const notabotStartPosition = { x: fixedX, y: notabotY, z: startZ };

    createNpc({
      name: "notabot",
      position: notabotStartPosition,
      originalSpawnPosition: {...notabotStartPosition},
      rotation: { y: degToRad(0) }, // Initially facing south (along Z axis)
      walkSpeed: 1.4, // Moderate walking speed
      path: {
        points: [
          { x: fixedX, y: notabotY, z: startZ },
          { x: fixedX, y: notabotY, z: endZ },
          { x: fixedX, y: notabotY, z: startZ } // Loop back to start
        ],
        currentTarget: 1, // Start by walking south
        pauseTime: 500, // Very short pause at endpoints
        isPaused: false,
        pauseTimer: 0,
        lastPauseTime: 0
      }
    });
    
    // Cowboy has been removed per request
    
    console.log("Initial NPCs spawned");
  } catch (error) {
    console.error("Failed to spawn initial NPCs:", error);
  }
}, 5000); // Wait for server to fully initialize

// =============================================
// Train System - Server Side Implementation
// =============================================

// Train variables
const TRAIN_SPEED = 0.0003; // Same speed as client to maintain consistency
const TRAIN_TRACK_START = { x: 0, y: 0, z: -1000 };
const TRAIN_TRACK_END = { x: 0, y: 0, z: 1000 };
const TRAIN_TRACK_LENGTH = 2000; // Total length between start and end
const TRAIN_CYCLE_TIME = Math.floor(TRAIN_TRACK_LENGTH / (TRAIN_SPEED * 60)); // Time in ms for a full one-way trip

// Time-based tracking
const TRAIN_START_TIME = Date.now(); // Global reference time when train started
let trainDirection = 1; // Current direction (1 = forward, -1 = backward)

// Send train updates every 2 seconds
const TRAIN_BROADCAST_INTERVAL = 2000;
setInterval(() => {
  broadcastTrainState();
}, TRAIN_BROADCAST_INTERVAL);

/**
 * Get current train direction based on elapsed time
 * @returns {number} 1 for forward, -1 for backward
 */
function getCurrentTrainDirection() {
  const elapsedTime = Date.now() - TRAIN_START_TIME;
  const cycleCount = Math.floor(elapsedTime / TRAIN_CYCLE_TIME);
  // Direction changes every cycle
  return cycleCount % 2 === 0 ? 1 : -1;
}

/**
 * Calculate train progress (0-1) based on elapsed time
 * @returns {number} Progress value between 0-1
 */
function calculateTrainProgress() {
  const elapsedTime = Date.now() - TRAIN_START_TIME;
  const cycleCount = Math.floor(elapsedTime / TRAIN_CYCLE_TIME);
  const timeInCurrentCycle = elapsedTime % TRAIN_CYCLE_TIME;
  
  // Calculate progress within current cycle (0-1)
  const cycleProgress = timeInCurrentCycle / TRAIN_CYCLE_TIME;
  
  // If even cycle, progress from 0 to 1 (forward)
  // If odd cycle, progress from 1 to 0 (backward)
  return cycleCount % 2 === 0 ? cycleProgress : 1 - cycleProgress;
}

/**
 * Broadcasts the current train state to all connected clients
 */
function broadcastTrainState() {
  // Only broadcast if there are connected players
  if (players.size === 0) return;
  
  // Get current values
  const progress = calculateTrainProgress();
  const direction = getCurrentTrainDirection();
  
  const trainState = {
    type: 'trainState',
    startTime: TRAIN_START_TIME,
    cycleTime: TRAIN_CYCLE_TIME,
    speed: TRAIN_SPEED,
    trackLength: TRAIN_TRACK_LENGTH,
    timestamp: Date.now(),
    // Include current values for debugging
    progress,
    direction
  };
  
  console.log(`Broadcasting train state: startTime=${TRAIN_START_TIME}, progress=${progress.toFixed(4)}, direction=${direction}`);
  broadcastToAll(trainState);
}

/**
 * Sends initial train state when a player connects
 * @param {WebSocket} ws - Player's WebSocket connection
 */
function sendInitialTrainState(ws) {
  if (ws.readyState === WebSocket.OPEN) {
    // Get current values
    const progress = calculateTrainProgress();
    const direction = getCurrentTrainDirection();
    
    const trainStateMsg = {
      type: 'trainInit',
      startTime: TRAIN_START_TIME,
      cycleTime: TRAIN_CYCLE_TIME,
      speed: TRAIN_SPEED,
      trackLength: TRAIN_TRACK_LENGTH,
      trackStart: TRAIN_TRACK_START,
      trackEnd: TRAIN_TRACK_END,
      timestamp: Date.now(),
      // Include current values for debugging
      progress,
      direction
    };
    
    console.log(`Sending initial train state: startTime=${TRAIN_START_TIME}, progress=${progress.toFixed(4)}, direction=${direction}`);
    ws.send(JSON.stringify(trainStateMsg));
  }
}