/**
 * A simple Revolver class that loads a low-poly gun model (GLB) for first-person view.
 */
export class Revolver {
    constructor() {
      this.group = new THREE.Group();
  
      // Use GLTFLoader to load the .glb gun model
      const loader = new THREE.GLTFLoader();
      loader.load(
        'models/lowpolygun.glb',
        (gltf) => {
          const gunModel = gltf.scene;
          gunModel.scale.set(0.5, 0.5, 0.5);
          gunModel.position.set(0, 0, 0);
          // Flip it 180 so it points forward
          gunModel.rotation.set(0, Math.PI, 0);
  
          this.group.add(gunModel);
          this.gunModel = gunModel;
        },
        undefined,
        (error) => {
          console.error('Error loading revolver model:', error);
        }
      );
  
      // Initially hidden until the player aims
      this.group.visible = false;
    }
  
    /**
     * Returns the world position of the gun barrel tip (approx).
     * Used for spawning bullets in first-person view.
     * @returns {THREE.Vector3}
     */
    getBarrelTipWorldPosition() {
      // If the model hasn't loaded yet, fallback
      if (!this.gunModel) {
        return this.group.localToWorld(new THREE.Vector3(0, 0, -0.7));
      }
      // Use local offset
      const localTip = new THREE.Vector3(0, 0, -0.7);
      return this.group.localToWorld(localTip);
    }
  }
  