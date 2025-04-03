import { networkManager } from './network.js';
import { ThirdPersonModel } from './playerModel.js';

/**
 * Manages bot players that behave like real human players
 */
export class BotPlayer {
  /**
   * Create a new bot player
   * @param {Object} config - Bot configuration
   * @param {THREE.Scene} config.scene - The scene to add the bot to
   * @param {string} config.name - Bot's display name
   * @param {Object} config.position - Initial position {x,y,z}
   * @param {number} config.walkSpeed - Walking speed for the bot (default 1.5)
   * @param {Object} config.path - Walking path settings
   */
  constructor({ scene, name = 'Bot', position = { x: 0, y: 1.6, z: 0 }, walkSpeed = 1.5, path = null }) {
    this.scene = scene;
    this.name = name;
    this.id = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.position = new THREE.Vector3(position.x, position.y, position.z);
    this.rotation = new THREE.Euler(0, 0, 0);
    this.walkSpeed = walkSpeed;
    this.health = 100;

    // Path for bot to walk along
    this.path = path || {
      points: [
        new THREE.Vector3(position.x - 5, position.y, position.z),
        new THREE.Vector3(position.x + 5, position.y, position.z)
      ],
      currentTarget: 0,
      pauseTime: 1000, // Time to pause at endpoints in ms
      lastPauseTime: 0
    };
    
    // Bot state
    this.isWalking = false;
    this.isIdle = true;
    this.isAiming = false;
    this.isShooting = false;
    this.isPaused = false;
    this.pauseTimer = 0;
    
    // Network broadcast timing
    this.lastBroadcastTime = 0;
    
    console.log(`Creating bot ${this.id} named ${name}`);
    
    // Create the bot model and make sure it's loaded before proceeding
    this.model = new ThirdPersonModel(scene, this.id);
    
    // Set a flag to indicate this model belongs to a bot
    this.model.isBot = true;
    
    // Position model properly immediately
    this.position.y = 2.72; // Correct height
    this.model.group.position.copy(this.position);
    
    // Initialize the bot model (with a slight delay to ensure model loading)
    setTimeout(() => {
      this.initializeBot();
    }, 100);
    
    // Start bot behavior loop (with a slight delay)
    this.lastUpdateTime = Date.now();
    setTimeout(() => {
      this.update();
    }, 200);
  }

  /**
   * Initialize the bot with proper position and network registration
   */
  initializeBot() {
    console.log(`Initializing bot ${this.id} at position:`, this.position);
    
    // Position the bot - proper height so feet don't sink into ground
    // Fix: Adjust Y position to 2.72 to match player eye level and prevent sinking
    this.position.y = 2.72;
    this.model.group.position.copy(this.position);
    this.model.targetPosition.copy(this.position);
    
    // Fix: Initialize the model with proper rotation (180 degrees to match model direction)
    this.model.targetRotation = Math.PI; 
    this.rotation.y = Math.PI;
    
    // Make sure model is visible and properly set up
    if (this.model.playerModel) {
      this.model.playerModel.visible = true;
      
      // Ensure any child meshes are visible too
      this.model.playerModel.traverse(child => {
        if (child.isMesh) {
          child.visible = true;
          child.frustumCulled = false; // Prevent frustum culling issues
        }
      });
    }
    
    // Ensure model is properly added to scene
    if (!this.scene.children.includes(this.model.group)) {
      console.log(`Adding bot model group to scene for ${this.id}`);
      this.scene.add(this.model.group);
    }
    
    // Ensure proper animations are loaded
    this.model.directToIdle();
    
    // Force an update of the model
    this.model.update({
      position: this.position,
      rotation: { y: this.rotation.y },
      isWalking: false,
      isRunning: false
    });
    
    // Update collision box
    this.model.updateCollisionBox();
    
    // Register bot with the network/game system to make other players see it
    this.broadcastBotState();
    
    console.log(`Bot ${this.id} initialized successfully`);
  }

