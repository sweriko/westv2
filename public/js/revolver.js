/**
 * A simple Revolver class that loads a low-poly gun model (GLB) for first-person view.
 */
export class Revolver {
  constructor() {
    this.group = new THREE.Group();

    // Internal flag to log the barrel lookup only once.
    this._barrelLogged = false;
    // This will be our anchor attached to the barrel, used for muzzle flash and bullet spawn.
    this.muzzleFlashAnchor = null;

    // Use GLTFLoader to load the .glb gun model
    const loader = new THREE.GLTFLoader();
    loader.load(
      'models/lowpolygun.glb',
      (gltf) => {
        const gunModel = gltf.scene;
        gunModel.scale.set(0.5, 0.5, 0.5);
        gunModel.position.set(0, 0, 0);
        // Flip the model 180° so it points forward
        gunModel.rotation.set(0, Math.PI, 0);

        // Optional: log all child names for debugging purposes
        // gunModel.traverse(child => console.log(child.name));

        this.group.add(gunModel);
        this.gunModel = gunModel;

        // Attempt to find the barrel by its name in the imported model
        const barrel = gunModel.getObjectByName("Magnum_Barrel_Magnum_mat_0");
        if (!this._barrelLogged) {
          if (barrel) {
            console.log('Revolver barrel found: "Magnum_Barrel_Magnum_mat_0".');
          } else {
            console.warn('Revolver barrel "Magnum_Barrel_Magnum_mat_0" not found. Muzzle flash anchor will not be attached.');
          }
          this._barrelLogged = true;
        }
        if (barrel) {
          // Create a muzzle flash anchor and attach it to the barrel.
          this.muzzleFlashAnchor = new THREE.Object3D();
          // Set an upward offset on the anchor (adjust as necessary)
          this.muzzleFlashAnchor.position.set(-2, 8, -10);
          barrel.add(this.muzzleFlashAnchor);
          console.log('Muzzle flash anchor attached to barrel.');
        }
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
   * Returns the world position of the gun barrel tip.
   * If a muzzle flash anchor was attached to the barrel, its world position is returned,
   * ensuring that the emission point remains fixed relative to the barrel.
   * Otherwise, it falls back to a default local offset relative to the revolver group.
   *
   * @returns {THREE.Vector3} The world position for spawning bullets and muzzle flash effects.
   */
  getBarrelTipWorldPosition() {
    if (this.muzzleFlashAnchor) {
      const worldPos = new THREE.Vector3();
      this.muzzleFlashAnchor.getWorldPosition(worldPos);
      return worldPos;
    }
    // Fallback: use a default local offset relative to the revolver group
    return this.group.localToWorld(new THREE.Vector3(0, 0, -0.7));
  }
}
