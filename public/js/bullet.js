import { createImpactEffect } from './effects.js';

export class Bullet {
  constructor(position, direction) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xB8860B })
    );
    this.mesh.position.copy(position);
    this.direction = direction.clone();
    this.speed = 80; // Speed of the bullet
    this.distanceTraveled = 0;
    this.maxDistance = 100;
  }
  
  /**
   * Updates the bullet's position and checks for collisions.
   * Calls impact effects when colliding with the NPC or ground.
   * @param {number} deltaTime - Time elapsed since the last frame.
   * @param {THREE.Group} npc - The NPC target (if any).
   * @param {THREE.Scene} scene - The scene to add impact effects.
   * @returns {boolean} - Whether the bullet should remain active.
   */
  update(deltaTime, npc, scene) {
    const displacement = this.direction.clone().multiplyScalar(this.speed * deltaTime);
    this.mesh.position.add(displacement);
    this.distanceTraveled += displacement.length();
    
    // Check collision with NPC target
    if (npc) {
      const npcCenterPos = new THREE.Vector3(
        npc.position.x,
        npc.position.y + 1.0, // Approximate center of the NPC
        npc.position.z
      );
      const distanceToNPC = this.mesh.position.distanceTo(npcCenterPos);
      if (distanceToNPC < 0.7) { // Collision radius
        createImpactEffect(this.mesh.position, this.direction, scene);
        return false; // Bullet should be destroyed on impact
      }
    }
    
    // Check collision with ground (assuming ground level at y=0)
    if (this.mesh.position.y <= 0.1) {
      createImpactEffect(this.mesh.position, this.direction, scene);
      return false; // Bullet is removed after hitting the ground
    }
    
    return this.distanceTraveled < this.maxDistance;
  }
}
