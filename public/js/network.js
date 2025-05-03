/**
 * NetworkManager class for WebSocket communication.
 * It provides event callbacks for multiplayer events and methods to send data.
 */
export class NetworkManager {
  constructor() {
    this.socket = null;
    this.playerId = null;
    this.otherPlayers = new Map(); // Maps playerId -> playerData from the server

    // Callbacks
    this.onInit = null;              // Called when we first receive 'init' from server
    this.onPlayerJoined = null;
    this.onPlayerLeft = null;
    this.onPlayerUpdate = null;
    this.onPlayerShoot = null;
    this.onPlayerCount = null;
    this.onPlayerHit = null;         // When this player is hit by someone
    this.onPlayerHitBroadcast = null;// When any player is hit
    this.onOpen = null;
    this.onClose = null;
    this.onError = null;
    this.onChatMessage = null;       // When a chat message is received

    // Train system callbacks
    this.onTrainInit = null;         // When initial train state is received
    this.onTrainState = null;        // When train state updates are received

    // Anti-cheat callbacks
    this.onPositionCorrection = null;// When server corrects client position
    this.onBulletImpact = null;      // When a bullet hits something
    this.onRespawn = null;           // When player respawns

    // Automatic reconnect attempts
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    this.reconnectTimer = null;

    // Unique sessionId to prevent multiple tabs from colliding
    this.sessionId = this._generateSessionId();
    
    // Anti-cheat: Sequence number for message ordering
    this.sequenceNumber = 0;
    
    // Anti-cheat: Map to track outgoing messages that need nonces
    this.pendingMessages = new Map();
  }

  /**
   * Generates a unique-ish session ID to detect duplicate connections from the same tab.
   */
  _generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
  
