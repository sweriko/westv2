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
    
    console.log("NPC Manager initialized - NPCs are now server-controlled");
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