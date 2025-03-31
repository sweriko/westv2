/**
 * FlyingEagle class - Loads and manages the eagle model that follows a circular path
 * with camera attached for POV view
 */
export class FlyingEagle {
  /**
   * @param {Object} config
   * @param {THREE.Scene} config.scene - The scene to add the eagle to
   * @param {THREE.Camera} config.camera - The camera to attach to the eagle
   */
  constructor({ scene, camera }) {
    this.scene = scene;
    this.camera = camera;
    this.model = null;
    this.animationMixer = null;
    this.animations = {};

    // Create a group to hold the eagle
    this.group = new THREE.Group();
    
    // Add to scene
    scene.add(this.group);
    
    // Create a camera target point slightly ahead of the eagle
    this.lookAhead = new THREE.Object3D();
    this.group.add(this.lookAhead);
    this.lookAhead.position.set(0, 0, -10); // 10 units ahead of eagle
    
    // Load the eagle model
    this.loadEagleModel();
    
    // Flight path parameters
    this.center = new THREE.Vector3(0, 0, 0); // Will be set to duel center
    this.radius = 20; // Radius of circular flight path
    this.height = 10; // Height above the ground
    this.currentAngle = 0; // Current angle in the circle
    this.flightSpeed = 0.3; // Speed of circular flight
    
    // Flag for tracking if the model is loaded
    this.isLoaded = false;
    
    // Flag to indicate if we're in aerial camera mode
    this.aerialCameraActive = false;

    // Set a default town center position
    this.townCenter = new THREE.Vector3(0, 0, 0);
    
    // Initialize the eagle with a default flight path
    this.setDefaultFlightPath();
    
    // Flag to indicate if we're in a quickdraw match
    this.inQuickdraw = false;
  }

  /**
   * Sets a default circular flight path above the town center
   */
  setDefaultFlightPath() {
    // Default town center coordinates - should be updated once we have actual town data
    this.townCenter = new THREE.Vector3(0, 0, 0);
    const defaultHeight = 25; // Higher altitude when patrolling
    const defaultRadius = 40; // Wider circle when patrolling
    
    this.setCircularFlightPath(this.townCenter, defaultHeight, defaultRadius);
    console.log('Eagle default flight path set');
  }

