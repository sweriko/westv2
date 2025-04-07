import { ThirdPersonModel } from './playerModel.js';

/**
 * NPC Manager - Responsible for handling server-controlled NPCs
 * The actual NPC logic is now controlled by the server
 */
export class NpcManager {
  /**
   * Initialize the NPC Manager
   * @param {THREE.Scene} scene - The scene to add NPCs to
   */
  constructor(scene) {
    this.scene = scene;
    this.npcs = new Map(); // npcId -> NPC instances
    
    // NPC interaction system
    this.interactionPrompt = null;
    this.proximityRadius = 3.5; // How close the player needs to be to interact
    this.nearbyNpc = null; // Current NPC the player is near
    this.isBartenderNearby = false; // Specifically tracking if near the bartender
    
    console.log("NPC Manager initialized - NPCs are now server-controlled");
    
    // Create interaction prompt
    this.createInteractionUI();
  }

  /**
   * Get an NPC by ID
   * @param {string} npcId - The ID of the NPC to get
   * @returns {Object|null} The NPC instance or null if not found
   */
  getNpc(npcId) {
    return this.npcs.get(npcId);
  }

  /**
   * Check if an entity is an NPC
   * @param {string} entityId - The ID to check
   * @returns {boolean} True if the entity is an NPC
   */
  isNpc(entityId) {
    return typeof entityId === 'string' && (
      entityId.startsWith('npc_') || // New server-controlled NPC format
      entityId.startsWith('bot_')     // Legacy bot format for backward compatibility
    );
  }
  
  /**
   * Creates or updates a specific type of NPC based on username
   * @param {string} npcId - The NPC's ID
   * @param {Object} npcData - NPC data including username and position
   * @returns {ThirdPersonModel} - The created or updated NPC model
   */
  createOrUpdateNpc(npcId, npcData) {
    // Check if we already have this NPC
    let npcModel = this.npcs.get(npcId);
    
    // If we already have it, just return it
    if (npcModel) {
      return npcModel;
    }
    
    // Create a specialized ID for sheriff or bartender to help with model loading
    let specializedId = npcId;
    
    // Check if this is the sheriff or bartender based on username
    if (npcData && npcData.username) {
      if (npcData.username.toLowerCase().includes('sheriff')) {
        specializedId = `Sheriff_${npcId}`;
      } else if (npcData.username.toLowerCase().includes('bartender')) {
        specializedId = `Bartender_${npcId}`;
      }
    }
    
    // Create the NPC model with specialized ID to trigger proper model loading
    npcModel = new ThirdPersonModel(this.scene, specializedId);
    npcModel.isNpc = true;
    
    // Add to our tracking map
    this.npcs.set(npcId, npcModel);
    
    console.log(`Created NPC model for ${npcData.username || 'Unknown NPC'}`);
    return npcModel;
  }
  
  /**
   * Creates UI elements for NPC interaction
   */
  createInteractionUI() {
    // Create interaction prompt
    this.interactionPrompt = document.createElement('div');
    this.interactionPrompt.id = 'npc-interaction-prompt';
    this.interactionPrompt.style.position = 'absolute';
    this.interactionPrompt.style.bottom = '20%';
    this.interactionPrompt.style.left = '50%';
    this.interactionPrompt.style.transform = 'translate(-50%, 0) rotate(-2deg)';
    this.interactionPrompt.style.width = '350px';
    this.interactionPrompt.style.height = '100px';
    this.interactionPrompt.style.background = 'url("/textures/wooden_sign.png") no-repeat center center';
    this.interactionPrompt.style.backgroundSize = 'contain';
    this.interactionPrompt.style.display = 'flex';
    this.interactionPrompt.style.alignItems = 'center';
    this.interactionPrompt.style.justifyContent = 'center';
    this.interactionPrompt.style.zIndex = '1000';
    
    // Create text element
    this.promptText = document.createElement('div');
    this.promptText.style.fontFamily = 'Western, "Wanted M54", serif';
    this.promptText.style.fontSize = '28px';
    this.promptText.style.fontWeight = 'bold';
    this.promptText.style.color = '#FFD700';
    this.promptText.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
    
    this.interactionPrompt.appendChild(this.promptText);
    document.getElementById('game-container').appendChild(this.interactionPrompt);
    this.interactionPrompt.style.display = 'none'; // Hide initially
    
    // Add gentle swing animation
    const promptAnimation = document.createElement('style');
    promptAnimation.textContent = `
      @keyframes swingSign {
        0% { transform: translate(-50%, 0) rotate(-2deg); }
        50% { transform: translate(-50%, 0) rotate(2deg); }
        100% { transform: translate(-50%, 0) rotate(-2deg); }
      }
      #npc-interaction-prompt {
        animation: swingSign 3s ease-in-out infinite;
      }
    `;
    document.head.appendChild(promptAnimation);
  }
  
  /**
   * Updates the list of nearby NPCs for interaction
   * @param {Player} player - The local player
   */
  updateNearbyNpcs(player) {
    if (!player) return;
    
    const playerPos = player.group.position.clone();
    this.nearbyNpc = null;
    this.isBartenderNearby = false;
    
    let closestDistance = this.proximityRadius;
    
    // Check each NPC for proximity
    for (const [npcId, npcModel] of this.npcs) {
      if (!npcModel.group) continue;
      
      // Get NPC position
      const npcPos = npcModel.group.position.clone();
      
      // Calculate distance to player
      const distance = playerPos.distanceTo(npcPos);
      
      // If within proximity radius and closer than any previous NPC
      if (distance <= closestDistance) {
        closestDistance = distance;
        this.nearbyNpc = npcModel;
        
        // Check if it's the bartender specifically
        if (npcId.includes('Bartender') || 
            (npcModel.playerId && npcModel.playerId.includes('Bartender'))) {
          this.isBartenderNearby = true;
          console.log('Near bartender, can get drunk!');
        }
      }
    }
    
    // Update UI based on nearby NPCs
    this.updateInteractionUI();
  }
  
  /**
   * Updates the interaction UI based on nearby NPCs
   */
  updateInteractionUI() {
    if (this.nearbyNpc && this.isBartenderNearby) {
      // Show bartender interaction prompt
      this.promptText.textContent = 'Press E to get drunk';
      this.interactionPrompt.style.display = 'flex';
    } else {
      // Hide interaction prompt
      this.interactionPrompt.style.display = 'none';
    }
  }
  
  /**
   * Handle interaction with NPCs
   * @param {KeyboardEvent} event - The keyboard event
   * @param {Player} player - The local player
   * @returns {boolean} True if interaction was handled
   */
  handleInteraction(event, player) {
    if (event.code !== 'KeyE') return false;
    
    // Check if player is near the bartender
    if (this.isBartenderNearby) {
      console.log('Interacting with bartender - getting drunk!');
      
      // Trigger drunkenness effect
      if (window.drunkennessEffect) {
        window.drunkennessEffect.activate();
      }
      
      return true;
    }
    
    return false;
  }
}

// Create a simple placeholder that will be initialized properly in main.js
let npcManagerInstance = null;

export function initNpcManager(scene) {
  if (!npcManagerInstance) {
    npcManagerInstance = new NpcManager(scene);
  }
  return npcManagerInstance;
}

export const npcManager = {
  get instance() {
    return npcManagerInstance;
  }
}; 