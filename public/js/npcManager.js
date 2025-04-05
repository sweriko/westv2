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