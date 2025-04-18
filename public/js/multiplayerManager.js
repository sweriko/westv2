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
    
    // Initialize nametag visibility - visible by default
    this._nametagsVisible = true;
    
    // Create a container for the username labels
    this.createLabelContainer();

    // Callback that main.js uses to know we changed remotePlayers
    this.onRemotePlayersUpdated = null;

    this.localPlayerId = null;

    // Initialize network handlers
    this.initNetwork();
  }
  
  /**
   * Creates the container for player username labels
   */
  createLabelContainer() {
    // Check if container already exists
    let container = document.getElementById('player-labels-container');
    
    if (!container) {
      // Create a new container
      container = document.createElement('div');
      container.id = 'player-labels-container';
      container.style.position = 'absolute';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.pointerEvents = 'none';
      container.style.overflow = 'hidden';
      container.style.zIndex = '10';
      
      // Add to the game container
      const gameContainer = document.getElementById('game-container');
      if (gameContainer) {
        gameContainer.appendChild(container);
      } else {
        document.body.appendChild(container);
      }
    }
    
    // Store the reference to the container
    this.labelContainer = container;
  }
  
  initNetwork() {
    // When we get the "init" message, set local player ID and add any existing players
    networkManager.onInit = (initData) => {
      this.localPlayerId = initData.id;
      console.log(`Local player initialized with ID: ${this.localPlayerId}`);

      // Remove any existing duplicate of the local player (safety check)
      this.removeLocalPlayerDuplicates();

      // Add all existing players (these are remote from our POV)
      if (initData.players && Array.isArray(initData.players)) {
        initData.players.forEach(playerData => {
          this.addPlayer(playerData.id, playerData);
        });
        this.notifyPlayersUpdated();
      }
      
      // Request train state explicitly after a short delay to ensure it's received
      setTimeout(() => {
        if (networkManager && typeof networkManager.requestTrainState === 'function') {
          console.log("Requesting train state from server after initialization");
          networkManager.requestTrainState();
        }
      }, 1000);
    };

    networkManager.onPlayerJoined = (playerData) => {
      if (playerData && playerData.id !== this.localPlayerId) {
        console.log(`Player joined: ${playerData.id}${playerData.isNpc ? ' (NPC)' : (playerData.isBot ? ' (BOT)' : '')}`);
        this.addPlayer(playerData.id, playerData);
        this.notifyPlayersUpdated();
      }
    };

    networkManager.onPlayerLeft = (playerId) => {
      console.log(`Player left: ${playerId}`);
      this.removePlayer(playerId);
      this.notifyPlayersUpdated();
    };

    // Add handler for player death events
    networkManager.onPlayerDeath = (playerId, killedById) => {
      console.log(`Player ${playerId} was killed by player ${killedById}`);
      
      // Find the player model and play death animation
      const playerModel = this.remotePlayers.get(playerId);
      if (playerModel && typeof playerModel.playDeathAnimation === 'function') {
        console.log(`Playing death animation for player ${playerId}`);
        playerModel.playDeathAnimation();
      }
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
      
      // Check if player animation state should be reset (after respawn)
      if (updatedData && updatedData.resetAnimationState === true && playerModel && typeof playerModel.resetAnimationState === 'function') {
        console.log(`[MultiplayerManager] Resetting animation state for player ${playerId}`);
        playerModel.resetAnimationState();
        // Continue with normal update
      }
      
      // Normal update
      if (playerModel) {
        // For NPCs/Bots, cache the latest network data to use in the animation update
        if (updatedData && (playerModel.isBot || playerModel.isNpc || (updatedData.isNpc || updatedData.isBot))) {
          // Cache the network data for use in the animation update
          playerModel._cachedNetworkData = {
            ...updatedData,
            isNpc: updatedData.isNpc || playerModel.isNpc,
            isBot: updatedData.isBot || playerModel.isBot
          };
          
          // Ensure isNpc/isBot flags are set on the model
          playerModel.isNpc = playerModel._cachedNetworkData.isNpc;
          playerModel.isBot = playerModel._cachedNetworkData.isBot;
          
          // If the NPC is walking, direct to walking animation immediately
          if (updatedData.isWalking && !playerModel.isWalking) {
            playerModel.isWalking = true;
            if (playerModel.directToWalking) {
              playerModel.directToWalking(false);
            }
          } else if (!updatedData.isWalking && playerModel.isWalking) {
            playerModel.isWalking = false;
            if (playerModel.directToIdle) {
              playerModel.directToIdle();
            }
          }
        }
        
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
        
        // Check if hitData contains a damage value directly
        if (hitData && typeof hitData.damage === 'number') {
          damage = hitData.damage;
        } else if (newHealth !== undefined) {
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
        
        // Make sure damage is a number
        damage = Number(damage) || 40; // Default to 40 if conversion fails
        
        // Show damage indicator with proper hit zone
        if (typeof showDamageIndicator === 'function') {
          console.log(`Showing damage indicator: ${damage} damage to ${hitZone}`);
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
      this.soundManager.playSound("revolverdraw");
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

  /**
   * Adds a remote player to the scene with proper model
   * @param {number} playerId - ID of the player to add
   * @param {Object} initialData - Initial player data from server
   */
  addPlayer(playerId, initialData = {}) {
    // Skip if we already have this player
    if (this.remotePlayers.has(playerId)) return;
    
    // Skip if this is the local player ID (safety check to prevent ghost duplicates)
    if (playerId === this.localPlayerId) {
      console.log(`MultiplayerManager: Skipping attempt to add local player (ID: ${playerId}) as remote player`);
      return null;
    }
    
    console.log(`Adding remote player ${playerId} to scene`);
    
    let playerModel;
    
    // Check if this is an NPC or bot
    const isNpc = initialData.isNpc || false;
    const isBot = initialData.isBot || false;
    
    // Use specialized NPC models for NPCs
    if (isNpc && window.npcManager && window.npcManager.instance) {
      // Let the NPC manager handle creating the appropriate model
      playerModel = window.npcManager.instance.createOrUpdateNpc(playerId, initialData);
    } else {
      // Create standard player model for regular players and bots
      playerModel = new ThirdPersonModel(this.scene, playerId);
    }
    
    // Set bot/NPC flag if this is not a human player
    playerModel.isBot = isBot;
    playerModel.isNpc = isNpc;
    
    // Track if this is an AI-controlled character
    const isAiControlled = playerModel.isBot || playerModel.isNpc;
    
    // Add to tracking map - used by main.js for bullet hit detection
    this.remotePlayers.set(playerId, playerModel);
    
    // Set initial position if provided
    if (initialData.position) {
      playerModel.targetPosition.set(
        initialData.position.x, 
        initialData.position.y, 
        initialData.position.z
      );
      playerModel.group.position.copy(playerModel.targetPosition);
    }
    
    // Set initial rotation if provided
    if (initialData.rotation && initialData.rotation.y !== undefined) {
      playerModel.targetRotation = initialData.rotation.y;
      playerModel.group.rotation.y = initialData.rotation.y;
    }
    
    // Apply skin information if provided and not an NPC/bot
    if (!isNpc && !isBot && initialData.skins) {
      console.log(`Applying initial skin data for player ${playerId}:`, initialData.skins);
      
      // Update skin permissions
      playerModel.updateSkinPermissions(initialData.skins);
      
      // Apply banana skin if permission is granted
      if (initialData.skins.bananaSkin) {
        console.log(`Player ${playerId} has bananaSkin permission, applying skin on initial join`);
        
        // Ensure the model is loaded first
        if (!playerModel.playerModel) {
          console.log(`Waiting for player model to load before applying skin for player ${playerId}`);
          // Add a delay to wait for model to load
          setTimeout(() => {
            if (playerModel.playerModel) {
              playerModel.updateSkin('bananaSkin');
              // Mark as initially applied to prevent duplicate application
              playerModel._initialSkinApplied = true;
              // Store the skin data to prevent redundant updates
              playerModel._lastSkinUpdate = JSON.stringify(initialData.skins);
            } else {
              console.warn(`Player model still not loaded for player ${playerId} after delay`);
            }
          }, 1500); // Longer delay to ensure model loads
        } else {
          playerModel.updateSkin('bananaSkin');
          // Mark as initially applied to prevent duplicate application
          playerModel._initialSkinApplied = true;
          // Store the skin data to prevent redundant updates
          playerModel._lastSkinUpdate = JSON.stringify(initialData.skins);
        }
      }
    }
    
    // For NPCs/Bots, ensure model is prepared correctly and animation is initialized
    if (isAiControlled) {
      // Store the network data for future updates
      playerModel._cachedNetworkData = { ...initialData };
      
      // Ensure animations load and initialize correctly
      setTimeout(() => {
        // Set initial animation state based on data
        if (initialData.isWalking && playerModel.directToWalking) {
          playerModel.isWalking = true;
          playerModel.directToWalking(false);
        } else if (playerModel.directToIdle) {
          playerModel.isWalking = false;
          playerModel.directToIdle();
        }
      }, 500); // Delay slightly to ensure model is loaded
    }
    
    // Create username label
    this.createPlayerLabel(playerId, initialData.username || `Player_${playerId}`, isAiControlled);
    
    return playerModel;
  }

  /**
   * Creates a floating username label for a player
   * @param {number} playerId - ID of the player
   * @param {string} username - Username to display
   * @param {boolean} isAiControlled - Whether this is a bot or NPC
   */
  createPlayerLabel(playerId, username, isAiControlled = false) {
    // Remove any existing label first
    this.removePlayerLabel(playerId);
    
    // Create label container
    const div = document.createElement('div');
    div.className = 'player-label';
    
    // Style the label
    div.style.position = 'absolute';
    div.style.color = 'white';
    div.style.fontFamily = 'Arial, sans-serif';
    div.style.fontSize = '14px';
    div.style.fontWeight = 'bold';
    div.style.textShadow = '1px 1px 2px black';
    div.style.padding = '3px 6px';
    div.style.borderRadius = '4px';
    div.style.pointerEvents = 'none';
    div.style.userSelect = 'none';
    div.style.zIndex = '10';
    
    // Add special styling for AI-controlled characters
    if (isAiControlled) {
      div.classList.add('ai-controlled');
      div.style.backgroundColor = 'rgba(50, 150, 255, 0.5)'; // Blue background for NPCs
      div.textContent = username; // Remove robot emoji, just use the name
    } else {
      div.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'; // Regular background for players
      div.textContent = username;
    }
    
    // Add to DOM
    this.labelContainer.appendChild(div);
    
    // Create THREE.js object to position the label in 3D space
    const labelObject = new THREE.Object3D();
    labelObject.position.y = 2.8; // Increased position above player head (was 2.5)
    
    // Store references for updating
    this.playerLabels.set(playerId, { div, labelObject });
    
    // If we have this player model, add the label object to it
    const model = this.remotePlayers.get(playerId);
    if (model && model.group) {
      model.group.add(labelObject);
    }
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
    const labelData = this.playerLabels.get(playerId);
    if (labelData) {
      // Remove the div from DOM
      if (labelData.div && labelData.div.parentNode) {
        labelData.div.parentNode.removeChild(labelData.div);
      }
      
      // Remove the 3D object from the player model
      const model = this.remotePlayers.get(playerId);
      if (model && model.group && labelData.labelObject) {
        model.group.remove(labelData.labelObject);
      }
      
      // Remove from tracking
      this.playerLabels.delete(playerId);
    }
  }

  update(deltaTime) {
    // Update player models
    for (const [id, playerModel] of this.remotePlayers.entries()) {
      if (playerModel) {
        // Always call animateMovement which handles the snapshot-based animations too
        if (playerModel.animateMovement) {
          playerModel.animateMovement(deltaTime);
        }
        
        // Also call the general update method if it exists
        if (playerModel.update) {
          // For NPCs/Bots, make sure we're passing the animation state correctly
          if (playerModel.isBot || playerModel.isNpc) {
            // Check for cached data that was received in onPlayerUpdate
            const cachedData = playerModel._cachedNetworkData;
            if (cachedData) {
              // Clone the data to avoid permanent modifications to cached data
              const clonedData = { ...cachedData };
              
              // Only include skin data on initial update or when it has actually changed
              if (!playerModel._initialSkinApplied) {
                playerModel._initialSkinApplied = true;
              } else {
                // Remove skin data from subsequent updates to prevent constant reapplication
                delete clonedData.skins;
              }
              
              playerModel.update(clonedData);
            }
          } else {
            // DON'T pass deltaTime to update when the player is in a frozen aim pose
            // This prevents animation mixer from resetting the animation each frame
            if (playerModel.isAiming && !playerModel.isShooting && !playerModel.isJumping) {
              // Skip sending deltaTime update which would reset the animation
            } else {
              playerModel.update(deltaTime);
            }
          }
        }
      }
    }
    
    // Update player labels
    this.updatePlayerLabels();
  }
  
  /**
   * Control visibility of ALL player nametags
   * @param {boolean} visible - Whether nametags should be visible
   */
  setAllNametagsVisible(visible) {
    console.log(`[MultiplayerManager] Setting all nametags visible: ${visible}`);
    
    this.playerLabels.forEach((labelData, playerId) => {
      if (labelData && labelData.div) {
        labelData.div.style.display = visible ? 'block' : 'none';
      }
    });
    
    // Store current global visibility setting
    this._nametagsVisible = visible;
  }
  
  updatePlayerLabels() {
    const tempVector = new THREE.Vector3();
    const canvas = document.querySelector('canvas');
    
    if (!canvas) return;
    
    // Get camera for projection
    const camera = window.renderer && window.renderer.camera ? 
                  window.renderer.camera : 
                  this.scene.getObjectByProperty('type', 'PerspectiveCamera');
    
    if (!camera) return;
    
    // If nametags are globally hidden, skip the update
    if (this._nametagsVisible === false) {
      return;
    }
    
    this.playerLabels.forEach((labelData, playerId) => {
      const { div, labelObject } = labelData;
      if (!div) return;
      
      const model = this.remotePlayers.get(playerId);
      if (!model || !model.group) return;
      
      // Get world position
      tempVector.setFromMatrixPosition(labelObject.matrixWorld);
      
      // Project to 2D screen coordinates
      tempVector.project(camera);
      
      // Convert to CSS coordinates
      const x = (tempVector.x * 0.5 + 0.5) * canvas.clientWidth;
      const y = (-(tempVector.y * 0.5) + 0.5) * canvas.clientHeight;
      
      // Check if label is in front of the camera
      if (tempVector.z > 1) {
        div.style.display = 'none';
      } else {
        div.style.display = 'block';
        div.style.transform = `translate(-50%, -50%)`;
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
      }
    });
  }

  notifyPlayersUpdated() {
    if (typeof this.onRemotePlayersUpdated === 'function') {
      this.onRemotePlayersUpdated(this.remotePlayers);
    }
  }

  /**
   * Removes any existing player models with the same ID as the local player
   * This prevents the "ghost player" issue where a player sees their own model
   */
  removeLocalPlayerDuplicates() {
    if (!this.localPlayerId) return;
    
    // Check if there's a model with our ID in the remote players map
    if (this.remotePlayers.has(this.localPlayerId)) {
      console.log(`Removing duplicate local player model with ID: ${this.localPlayerId}`);
      
      // Get the model
      const duplicateModel = this.remotePlayers.get(this.localPlayerId);
      
      // Dispose of the model properly
      if (duplicateModel) {
        duplicateModel.dispose();
      }
      
      // Remove from the map
      this.remotePlayers.delete(this.localPlayerId);
      
      // Remove username label
      this.removePlayerLabel(this.localPlayerId);
      
      // Notify that remote players have changed
      this.notifyPlayersUpdated();
    }
  }
}