  /**
   * Generates a unique nonce for secure actions.
   * @returns {string} A unique nonce
   */
  _generateNonce() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2) + 
           Math.random().toString(36).substring(2);
  }

  /**
   * Initiates a connection to the WebSocket server.
   */
  connect() {
    this._cleanupSocket();

    // Get persistent player identity information
    const playerIdentity = window.playerIdentity || {};
    
    // Create query parameters for the WebSocket connection
    const params = new URLSearchParams({
      sessionId: this.sessionId,
      clientId: playerIdentity.id || '',
      username: playerIdentity.username || '',
      token: playerIdentity.token || '' // Add token for auth
    });

    // Determine correct ws:// or wss:// based on current protocol
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const wsUrl = `${protocol}${window.location.host}?${params.toString()}`;

    console.log('Attempting to connect to:', wsUrl);
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = (event) => {
      console.log('WebSocket connected');
      this.connectionAttempts = 0;
      if (typeof this.onOpen === 'function') {
        this.onOpen(event);
      }
    };

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        // Handle auth failures specifically
        if (message.type === 'authFailure') {
          console.error('Authentication failed:', message.reason);
          // If the server rejected our token, clear it and reload
          if (message.reason === 'invalidToken') {
            try {
              localStorage.removeItem('wildWestPlayerIdentity');
              sessionStorage.removeItem('wildWestPlayerSession');
              alert('Your session has expired. The game will reload.');
              window.location.reload();
            } catch (e) {
              console.error('Failed to clear invalid token:', e);
            }
          }
          return;
        }
        
        this.handleMessage(message);
      } catch (err) {
        console.error('Error parsing server message:', err);
      }
    };

    this.socket.onclose = (event) => {
      console.log(`WebSocket closed: ${event.code} ${event.reason}`);
      if (typeof this.onClose === 'function') {
        this.onClose(event);
      }
      this._scheduleReconnect();
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (typeof this.onError === 'function') {
        this.onError(error);
      }
    };
  }

  /**
   * Clean up any existing WebSocket connection.
   */
  _cleanupSocket() {
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      if (
        this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING
      ) {
        this.socket.close();
      }
      this.socket = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Schedules a reconnect attempt if under max attempts.
   */
  _scheduleReconnect() {
    if (this.connectionAttempts < this.maxConnectionAttempts) {
      this.connectionAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000);
      console.log(`Reconnecting in ${(delay / 1000).toFixed(1)}s... (Attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})`);
      
      this.reconnectTimer = setTimeout(() => {
        console.log(`Reconnecting now (Attempt ${this.connectionAttempts})...`);
        this.connect();
      }, delay);
    } else {
      console.error('Max reconnect attempts reached. Please refresh the page.');
    }
  }

  /**
   * Handles all messages from the server.
   * @param {Object} message The parsed JSON message object.
   */
  handleMessage(message) {
    switch (message.type) {
      // New connection initialization
      case 'init':
        this.playerId = message.id;
        console.log(`Assigned player ID: ${this.playerId}`);

        // If there's a callback
        if (typeof this.onInit === 'function') {
          this.onInit(message);
        }

        // Add known players - exclude any with our own ID
        message.players.forEach(player => {
          // Skip if this is somehow our own ID
          if (player.id === this.playerId) {
            console.log(`Skipping duplicate player with our ID: ${player.id}`);
            return;
          }
          
          if (this.onPlayerJoined) {
            this.onPlayerJoined(player);
          }
          this.otherPlayers.set(player.id, player);
        });
        break;

      // Another player joined
      case 'playerJoined':
        console.log(`Player ${message.id} joined`);
        
        // Skip if this is our own ID
        if (message.id === this.playerId) {
          console.log(`Skipping player join for own player ID: ${message.id}`);
          break;
        }
        
        if (this.onPlayerJoined) {
          this.onPlayerJoined(message);
        }
        this.otherPlayers.set(message.id, {
          id: message.id,
          position: message.position,
          rotation: message.rotation,
          isAiming: false,
          isShooting: false,
          isReloading: false,
          username: message.username || `Player_${message.id}`,
          skins: message.skins || { bananaSkin: false } // Include skin information
        });
        break;

      // Player left
      case 'playerLeft':
        console.log(`Player ${message.id} left`);
        if (this.onPlayerLeft) {
          this.onPlayerLeft(message.id);
        }
        this.otherPlayers.delete(message.id);
        break;

      // General player update (pos/rot/aiming/etc.)
      case 'playerUpdate':
        {
          // Skip if this is our own ID
          if (message.id === this.playerId) {
            console.log(`Skipping update for own player ID: ${message.id}`);
            break;
          }

          const existing = this.otherPlayers.get(message.id);
          if (existing) {
            existing.position = message.position || existing.position;
            existing.rotation = message.rotation || existing.rotation;
            existing.isAiming =
              message.isAiming !== undefined ? message.isAiming : existing.isAiming;
            existing.isShooting =
              message.isShooting !== undefined ? message.isShooting : existing.isShooting;
            existing.isReloading =
              message.isReloading !== undefined ? message.isReloading : existing.isReloading;
            existing.health =
              message.health !== undefined ? message.health : existing.health;
            existing.isDying =
              message.isDying !== undefined ? message.isDying : existing.isDying;
            existing.isWalking =
              message.isWalking !== undefined ? message.isWalking : existing.isWalking;
            
            // Always maintain skin state for syncing to new clients
            if (message.skins) {
              existing.skins = message.skins;
            }
          } else {
            // If this is a new player we hadn't seen before - skip if it's our own ID
            if (message.id !== this.playerId) {
              this.otherPlayers.set(message.id, {
                id: message.id,
                position: message.position || { x: 0, y: 0, z: 0 },
                rotation: message.rotation || { y: 0 },
                isAiming: message.isAiming || false,
                isShooting: message.isShooting || false,
                isReloading: message.isReloading || false, 
                health: message.health || 100,
                isDying: message.isDying || false,
                isWalking: message.isWalking || false,
                username: message.username || `Player_${message.id}`,
                skins: message.skins || { bananaSkin: false } // Include skin information
              });
              
              // Notify about this newly discovered player
              if (this.onPlayerJoined) {
                this.onPlayerJoined(this.otherPlayers.get(message.id));
              }
            }
          }
          
          // Call onPlayerUpdate with the updated or new player data
          if (this.onPlayerUpdate && message.id !== this.playerId) {
            this.onPlayerUpdate(message.id, existing || this.otherPlayers.get(message.id));
          }
        }
        break;

      // Remote player fired
      case 'playerShoot':
        if (this.onPlayerShoot) {
          this.onPlayerShoot(message.id, message.bulletData, message.bulletId);
        }
        break;

      // Current total player count
      case 'playerCount':
        if (this.onPlayerCount) {
          this.onPlayerCount(message.count);
        }
        break;

      // This client was hit by another player
      case 'hit':
        console.log(`I was hit by player ${message.sourceId} in the ${message.hitZone || 'body'} for ${message.hitData?.damage || 20} damage`);
        
        // Add damage to hitData if it's missing
        let damage = 40; // Default body shot damage
        if (message.hitZone === 'head') {
          damage = 100;
        } else if (message.hitZone === 'limbs') {
          damage = 20;
        }
        
        // If hitData is missing, create it
        if (!message.hitData) {
          message.hitData = {
            damage: damage,
            hitZone: message.hitZone || 'body'
          };
        }
        
        // Ensure damage property exists in hitData
        if (message.hitData && !message.hitData.damage) {
          message.hitData.damage = damage;
        }
        
        if (this.onPlayerHit) {
          this.onPlayerHit(message.sourceId, message.hitData, message.health, message.hitZone);
        }
        break;

      // Player hit - broadcast to all players
      case 'playerHitBroadcast':
        if (this.onPlayerHitBroadcast) {
          this.onPlayerHitBroadcast(message.hitData);
        }
        break;
        
      // Anti-cheat: Server correction of client position
      case 'positionCorrection':
        console.log(`Received position correction:`, message.position);
        if (this.onPositionCorrection) {
          this.onPositionCorrection(message.position);
        }
        break;
        
      // Anti-cheat: Bullet impact notification
      case 'bulletImpact':
        if (this.onBulletImpact) {
          this.onBulletImpact(
            message.bulletId, 
            message.hitType, 
            message.targetId, 
            message.position,
            message.hitZone
          );
        }
        break;
        
      // Anti-cheat: Player respawn notification
      case 'respawn':
        console.log(`Respawning at:`, message.position);
        if (this.onRespawn) {
          this.onRespawn(
            message.position, 
            message.health, 
            message.bullets, 
            message.maxBullets, 
            message.activeWeapon
          );
        }
        break;

      // Player death notification - when this player is killed
      case 'death':
        console.log(`You were killed by player ${message.killerId}`);
        if (this.onDeath) {
          this.onDeath(message.killerId);
        }
        break;
        
      // Kill notification - when this player kills another player
      case 'kill':
        console.log(`You killed player ${message.targetId}`);
        if (this.onKill) {
          this.onKill(message.targetId);
        }
        break;
        
      // Player death notification - for other players in the game
      case 'playerDeath':
        console.log(`Player ${message.id} was killed by player ${message.killedById}`);
        if (this.onPlayerDeath) {
          this.onPlayerDeath(message.id, message.killedById);
        }
        break;

      // Generic error from server
      case 'error':
        console.error('Server error:', message.message);
        if (message.fatal) {
          this.connectionAttempts = this.maxConnectionAttempts; // block further reconnect
          alert(`Fatal error: ${message.message}`);
        }
        break;

      // Chat message received
      case 'chatMessage':
        if (this.onChatMessage) {
          this.onChatMessage(message.senderId, message.username, message.message);
        }
        break;

      // Player skin update
      case 'playerSkinUpdate':
        // Update the stored player data for skins
        const playerToUpdate = this.otherPlayers.get(message.playerId);
        if (playerToUpdate) {
          playerToUpdate.skins = message.skins;
        }
        
        // Call the skin update handler in main.js
        if (this.onPlayerSkinUpdate) {
          this.onPlayerSkinUpdate(message);
        }
        break;

      // Train system: Initial train state
      case 'trainInit':
        if (this.onTrainInit) {
          this.onTrainInit(message);
        }
        break;

      // Train system: Ongoing train state updates
      case 'trainState':
        if (this.onTrainState) {
          this.onTrainState(message);
        }
        break;

      default:
        console.warn('Unhandled message:', message);
        break;
    }
  }

  /**
   * Sends local player position/rotation etc. to the server.
   * @param {Object} playerData - { position, rotation, isAiming, isReloading, isSprinting, isShooting }
   */
  sendUpdate(playerData) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      // Anti-cheat: Add sequence number for message ordering
      this.sequenceNumber++;
      
      this.socket.send(
        JSON.stringify({
          type: 'update',
          sequenceNumber: this.sequenceNumber,
          ...playerData
        })
      );
    }
  }

  /**
   * Notifies server that we fired a bullet.
   * @param {Object} bulletData - { position: {x,y,z}, direction: {x,y,z} }
   */
  sendShoot(bulletData) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      // Anti-cheat: Add sequence number and nonce for replay protection
      this.sequenceNumber++;
      const nonce = this._generateNonce();
      
      this.socket.send(
        JSON.stringify({
          type: 'shoot',
          sequenceNumber: this.sequenceNumber,
          nonce: nonce,
          bulletData
        })
      );
    }
  }

  /**
   * Notifies server that we hit another player.
   * @param {number|string} hitPlayerId
   * @param {Object} hitData - { position: {x,y,z}, sourcePlayerId: ..., hitZone: 'head'|'body'|'limbs', damage: number }
   * @param {number|string} bulletId - Optional bulletId if known
   */
  sendPlayerHit(hitPlayerId, hitData, bulletId = null) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      // Anti-cheat: Add sequence number and nonce for replay protection
      this.sequenceNumber++;
      const nonce = this._generateNonce();
      
      this.socket.send(
        JSON.stringify({
          type: 'playerHit',
          sequenceNumber: this.sequenceNumber,
          nonce: nonce,
          targetId: hitPlayerId,
          bulletId: bulletId,
          hitData
        })
      );
    }
  }
  
  /**
   * Notifies server that player is starting to reload.
   */
  sendReload() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      // Anti-cheat: Add sequence number for message ordering
      this.sequenceNumber++;
      
      this.socket.send(
        JSON.stringify({
          type: 'reload',
          sequenceNumber: this.sequenceNumber
        })
      );
    }
  }

  /**
   * Closes the connection manually.
   */
  disconnect() {
    this._cleanupSocket();
  }
  
  /**
   * Send a chat message to all players
   * @param {string} message - The chat message to send
   */
  sendChatMessage(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'chat',
        message: message
      }));
    }
  }

  /**
   * Explicitly requests current train state from the server
   */
  requestTrainState() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log("Requesting train state from server");
      this.socket.send(JSON.stringify({
        type: 'requestTrainState'
      }));
    } else {
      console.warn("Cannot request train state, not connected to server");
    }
  }
}

// Export a singleton instance
export const networkManager = new NetworkManager();
// Make it globally accessible
window.networkManager = networkManager;

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  networkManager.disconnect();
});