  /**
   * Loads the eagle model and animations
   */
  loadEagleModel() {
    const loader = new THREE.GLTFLoader();
    
    loader.load('models/eagle.glb', 
      // Success callback
      (gltf) => {
        this.model = gltf.scene;
        
        // Position at origin
        this.model.position.set(0, 0, 0);
        
        // Add the model to the group
        this.group.add(this.model);
        
        // Setup shadows and materials
        this.model.traverse(child => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Ensure materials are set up correctly
            if (child.material) {
              if (child.isSkinnedMesh) {
                child.material.skinning = true;
              }
              child.material.needsUpdate = true;
            }
          }
        });
        
        // Set up animations if they exist
        if (gltf.animations && gltf.animations.length > 0) {
          this.setupAnimations(gltf.animations);
        }
        
        // Create camera mount point at the eagle's head
        this.createCameraMount();
        
        console.log('Eagle model loaded successfully');
        this.isLoaded = true;
      }, 
      // Progress callback - silent
      undefined,
      // Error callback
      (error) => {
        console.error('Error loading eagle.glb model:', error);
      }
    );
  }

  /**
   * Creates a mount point for the camera at the eagle's head
   */
  createCameraMount() {
    // Create a mount point that's attached to the group, not the model
    // This prevents it from inheriting the up/down motion of wing flapping
    this.cameraMount = new THREE.Object3D();
    this.group.add(this.cameraMount);
    
    // Position the camera mount at an offset angle from the eagle
    // This gives a view from outside showing the bird at an angle
    this.cameraMount.position.set(3, 2, -2); // Right, up, and slightly behind
    
    // Rotate to face the eagle at an angle
    this.cameraMount.lookAt(0, 0, 0); // Look at the center of the group
  }

  /**
   * Sets up animations from the loaded model
   * @param {Array} animations - The animations from the GLB file
   */
  setupAnimations(animations) {
    if (!animations || animations.length === 0) {
      console.warn('No animations found in eagle model');
      return;
    }
    
    // Create animation mixer
    this.animationMixer = new THREE.AnimationMixer(this.model);
    
    // Store animations and start playing flycycle
    animations.forEach(animation => {
      this.animations[animation.name] = this.animationMixer.clipAction(animation);
      
      // If this is the flycycle animation, play it on loop
      if (animation.name === 'flycycle') {
        console.log('Found flycycle animation, playing on loop');
        this.animations[animation.name].setLoop(THREE.LoopRepeat);
        this.animations[animation.name].play();
      }
    });
    
    if (!this.animations['flycycle']) {
      console.warn('Flycycle animation not found in eagle model');
    }
  }

  /**
   * Sets target position for circular flight
   * @param {THREE.Vector3} centerPos - Center position to circle around
   * @param {number} height - Height above the ground
   * @param {number} radius - Radius of the circle
   */
  setCircularFlightPath(centerPos, height = 10, radius = 20) {
    this.center = centerPos.clone();
    this.height = height;
    this.radius = radius;
    
    // Position immediately on the circle
    this.updateCircularPosition();
    
    console.log(`Eagle circular flight path set around ${centerPos.x.toFixed(1)}, ${centerPos.y.toFixed(1)}, ${centerPos.z.toFixed(1)}`);
  }

  /**
   * Switch to quickdraw mode with closer flight path to players
   * @param {THREE.Vector3} duelCenter - Center position between the two players
   * @param {number} distanceBetweenPlayers - Distance between the two dueling players
   */
  setQuickdrawFlightPath(duelCenter, distanceBetweenPlayers) {
    this.inQuickdraw = true;
    
    // Save the duel center
    this.duelCenter = duelCenter.clone();
    
    // Calculate a closer flight radius based on player distance
    const closeRadius = Math.max(12, distanceBetweenPlayers * 0.9); // Closer to players during duel
    const closeHeight = 15; // Lower during duel for better visibility
    
    // Set a tighter circular path around the duel
    this.setCircularFlightPath(duelCenter, closeHeight, closeRadius);
    
    console.log(`Eagle quickdraw flight path set - radius: ${closeRadius.toFixed(1)}, height: ${closeHeight.toFixed(1)}`);
  }
  
  /**
   * Return to normal patrol mode after quickdraw is over
   */
  returnToDefaultPath() {
    this.inQuickdraw = false;
    this.setDefaultFlightPath();
  }

  /**
   * Updates the eagle's position on its circular path
   */
  updateCircularPosition() {
    // Calculate new position on the circle
    const x = this.center.x + Math.cos(this.currentAngle) * this.radius;
    const z = this.center.z + Math.sin(this.currentAngle) * this.radius;
    
    // Set eagle position
    this.group.position.set(x, this.center.y + this.height, z);
    
    // Calculate forward direction (tangent to circle)
    const forwardDirection = new THREE.Vector3(
      -Math.sin(this.currentAngle),
      0,
      Math.cos(this.currentAngle)
    ).normalize();
    
    // Make the eagle always face tangent to the circle (direction of movement)
    const lookAtPoint = new THREE.Vector3(
      x + forwardDirection.x * 10,
      this.center.y + this.height,
      z + forwardDirection.z * 10
    );
    
    this.group.lookAt(lookAtPoint);
    
    // Apply a slight bank toward the center of the circle
    const bankAngle = 0.2; // Radians - a slight bank
    this.group.rotateZ(bankAngle);
    
    // Update the camera orientation to always look at the eagle at a constant angle
    // This step is key to maintaining the stable camera view
    if (this.cameraMount) {
      // We don't need to do anything here since the camera mount is already
      // attached to the group with fixed position relative to the eagle
      // This ensures the camera doesn't move with the bird's flapping animation
    }
  }

  /**
   * Activates aerial camera mode, attaching camera to the eagle
   */
  activateAerialCamera() {
    if (!this.isLoaded) return;
    
    // Enable letterbox effect for cinematic view
    document.body.classList.add('letterbox-active');
    
    // Ensure the camera is properly parented to the mount
    if (this.camera.parent) {
      this.camera.parent.remove(this.camera);
    }
    
    // Add camera to the mount point
    if (this.cameraMount) {
      this.cameraMount.add(this.camera);
      // Reset camera position relative to mount
      this.camera.position.set(0, 0, 0);
      this.camera.rotation.set(0, 0, 0);
      
      // Ensure camera looks at the eagle
      this.camera.lookAt(0, 0, 0);
    } else {
      console.error('Camera mount not available');
    }
    
    this.aerialCameraActive = true;
    console.log('Eagle angled camera activated with letterbox effect');
  }

  /**
   * Deactivates aerial camera mode, detaching camera from eagle
   */
  deactivateAerialCamera() {
    // Remove letterbox effect
    document.body.classList.remove('letterbox-active');
    
    if (this.camera.parent === this.cameraMount || 
        this.camera.parent === this.model) {
      this.camera.parent.remove(this.camera);
    }
    
    this.aerialCameraActive = false;
    console.log('Eagle POV camera deactivated');
  }

  /**
   * Updates the eagle's position and animations
   * @param {number} deltaTime - Time elapsed since last frame in seconds
   */
  update(deltaTime) {
    if (!this.isLoaded) return;
    
    // Always update position - eagle always flies regardless of camera state
    this.currentAngle += this.flightSpeed * deltaTime;
    
    // Update position on the circle
    this.updateCircularPosition();
    
    // Update animations
    if (this.animationMixer) {
      this.animationMixer.update(deltaTime);
    }
  }
} 