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
    
    // Reusable objects for calculations to avoid creating new objects each frame
    this._tmpVec3 = new THREE.Vector3();
    this._lookAtPoint = new THREE.Vector3();
    this._forwardDir = new THREE.Vector3();
    
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

    // Hitbox and state
    this.hitbox = new THREE.Sphere(this.group.position.clone(), 2.0); // Generous hitbox radius
    this.isHit = false;
    this.hitTime = 0;
    this.fallSpeed = 0;
    this.rotationSpeed = 0;
    this.groundTime = 0;
    this.sinkTime = 0;
    this.isSinking = false;
    this.originalHeight = 0;
    this.originalRotation = new THREE.Euler();
    
    // Add random rotation parameters
    this.tumbleSpeeds = {
      x: 0,
      y: 0,
      z: 0
    };
    this.tumbleAcceleration = {
      x: 0,
      y: 0,
      z: 0
    };
    this.lastTumbleUpdate = 0;
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
    
    // Calculate flight radius based on player distance
    // Adjusted for more balanced view with reduced player distance
    const flightRadius = Math.max(25, distanceBetweenPlayers * 1.2); // Reduced from 40 to 25 minimum and multiplier from 2.5 to 1.2
    const flightHeight = 18; // Reduced from 25 to 18
    
    // Set a slower flight speed for QuickDraw aerial view
    this.flightSpeed = 0.15; // Reduced from 0.3 to 0.15 for slower circling
    
    // Set the circular path around the duel
    this.setCircularFlightPath(duelCenter, flightHeight, flightRadius);
    
    console.log(`Eagle quickdraw flight path set - radius: ${flightRadius.toFixed(1)}, height: ${flightHeight.toFixed(1)}, speed: ${this.flightSpeed}`);
  }
  
  /**
   * Return to default flight path (after quickdraw)
   */
  returnToDefaultPath() {
    this.inQuickdraw = false;
    
    // Reset to default flight speed
    this.flightSpeed = 0.3;
    
    // Reset to default flight path
    this.setDefaultFlightPath();
    
    console.log('Eagle returned to default flight path');
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
    this._forwardDir.set(
      -Math.sin(this.currentAngle),
      0,
      Math.cos(this.currentAngle)
    ).normalize();
    
    // Make the eagle always face tangent to the circle (direction of movement)
    this._lookAtPoint.set(
      x + this._forwardDir.x * 10,
      this.center.y + this.height,
      z + this._forwardDir.z * 10
    );
    
    this.group.lookAt(this._lookAtPoint);
    
    // Apply a slight bank toward the center of the circle
    const bankAngle = 0.2; // Radians - a slight bank
    this.group.rotateZ(bankAngle);
    
    // Update the camera orientation to always look at the duel center
    if (this.cameraMount && this.inQuickdraw && this.duelCenter) {
      // Make the camera always point at the duel center
      this.cameraMount.lookAt(this.duelCenter);
    }
  }

  /**
   * Activates aerial camera mode, attaching camera to the eagle
   */
  activateAerialCamera() {
    if (!this.isLoaded) return;
    
    // Enable letterbox effect for cinematic view, but only on desktop
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (!isMobile) {
      document.body.classList.add('letterbox-active');
    }
    
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
   * Handles collision with a bullet
   * @returns {boolean} True if hit was successful
   */
  hit() {
    if (!this.isLoaded || this.isHit) return false;
    
    this.isHit = true;
    this.hitTime = performance.now() / 1000.0;
    this.fallSpeed = 0;
    
    // Use a single random call and derive values (more efficient)
    const randomValues = [
      Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5,
      Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
    ];
    
    // Initialize random tumble speeds with higher values for more dramatic effect
    this.tumbleSpeeds = {
      x: randomValues[0] * 8, 
      y: randomValues[1] * 8,
      z: randomValues[2] * 8
    };
    
    // Initialize random tumble accelerations with higher values
    this.tumbleAcceleration = {
      x: randomValues[3] * 4,
      y: randomValues[4] * 4,
      z: randomValues[5] * 4
    };
    
    this.lastTumbleUpdate = this.hitTime;
    this.originalHeight = this.group.position.y;
    this.originalRotation.copy(this.group.rotation);
    
    // Stop the fly animation if it exists
    if (this.animations['flycycle']) {
      this.animations['flycycle'].stop();
    }
    
    // Play eagle hit sound
    if (window.soundManager) {
      window.soundManager.playSound('eaglehit', 0, 1.0);
    } else if (window.localPlayer && window.localPlayer.soundManager) {
      window.localPlayer.soundManager.playSoundAt(
        'eaglehit',
        this.group.position,
        0,
        0.8 + Math.random() * 0.4,
        false,
        true
      );
    }
    
    return true;
  }

  /**
   * Updates the eagle's position and animations
   * @param {number} deltaTime - Time elapsed since last frame in seconds
   */
  update(deltaTime) {
    if (!this.isLoaded) return;
    
    // Update hitbox position
    this.hitbox.center.copy(this.group.position);
    
    // Handle normal eagle logic when not hit
    if (!this.isHit) {
      // Always update position - eagle always flies regardless of camera state
      this.currentAngle += this.flightSpeed * deltaTime;
      
      // Update position on the circle
      this.updateCircularPosition();
      
      // Update animations with adjusted speed for quickdraw mode
      if (this.animationMixer) {
        // Use half animation speed when in quickdraw mode to match the flight speed
        const animationTimeScale = this.inQuickdraw ? 0.5 : 1.0;
        
        // Set the time scale for each animation
        if (this.animations['flycycle']) {
          this.animations['flycycle'].setEffectiveTimeScale(animationTimeScale);
        }
        
        this.animationMixer.update(deltaTime);
      }
    } else {
      // Handle falling animation
      const currentTime = performance.now() / 1000.0;
      const timeSinceHit = currentTime - this.hitTime;
      
      if (!this.isSinking) {
        // Apply gravity and rotation during fall
        this.fallSpeed += 9.8 * deltaTime; // Gravity
        this.group.position.y -= this.fallSpeed * deltaTime;
        
        // Update tumble speeds less frequently to improve performance
        if (currentTime - this.lastTumbleUpdate > 0.1) {
          // Pre-calculate random values in a batch (more efficient)
          const randomX = (Math.random() - 0.5) * 4;
          const randomY = (Math.random() - 0.5) * 4;
          const randomZ = (Math.random() - 0.5) * 4;
          
          this.tumbleAcceleration.x = randomX;
          this.tumbleAcceleration.y = randomY;
          this.tumbleAcceleration.z = randomZ;
          
          this.lastTumbleUpdate = currentTime;
        }
        
        // Calculate rotation factors once to avoid redundant calculations
        const rotationFactor = deltaTime * 2;
        const dampingFactor = 0.99;
        
        // Apply tumble accelerations with higher impact
        this.tumbleSpeeds.x = (this.tumbleSpeeds.x + this.tumbleAcceleration.x * deltaTime * 2) * dampingFactor;
        this.tumbleSpeeds.y = (this.tumbleSpeeds.y + this.tumbleAcceleration.y * deltaTime * 2) * dampingFactor;
        this.tumbleSpeeds.z = (this.tumbleSpeeds.z + this.tumbleAcceleration.z * deltaTime * 2) * dampingFactor;
        
        // Apply rotations with higher magnitude
        this.group.rotation.x += this.tumbleSpeeds.x * rotationFactor;
        this.group.rotation.y += this.tumbleSpeeds.y * rotationFactor;
        this.group.rotation.z += this.tumbleSpeeds.z * rotationFactor;
        
        // Add more pronounced forward tilt based on fall speed
        const forwardTilt = Math.min(this.fallSpeed * 0.1, 1.0);
        this.group.rotation.x += forwardTilt * deltaTime;
        
        // Add some side-to-side sway based on fall speed (pre-calculated)
        const sineValue = Math.sin(timeSinceHit * 2);
        const swayAmount = Math.min(this.fallSpeed * 0.05, 0.3) * deltaTime;
        this.group.rotation.z += sineValue * swayAmount;
        
        // Check if we've hit the ground
        if (this.group.position.y <= 0.1) {
          this.group.position.y = 0.1;
          this.groundTime = currentTime;
          this.isSinking = true;
          
          // Stop all rotations
          this.tumbleSpeeds.x = 0;
          this.tumbleSpeeds.y = 0;
          this.tumbleSpeeds.z = 0;
          this.tumbleAcceleration.x = 0;
          this.tumbleAcceleration.y = 0;
          this.tumbleAcceleration.z = 0;
          
          // Play landing sound
          if (window.soundManager) {
            window.soundManager.playSound('eagleland', 0, 1.0);
          } else if (window.localPlayer && window.localPlayer.soundManager) {
            window.localPlayer.soundManager.playSoundAt(
              'eagleland',
              this.group.position,
              0,
              0.8 + Math.random() * 0.4,
              false,
              true
            );
          }
        }
      } else {
        // Handle sinking into ground
        const timeSinceGround = currentTime - this.groundTime;
        
        if (timeSinceGround >= 3.0) { // Wait 3 seconds before sinking
          if (!this.sinkTime) {
            this.sinkTime = currentTime;
          }
          
          const sinkProgress = (currentTime - this.sinkTime) / 2.0; // 2 second sink animation
          if (sinkProgress >= 1.0) {
            // Reset eagle
            this.reset();
            return;
          }
          
          // Calculate rotation adjustment once
          const rotFactor = (1 - sinkProgress * 0.1);
          
          // Sink into ground
          this.group.position.y = -sinkProgress * 0.5;
          this.group.rotation.z *= rotFactor;
          this.group.rotation.x *= rotFactor;
        }
      }
    }
  }

  /**
   * Resets the eagle after being hit
   */
  reset() {
    this.isHit = false;
    this.hitTime = 0;
    this.fallSpeed = 0;
    this.rotationSpeed = 0;
    this.groundTime = 0;
    this.sinkTime = 0;
    this.isSinking = false;
    
    // Reset position and rotation
    this.group.position.y = this.originalHeight;
    this.group.rotation.copy(this.originalRotation);
    
    // Restart fly animation
    if (this.animations['flycycle']) {
      this.animations['flycycle'].reset();
      this.animations['flycycle'].play();
    }
    
    // Reset to default flight path
    this.setDefaultFlightPath();
  }
} 