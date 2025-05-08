/**
 * Physics system using cannon.js for collision detection and physics simulation.
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
    
    // Tag as ground for quick identification
    groundBody.isGround = true;
    
    this.world.addBody(groundBody);
    this.bodies.push(groundBody);
  }
  
  /**
   * Gets the terrain height at a specific world position
   * @param {number} x - World x coordinate
   * @param {number} z - World z coordinate
   * @returns {number} - Height at that point (0 if terrain not available)
   */
  getTerrainHeightAt(x, z) {
    // If desert terrain is available, use its height
    if (window.desertTerrain) {
      // Use the full terrain height calculation directly for perfect matching
      return window.desertTerrain.getHeightAt(x, z);
    }
    
    // Default height for town area or if terrain not available
    return 0;
  }
  
  /**
   * Create a physics body for a player
   * @param {THREE.Vector3} position - Initial position
   * @param {number} radius - Player collision radius
   * @param {number} height - Player height
   * @returns {CANNON.Body} - The created physics body
   */
  createPlayerBody(position, radius = 0.51, height = 3.06) {
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
   * Enables or disables debug visualization
   * @param {boolean} enabled - Whether debug mode should be enabled
   */
  setDebugMode(enabled) {
    // Store previous debug mode to detect changes
    const previousDebugMode = this.debugMode;
    this.debugMode = enabled;
    
    // If enabling and we weren't previously in debug mode
    if (enabled && !previousDebugMode) {
      // Create meshes for existing physics bodies
      this.bodies.forEach(body => {
        this.createDebugMesh(body);
      });
      
      // Set a global flag to signal hit zone debug should be created
      window.showHitZoneDebug = true;
      
      console.log("Physics debug mode enabled - hit zones visible");
    }
    // If disabling and we were previously in debug mode
    else if (!enabled && previousDebugMode) {
      // Remove all physics debug meshes
      this.debugMeshes.forEach(item => {
        if (item.mesh && window.scene) {
          window.scene.remove(item.mesh);
          item.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          });
        }
      });
      this.debugMeshes = [];
      
      // Remove any hit zone debug visualizations
      this.cleanupHitZoneDebug();
      
      // Clear the global flag for hit zone debugging
      window.showHitZoneDebug = false;
      
      console.log("Physics debug mode disabled - hit zones hidden");
    }
  }
  
  /**
   * Clean up hit zone debug visualizations
   */
  cleanupHitZoneDebug() {
    // Find and remove all hit zone debug objects
    if (window.scene) {
      const hitZoneObjects = [];
      window.scene.traverse(obj => {
        if (obj.name && obj.name.startsWith("hitZoneDebug_")) {
          hitZoneObjects.push(obj);
        }
      });
      
      // Remove each hit zone debug object
      hitZoneObjects.forEach(obj => {
        window.scene.remove(obj);
        // Clean up materials and geometries
        obj.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      });
      
      if (hitZoneObjects.length > 0) {
        console.log(`Removed ${hitZoneObjects.length} hit zone debug visualizations`);
      }
    }
    
    // Clear player hit zone debug references
    // Find all player objects
    if (window.localPlayer) {
      window.localPlayer._hitZoneDebug = null;
    }
    // Remote players
    if (window.remotePlayers) {
      window.remotePlayers.forEach(player => {
        if (player) {
          player._hitZoneDebug = null;
        }
      });
    }
  }
  
  /**
   * Refreshes hit zone debug visualizations when debug mode is active
   */
  refreshHitZoneDebug() {
    console.log("Refreshing hit zone debug visualizations");
    
    // Don't do anything if debug mode isn't enabled
    if (!this.debugMode) return;
    
    // Create debug boxes for all existing player models
    if (window.playersMap) {
      for (const [playerId, playerModel] of window.playersMap.entries()) {
        if (playerModel && typeof playerModel.createHitZoneVisualizers === 'function') {
          // Use the new direct visualization method with forced visibility
          playerModel.createHitZoneVisualizers(true);
        } else {
          console.warn(`Player ${playerId} doesn't support improved hit zones`);
          // We no longer use the old fallback method
        }
      }
    }
    
    // Also check the local player's model if available
    if (window.localPlayer && window.localPlayer.model && 
        typeof window.localPlayer.model.createHitZoneVisualizers === 'function') {
      window.localPlayer.model.createHitZoneVisualizers(true);
    }
    
    // Print debug info to console
    if (typeof window.printHitboxDebugInfo === 'function') {
      window.printHitboxDebugInfo();
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
        if (window.scene) {
          window.scene.remove(item.mesh);
          item.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          });
        }
      });
    }
    
    // Clean up hit zone debug visualizations
    this.cleanupHitZoneDebug();
    
    this.bodies = [];
    this.debugMeshes = [];
  }
  
  /**
   * Updates or creates the terrain collider using heightfield data
   * @param {Array<Array<number>>} heightData - 2D array of height values
   * @param {number} size - Total terrain size
   * @param {number} elementSize - Size of each heightfield element
   */
  updateTerrainCollider(heightData, size, elementSize) {
    console.log(`Creating terrain collider with ${heightData.length}x${heightData[0].length} resolution`);
    
    // Remove existing terrain collider if any
    if (this.terrainBody) {
      this.world.removeBody(this.terrainBody);
      // Find the index in bodies array and remove it
      const index = this.bodies.findIndex(body => body === this.terrainBody);
      if (index !== -1) {
        this.bodies.splice(index, 1);
      }
    }
    
    // Create new heightfield shape
    const terrainShape = new CANNON.Heightfield(heightData, {
      elementSize: elementSize 
    });
    
    // Create terrain body
    this.terrainBody = new CANNON.Body({
      mass: 0, // Static body
      material: this.defaultMaterial
    });
    
    // Add the shape
    this.terrainBody.addShape(terrainShape);
    
    // Position the body - centered at 0,0 but offset by half the height down
    // to align with the visual terrain
    const minHeight = Math.min(...heightData.flat());
    this.terrainBody.position.set(0, minHeight, 0);
    
    // Tag as terrain for identification
    this.terrainBody.isTerrain = true;
    
    // Add to physics world
    this.world.addBody(this.terrainBody);
    this.bodies.push(this.terrainBody);
    
    console.log("Terrain collider created successfully");
  }
}