  /**
   * Main update loop for bot behavior
   */
  update() {
    const currentTime = Date.now();
    const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = currentTime;
    
    // Update bot behavior
    this.updateWalkingBehavior(deltaTime);
    
    // Broadcast bot state to other players
    this.broadcastBotState();
    
    // Continue update loop with proper reference for cancellation
    this._animationFrameId = requestAnimationFrame(() => this.update());
  }

  /**
   * Update the bot's walking behavior along its path
   * @param {number} deltaTime - Time since last update (seconds)
   */
  updateWalkingBehavior(deltaTime) {
    // Skip if paused
    if (this.isPaused) {
      this.pauseTimer -= deltaTime * 1000;
      if (this.pauseTimer <= 0) {
        this.isPaused = false;
        this.isIdle = false;
        this.isWalking = true;
        
        // Update model with new state
        this.model.update({
          isWalking: true,
          isRunning: false
        });
      } else {
        // Make sure we're in idle state
        if (!this.isIdle) {
          this.isIdle = true;
          this.isWalking = false;
          this.model.directToIdle();
        }
        return;
      }
    }

    const points = this.path.points;
    const targetPointIndex = this.path.currentTarget;
    const targetPoint = points[targetPointIndex];
    
    // Calculate direction to current target
    const direction = new THREE.Vector3().subVectors(targetPoint, this.position);
    const distance = direction.length();
    
    // Normalize direction for movement
    direction.normalize();
    
    // If we're close to target, move to next point
    if (distance < 0.2) {
      // Pause at the endpoint
      this.isPaused = true;
      this.pauseTimer = this.path.pauseTime;
      
      // Update target index for next movement
      this.path.currentTarget = (this.path.currentTarget + 1) % points.length;
      
      // Update rotation to face the next point
      const nextTarget = points[this.path.currentTarget];
      const nextDirection = new THREE.Vector3().subVectors(nextTarget, this.position);
      
      if (nextDirection.length() > 0.1) {
        // Fix: Add 180 degrees (Math.PI) to make the model face forward in the direction of travel
        this.rotation.y = Math.atan2(nextDirection.x, nextDirection.z) + Math.PI;
        
        // Update model rotation
        this.model.targetRotation = this.rotation.y;
      }
      
      // Set to idle state
      this.isIdle = true;
      this.isWalking = false;
      this.model.directToIdle();
    } else {
      // Move towards the target point
      const moveSpeed = this.walkSpeed * deltaTime;
      
      // Calculate new position
      const moveVector = direction.clone().multiplyScalar(moveSpeed);
      this.position.add(moveVector);
      
      // Update model position 
      this.model.targetPosition.copy(this.position);
      
      // Calculate rotation to face direction of movement
      // Fix: Add 180 degrees (Math.PI) to make the model face forward in the direction of travel
      this.rotation.y = Math.atan2(direction.x, direction.z) + Math.PI;
      this.model.targetRotation = this.rotation.y;
      
      // Ensure the walking animation is playing
      if (!this.isWalking) {
        this.isWalking = true;
        this.isIdle = false;
        this.model.directToWalking(false); // false = walking, not running
      }
      
      // Update model animation state
      this.model.update({
        position: this.position,
        rotation: { y: this.rotation.y },
        isWalking: true,
        isRunning: false
      });
    }
  }
  
  /**
   * Send the bot's state to the network so other players can see it
   */
  broadcastBotState() {
    // Only broadcast at a reasonable rate to avoid excessive traffic
    const currentTime = Date.now();
    if (currentTime - this.lastBroadcastTime < 100) return;
    this.lastBroadcastTime = currentTime;
    
    // Create data packet similar to player updates
    const botData = {
      type: 'bot_update',
      id: this.id,
      username: this.name,
      position: {
        x: this.position.x,
        y: this.position.y,
        z: this.position.z
      },
      rotation: {
        y: this.rotation.y
      },
      health: this.health,
      isWalking: this.isWalking,
      isAiming: this.isAiming,
      isShooting: this.isShooting,
      isBot: true // Mark as bot
    };
    
    // Send bot data to all players
    if (networkManager.socket && networkManager.socket.readyState === WebSocket.OPEN) {
      networkManager.socket.send(JSON.stringify(botData));
    }
  }
  
