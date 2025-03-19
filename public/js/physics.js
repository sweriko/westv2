/**
 * Physics module that handles Cannon.js physics simulation
 * Used to create invisible boundaries and physics collisions
 */
export class PhysicsWorld {
    constructor() {
      // Create a new physics world with gravity
      this.world = new CANNON.World();
      this.world.gravity.set(0, -9.82, 0); // Earth gravity
      this.world.broadphase = new CANNON.NaiveBroadphase();
      this.world.solver.iterations = 10;
      
      // Store all physics bodies for collision detection
      this.bodies = [];
      this.quickDrawBoundaryBodies = [];
      
      // Collision groups
      this.COLLISION_GROUPS = {
        PLAYER: 1,
        BULLET: 2,
        ARENA_BOUNDARY: 4,
        GROUND: 8
      };
      
      // Initialize the ground
      this.initGround();
    }
    
    /**
     * Initialize the ground plane
     */
    initGround() {
      const groundShape = new CANNON.Plane();
      const groundBody = new CANNON.Body({
        mass: 0, // static body
        shape: groundShape,
        collisionFilterGroup: this.COLLISION_GROUPS.GROUND,
        collisionFilterMask: this.COLLISION_GROUPS.PLAYER | this.COLLISION_GROUPS.BULLET
      });
      groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2); // rotate to be horizontal
      this.world.addBody(groundBody);
      this.bodies.push(groundBody);
    }
    
    /**
     * Create invisible boundary walls for the QuickDraw arena
     * @param {THREE.Vector3} center - Center position of the arena
     * @param {number} radius - Radius of the arena
     * @param {number} height - Height of the boundary walls
     */
    createQuickDrawBoundary(center, radius, height) {
      // Clear any existing boundary bodies
      this.quickDrawBoundaryBodies.forEach(body => {
        this.world.removeBody(body);
        const index = this.bodies.indexOf(body);
        if (index !== -1) {
          this.bodies.splice(index, 1);
        }
      });
      this.quickDrawBoundaryBodies = [];
      
      // Create a cylinder boundary using multiple box segments
      const segments = 16;
      for (let i = 0; i < segments; i++) {
        const angle1 = (i / segments) * Math.PI * 2;
        const angle2 = ((i + 1) / segments) * Math.PI * 2;
        
        const x1 = center.x + Math.cos(angle1) * radius;
        const z1 = center.z + Math.sin(angle1) * radius;
        const x2 = center.x + Math.cos(angle2) * radius;
        const z2 = center.z + Math.sin(angle2) * radius;
        
        // Calculate the length and position of the wall segment
        const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
        const posX = (x1 + x2) / 2;
        const posZ = (z1 + z2) / 2;
        
        // Create a box shape for the wall segment
        const wallShape = new CANNON.Box(new CANNON.Vec3(length / 2, height / 2, 0.1));
        const wallBody = new CANNON.Body({
          mass: 0, // static body
          position: new CANNON.Vec3(posX, height / 2, posZ),
          shape: wallShape,
          collisionFilterGroup: this.COLLISION_GROUPS.ARENA_BOUNDARY,
          collisionFilterMask: this.COLLISION_GROUPS.PLAYER | this.COLLISION_GROUPS.BULLET
        });
        
        // Rotate the wall to face the center
        const lookAtPos = new CANNON.Vec3(center.x, height / 2, center.z);
        const direction = new CANNON.Vec3().copy(lookAtPos).vsub(wallBody.position).unit();
        const up = new CANNON.Vec3(0, 1, 0);
        const right = new CANNON.Vec3().copy(direction).cross(up);
        
        // Create rotation quaternion
        const rotation = new CANNON.Quaternion();
        rotation.setFromVectors(new CANNON.Vec3(0, 0, 1), direction);
        wallBody.quaternion = rotation;
        
        this.world.addBody(wallBody);
        this.bodies.push(wallBody);
        this.quickDrawBoundaryBodies.push(wallBody);
      }
      
      // Create a "roof" to prevent players from jumping over the boundary
      const roofShape = new CANNON.Cylinder(radius, radius, 0.1, segments);
      const roofBody = new CANNON.Body({
        mass: 0,
        position: new CANNON.Vec3(center.x, height, center.z),
        shape: roofShape,
        collisionFilterGroup: this.COLLISION_GROUPS.ARENA_BOUNDARY,
        collisionFilterMask: this.COLLISION_GROUPS.PLAYER | this.COLLISION_GROUPS.BULLET
      });
      // Rotate cylinder to be horizontal
      roofBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
      
      this.world.addBody(roofBody);
      this.bodies.push(roofBody);
      this.quickDrawBoundaryBodies.push(roofBody);
      
      console.log(`Created Quick Draw boundary at ${center.x}, ${center.z} with radius ${radius} and height ${height}`);
    }
    
    /**
     * Create a player physics body
     * @param {number} playerId - The player's ID
     * @param {THREE.Vector3} position - Initial position
     * @returns {CANNON.Body} - The created physics body
     */
    createPlayerBody(playerId, position) {
      const playerShape = new CANNON.Box(new CANNON.Vec3(0.3, 0.9, 0.3)); // slightly smaller than visual model
      const playerBody = new CANNON.Body({
        mass: 70, // average human mass in kg
        position: new CANNON.Vec3(position.x, position.y, position.z),
        shape: playerShape,
        linearDamping: 0.9,
        angularDamping: 0.9,
        collisionFilterGroup: this.COLLISION_GROUPS.PLAYER,
        collisionFilterMask: this.COLLISION_GROUPS.ARENA_BOUNDARY | this.COLLISION_GROUPS.GROUND
      });
      playerBody.userData = { type: 'player', id: playerId };
      
      this.world.addBody(playerBody);
      this.bodies.push(playerBody);
      
      return playerBody;
    }
    
    /**
     * Create a bullet physics body
     * @param {THREE.Vector3} position - Initial position
     * @param {THREE.Vector3} direction - Direction vector
     * @param {number} sourcePlayerId - ID of player who fired
     * @returns {CANNON.Body} - The created physics body
     */
    createBulletBody(position, direction, sourcePlayerId) {
      const bulletShape = new CANNON.Sphere(0.02); // match visual bullet size
      const bulletBody = new CANNON.Body({
        mass: 0.05, // very light
        position: new CANNON.Vec3(position.x, position.y, position.z),
        shape: bulletShape,
        collisionFilterGroup: this.COLLISION_GROUPS.BULLET,
        collisionFilterMask: this.COLLISION_GROUPS.ARENA_BOUNDARY | this.COLLISION_GROUPS.GROUND
      });
      bulletBody.userData = { 
        type: 'bullet', 
        sourcePlayerId, 
        createdAt: Date.now() 
      };
      
      // Set initial velocity based on direction and speed
      const speed = 80; // match visual bullet speed
      bulletBody.velocity.set(
        direction.x * speed,
        direction.y * speed,
        direction.z * speed
      );
      
      this.world.addBody(bulletBody);
      this.bodies.push(bulletBody);
      
      return bulletBody;
    }
    
    /**
     * Check if a point is inside the QuickDraw arena boundary
     * @param {THREE.Vector3} point - The point to check
     * @returns {boolean} - True if the point is inside the arena
     */
    isPointInArena(center, radius, point) {
      const dx = point.x - center.x;
      const dz = point.z - center.z;
      const distanceFromCenter = Math.sqrt(dx * dx + dz * dz);
      
      return distanceFromCenter <= radius;
    }
    
    /**
     * Remove a body from the physics world
     * @param {CANNON.Body} body - The body to remove
     */
    removeBody(body) {
      this.world.removeBody(body);
      const index = this.bodies.indexOf(body);
      if (index !== -1) {
        this.bodies.splice(index, 1);
      }
    }
    
    /**
     * Update the physics simulation
     * @param {number} deltaTime - Time step in seconds
     */
    update(deltaTime) {
      // Cap delta time to avoid large time steps which can cause instability
      const maxDeltaTime = 1 / 30; // 30fps minimum
      const timeStep = Math.min(deltaTime, maxDeltaTime);
      
      // Step the physics simulation
      this.world.step(timeStep);
      
      // Clean up old bullets (after 5 seconds)
      const currentTime = Date.now();
      for (let i = this.bodies.length - 1; i >= 0; i--) {
        const body = this.bodies[i];
        if (body.userData && body.userData.type === 'bullet') {
          if (currentTime - body.userData.createdAt > 5000) {
            this.removeBody(body);
          }
        }
      }
    }
    
    /**
     * Update a player's physics body position
     * @param {CANNON.Body} body - The player's physics body
     * @param {THREE.Vector3} position - New position
     */
    updatePlayerPosition(body, position) {
      body.position.set(position.x, position.y, position.z);
      body.wakeUp(); // Ensure the body is active
    }
  }