import { createImpactEffect } from './effects.js';

/**
 * A bullet class with client-side prediction and server validation.
 * It lets the server have final authority on collisions and hits.
 */
export class Bullet {
  /**
   * @param {THREE.Vector3} position - Starting position
   * @param {THREE.Vector3} direction - Normalized direction vector
   * @param {string|number} bulletId - Optional server-assigned bullet ID (for remote bullets)
   */
  constructor(position, direction, bulletId = null) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xB8860B })
    );
    this.mesh.position.copy(position);

    this.direction = direction.clone();
    this.speed = 80; // speed units/second
    this.distanceTraveled = 0;
    this.maxDistance = 100;
    this.timeCreated = performance.now();

    // Remember previous position for continuous detection
    this.lastPosition = position.clone();

    // Track which player fired this bullet
    this.sourcePlayerId = null;
    
    // Anti-cheat: Server-assigned bulletId
    this.bulletId = bulletId;
    
    // Anti-cheat: Track whether this bullet is local (created by local player)
    this.isLocalBullet = true;
    
    // Add collision detection raycaster
    this.raycaster = new THREE.Raycaster(position.clone(), direction.clone(), 0, 0.1);
  }

  /**
   * Sets the player ID that fired this bullet.
   * @param {string|number} playerId - The ID of the player who fired the bullet.
   */
  setSourcePlayer(playerId) {
    this.sourcePlayerId = playerId;
    
    // Anti-cheat: Determine if this is a local bullet
    if (window.localPlayer) {
      this.isLocalBullet = Number(playerId) === Number(window.localPlayer.id);
    }
  }

  /**
   * Updates the bullet's movement & handles collisions with NPC or players.
   * Uses client-side prediction with server authority.
   * @param {number} deltaTime
   * @param {THREE.Group} npc
   * @param {THREE.Scene} scene
   * @param {Map<number, object>} allPlayers - Map of local + remote players.
   * @returns {Object} - Result of the update containing active state and hit info.
   */
  update(deltaTime, npc, scene, allPlayers) {
    // Previous position for boundary crossing detection
    this.lastPosition = this.mesh.position.clone();
    
    // FIRST CHECK: Before moving, check if bullet is already within arena but from an unauthorized player
    if (window.quickDraw && window.quickDraw.isPointInArena(this.mesh.position)) {
      const isLocalPlayerBullet = Number(this.sourcePlayerId) === Number(window.localPlayer.id);
      const isPlayerInDuel = window.quickDraw.inDuel;
      const isOpponentBullet = window.quickDraw.duelOpponentId === Number(this.sourcePlayerId);
      
      // If bullet is inside arena but not from a duel player, destroy it immediately
      if (!(isPlayerInDuel && isLocalPlayerBullet) && !isOpponentBullet) {
        console.log("Destroying unauthorized bullet inside arena from player " + this.sourcePlayerId);
        createImpactEffect(this.mesh.position, this.direction, scene, 'ground');
        return { active: false, hit: { type: 'arena', position: this.mesh.position } };
      }
    }
    
    // Move the bullet
    const displacement = this.direction.clone().multiplyScalar(this.speed * deltaTime);
    this.mesh.position.add(displacement);
    this.distanceTraveled += displacement.length();

    // Current bullet position
    const endPos = this.mesh.position.clone();
    
    // Check if crossing Quick Draw arena boundary using the physics system
    if (window.quickDraw && window.quickDraw.physics) {
      const physics = window.quickDraw.physics;
      
      // Check if bullet is crossing the arena boundary
      const bulletInArena = window.quickDraw.isPointInArena(endPos);
      const prevInArena = window.quickDraw.isPointInArena(this.lastPosition);
      
      // Calculate if bullet is crossing the boundary
      const bulletCrossingBoundary = bulletInArena !== prevInArena;
      
      // If the bullet is crossing the boundary
      if (bulletCrossingBoundary) {
        const playerInDuel = window.quickDraw.inDuel;
        const isLocalPlayerBullet = Number(this.sourcePlayerId) === Number(window.localPlayer.id);
        
        // Case 1: Player in duel and their bullet trying to exit
        if (playerInDuel && isLocalPlayerBullet && !bulletInArena) {
          console.log("Bullet hit arena boundary (exiting) - destroying it");
          createImpactEffect(endPos, this.direction, scene, 'ground');
          return { active: false, hit: { type: 'arena', position: endPos } };
        }
        
        // Case 2: Player outside trying to shoot in
        if (!playerInDuel && isLocalPlayerBullet && bulletInArena) {
          console.log("Bullet from outside entering arena - destroying it");
          createImpactEffect(endPos, this.direction, scene, 'ground');
          return { active: false, hit: { type: 'arena', position: endPos } };
        }
        
        // Case 3: Bullet from duel player hitting boundary from inside
        if (playerInDuel && !isLocalPlayerBullet && !bulletInArena) {
          console.log("Bullet from other duel player hitting boundary (exiting) - destroying it");
          createImpactEffect(endPos, this.direction, scene, 'ground');
          return { active: false, hit: { type: 'arena', position: endPos } };
        }
        
        // Case 4: Bullet from outside player hitting boundary from outside
        if (!playerInDuel && !isLocalPlayerBullet && bulletInArena) {
          console.log("Bullet from outside player hitting boundary (entering) - destroying it");
          createImpactEffect(endPos, this.direction, scene, 'ground');
          return { active: false, hit: { type: 'arena', position: endPos } };
        }
      }
    }

    // Check if crossing town boundary using the physics system
    if (window.physics && typeof window.physics.isPointInTown === 'function') {
      const bulletInTown = window.physics.isPointInTown(endPos);
      const prevInTown = window.physics.isPointInTown(this.lastPosition);
      
      // Calculate if bullet is crossing the boundary
      const bulletCrossingBoundary = bulletInTown !== prevInTown;
      
      // If the bullet is crossing the boundary, destroy it
      if (bulletCrossingBoundary) {
        console.log("Bullet hit town boundary - destroying it");
        createImpactEffect(endPos, this.direction, scene, 'ground');
        return { active: false, hit: { type: 'boundary', position: endPos } };
      }
    } else if (window.townDimensions) {
      // Fallback if physics isn't available but town dimensions are
      const width = window.townDimensions.width;
      const length = window.townDimensions.length;
      
      // Check if bullet is outside town boundary
      if (
        endPos.x < -width / 2 || 
        endPos.x > width / 2 || 
        endPos.z < -length / 2 || 
        endPos.z > length / 2
      ) {
        console.log("Bullet hit town boundary - destroying it");
        createImpactEffect(endPos, this.direction, scene, 'ground');
        return { active: false, hit: { type: 'boundary', position: endPos } };
      }
    }

    // Anti-cheat: For local bullets, collision detection is only client-side prediction
    // For remote bullets, we rely on client-side collision for visual effects
    
    // 1) Check collision with NPC
    if (npc) {
      const npcBox = new THREE.Box3().setFromObject(npc);
      npcBox.expandByScalar(0.2);
      if (npcBox.containsPoint(endPos)) {
        createImpactEffect(endPos, this.direction, scene, 'npc');
        return { active: false, hit: { type: 'npc', target: npc } };
      }
    }

    // 2) Check collision with players
    if (allPlayers) {
      for (const [playerId, playerObj] of allPlayers.entries()) {
        // Skip bullet's owner by converting both IDs to numbers
        if (Number(playerId) === Number(this.sourcePlayerId)) continue;
        if (!playerObj || !playerObj.group) continue;

        // Prevent hits across arena boundary
        // Only allow hits if both players are in the same area (both in arena or both outside)
        const bulletPlayerInArena = window.quickDraw && window.quickDraw.inDuel;
        const targetPlayerInArena = window.quickDraw && 
                                   window.quickDraw.duelOpponentId === Number(playerId);
        
        if (bulletPlayerInArena !== targetPlayerInArena) {
          continue; // Skip collision check if players are in different areas
        }
        
        // Detect which hit zone was hit (head, body, limbs)
        const hitResult = this.checkPlayerHitZones(playerObj, endPos);
        
        if (hitResult.hit) {
          // Create the impact effect
          createImpactEffect(endPos, this.direction, scene, 'player');
          
          // Play headshot sound if it was a headshot
          if (hitResult.zone === 'head' && window.localPlayer && window.localPlayer.soundManager) {
            window.localPlayer.soundManager.playSound("headshotmarker", 100);
          }
          
          // Anti-cheat: For local bullets, send hit to server and let server decide
          if (this.isLocalBullet && window.networkManager) {
            window.networkManager.sendPlayerHit(playerId, {
              position: { x: endPos.x, y: endPos.y, z: endPos.z },
              sourcePlayerId: this.sourcePlayerId,
              hitZone: hitResult.zone, // Send the hit zone to the server
              damage: hitResult.damage // Send the damage amount to the server
            }, this.bulletId);
            
            // Quick Draw duels with better logging
            if (window.quickDraw && window.quickDraw.inDuel && 
                window.quickDraw.duelState === 'draw' && 
                Number(playerId) === Number(window.quickDraw.duelOpponentId) && 
                Number(this.sourcePlayerId) === Number(window.localPlayer.id)) {
                
                console.log(`Quick Draw hit detected! Player ${this.sourcePlayerId} hit player ${playerId} in the ${hitResult.zone} for ${hitResult.damage} damage`);
                // Send special Quick Draw hit notification
                window.networkManager.sendQuickDrawShoot(playerId);
            }
          }
          
          return { 
            active: false, 
            hit: { 
              type: 'player', 
              playerId, 
              bulletId: this.bulletId,
              zone: hitResult.zone,
              damage: hitResult.damage
            } 
          };
        }
      }
    }

    // 3) Check collision with ground
    if (this.mesh.position.y <= 0.1) {
      createImpactEffect(endPos, this.direction, scene, 'ground');
      return { active: false, hit: { type: 'ground', position: endPos } };
    }

    // 4) If bullet exceeded max distance, remove it.
    if (this.distanceTraveled >= this.maxDistance) {
      return { active: false, hit: null };
    }

    // Still active
    return { active: true, hit: null };
  }
  
  /**
   * Checks which part of the player model was hit and returns damage amount.
   * Implements hit zones for head, body, and limbs.
   * @param {object} playerObj - The player object to check
   * @param {THREE.Vector3} bulletPos - The bullet position
   * @returns {object} - Contains hit (boolean), zone (string), and damage (number)
   */
  checkPlayerHitZones(playerObj, bulletPos) {
    // Get player's base position for collision box
    // For local players (first-person), group.position is at eye-level so subtract 1.6
    // Remote players (third-person) have group.position at the base
    const playerPos = playerObj.group.position.clone();
    let baseY = playerPos.y;
    if (playerObj.camera) { // local player
      baseY = playerPos.y - 1.6;
    }
    
    // Define hit zone dimensions
    const headSize = 0.4; // Head is a smaller target
    const bodyWidth = 0.5;
    const bodyHeight = 0.9;
    const limbWidth = 0.2;
    const limbHeight = 0.6;
    
    // Calculate vertical positions of each zone
    const headBottom = baseY + 2.0 - headSize;
    const headTop = baseY + 2.0;
    const bodyBottom = baseY + 1.1;
    const bodyTop = baseY + 2.0 - headSize;
    const legBottom = baseY;
    const legTop = baseY + 0.9;
    const armBottom = baseY + 1.1;
    const armTop = baseY + 1.7;
    
    // Create debug visualization if physics debug mode is enabled
    if (window.physics && window.physics.debugMode && !playerObj._hitZoneDebug) {
      this.createHitZoneDebugBoxes(playerObj, {
        playerPos, baseY, 
        headSize, bodyWidth, bodyHeight, limbWidth, limbHeight,
        headBottom, headTop, bodyBottom, bodyTop, 
        legBottom, legTop, armBottom, armTop
      });
    }
    
    // First do a quick test with the overall player bounding box
    const overallMin = new THREE.Vector3(
      playerPos.x - bodyWidth,
      baseY,
      playerPos.z - bodyWidth
    );
    const overallMax = new THREE.Vector3(
      playerPos.x + bodyWidth,
      baseY + 2.0,
      playerPos.z + bodyWidth
    );
    const overallBox = new THREE.Box3(overallMin, overallMax);
    
    if (!overallBox.containsPoint(bulletPos)) {
      return { hit: false, zone: null, damage: 0 };
    }
    
    // Check head zone (highest damage)
    const headMin = new THREE.Vector3(
      playerPos.x - headSize/2,
      headBottom,
      playerPos.z - headSize/2
    );
    const headMax = new THREE.Vector3(
      playerPos.x + headSize/2,
      headTop,
      playerPos.z + headSize/2
    );
    const headBox = new THREE.Box3(headMin, headMax);
    
    if (headBox.containsPoint(bulletPos)) {
      return { hit: true, zone: 'head', damage: 100 };
    }
    
    // Check body zone (medium damage)
    const bodyMin = new THREE.Vector3(
      playerPos.x - bodyWidth/2,
      bodyBottom,
      playerPos.z - bodyWidth/2
    );
    const bodyMax = new THREE.Vector3(
      playerPos.x + bodyWidth/2,
      bodyTop,
      playerPos.z + bodyWidth/2
    );
    const bodyBox = new THREE.Box3(bodyMin, bodyMax);
    
    if (bodyBox.containsPoint(bulletPos)) {
      return { hit: true, zone: 'body', damage: 40 };
    }
    
    // Check arms (low damage, simplified to two boxes on sides)
    // Left arm
    const leftArmMin = new THREE.Vector3(
      playerPos.x - bodyWidth/2 - limbWidth,
      armBottom,
      playerPos.z - limbWidth/2
    );
    const leftArmMax = new THREE.Vector3(
      playerPos.x - bodyWidth/2,
      armTop,
      playerPos.z + limbWidth/2
    );
    const leftArmBox = new THREE.Box3(leftArmMin, leftArmMax);
    
    // Right arm
    const rightArmMin = new THREE.Vector3(
      playerPos.x + bodyWidth/2,
      armBottom,
      playerPos.z - limbWidth/2
    );
    const rightArmMax = new THREE.Vector3(
      playerPos.x + bodyWidth/2 + limbWidth,
      armTop,
      playerPos.z + limbWidth/2
    );
    const rightArmBox = new THREE.Box3(rightArmMin, rightArmMax);
    
    if (leftArmBox.containsPoint(bulletPos) || rightArmBox.containsPoint(bulletPos)) {
      return { hit: true, zone: 'limbs', damage: 20 };
    }
    
    // Check legs (low damage)
    // Left leg
    const leftLegMin = new THREE.Vector3(
      playerPos.x - bodyWidth/4 - limbWidth/2,
      legBottom,
      playerPos.z - limbWidth/2
    );
    const leftLegMax = new THREE.Vector3(
      playerPos.x - bodyWidth/4 + limbWidth/2,
      legTop,
      playerPos.z + limbWidth/2
    );
    const leftLegBox = new THREE.Box3(leftLegMin, leftLegMax);
    
    // Right leg
    const rightLegMin = new THREE.Vector3(
      playerPos.x + bodyWidth/4 - limbWidth/2,
      legBottom,
      playerPos.z - limbWidth/2
    );
    const rightLegMax = new THREE.Vector3(
      playerPos.x + bodyWidth/4 + limbWidth/2,
      legTop,
      playerPos.z + limbWidth/2
    );
    const rightLegBox = new THREE.Box3(rightLegMin, rightLegMax);
    
    if (leftLegBox.containsPoint(bulletPos) || rightLegBox.containsPoint(bulletPos)) {
      return { hit: true, zone: 'limbs', damage: 20 };
    }
    
    // If we reach here but hit the overall box, it's a glancing hit to the body
    return { hit: true, zone: 'body', damage: 40 };
  }
  
  /**
   * Creates visible debug boxes for hit zones when physics debug mode is enabled
   * @param {object} playerObj - The player object
   * @param {object} dims - Dimensions and positions for the hit zones
   */
  createHitZoneDebugBoxes(playerObj, dims) {
    // Create a group to hold all hit zone visualizations
    if (!window.scene) return;
    
    const hitZoneGroup = new THREE.Group();
    hitZoneGroup.name = "hitZoneDebug_" + playerObj.id;
    window.scene.add(hitZoneGroup);
    
    // Create helper function to make box helpers
    const createBoxHelper = (min, max, color) => {
      const box = new THREE.Box3(min, max);
      const helper = new THREE.Box3Helper(box, color);
      hitZoneGroup.add(helper);
      return { box, helper };
    };
    
    // Head zone - red
    const headMin = new THREE.Vector3(
      dims.playerPos.x - dims.headSize/2,
      dims.headBottom,
      dims.playerPos.z - dims.headSize/2
    );
    const headMax = new THREE.Vector3(
      dims.playerPos.x + dims.headSize/2,
      dims.headTop,
      dims.playerPos.z + dims.headSize/2
    );
    const headHelper = createBoxHelper(headMin, headMax, 0xff0000);
    
    // Body zone - orange
    const bodyMin = new THREE.Vector3(
      dims.playerPos.x - dims.bodyWidth/2,
      dims.bodyBottom,
      dims.playerPos.z - dims.bodyWidth/2
    );
    const bodyMax = new THREE.Vector3(
      dims.playerPos.x + dims.bodyWidth/2,
      dims.bodyTop,
      dims.playerPos.z + dims.bodyWidth/2
    );
    const bodyHelper = createBoxHelper(bodyMin, bodyMax, 0xff7700);
    
    // Left arm - yellow
    const leftArmMin = new THREE.Vector3(
      dims.playerPos.x - dims.bodyWidth/2 - dims.limbWidth,
      dims.armBottom,
      dims.playerPos.z - dims.limbWidth/2
    );
    const leftArmMax = new THREE.Vector3(
      dims.playerPos.x - dims.bodyWidth/2,
      dims.armTop,
      dims.playerPos.z + dims.limbWidth/2
    );
    const leftArmHelper = createBoxHelper(leftArmMin, leftArmMax, 0xffff00);
    
    // Right arm - green
    const rightArmMin = new THREE.Vector3(
      dims.playerPos.x + dims.bodyWidth/2,
      dims.armBottom,
      dims.playerPos.z - dims.limbWidth/2
    );
    const rightArmMax = new THREE.Vector3(
      dims.playerPos.x + dims.bodyWidth/2 + dims.limbWidth,
      dims.armTop,
      dims.playerPos.z + dims.limbWidth/2
    );
    const rightArmHelper = createBoxHelper(rightArmMin, rightArmMax, 0x00ff00);
    
    // Left leg - blue
    const leftLegMin = new THREE.Vector3(
      dims.playerPos.x - dims.bodyWidth/4 - dims.limbWidth/2,
      dims.legBottom,
      dims.playerPos.z - dims.limbWidth/2
    );
    const leftLegMax = new THREE.Vector3(
      dims.playerPos.x - dims.bodyWidth/4 + dims.limbWidth/2,
      dims.legTop,
      dims.playerPos.z + dims.limbWidth/2
    );
    const leftLegHelper = createBoxHelper(leftLegMin, leftLegMax, 0x0000ff);
    
    // Right leg - purple
    const rightLegMin = new THREE.Vector3(
      dims.playerPos.x + dims.bodyWidth/4 - dims.limbWidth/2,
      dims.legBottom,
      dims.playerPos.z - dims.limbWidth/2
    );
    const rightLegMax = new THREE.Vector3(
      dims.playerPos.x + dims.bodyWidth/4 + dims.limbWidth/2,
      dims.legTop,
      dims.playerPos.z + dims.limbWidth/2
    );
    const rightLegHelper = createBoxHelper(rightLegMin, rightLegMax, 0x800080);
    
    // Store reference to debug visualization group
    playerObj._hitZoneDebug = hitZoneGroup;
    
    // Add an update function to the player object to move the boxes with the player
    if (!playerObj._updateHitZoneDebug) {
      playerObj._updateHitZoneDebug = function() {
        if (this._hitZoneDebug) {
          this._hitZoneDebug.position.copy(this.group.position);
          // Apply rotation
          this._hitZoneDebug.rotation.y = this.group.rotation.y;
        }
      };
      
      // Add to the update loop
      const originalUpdate = playerObj.update;
      playerObj.update = function(deltaTime) {
        // Call original update
        originalUpdate.call(this, deltaTime);
        // Update hit zone debug
        if (this._updateHitZoneDebug) {
          this._updateHitZoneDebug();
        }
      };
    }
  }
  
  /**
   * Directly handles a server-reported impact for this bullet.
   * @param {string} hitType - Type of impact: 'player', 'npc', 'ground', 'boundary', 'arena'
   * @param {string|number|null} targetId - ID of hit target (for player hits)
   * @param {THREE.Vector3} position - Impact position
   * @param {THREE.Scene} scene - Scene to add effects to
   * @returns {Object} - Result object with active=false
   */
  handleServerImpact(hitType, targetId, position, scene) {
    // Create visual effect based on hit type
    if (position) {
      createImpactEffect(position, this.direction, scene, hitType);
      
      // Play headshot sound if the server reports it was a headshot
      if (hitType === 'player' && window.localPlayer && window.localPlayer.soundManager) {
        // If hitZone data is available and it's a headshot
        if (this.lastHitZone === 'head') {
          window.localPlayer.soundManager.playSound("headshotmarker", 100);
        }
      }
    } else {
      // If no position provided, use current bullet position
      createImpactEffect(this.mesh.position, this.direction, scene, hitType);
    }
    
    // Always deactivate the bullet
    return { active: false, hit: { type: hitType, targetId, position } };
  }
  
  /**
   * Sets the last hit zone information for this bullet (for server validation)
   * @param {string} zone - The hit zone ('head', 'body', 'limbs')
   */
  setLastHitZone(zone) {
    this.lastHitZone = zone;
  }
}