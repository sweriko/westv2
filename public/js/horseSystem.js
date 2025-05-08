/**
 * Horse System - Handles horse spawning and riding
 */
export class HorseSystem {
  /**
   * @param {THREE.Scene} scene - The scene to add the horse to
   * @param {THREE.LoadingManager} [loadingManager] - Optional loading manager
   */
  constructor(scene, loadingManager) {
    this.scene = scene;
    this.horse = null;
    this.isLoaded = false;
    this.loadingManager = loadingManager || null;
    this.mixer = null;
    this.gallopAction = null;
    this.isActive = false;
    
    // Load the horse model
    this.loadHorseModel();
  }

  /**
   * Loads the horse model
   */
  loadHorseModel() {
    // Create loader without passing loadingManager if it's null
    const loader = this.loadingManager ? new THREE.GLTFLoader(this.loadingManager) : new THREE.GLTFLoader();
    
    // Use the first model
    loader.load(
      'models/horse1.glb',
      (gltf) => {
        this.horse = gltf.scene;
        
        // Scale and adjust the horse
        this.horse.scale.set(2, 2, 2);
        
        // Rotate the horse 180 degrees so it faces forward
        this.horse.rotation.y = Math.PI;
        
        // Add shadows
        this.horse.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });
        
        // Initially hide the horse
        this.horse.visible = false;
        
        // Set up animation
        this.mixer = new THREE.AnimationMixer(this.horse);
        const animations = gltf.animations;
        
        // Find and prepare the "Gallop" animation
        const gallopAnim = animations.find(animation => animation.name === "Gallop");
        if (gallopAnim) {
          this.gallopAction = this.mixer.clipAction(gallopAnim);
          this.gallopAction.timeScale = 1.2; // Slightly faster for better visual
          // Don't play it yet, we'll play when activated
        } else {
          console.warn("Gallop animation not found in horse model");
        }
        
        // Add to scene
        this.scene.add(this.horse);
        this.isLoaded = true;
        
        console.log('Horse model loaded successfully');
      },
      (xhr) => {
        console.log(`Loading horse model: ${(xhr.loaded / xhr.total) * 100}% loaded`);
      },
      (error) => {
        console.error('Error loading horse model:', error);
      }
    );
  }

  /**
   * Updates the horse animation
   * @param {number} deltaTime - The time since the last frame
   */
  update(deltaTime) {
    if (this.mixer && this.isActive) {
      this.mixer.update(deltaTime);
    }
  }

  /**
   * Positions the horse at the player's position
   * @param {THREE.Vector3} playerPosition - The player's position
   * @param {number} playerRotationY - The player's y rotation
   */
  positionAtPlayer(playerPosition, playerRotationY) {
    if (!this.horse) return;
    
    // Position the horse at the player's feet
    const terrainHeight = window.physics ? 
      window.physics.getTerrainHeightAt(playerPosition.x, playerPosition.z) : 0;
    
    this.horse.position.set(
      playerPosition.x,
      terrainHeight, // Position exactly on the ground
      playerPosition.z
    );
    
    // Match player's rotation + 180 degrees to face forward
    this.horse.rotation.y = playerRotationY + Math.PI;
  }

  /**
   * Shows the horse and starts animation
   */
  show() {
    if (!this.horse || !this.isLoaded) return;
    
    this.horse.visible = true;
    this.isActive = true;
    
    // Start gallop animation
    if (this.gallopAction) {
      this.gallopAction.play();
      this.gallopAction.setLoop(THREE.LoopRepeat);
    }
  }

  /**
   * Hides the horse and stops animation
   */
  hide() {
    if (!this.horse) return;
    
    this.horse.visible = false;
    this.isActive = false;
    
    // Stop gallop animation
    if (this.gallopAction) {
      this.gallopAction.stop();
    }
  }

  /**
   * Disposes the horse system
   */
  dispose() {
    if (this.horse) {
      this.scene.remove(this.horse);
      
      // Dispose geometries and materials
      this.horse.traverse((node) => {
        if (node.isMesh) {
          if (node.geometry) node.geometry.dispose();
          
          if (node.material) {
            if (Array.isArray(node.material)) {
              node.material.forEach(material => material.dispose());
            } else {
              node.material.dispose();
            }
          }
        }
      });
      
      this.horse = null;
      this.mixer = null;
      this.gallopAction = null;
    }
  }
} 