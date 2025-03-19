import { createImpactEffect } from './effects.js';

/**
 * A simple bullet that checks collisions by seeing if its end position
 * is inside bounding boxes (NPC or players).
 */
export class Bullet {
  constructor(position, direction) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xB8860B })
    );
    this.mesh.position.copy(position);

    this.direction = direction.clone();
    this.speed = 80; // speed units/second
    this.distanceTraveled = 0;
    this.maxDistance = 100;

    // Remember previous position for some rough continuous detection
    this.lastPosition = position.clone();

    // Track which player fired this bullet
    this.sourcePlayerId = null;
  }

  /**
   * Sets the player ID that fired this bullet.
   * @param {string|number} playerId - The ID of the player who fired the bullet.
   */
  setSourcePlayer(playerId) {
    this.sourcePlayerId = playerId;
  }

  /**
   * Updates the bullet's movement & handles collisions with NPC or players.
   * Uses a simpler .containsPoint() approach so it won't throw an error on r128.
   * @param {number} deltaTime
   * @param {THREE.Group} npc
   * @param {THREE.Scene} scene
   * @param {Map<number, object>} allPlayers - Map of local + remote players.
   */
  update(deltaTime, npc, scene, allPlayers) {
    // Move the bullet
    const displacement = this.direction.clone().multiplyScalar(this.speed * deltaTime);
    this.mesh.position.add(displacement);
    this.distanceTraveled += displacement.length();

    // Current bullet position
    const endPos = this.mesh.position.clone();

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
        // Skip bullet’s owner by converting both IDs to numbers
        if (Number(playerId) === Number(this.sourcePlayerId)) continue;
        if (!playerObj || !playerObj.group) continue;

        // Get player's base position for collision box.
        // For local players (first-person), group.position is at eye-level so subtract 1.6.
        // Remote players (third-person) have group.position at the base.
        const playerPos = playerObj.group.position.clone();
        let baseY = playerPos.y;
        if (playerObj.camera) { // local player
          baseY = playerPos.y - 1.6;
        }
        const boxMin = new THREE.Vector3(
          playerPos.x - 0.5,
          baseY,
          playerPos.z - 0.5
        );
        const boxMax = new THREE.Vector3(
          playerPos.x + 0.5,
          baseY + 2.0,
          playerPos.z + 0.5
        );
        const playerBox = new THREE.Box3(boxMin, boxMax);
        if (playerBox.containsPoint(endPos)) {
          createImpactEffect(endPos, this.direction, scene, 'player');
          // Notify server we hit this player
          if (window.networkManager) {
            window.networkManager.sendPlayerHit(playerId, {
              position: { x: endPos.x, y: endPos.y, z: endPos.z },
              sourcePlayerId: this.sourcePlayerId
            });
          }
          return { active: false, hit: { type: 'player', playerId } };
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
}
