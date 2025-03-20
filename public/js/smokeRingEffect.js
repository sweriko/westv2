/**
 * Smoke Ring Effect implementation for the Western Shooter game
 * Creates a stylized low-poly smoke ring when firing
 * Optimized for performance to reduce frame drops
 */
export class SmokeRingEffect {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.scene.add(this.group);
        
        this.puffs = [];
        this.active = false;
        
        // Use an object pool for particles to reduce GC
        this.particlePool = [];
        this.materialsPool = [];
        
        // Create shared geometries that will be reused
        this.puffGeometry = new THREE.IcosahedronGeometry(0.05, 0);
        this.muzzleGeometry = new THREE.IcosahedronGeometry(0.06, 0);
    }
    
    /**
     * Preload all resources needed for the smoke ring effect
     * Call this during initialization to avoid FPS drops on first use
     */
    preload() {
        // Create and cache particles
        const numToPreload = 25; // Slightly more than used in a single effect
        
        for (let i = 0; i < numToPreload; i++) {
            // Create standard particles
            this._getParticle(false);
            
            // Create a few muzzle particles too
            if (i < 5) {
                this._getParticle(true);
            }
        }
        
        // Make them all invisible and return to pool
        for (let i = 0; i < this.group.children.length; i++) {
            const mesh = this.group.children[i];
            mesh.visible = false;
            this.particlePool.push(mesh);
        }
        
        // Create a dummy smoke ring to warm up all the logic
        this._createSmokeRing();
        
        // Reset everything
        this.puffs = [];
        
        return this; // For chaining
    }
    
    /**
     * Create a smoke ring effect at the specified position and direction
     * @param {THREE.Vector3} position - The position to create the smoke ring
     * @param {THREE.Vector3} direction - The direction the weapon is firing
     */
    create(position, direction) {
        // Reuse particles instead of removing them
        for (let i = 0; i < this.group.children.length; i++) {
            const mesh = this.group.children[i];
            mesh.visible = false;
            this.particlePool.push(mesh);
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
     * Get a particle mesh from the pool or create a new one
     * @param {boolean} isMuzzle - Whether this is a muzzle blast particle
     * @returns {THREE.Mesh} - The particle mesh
     * @private
     */
    _getParticle(isMuzzle = false) {
        if (this.particlePool.length > 0) {
            const mesh = this.particlePool.pop();
            mesh.visible = true;
            return mesh;
        }
        
        // Create new material with proper settings
        const material = new THREE.MeshPhongMaterial({
            color: 0xCCCCCC,
            flatShading: true,
            shininess: 0,
            transparent: true,
            depthWrite: false
        });
        
        this.materialsPool.push(material);
        
        // Create new mesh with the proper geometry
        const geometry = isMuzzle ? this.muzzleGeometry : this.puffGeometry;
        const mesh = new THREE.Mesh(geometry, material);
        this.group.add(mesh);
        return mesh;
    }
    
    /**
     * Create a smoke ring with proper radial particles
     * @private
     */
    _createSmokeRing() {
        // Keep original particle count for visual fidelity
        const numRingParticles = 20;
        const initialRingRadius = 0.15;
        
        for (let i = 0; i < numRingParticles; i++) {
            const angle = (i / numRingParticles) * Math.PI * 2;
            
            // Slightly randomize the ring radius for a less perfect circle
            const radiusVariation = initialRingRadius * (0.9 + Math.random() * 0.2);
            
            // Get a particle from the pool or create a new one
            const puffMesh = this._getParticle(false);
            
            // Compute normals for flat shading
            if (puffMesh.geometry.attributes.normal) {
                puffMesh.geometry.computeVertexNormals();
            }
            
            // Position in ring formation
            puffMesh.position.x = Math.cos(angle) * radiusVariation;
            puffMesh.position.y = Math.sin(angle) * radiusVariation;
            puffMesh.position.z = 0.05 + Math.random() * 0.1;
            
            // Random rotation
            puffMesh.rotation.x = Math.random() * Math.PI * 2;
            puffMesh.rotation.y = Math.random() * Math.PI * 2;
            puffMesh.rotation.z = Math.random() * Math.PI * 2;
            
            // Start with small scale
            puffMesh.scale.set(0.05, 0.05, 0.05);
            
            // Original speed and lifespan for visual fidelity
            const outwardSpeed = 1.8 + Math.random() * 0.7;
            
            this.puffs.push({
                mesh: puffMesh,
                age: 0,
                lifespan: 0.6 + Math.random() * 0.3,
                velocity: new THREE.Vector3(
                    Math.cos(angle) * outwardSpeed,
                    Math.sin(angle) * outwardSpeed,
                    0.2 + Math.random() * 0.4
                ),
                rotationSpeed: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.05,
                    (Math.random() - 0.5) * 0.05,
                    (Math.random() - 0.5) * 0.05
                ),
                initialSize: 0.05 + Math.random() * 0.03
            });
        }
        
        // Original muzzle blast particles for visual fidelity
        for (let i = 0; i < 3; i++) {
            const puffMesh = this._getParticle(true);
            
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
            
            // Random outward direction
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 0.6;
            
            this.puffs.push({
                mesh: puffMesh,
                age: 0,
                lifespan: 0.4 + Math.random() * 0.2,
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
        
        // Limit delta time to avoid large jumps that cause performance issues
        const clampedDelta = Math.min(deltaTime, 0.05);
        
        for (let i = 0; i < this.puffs.length; i++) {
            const puff = this.puffs[i];
            puff.age += clampedDelta;
            
            if (puff.age < puff.lifespan) {
                allExpired = false;
                
                // Calculate life ratio
                const lifeRatio = puff.age / puff.lifespan;
                
                // Batch position updates to improve performance
                const positionX = puff.mesh.position.x + puff.velocity.x * clampedDelta;
                const positionY = puff.mesh.position.y + puff.velocity.y * clampedDelta;
                const positionZ = puff.mesh.position.z + puff.velocity.z * clampedDelta;
                puff.mesh.position.set(positionX, positionY, positionZ);
                
                // Update rotation
                puff.mesh.rotation.x += puff.rotationSpeed.x;
                puff.mesh.rotation.y += puff.rotationSpeed.y;
                puff.mesh.rotation.z += puff.rotationSpeed.z;
                
                // Original scale curve for visual fidelity
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
                } else {
                    // Reset opacity for particles not in final phase
                    puff.mesh.material.opacity = 1.0;
                }
                
                // Original drag calculation
                const dragFactor = lifeRatio < 0.5 ? 0.98 : 0.96;
                puff.velocity.multiplyScalar(dragFactor);
            } else {
                // Add expired puffs back to the pool instead of making them invisible
                puff.mesh.visible = false;
                this.particlePool.push(puff.mesh);
            }
        }
        
        // If all puffs have expired, clean up and set active to false
        if (allExpired) {
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
        // Clean up all meshes and properly dispose materials
        while(this.group.children.length > 0) {
            const mesh = this.group.children[0];
            this.group.remove(mesh);
        }
        
        // Clear the particle pool
        this.particlePool = [];
        this.puffs = [];
        
        // Dispose of all materials in the pool
        for (let i = 0; i < this.materialsPool.length; i++) {
            if (this.materialsPool[i]) {
                this.materialsPool[i].dispose();
            }
        }
        this.materialsPool = [];
        
        // Dispose of shared geometries
        if (this.puffGeometry) this.puffGeometry.dispose();
        if (this.muzzleGeometry) this.muzzleGeometry.dispose();
        
        // Remove group from scene
        if (this.group.parent) {
            this.group.parent.remove(this.group);
        }
    }
}