import { ThirdPersonModel } from './playerModel.js';
import { networkManager } from './network.js';
import { updateHealthUI, showDamageIndicator } from './ui.js';

/**
 * Manages all remote players (their models, animations, etc.) but NOT bullets.
 * Bullets are now handled in main.js.
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

    // Map to track username labels
    this.playerLabels = new Map(); // playerId -> { sprite, div }
    
    // Create a container for the username labels
    this.createLabelContainer();

    // Callback that main.js uses to know we changed remotePlayers
    this.onRemotePlayersUpdated = null;

    this.localPlayerId = null;

    // Initialize network handlers
    this.initNetwork();
  }
  
  createLabelContainer() {
    // Create a container for all player labels if it doesn't exist
    if (!document.getElementById('player-labels-container')) {
      const container = document.createElement('div');
      container.id = 'player-labels-container';
      container.style.position = 'absolute';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.pointerEvents = 'none';
      container.style.overflow = 'hidden';
      document.body.appendChild(container);
    }
  }
  
  initNetwork() {
    // When we get the "init" message, set local player ID and add any existing players
    networkManager.onInit = (initData) => {
      this.localPlayerId = initData.id;
      console.log(`Local player initialized with ID: ${this.localPlayerId}`);

      // Add all existing players (these are remote from our POV)
      if (initData.players && Array.isArray(initData.players)) {
        initData.players.forEach(playerData => {
          this.addPlayer(playerData.id, playerData);
        });
        this.notifyPlayersUpdated();
      }
    };

    networkManager.onPlayerJoined = (playerData) => {
      if (playerData && playerData.id !== this.localPlayerId) {
        console.log(`Player joined: ${playerData.id}${playerData.isBot ? ' (BOT)' : ''}`);
        this.addPlayer(playerData.id, playerData);
        this.notifyPlayersUpdated();
      }
    };

    networkManager.onPlayerLeft = (playerId) => {
      console.log(`Player left: ${playerId}`);
      this.removePlayer(playerId);
      this.notifyPlayersUpdated();
    };

    networkManager.onPlayerUpdate = (playerId, updatedData) => {
      if (playerId === this.localPlayerId) return; // skip ourself
      
      const playerModel = this.remotePlayers.get(playerId);
      
      // Check if this is a full reset request
      if (updatedData && updatedData.fullReset === true) {
        console.log(`[MultiplayerManager] Received full reset for player ${playerId}`);
        
        // If we have this player model, remove it completely
        if (playerModel) {
          playerModel.dispose();
          this.remotePlayers.delete(playerId);
          
          // Remove username label
          this.removePlayerLabel(playerId);
        }
        
        // Create a fresh player model
        this.addPlayer(playerId, updatedData);
        this.notifyPlayersUpdated();
        return;
      }
      
      // Check if player is dying and should play death animation
      if (updatedData && updatedData.isDying === true && playerModel && playerModel.playDeathAnimation && !playerModel.isDying) {
        console.log(`[MultiplayerManager] Playing death animation for remote player ${playerId}`);
        playerModel.playDeathAnimation();
        return; // Skip normal update as death animation takes precedence
      }
      
      // Normal update
      if (playerModel) {
        playerModel.update(updatedData);
      } else if (updatedData) {
        // If we don't have this model yet, create it
        this.addPlayer(playerId, updatedData);
      }
    };

    // Anti-cheat: Player got hit (local player) - server validated
    networkManager.onPlayerHit = (sourceId, hitData, newHealth, hitZone) => {
      console.log(`I was hit by player ${sourceId} in the ${hitZone || 'body'}!`);
      
      // Skip processing if this is a QuickDraw duel hit - QuickDraw will handle it separately
      const isQuickDrawDuel = window.quickDraw && window.quickDraw.inDuel && 
                              window.quickDraw.duelOpponentId === Number(sourceId);
      
      if (isQuickDrawDuel) {
        console.log(`[MultiplayerManager] Deferring hit handling to QuickDraw system`);
        return;
      }
      
      // This is a regular hit, not in QuickDraw mode
      this.showHitFeedback();
      
      // Play headshot sound if appropriate
      if (hitZone === 'head' && this.soundManager) {
        this.soundManager.playSound("headshotmarker", 100);
      }
      
      // Reduce local player's health (using value from server)
      if (window.localPlayer) {
        // Calculate damage based on the health difference or hit zone
        let damage = 20; // Default damage
        
        if (newHealth !== undefined) {
          // Calculate damage from previous health
          damage = window.localPlayer.health - newHealth;
          window.localPlayer.health = newHealth;
        } else {
          // Calculate damage based on hit zone if provided
          if (hitZone === 'head') {
            damage = 100;
          } else if (hitZone === 'body') {
            damage = 40;
          } else if (hitZone === 'limbs') {
            damage = 20;
          }
          
          // Apply damage
          window.localPlayer.takeDamage(damage, hitZone);
        }
        
        // Show damage indicator with proper hit zone
        if (typeof showDamageIndicator === 'function') {
          showDamageIndicator(damage, hitZone);
        }
        
        // Ensure health UI is updated
        if (typeof updateHealthUI === 'function') {
          updateHealthUI(window.localPlayer);
        }
      }
    };

    // Anti-cheat: Broadcast that some player was hit (server validated)
    networkManager.onPlayerHitBroadcast = (targetId, sourceId, hitPos, newHealth, hitZone) => {
      console.log(`Player ${targetId} was hit by ${sourceId} in the ${hitZone || 'body'}`);
      
      // Skip processing if this is a QuickDraw duel hit
      const isQuickDrawHit = window.quickDraw && window.quickDraw.inDuel && 
                            (window.quickDraw.duelOpponentId === Number(targetId) || 
                             window.localPlayer.id === Number(targetId));
      
      if (isQuickDrawHit) {
        console.log(`[MultiplayerManager] Skipping hit broadcast for QuickDraw duel`);
        return;
      }
      
      // Convert targetId to integer if it's a string
      const playerId = typeof targetId === 'string' ? parseInt(targetId, 10) : targetId;
      const tPlayer = this.remotePlayers.get(playerId);
      
      if (tPlayer) {
        tPlayer.showHitFeedback();
        
        // Play headshot sound if appropriate
        if (hitZone === 'head' && this.soundManager) {
          this.soundManager.playSound("headshotmarker", 100);
        }
        
        // Calculate damage based on hit zone
        let damage = 20; // Default damage
        if (hitZone === 'head') {
          damage = 100;
        } else if (hitZone === 'body') {
          damage = 40;
        } else if (hitZone === 'limbs') {
          damage = 20;
        }
        
        // Update health directly from server value if provided
        if (newHealth !== undefined) {
          tPlayer.health = newHealth;
        } else {
          // Apply damage
          if (typeof tPlayer.takeDamage === 'function') {
            tPlayer.takeDamage(damage, hitZone);
          } else {
            // If takeDamage is not defined, manually update health
            tPlayer.health = Math.max((tPlayer.health || 100) - damage, 0);
          }
        }
        
        // Create a hit marker or effect at the hit position if available
        if (hitPos && window.scene) {
          this.createHitMarker(hitPos, hitZone);
        }
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

  /**
   * Creates a visual hit marker at the hit position
   * @param {Object} position - The hit position
   * @param {string} hitZone - The hit zone ('head', 'body', 'limbs')
   */
  createHitMarker(position, hitZone) {
    // Only create if we have THREE.js and a scene
    if (!window.THREE || !window.scene) return;
    
    // Choose color based on hit zone
    let color = 0xFFFFFF; // Default white
    if (hitZone === 'head') {
      color = 0xFF0000; // Red for headshots
    } else if (hitZone === 'body') {
      color = 0xFF6600; // Orange for body shots
    } else if (hitZone === 'limbs') {
      color = 0xFFFF00; // Yellow for limb shots
    }
    
    try {
      // Create a particle system for the hit marker
      const geometry = new window.THREE.BufferGeometry();
      const vertices = [];
      
      // Create particles in a small sphere
      const particleCount = 10;
      const radius = 0.1;
      
      for (let i = 0; i < particleCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);
        
        vertices.push(x, y, z);
      }
      
      geometry.setAttribute('position', new window.THREE.Float32BufferAttribute(vertices, 3));
      
      const material = new window.THREE.PointsMaterial({
        color: color,
        size: 0.05,
        transparent: true,
        opacity: 1
      });
      
      const particles = new window.THREE.Points(geometry, material);
      particles.position.copy(position);
      window.scene.add(particles);
      
      // Animate the particles
      const startTime = performance.now();
      const duration = 500; // ms
      
      function animateParticles() {
        const elapsed = performance.now() - startTime;
        const progress = elapsed / duration;
        
        if (progress < 1) {
          // Expand particles
          particles.scale.set(1 + progress * 2, 1 + progress * 2, 1 + progress * 2);
          // Fade out
          material.opacity = 1 - progress;
          
          requestAnimationFrame(animateParticles);
        } else {
          // Clean up
          window.scene.remove(particles);
          geometry.dispose();
          material.dispose();
        }
      }
      
      requestAnimationFrame(animateParticles);
    } catch (error) {
      console.error("Error creating hit marker:", error);
    }
  }

  addPlayer(playerId, data) {
    if (!this.remotePlayers.has(playerId)) {
      console.log(`Adding new ${data.isBot ? 'bot' : 'player'} model for ID: ${playerId}, Username: ${data.username || 'Unknown'}`);
      
      // Check if the player ID looks like a bot ID
      const isBot = data.isBot || (typeof playerId === 'string' && playerId.startsWith('bot_'));
      
      const playerModel = new ThirdPersonModel(this.scene, playerId);
      playerModel.isBot = isBot; // Flag to identify bots
      
      // For bots, ensure model is immediately visible
      if (isBot && playerModel.playerModel) {
        playerModel.playerModel.visible = true;
        playerModel.playerModel.traverse(child => {
          if (child.isMesh) {
            child.visible = true;
            child.frustumCulled = false;
          }
        });
      }
      
      this.remotePlayers.set(playerId, playerModel);
      this.createPlayerLabel(playerId, data.username || `Player_${playerId}`);
    }
    
    // Update player with latest data
    const player = this.remotePlayers.get(playerId);
    if (player && data) {
      player.update(data);
    }
  }

  createPlayerLabel(playerId, username) {
    // Check if we already have a label for this player
    if (this.playerLabels.has(playerId)) {
      // Just update the label text if it exists
      const labelData = this.playerLabels.get(playerId);
      if (labelData && labelData.div) {
        labelData.div.textContent = username;
      }
      return;
    }
    
    // Get the player model
    const playerModel = this.remotePlayers.get(playerId);
    const isBot = playerModel && playerModel.isBot;
    
    // Create new HTML element for the player label
    const labelElement = document.createElement('div');
    labelElement.classList.add('player-label');
    
    // Style for bot vs player
    if (isBot) {
      labelElement.classList.add('bot-label');
      labelElement.textContent = `🤖 ${username}`;
    } else {
      labelElement.textContent = username;
    }
    
    // Apply general label styling
    labelElement.style.position = 'absolute';
    labelElement.style.color = 'white';
    labelElement.style.fontFamily = 'Arial, sans-serif';
    labelElement.style.fontSize = '14px';
    labelElement.style.fontWeight = 'bold';
    labelElement.style.textShadow = '1px 1px 2px black';
    labelElement.style.padding = '3px 6px';
    labelElement.style.borderRadius = '4px';
    labelElement.style.backgroundColor = isBot ? 'rgba(50, 150, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)';
    labelElement.style.pointerEvents = 'none';
    labelElement.style.userSelect = 'none';
    labelElement.style.zIndex = '10';
    
    // Get the container
    const container = document.getElementById('player-labels-container');
    if (container) {
      container.appendChild(labelElement);
    } else {
      document.body.appendChild(labelElement);
    }
    
    // Store label data
    this.playerLabels.set(playerId, {
      div: labelElement
    });
  }

  removePlayer(playerId) {
    const playerModel = this.remotePlayers.get(playerId);
    if (playerModel) {
      playerModel.dispose();
      this.remotePlayers.delete(playerId);
    }
    
    // Remove username label
    this.removePlayerLabel(playerId);
  }
  
  removePlayerLabel(playerId) {
    const labelInfo = this.playerLabels.get(playerId);
    if (labelInfo && labelInfo.div) {
      if (labelInfo.div.parentNode) {
        labelInfo.div.parentNode.removeChild(labelInfo.div);
      }
      this.playerLabels.delete(playerId);
    }
  }

  update(deltaTime) {
    // Update all player models
    for (const [playerId, playerModel] of this.remotePlayers.entries()) {
      playerModel.animateMovement(deltaTime);
      
      // Update player label positions
      this.updateLabelPosition(playerId, playerModel);
    }
  }
  
  updateLabelPosition(playerId, playerModel) {
    const labelInfo = this.playerLabels.get(playerId);
    if (!labelInfo || !labelInfo.div) return;
    
    const label = labelInfo.div;
    
    // Hide player names if in a quickdraw match
    if (window.quickDraw && window.quickDraw.inDuel) {
      label.style.display = 'none';
      return;
    }
    
    // Get player position
    if (playerModel) {
      // Use model property if available, otherwise fall back to group
      const modelObj = playerModel.playerModel || playerModel.model || playerModel.group;
      
      if (!modelObj) {
        label.style.display = 'none';
        return;
      }
      
      const playerPos = new window.THREE.Vector3();
      modelObj.getWorldPosition(playerPos);
      
      // Add height offset to position the label above the player's head
      playerPos.y += 2.2;
      
      // Convert 3D position to screen coordinates
      const camera = window.camera || (window.localPlayer && window.localPlayer.camera);
      if (!camera) return;
      
      // Project position to screen space
      const widthHalf = window.innerWidth / 2;
      const heightHalf = window.innerHeight / 2;
      
      // Clone position to avoid modifying the original
      const projectedPos = playerPos.clone();
      projectedPos.project(camera);
      
      // Convert to screen coordinates
      const x = (projectedPos.x * widthHalf) + widthHalf;
      const y = -(projectedPos.y * heightHalf) + heightHalf;
      
      // Check if player is behind camera
      if (projectedPos.z > 1) {
        label.style.display = 'none';
        return;
      }
      
      // Update label position
      label.style.display = 'block';
      label.style.left = `${x}px`;
      label.style.top = `${y}px`;
      
      // Distance fading (fade out when too far)
      const distance = playerPos.distanceTo(camera.position);
      const maxDistance = 30;
      const opacity = 1 - Math.min(Math.max(0, (distance - 15) / maxDistance), 0.9);
      label.style.opacity = opacity.toString();
    } else {
      label.style.display = 'none';
    }
  }

  notifyPlayersUpdated() {
    if (typeof this.onRemotePlayersUpdated === 'function') {
      this.onRemotePlayersUpdated(this.remotePlayers);
    }
  }
}