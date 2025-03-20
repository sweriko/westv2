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

    // Automatic reconnect attempts
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    this.reconnectTimer = null;

    // Unique sessionId to prevent multiple tabs from colliding
    this.sessionId = this._generateSessionId();
  }

  /**
   * Generates a unique-ish session ID to detect duplicate connections from the same tab.
   */
  _generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /**
   * Initiates a connection to the WebSocket server.
   */
  connect() {
    this._cleanupSocket();

    // Determine correct ws:// or wss:// based on current protocol
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const wsUrl = `${protocol}${window.location.host}?sessionId=${this.sessionId}`;

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

        // Add known players
        message.players.forEach(player => {
          if (this.onPlayerJoined) {
            this.onPlayerJoined(player);
          }
          this.otherPlayers.set(player.id, player);
        });
        break;

      // Another player joined
      case 'playerJoined':
        console.log(`Player ${message.id} joined`);
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
          quickDrawLobbyIndex: message.quickDrawLobbyIndex || -1
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
            existing.quickDrawLobbyIndex =
              message.quickDrawLobbyIndex !== undefined ? message.quickDrawLobbyIndex : existing.quickDrawLobbyIndex;
          }
          if (this.onPlayerUpdate) {
            this.onPlayerUpdate(message.id, existing);
          }
        }
        break;

      // Remote player fired
      case 'playerShoot':
        if (this.onPlayerShoot) {
          this.onPlayerShoot(message.id, message.bulletData);
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
        console.log(`I was hit by player ${message.sourceId}`);
        if (this.onPlayerHit) {
          this.onPlayerHit(message.sourceId, message.hitData);
        }
        break;

      // A broadcast that someone was hit
      case 'playerHit':
        console.log(`Player ${message.targetId} was hit by player ${message.sourceId}`);
        if (this.onPlayerHitBroadcast) {
          this.onPlayerHitBroadcast(
            message.targetId,
            message.sourceId,
            message.hitPosition
          );
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

      default:
        console.warn('Unhandled message:', message);
        break;
    }
  }

  /**
   * Sends local player position/rotation etc. to the server.
   * @param {Object} playerData - { position, rotation, isAiming, isReloading, quickDrawLobbyIndex }
   */
  sendUpdate(playerData) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: 'update',
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
      this.socket.send(
        JSON.stringify({
          type: 'shoot',
          bulletData
        })
      );
    }
  }

  /**
   * Notifies server that we hit another player.
   * @param {number|string} hitPlayerId
   * @param {Object} hitData - { position: {x,y,z}, sourcePlayerId: ... }
   */
  sendPlayerHit(hitPlayerId, hitData) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: 'playerHit',
          targetId: hitPlayerId,
          hitData
        })
      );
    }
  }
  
  /**
   * Sends a request to join a specific Quick Draw arena queue.
   * @param {number} arenaIndex - The arena index (0-4)
   */
  sendQuickDrawJoin(arenaIndex) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: 'quickDrawJoin',
          arenaIndex: arenaIndex
        })
      );
    }
  }
  
  /**
   * Sends a request to leave the Quick Draw queue.
   */
  sendQuickDrawLeave() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: 'quickDrawLeave'
        })
      );
    }
  }
  
  /**
   * Notifies the server that the player is ready for a Quick Draw duel.
   * @param {number} arenaIndex - The arena index for the duel
   */
  sendQuickDrawReady(arenaIndex) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: 'quickDrawReady',
          arenaIndex: arenaIndex
        })
      );
    }
  }
  
  /**
   * Notifies the server that the player has shot their opponent in a Quick Draw duel.
   * @param {number|string} opponentId - The opponent's player ID
   * @param {number} arenaIndex - The arena index for the duel
   */
  sendQuickDrawShoot(opponentId, arenaIndex) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log(`Sending Quick Draw hit notification to server: player ${this.playerId} hit player ${opponentId} in arena ${arenaIndex + 1}`);
      this.socket.send(
        JSON.stringify({
          type: 'quickDrawShoot',
          opponentId: opponentId,
          arenaIndex: arenaIndex
        })
      );
    }
  }

  /**
   * Closes the connection manually.
   */
  disconnect() {
    this._cleanupSocket();
    console.log('WebSocket connection manually closed');
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