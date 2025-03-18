import { ThirdPersonModel } from './playerModel.js';
import { networkManager } from './network.js';

/**
 * Manages all remote players (their models, animations, etc.) but NOT bullets.
 * Bullets are now handled in `main.js`.
 */
export class MultiplayerManager {
  constructor(scene, soundManager, remotePlayersMap) {
    /**
     * @param remotePlayersMap {Map<number,ThirdPersonModel>}
     * A shared map that main.js also references. We'll update it here.
     */
    this.scene = scene;
    this.soundManager = soundManager;
    
    // This map is passed in from main.js; we mutate it
    this.remotePlayers = remotePlayersMap;

    // Callback that main.js uses to know we changed remotePlayers
    this.onRemotePlayersUpdated = null;

    this.localPlayerId = null;

    // Initialize network handlers
    this.initNetwork();
  }
  
  initNetwork() {
    // When we get the "init" message, set local player ID and add any existing players
    networkManager.onInit = (initData) => {
      this.localPlayerId = initData.id;
      console.log(`Local player ID: ${this.localPlayerId}`);

      // Add all existing players (these are remote from our POV)
      initData.players.forEach(playerData => {
        this.addPlayer(playerData.id, playerData);
      });
      this.notifyPlayersUpdated();
    };

    networkManager.onPlayerJoined = (playerData) => {
      if (playerData.id === this.localPlayerId) return; // skip ourself
      this.addPlayer(playerData.id, playerData);
      this.notifyPlayersUpdated();
    };

    networkManager.onPlayerLeft = (playerId) => {
      this.removePlayer(playerId);
      this.notifyPlayersUpdated();
    };

    networkManager.onPlayerUpdate = (playerId, updatedData) => {
      if (playerId === this.localPlayerId) return; // skip ourself
      const playerModel = this.remotePlayers.get(playerId);
      if (playerModel) {
        playerModel.update(updatedData);
      } else {
        // If we don't have this model yet, create it
        this.addPlayer(playerId, updatedData);
      }
    };

    // We no longer handle bullets here (onPlayerShoot) – that's handled in main.js

    // Player got hit
    networkManager.onPlayerHit = (sourceId, hitData) => {
      // If this client is the one that got hit, show a red flash
      console.log(`I was hit by player ${sourceId}!`);
      this.showHitFeedback();
    };

    // Broadcast that some player was hit (for visual effects)
    networkManager.onPlayerHitBroadcast = (targetId, sourceId, hitPos) => {
      console.log(`Player ${targetId} was hit by ${sourceId}`);
      // If the target is in our remotePlayers map, show them flashing red
      const tPlayer = this.remotePlayers.get(parseInt(targetId));
      if (tPlayer) {
        tPlayer.showHitFeedback();
      }
    };
  }

  showHitFeedback() {
    // Flash the screen red briefly
    const hitOverlay = document.createElement('div');
    hitOverlay.style.position = 'absolute';
    hitOverlay.style.top = '0';
    hitOverlay.style.left = '0';
    hitOverlay.style.width = '100%';
    hitOverlay.style.height = '100%';
    hitOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
    hitOverlay.style.pointerEvents = 'none';
    hitOverlay.style.transition = 'opacity 0.5s ease-out';
    hitOverlay.style.zIndex = '1000';
    document.body.appendChild(hitOverlay);
    
    setTimeout(() => {
      hitOverlay.style.opacity = '0';
      setTimeout(() => {
        if (hitOverlay.parentNode) {
          hitOverlay.parentNode.removeChild(hitOverlay);
        }
      }, 500);
    }, 100);

    // Optional hit sound
    if (this.soundManager) {
      this.soundManager.playSound("aimclick");
    }
  }

  addPlayer(playerId, data) {
    // Create a ThirdPersonModel for the remote player
    console.log(`Adding remote player ${playerId}`);
    const model = new ThirdPersonModel(this.scene, playerId);
    model.update(data);
    this.remotePlayers.set(playerId, model);
  }

  removePlayer(playerId) {
    console.log(`Removing remote player ${playerId}`);
    const model = this.remotePlayers.get(playerId);
    if (model) {
      model.remove();
      this.remotePlayers.delete(playerId);
    }
  }

  update(deltaTime) {
    // Animate each remote player's walk cycle, etc.
    for (const [playerId, remoteModel] of this.remotePlayers.entries()) {
      if (remoteModel.isWalking) {
        remoteModel.animateWalk(deltaTime);
      } else {
        remoteModel.resetWalkAnimation();
      }
      // Keep collision boxes up to date
      remoteModel.updateCollisionBox();
    }
  }

  notifyPlayersUpdated() {
    if (typeof this.onRemotePlayersUpdated === 'function') {
      this.onRemotePlayersUpdated();
    }
  }
}
