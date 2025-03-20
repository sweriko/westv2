/**
 * Smoke Ring Effect implementation for the Western Shooter game
 * Creates a stylized low-poly smoke ring when firing
 */
export class SmokeRingEffect {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.scene.add(this.group);
        
        this.puffs = [];
        this.active = false;
        
        // Create smoke material - using PhongMaterial with flatShading
        this.smokeMaterial = new THREE.MeshPhongMaterial({
            color: 0xCCCCCC, // Light gray
            flatShading: true,
            shininess: 0,
            transparent: true
        });
    }
    
    /**
     * Create a smoke ring effect at the specified position and direction
     * @param {THREE.Vector3} position - The position to create the smoke ring
     * @param {THREE.Vector3} direction - The direction the weapon is firing
     */
    create(position, direction) {
        // Clear any existing puffs
        while(this.group.children.length > 0) {
            let mesh = this.group.children[0];
            this.group.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        }
        this.puffs = [];
        
        // Position the smoke ring at the muzzle
        this.group.position.copy(position);
        this.group.lookAt(position.clone().add(direction));
        
        // Create the smoke ring effect
        this._createSmokeRing();
        
        this.active = true;
    }
    
    /**
     * Create a smoke ring with proper radial particles
     * @private
     */
    _createSmokeRing() {
        // Main ring particles
        const numRingParticles = 20; // Adjusted for revolver (smaller than blunderbuss)
        const initialRingRadius = 0.15; // Smaller initial radius for revolver
        
        for (let i = 0; i < numRingParticles; i++) {
            const angle = (i / numRingParticles) * Math.PI * 2;
            
            // Slightly randomize the ring radius for a less perfect circle
            const radiusVariation = initialRingRadius * (0.9 + Math.random() * 0.2);
            
            // Create puff with low-poly icosahedron
            const geometry = new THREE.IcosahedronGeometry(0.05 + Math.random() * 0.03, 0);
            const material = this.smokeMaterial.clone();
            
            // Compute normals for flat shading
            geometry.computeVertexNormals();
            
            const puffMesh = new THREE.Mesh(geometry, material);
            
            // Position in ring formation
            puffMesh.position.x = Math.cos(angle) * radiusVariation;
            puffMesh.position.y = Math.sin(angle) * radiusVariation;
            puffMesh.position.z = 0.05 + Math.random() * 0.1; // Slight forward offset
            
            // Random rotation
            puffMesh.rotation.x = Math.random() * Math.PI * 2;
            puffMesh.rotation.y = Math.random() * Math.PI * 2;
            puffMesh.rotation.z = Math.random() * Math.PI * 2;
            
            // Start with small scale
            puffMesh.scale.set(0.05, 0.05, 0.05);
            
            this.group.add(puffMesh);
            
            // Outward velocity along the ring angle
            const outwardSpeed = 1.8 + Math.random() * 0.7; // Slightly slower for revolver
            
            this.puffs.push({
                mesh: puffMesh,
                age: 0,
                lifespan: 0.6 + Math.random() * 0.3, // Shorter lifespan for revolver
                velocity: new THREE.Vector3(
                    Math.cos(angle) * outwardSpeed,
                    Math.sin(angle) * outwardSpeed,
                    0.2 + Math.random() * 0.4 // Slight forward movement
                ),
                rotationSpeed: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.05,
                    (Math.random() - 0.5) * 0.05,
                    (Math.random() - 0.5) * 0.05
                ),
                initialSize: 0.05 + Math.random() * 0.03
            });
        }
        
        // Add just a few particles near origin for muzzle blast effect
        for (let i = 0; i < 3; i++) {
            const geometry = new THREE.IcosahedronGeometry(0.06 + Math.random() * 0.04, 0);
            const material = this.smokeMaterial.clone();
            geometry.computeVertexNormals();
            
            const puffMesh = new THREE.Mesh(geometry, material);
            
            // Position very close to origin with minimal spread
            const smallOffset = 0.08;
            puffMesh.position.set(
                (Math.random() - 0.5) * smallOffset,
                (Math.random() - 0.5) * smallOffset,
                0
            );
            
            // Random rotation
            puffMesh.rotation.x = Math.random() * Math.PI * 2;
            puffMesh.rotation.y = Math.random() * Math.PI * 2;
            puffMesh.rotation.z = Math.random() * Math.PI * 2;
            
            puffMesh.scale.set(0.05, 0.05, 0.05);
            
            this.group.add(puffMesh);
            
            // Random outward direction
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 0.6;
            
            this.puffs.push({
                mesh: puffMesh,
                age: 0,
                lifespan: 0.4 + Math.random() * 0.2, // Shorter lifespan
                velocity: new THREE.Vector3(
                    Math.cos(angle) * speed,
                    Math.sin(angle) * speed,
                    0.3 + Math.random() * 0.3
                ),
                rotationSpeed: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.05,
                    (Math.random() - 0.5) * 0.05,
                    (Math.random() - 0.5) * 0.05
                ),
                initialSize: 0.06 + Math.random() * 0.04
            });
        }
    }
    
    /**
     * Update the smoke ring effect
     * @param {number} deltaTime - Time elapsed since last frame
     * @returns {boolean} - Whether the effect is still active
     */
    update(deltaTime) {
        if (!this.active) return false;
        
        let allExpired = true;
        
        for (let i = 0; i < this.puffs.length; i++) {
            const puff = this.puffs[i];
            puff.age += deltaTime;
            
            if (puff.age < puff.lifespan) {
                allExpired = false;
                
                // Calculate life ratio
                const lifeRatio = puff.age / puff.lifespan;
                
                // Update position based on velocity
                puff.mesh.position.x += puff.velocity.x * deltaTime;
                puff.mesh.position.y += puff.velocity.y * deltaTime;
                puff.mesh.position.z += puff.velocity.z * deltaTime;
                
                // Update rotation
                puff.mesh.rotation.x += puff.rotationSpeed.x;
                puff.mesh.rotation.y += puff.rotationSpeed.y;
                puff.mesh.rotation.z += puff.rotationSpeed.z;
                
                // Modified scale curve - quick growth, plateau, then fade
                let scaleFactor;
                
                if (lifeRatio < 0.2) {
                    // Quick growth phase - 0 to 0.2
                    scaleFactor = lifeRatio / 0.2;
                } else if (lifeRatio < 0.7) {
                    // Maintain size with slight growth - 0.2 to 0.7
                    scaleFactor = 1.0 + (lifeRatio - 0.2) * 0.3;
                } else {
                    // Shrink phase - 0.7 to 1.0
                    scaleFactor = 1.3 - (lifeRatio - 0.7) * (1.3 / 0.3);
                }
                
                puff.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
                
                // Handle transparency in final phase
                if (lifeRatio > 0.7) {
                    const opacity = 1 - ((lifeRatio - 0.7) / 0.3);
                    puff.mesh.material.opacity = opacity;
                }
                
                // Adjust drag based on life stage
                const dragFactor = lifeRatio < 0.5 ? 0.98 : 0.96;
                puff.velocity.multiplyScalar(dragFactor);
            } else {
                // Make expired puffs invisible
                puff.mesh.visible = false;
            }
        }
        
        // If all puffs have expired, clean up and set active to false
        if (allExpired) {
            // Clean up
            while(this.group.children.length > 0) {
                let mesh = this.group.children[0];
                this.group.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
            }
            this.puffs = [];
            this.active = false;
            return false;
        }
        
        return true;
    }
    
    /**
     * Clean up resources
     */
    dispose() {
        // Clean up all meshes and materials
        while(this.group.children.length > 0) {
            let mesh = this.group.children[0];
            this.group.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        }
        this.puffs = [];
        
        // Remove group from scene
        if (this.group.parent) {
            this.group.parent.remove(this.group);
        }
    }
}