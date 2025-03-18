export class Revolver {
    constructor() {
      this.group = new THREE.Group();
      // Load the GLB gun model via GLTFLoader.
      const loader = new THREE.GLTFLoader();
      loader.load('models/lowpolygun.glb', (gltf) => {
        const gunModel = gltf.scene;
        gunModel.scale.set(0.5, 0.5, 0.5);
        gunModel.position.set(0, 0, 0);
        gunModel.rotation.set(0, Math.PI, 0);
        this.group.add(gunModel);
        this.gunModel = gunModel;
      }, undefined, (error) => {
        console.error('Error loading gun model:', error);
      });
    }
    
    /**
     * Returns the world position of the gun barrel tip.
     */
    getBarrelTipWorldPosition() {
      const localTip = new THREE.Vector3(0, 0, -0.7);
      return this.group.localToWorld(localTip);
    }
  }
  