  /**
   * Cleanly remove the bot from the scene and stop broadcasting
   */
  dispose() {
    // Remove model from scene
    if (this.model) {
      // Make sure the model is properly removed from the scene
      this.scene.remove(this.model.group);
      
      // Properly dispose of the model's resources
      if (this.model.playerModel) {
        this.model.playerModel.traverse(child => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(material => material.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      }
      
      this.model.dispose();
      this.model = null;
    }
    
    // Send bot removal message
    const removeData = {
      type: 'bot_remove',
      id: this.id
    };
    
    if (networkManager.socket && networkManager.socket.readyState === WebSocket.OPEN) {
      networkManager.socket.send(JSON.stringify(removeData));
    }
    
    // Cancel any pending animation frame
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
  }
}

/**
 * Manages multiple bot players
 */
export class BotManager {
  constructor(scene) {
    this.scene = scene;
    this.bots = new Map();
  }
  
  /**
   * Spawn a bot in the town center that walks back and forth
   * @param {string} name - Bot name
   * @returns {BotPlayer} - The created bot
   */
  spawnTownBot(name = "TownBot") {
    // Create starting position in town center
    const position = {
      x: 0,
      y: 2.72, // Fix: Use correct player eye height to prevent sinking
      z: 0
    };
    
    // Create a more realistic path that loops around town
    const townPath = [
      // Create a path that covers some of the town area
      new THREE.Vector3(-5, 2.72, -2),  // Fix: Update all path Y values to 2.72
      new THREE.Vector3(-3, 2.72, -10),
      new THREE.Vector3(3, 2.72, -10),
      new THREE.Vector3(5, 2.72, -2),
      new THREE.Vector3(5, 2.72, 5),
      new THREE.Vector3(0, 2.72, 8),
      new THREE.Vector3(-5, 2.72, 5)
    ];
    
    // Create a path for the bot to walk on
    const path = {
      points: townPath,
      currentTarget: 0,
      pauseTime: 2000 // Pause for 2 seconds at each node
    };
    
    // Randomize the starting position along the path
    const randomStart = Math.floor(Math.random() * townPath.length);
    position.x = townPath[randomStart].x;
    position.z = townPath[randomStart].z;
    path.currentTarget = (randomStart + 1) % townPath.length;
    
    // Create the bot with slightly randomized walk speed
    const walkSpeed = 1.2 + (Math.random() * 0.6); // 1.2 to 1.8
    
    const bot = new BotPlayer({
      scene: this.scene,
      name,
      position,
      walkSpeed,
      path
    });
    
    // Add to bot map
    this.bots.set(bot.id, bot);
    
    return bot;
  }
  
  /**
   * Spawn a bot at a fixed position that always works
   * @param {string} name - Bot name
   * @returns {BotPlayer} - The created bot
   */
  spawnFixedBot(name = "TownGuard") {
    // Create a fixed position that is guaranteed to work
    const position = {
      x: 0,
      y: 2.72, // Correct player eye height
      z: 0
    };
    
    // Create a simple path
    const simplePath = [
      new THREE.Vector3(-3, 2.72, 0),
      new THREE.Vector3(3, 2.72, 0)
    ];
    
    // Create a path for the bot
    const path = {
      points: simplePath,
      currentTarget: 0,
      pauseTime: 2000 // Pause for 2 seconds at each node
    };
    
    // Create the bot with reliable settings
    const bot = new BotPlayer({
      scene: this.scene,
      name,
      position,
      walkSpeed: 1.0, // Slow, reliable speed
      path
    });
    
    // Add to bot map
    this.bots.set(bot.id, bot);
    
    return bot;
  }
  
  /**
   * Remove a bot from the scene
   * @param {string} botId - ID of bot to remove
   */
  removeBot(botId) {
    const bot = this.bots.get(botId);
    if (bot) {
      bot.dispose();
      this.bots.delete(botId);
    }
  }
  
  /**
   * Remove all bots
   */
  removeAllBots() {
    this.bots.forEach(bot => {
      bot.dispose();
    });
    this.bots.clear();
  }
} 