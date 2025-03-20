/**
 * Physics system using cannon.js for collision detection and physics simulation.
 * Focused on creating invisible boundaries for the QuickDraw arena.
 */
export class PhysicsSystem {
    constructor() {
      // Create a physics world with gravity
      this.world = new CANNON.World();
      this.world.gravity.set(0, -9.8, 0);
      
      // Set default contact material properties
      this.defaultMaterial = new CANNON.Material('default');
      const defaultContactMaterial = new CANNON.ContactMaterial(
        this.defaultMaterial,
        this.defaultMaterial,
        {
          friction: 0.3,
          restitution: 0.3 // Slightly bouncy
        }
      );
      this.world.addContactMaterial(defaultContactMaterial);
      this.world.defaultContactMaterial = defaultContactMaterial;
      
      // Collection of bodies
      this.bodies = [];
      
      // Debug helper for visualizing physics bodies
      this.debugMeshes = [];
      this.debugMode = false;
      
      // Initialize ground
      this.initGround();
    }
    
    /**
     * Initialize the ground plane
     */
    initGround() {
      const groundBody = new CANNON.Body({
        mass: 0, // Static body
        shape: new CANNON.Plane(),
        material: this.defaultMaterial
      });
      groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2); // Rotate to be flat
      this.world.addBody(groundBody);
      this.bodies.push(groundBody);
    }
    
    /**
     * Creates an invisible cylindrical boundary for the QuickDraw arena
     * @param {THREE.Vector3} center - Center position of the arena
     * @param {number} radius - Radius of the cylindrical arena
     * @param {number} height - Height of the cylindrical arena
     */
    createQuickDrawArenaBoundary(center, radius, height) {
      // First remove any existing arena boundaries
      this.removeQuickDrawArenaBoundary();
      
      // Create a physics body for the arena boundary
      const arenaBody = new CANNON.Body({
        mass: 0, // Static body
        material: this.defaultMaterial
      });
      
      // Position at the center
      arenaBody.position.set(center.x, center.y + height/2, center.z);
      
      // Add a cylindrical shape for the arena
      // Use a hollow cylinder (cylinder + inverted cylinder)
      // We make the walls a bit thick (0.5 units) to ensure reliable collision detection
      const wallThickness = 0.5;
      
      // Outer cylinder (pushing inward)
      const outerRadius = radius + wallThickness;
      const segments = 16; // Number of sides for the cylinder approximation
      
      // Create segments around the circle to approximate the cylinder
      for (let i = 0; i < segments; i++) {
        const angle1 = (i / segments) * Math.PI * 2;
        const angle2 = ((i + 1) / segments) * Math.PI * 2;
        
        const x1 = Math.cos(angle1) * radius;
        const z1 = Math.sin(angle1) * radius;
        const x2 = Math.cos(angle2) * radius;
        const z2 = Math.sin(angle2) * radius;
        
        // Calculate the position and orientation of this wall segment
        const segCenter = {
          x: (x1 + x2) / 2,
          z: (z1 + z2) / 2
        };
        
        const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
        
        // Create a box shape for this wall segment
        const halfExtents = new CANNON.Vec3(length/2, height/2, wallThickness/2);
        const wallShape = new CANNON.Box(halfExtents);
        
        // Get the angle to rotate this wall segment
        const rotationY = Math.atan2(z2 - z1, x2 - x1) + Math.PI/2;
        
        // Add the shape to the body with the appropriate offset and rotation
        const offset = new CANNON.Vec3(segCenter.x, 0, segCenter.z);
        const quaternion = new CANNON.Quaternion();
        quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotationY);
        
        arenaBody.addShape(wallShape, offset, quaternion);
      }
      
      // Bottom circle to prevent falling through
      const bottomShape = new CANNON.Cylinder(radius, radius, wallThickness, segments);
      const bottomOffset = new CANNON.Vec3(0, -height/2, 0);
      const bottomQuaternion = new CANNON.Quaternion();
      bottomQuaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
      arenaBody.addShape(bottomShape, bottomOffset, bottomQuaternion);
      
      arenaBody.arenaBoundary = true; // Tag this body as an arena boundary
      arenaBody.collisionFilterGroup = 2; // Group 2 for arena boundaries
      
      // Add the arena body to the world
      this.world.addBody(arenaBody);
      this.bodies.push(arenaBody);
      
      // Create a reference to easily find this body later
      this.arenaBoundaryBody = arenaBody;
      
      // If debug mode is enabled, create a visual representation
      if (this.debugMode) {
        this.createDebugMesh(arenaBody);
      }
      
      console.log("Created QuickDraw arena boundary at", center, "with radius", radius, "and height", height);
      
      return arenaBody;
    }
    
    /**
     * Removes the QuickDraw arena boundary if it exists
     */
    removeQuickDrawArenaBoundary() {
      if (this.arenaBoundaryBody) {
        this.world.removeBody(this.arenaBoundaryBody);
        
        // Remove from our bodies array
        const index = this.bodies.indexOf(this.arenaBoundaryBody);
        if (index !== -1) {
          this.bodies.splice(index, 1);
        }
        
        // Clear the reference
        this.arenaBoundaryBody = null;
        console.log("Removed QuickDraw arena boundary");
      }
    }
    
    /**
     * Create a physics body for a player
     * @param {THREE.Vector3} position - Initial position
     * @param {number} radius - Player collision radius
     * @param {number} height - Player height
     * @returns {CANNON.Body} - The created physics body
     */
    createPlayerBody(position, radius = 0.3, height = 1.8) {
      // Create a capsule shape (cylinder with spheres at ends)
      const playerBody = new CANNON.Body({
        mass: 70, // Player mass in kg
        material: this.defaultMaterial,
        fixedRotation: true, // Don't rotate the player when colliding
        linearDamping: 0.9 // Add some damping to prevent excessive sliding
      });
      
      // Use a cylinder for the body
      playerBody.addShape(new CANNON.Cylinder(radius, radius, height, 8));
      
      // Position the player body
      playerBody.position.set(position.x, position.y, position.z);
      
      // Add to world
      this.world.addBody(playerBody);
      this.bodies.push(playerBody);
      
      // If debug mode is enabled, create a visual representation
      if (this.debugMode) {
        this.createDebugMesh(playerBody);
      }
      
      return playerBody;
    }
    
    /**
     * Creates a debug mesh to visualize a physics body
     * @param {CANNON.Body} body - The physics body to visualize
     */
    createDebugMesh(body) {
      // Only used in debug mode
      if (!this.debugMode) return;
      
      // For each shape in the body, create a wireframe mesh
      body.shapes.forEach((shape, i) => {
        let geometry;
        let mesh;
        
        // Get the shape's offset and orientation
        const offset = body.shapeOffsets[i];
        const orientation = body.shapeOrientations[i];
        
        // Create different geometries based on shape type
        if (shape instanceof CANNON.Box) {
          geometry = new THREE.BoxGeometry(
            shape.halfExtents.x * 2,
            shape.halfExtents.y * 2,
            shape.halfExtents.z * 2
          );
          
          mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({
              color: 0x00ff00,
              wireframe: true
            })
          );
          
          // Apply offset and orientation
          mesh.position.set(offset.x, offset.y, offset.z);
          mesh.quaternion.set(
            orientation.x,
            orientation.y,
            orientation.z,
            orientation.w
          );
        }
        else if (shape instanceof CANNON.Sphere) {
          geometry = new THREE.SphereGeometry(shape.radius, 16, 16);
          
          mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({
              color: 0x00ff00,
              wireframe: true
            })
          );
          
          // Apply offset
          mesh.position.set(offset.x, offset.y, offset.z);
        }
        else if (shape instanceof CANNON.Cylinder) {
          geometry = new THREE.CylinderGeometry(
            shape.radiusTop,
            shape.radiusBottom,
            shape.height,
            shape.numSegments
          );
          
          mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({
              color: 0x00ff00,
              wireframe: true
            })
          );
          
          // Rotate to match cannon.js cylinders
          mesh.rotation.x = Math.PI / 2;
          
          // Apply offset and orientation
          mesh.position.set(offset.x, offset.y, offset.z);
          const quat = new THREE.Quaternion(
            orientation.x,
            orientation.y,
            orientation.z,
            orientation.w
          );
          mesh.quaternion.multiply(quat);
        }
        
        if (mesh) {
          // Add to the body's group
          const group = new THREE.Group();
          group.add(mesh);
          
          // Store reference for updating
          this.debugMeshes.push({
            mesh: group,
            body: body
          });
          
          // Add to scene
          window.scene.add(group);
        }
      });
    }
    
    /**
     * Update the physics world
     * @param {number} deltaTime - Time step in seconds
     */
    update(deltaTime) {
      // Limit delta time to prevent large jumps
      const timeStep = Math.min(deltaTime, 0.1);
      
      // Update physics world
      this.world.step(timeStep);
      
      // Update debug meshes if in debug mode
      if (this.debugMode) {
        this.updateDebugMeshes();
      }
    }
    
    /**
     * Update debug mesh positions to match their physics bodies
     */
    updateDebugMeshes() {
      if (!this.debugMode) return;
      
      this.debugMeshes.forEach(item => {
        // Update position
        item.mesh.position.set(
          item.body.position.x,
          item.body.position.y,
          item.body.position.z
        );
        
        // Update orientation
        item.mesh.quaternion.set(
          item.body.quaternion.x,
          item.body.quaternion.y,
          item.body.quaternion.z,
          item.body.quaternion.w
        );
      });
    }
    
    /**
     * Checks if a point is inside the arena boundary
     * @param {THREE.Vector3} point - The point to check
     * @returns {boolean} - True if inside, false if outside
     */
    isPointInArenaBoundary(point) {
      // If no arena boundary exists, return false
      if (!this.arenaBoundaryBody) return false;
      
      // Get arena position and create a CANNON vector for the point
      const arenaPos = this.arenaBoundaryBody.position;
      const pointVec = new CANNON.Vec3(point.x, point.y, point.z);
      
      // Calculate horizontal distance (ignoring Y) from arena center
      const dx = pointVec.x - arenaPos.x;
      const dz = pointVec.z - arenaPos.z;
      const horizontalDist = Math.sqrt(dx * dx + dz * dz);
      
      // Get the radius from the first shape (assuming it's a cylinder or shape with radius property)
      const radius = 15; // Default from QuickDraw.js
      
      // Check if point is inside the cylinder horizontally and vertically
      return horizontalDist < radius;
    }
    
    /**
     * Enables or disables debug visualization
     * @param {boolean} enabled - Whether debug mode should be enabled
     */
    setDebugMode(enabled) {
      this.debugMode = enabled;
      
      // If enabling, create meshes for existing bodies
      if (enabled) {
        this.bodies.forEach(body => {
          this.createDebugMesh(body);
        });
      }
      // If disabling, remove all debug meshes
      else {
        this.debugMeshes.forEach(item => {
          window.scene.remove(item.mesh);
          item.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          });
        });
        this.debugMeshes = [];
      }
    }
    
    /**
     * Cleans up all physics resources
     */
    cleanup() {
      // Remove all bodies
      this.bodies.forEach(body => {
        this.world.removeBody(body);
      });
      
      // Remove all debug meshes
      if (this.debugMode) {
        this.debugMeshes.forEach(item => {
          window.scene.remove(item.mesh);
          item.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          });
        });
      }
      
      this.bodies = [];
      this.debugMeshes = [];
    }
  }