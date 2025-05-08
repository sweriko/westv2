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

// Anti-cheat: Track active bullets map
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
  // Create initial player data with health
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
    username: player.username
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
  
  // Rest of original hit handling
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
  // This function is still used by client-controlled bots
  // Update the bot player with the provided data
  if (!data.id || !botPlayers.has(data.id)) {
    // If bot doesn't exist yet, create it
    const botId = data.id || `bot_${Date.now()}`;
    
    botPlayers.set(botId, {
      id: botId,
      position: data.position || { x: 0, y: 1.6, z: 0 },
      rotation: data.rotation || { y: 0 },
      isAiming: data.isAiming || false,
      isShooting: data.isShooting || false,
      isReloading: data.isReloading || false,
      health: data.health || 100,
      username: sanitizeText(data.username || 'Bot')
    });
    
    // Broadcast to all players that a new bot has joined
    broadcastToAll({
      type: 'playerJoined',
      id: botId,
      position: botPlayers.get(botId).position,
      rotation: botPlayers.get(botId).rotation,
      health: botPlayers.get(botId).health,
      username: botPlayers.get(botId).username,
      isBot: true
    });
    
    console.log(`Added bot player: ${botId} (${botPlayers.get(botId).username})`);
    return;
  }
  
  // Update existing bot
  const bot = botPlayers.get(data.id);
  
  // Update bot properties
  if (data.position) bot.position = data.position;
  if (data.rotation) bot.rotation = data.rotation;
  if (data.isAiming !== undefined) bot.isAiming = data.isAiming;
  if (data.isShooting !== undefined) bot.isShooting = data.isShooting;
  if (data.isReloading !== undefined) bot.isReloading = data.isReloading;
  if (data.health !== undefined) bot.health = data.health;
  
  // Broadcast updated bot state
  broadcastToAll({
    type: 'playerUpdate',
    id: data.id,
    position: bot.position,
    rotation: bot.rotation,
    isAiming: bot.isAiming,
    isShooting: bot.isShooting,
    isReloading: bot.isReloading,
    health: bot.health,
    username: bot.username,
    isBot: true
  });
}

// Handle bot player removal
function handleBotRemove(data) {
  if (!data.id || !botPlayers.has(data.id)) {
    console.log(`Cannot remove non-existent bot: ${data.id}`);
    return;
  }
  
  const botId = data.id;
  const bot = botPlayers.get(botId);
  
  // Remove the bot
  botPlayers.delete(botId);
  
  // Broadcast that the bot has left
  broadcastToAll({
    type: 'playerLeft',
    id: botId
  });
  
  console.log(`Removed bot player: ${botId} (${bot.username})`);
}

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} The angle in radians
 */
function degToRad(degrees) {
  return degrees * (Math.PI / 180);
}

// =============================================
// Train System - Server Side Implementation
// =============================================

// Train variables
const TRAIN_SPEED = 0.0003; // Same speed as client to maintain consistency
// Updated track endpoints for half-circle around town
const TRAIN_TRACK_START = { x: 0, y: 0.5, z: -200 }; // Estimated position from client-side calculation
const TRAIN_TRACK_END = { x: 0, y: 0.5, z: 200 }; // Estimated position from client-side calculation
const TRAIN_TRACK_LENGTH = 650; // Approximated arc length of half-circle (PI * radius)
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

// Anti-cheat: Bullet physics update
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