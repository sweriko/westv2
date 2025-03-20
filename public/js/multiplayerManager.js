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
      console.log(`Local player initialized with ID: ${this.localPlayerId}`);

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

    // Anti-cheat: Player got hit (local player) - server validated
    networkManager.onPlayerHit = (sourceId, hitData, newHealth, hitZone) => {
      console.log(`I was hit by player ${sourceId} in the ${hitZone || 'body'}!`);
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
        if (typeof window.showDamageIndicator === 'function') {
          window.showDamageIndicator(damage, hitZone);
        }
        
        // Ensure health UI is updated
        if (typeof window.updateHealthUI === 'function') {
          window.updateHealthUI(window.localPlayer);
        }
      }
    };

    // Anti-cheat: Broadcast that some player was hit (server validated)
    networkManager.onPlayerHitBroadcast = (targetId, sourceId, hitPos, newHealth, hitZone) => {
      console.log(`Player ${targetId} was hit by ${sourceId} in the ${hitZone || 'body'}`);
      const tPlayer = this.remotePlayers.get(parseInt(targetId));
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
    
    // Create a particle system for the hit marker
    const geometry = new THREE.BufferGeometry();
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
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    const material = new THREE.PointsMaterial({
      color: color,
      size: 0.05,
      transparent: true,
      opacity: 1
    });
    
    const particles = new THREE.Points(geometry, material);
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
  }

  addPlayer(playerId, data) {
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
    // Animate each remote player's walk cycle and smoothly update movement
    for (const [playerId, remoteModel] of this.remotePlayers.entries()) {
      if (remoteModel.isWalking) {
        remoteModel.animateWalk(deltaTime);
      } else {
        remoteModel.resetWalkAnimation();
      }
      remoteModel.animateMovement(deltaTime);
    }
  }

  notifyPlayersUpdated() {
    if (typeof this.onRemotePlayersUpdated === 'function') {
      this.onRemotePlayersUpdated();
    }
  }
}