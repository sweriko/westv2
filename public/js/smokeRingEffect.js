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
        
        // Create shared geometries that will be reused - MUCH LARGER BASE GEOMETRY
        this.puffGeometry = new THREE.IcosahedronGeometry(0.2, 0); // Increased from 0.05
        this.muzzleGeometry = new THREE.IcosahedronGeometry(0.25, 0); // Increased from 0.06
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
        
        // Store original position of the group
        const originalPosition = this.group.position.clone();
        
        // Move group far below scene to hide preload animations
        this.group.position.set(0, -1000, 0);
        
        // Create a dummy direction for the effect
        const dummyDirection = new THREE.Vector3(0, 0, 1);
        
        // Create a full smoke ring effect in the hidden location
        this._createSmokeRing();
        this.active = true;
        
        // Simulate animation frames manually for each effect
        // This forces shader compilation and resource allocation before the user sees it
        const timesteps = [0, 16, 32, 48, 64, 80, 96, 112, 128];
        
        // Manually advance animation by simulating update calls
        for (const timestep of timesteps) {
            this.update(timestep / 1000); // Convert ms to seconds for the update method
        }
        
        // Reset everything after preloading
        this.puffs = [];
        this.active = false;
        
        // Return group to original position
        this.group.position.copy(originalPosition);
        
        // Clear all used particles back to pool
        for (let i = 0; i < this.group.children.length; i++) {
            const mesh = this.group.children[i];
            mesh.visible = false;
            this.particlePool.push(mesh);
        }
        
        return this; // For chaining
    }
    
    /**
     * Create a smoke ring effect at the specified position and direction
     * @param {THREE.Vector3} position - The position to create the smoke ring
     * @param {THREE.Vector3} direction - The direction the weapon is firing
     * @param {Object} options - Optional positioning overrides
     */
    create(position, direction, options = null) {
        // Reuse particles instead of removing them
        for (let i = 0; i < this.group.children.length; i++) {
            const mesh = this.group.children[i];
            mesh.visible = false;
            this.particlePool.push(mesh);
        }
        this.puffs = [];
        
        // Get effect configuration - either from options or from default constants
        let forwardOffset = 0.05;
        let xOffset = 0;
        let yOffset = 0;
        let scale = 1.0;
        
        // If we have options from the viewmodel, use those for positioning
        if (options) {
            forwardOffset = options.forward_offset || forwardOffset;
            xOffset = options.x_offset || xOffset;
            yOffset = options.y_offset || yOffset;
            scale = options.scale || scale;
        }
        
        // Position the smoke ring with the appropriate offsets
        const adjustedPosition = position.clone();
        
        // Apply direction-based forward offset
        const forwardDir = direction.clone().normalize().multiplyScalar(forwardOffset);
        adjustedPosition.add(forwardDir);
        
        // Apply lateral offsets if specified
        if (xOffset !== 0 || yOffset !== 0) {
            // We need to calculate the right and up vectors relative to the firing direction
            // to apply the x/y offsets correctly
            const right = new THREE.Vector3();
            const up = new THREE.Vector3(0, 1, 0);
            right.crossVectors(direction, up).normalize();
            
            // Recalculate up to ensure it's perpendicular
            up.crossVectors(right, direction).normalize();
            
            // Apply offsets
            if (xOffset !== 0) {
                adjustedPosition.add(right.multiplyScalar(xOffset));
            }
            
            if (yOffset !== 0) {
                adjustedPosition.add(up.multiplyScalar(yOffset));
            }
        }
        
        // Position the smoke ring at the adjusted position
        this.group.position.copy(adjustedPosition);
        this.group.lookAt(adjustedPosition.clone().add(direction));
        
        // Apply scale if different from default
        if (scale !== 1.0) {
            this.group.scale.set(scale, scale, scale);
        } else {
            this.group.scale.set(1, 1, 1);
        }
        
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
        
        // Set renderOrder on the mesh itself where it belongs
        mesh.renderOrder = 1000;
        
        this.group.add(mesh);
        return mesh;
    }
    
    /**
     * Create a smoke ring with proper radial particles
     * @private
     */
    _createSmokeRing() {
        // Keep just a handful of puffs with better size distribution
        const numRingParticles = 5; // 5 total puffs for outer ring
        const initialRingRadius = 0.35; // Reduced from 0.5 for less spread
        
        // Number of small inner puffs
        const numInnerPuffs = 3; // Add small puffs in the inner area
        const innerRingRadius = 0.18; // Reduced from 0.25 for less spread
        
        // Pre-determine which particles will be the large ones (1 or 2 max)
        const largeParticleIndices = [];
        const numLargeParticles = Math.random() < 0.5 ? 1 : 2; // Either 1 or 2 large particles
        
        while (largeParticleIndices.length < numLargeParticles) {
            const idx = Math.floor(Math.random() * numRingParticles);
            if (!largeParticleIndices.includes(idx)) {
                largeParticleIndices.push(idx);
            }
        }
        
        // Create outer ring puffs (larger ones)
        for (let i = 0; i < numRingParticles; i++) {
            // Much wider distribution around the circle
            // More randomness in angle placement for less uniform pattern
            const angle = (i / numRingParticles) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
            
            // Less radius spread for tighter dispersion
            const radiusVariation = initialRingRadius * (0.8 + Math.random() * 0.8); // Reduced from 1.0 + random * 1.2
            
            // Get a particle from the pool or create a new one
            const puffMesh = this._getParticle(false);
            
            // Compute normals for flat shading
            if (puffMesh.geometry.attributes.normal) {
                puffMesh.geometry.computeVertexNormals();
            }
            
            // All particles initially start near the origin (gun position)
            // They'll move to their final positions quickly during the first frames
            puffMesh.position.x = Math.cos(angle) * 0.05; // Start close to center
            puffMesh.position.y = Math.sin(angle) * 0.05; // Start close to center
            puffMesh.position.z = 0.01; // Start very close to gun
            
            // Target positions for quick interpolation - closer to gun
            const targetX = Math.cos(angle) * radiusVariation;
            const targetY = Math.sin(angle) * radiusVariation;
            const targetZ = 0.05 + Math.random() * 0.2; // Reduced from 0.3 for less z-spread
            
            // Fixed random rotation for initial appearance - don't animate rotation later
            puffMesh.rotation.x = Math.random() * Math.PI * 2;
            puffMesh.rotation.y = Math.random() * Math.PI * 2;
            puffMesh.rotation.z = Math.random() * Math.PI * 2;
            
            // Determine size based on whether this is one of the pre-selected large particles
            let baseSize;
            if (largeParticleIndices.includes(i)) {
                // This is one of the 1-2 large particles
                baseSize = 1.4 + Math.random() * 0.8; // 1.4-2.2 size
            } else {
                // Regular smaller particles
                baseSize = 0.6 + Math.random() * 0.4; // 0.6-1.0 size
            }
            
            // Start with a very small scale (originating from gun)
            puffMesh.scale.set(0.05, 0.05, 0.05);
            
            // Slower outward speed for less spread
            const outwardSpeed = largeParticleIndices.includes(i) ? 
                1.0 + Math.random() * 0.6 : // Reduced from 1.5 + random * 0.8 
                0.9 + Math.random() * 0.7;  // Reduced from 1.4 + random * 1.0
            
            this.puffs.push({
                mesh: puffMesh,
                age: 0,
                lifespan: largeParticleIndices.includes(i) ?
                    1.0 + Math.random() * 1.2 : // Longer lifespan for larger clouds
                    0.7 + Math.random() * 0.5,  // Shorter for smaller clouds
                velocity: new THREE.Vector3(
                    Math.cos(angle) * outwardSpeed,
                    Math.sin(angle) * outwardSpeed,
                    largeParticleIndices.includes(i) ?
                        0.01 + Math.random() * 0.1 : // Less vertical for big clouds
                        0.05 + Math.random() * 0.2   // Reduced from 0.25 for less upward movement
                ),
                rotationSpeed: new THREE.Vector3(0, 0, 0), // No rotation
                initialSize: baseSize, // Store the initial size for reference
                // Add target position data for fast initial interpolation
                targetPos: new THREE.Vector3(targetX, targetY, targetZ),
                initialExpansionDone: false, // Track if initial expansion is complete
                initialExpansionSpeed: largeParticleIndices.includes(i) ?
                    30 + Math.random() * 15 : // Much faster expansion for large particles
                    20 + Math.random() * 10   // Fast expansion for other particles
            });
        }
        
        // Create inner core small puffs
        for (let i = 0; i < numInnerPuffs; i++) {
            // Distribute small puffs randomly in the inner area
            const angle = Math.random() * Math.PI * 2;
            
            // Use smaller radius for inner puffs with less spread
            const radiusVariation = innerRingRadius * (0.5 + Math.random() * 0.7); // Reduced from 0.6 + random * 1.0
            
            // Get a particle from the pool or create a new one
            const puffMesh = this._getParticle(false);
            
            // Compute normals for flat shading
            if (puffMesh.geometry.attributes.normal) {
                puffMesh.geometry.computeVertexNormals();
            }
            
            // Start at the origin (gun position)
            puffMesh.position.x = Math.cos(angle) * 0.03;
            puffMesh.position.y = Math.sin(angle) * 0.03;
            puffMesh.position.z = 0.01;
            
            // Target positions for quick interpolation - closer to gun
            const targetX = Math.cos(angle) * radiusVariation;
            const targetY = Math.sin(angle) * radiusVariation;
            const targetZ = 0.02 + Math.random() * 0.1; // Reduced from 0.15 for less z-spread
            
            // Fixed random rotation
            puffMesh.rotation.x = Math.random() * Math.PI * 2;
            puffMesh.rotation.y = Math.random() * Math.PI * 2;
            puffMesh.rotation.z = Math.random() * Math.PI * 2;
            
            // Small size for inner puffs
            const baseSize = 0.2 + Math.random() * 0.2; // 0.2-0.4 size
            
            // Start very small
            puffMesh.scale.set(0.03, 0.03, 0.03);
            
            // Slower outward speed for less spread
            const outwardSpeed = 0.6 + Math.random() * 0.6; // Reduced from 0.9 + random * 0.8
            
            this.puffs.push({
                mesh: puffMesh,
                age: 0,
                lifespan: 0.5 + Math.random() * 0.4, // Shorter lifespan for small inner puffs
                velocity: new THREE.Vector3(
                    Math.cos(angle) * outwardSpeed,
                    Math.sin(angle) * outwardSpeed,
                    0.03 + Math.random() * 0.09 // Reduced from 0.12 for less upward movement
                ),
                rotationSpeed: new THREE.Vector3(0, 0, 0), // No rotation
                initialSize: baseSize,
                // Add target position data for fast initial interpolation
                targetPos: new THREE.Vector3(targetX, targetY, targetZ),
                initialExpansionDone: false, // Track if initial expansion is complete
                initialExpansionSpeed: 25 + Math.random() * 10 // Fast expansion speed
            });
        }
        
        // Original muzzle blast particles for visual fidelity
        for (let i = 0; i < 1; i++) {
            const puffMesh = this._getParticle(true);
            
            // Position very close to origin with minimal spread
            const smallOffset = 0.03; // Start even closer to gun
            puffMesh.position.set(
                (Math.random() - 0.5) * smallOffset,
                (Math.random() - 0.5) * smallOffset,
                0
            );
            
            // Target positions - muzzle particles expand in place - closer to gun
            const targetX = (Math.random() - 0.5) * 0.08; // Reduced from 0.12
            const targetY = (Math.random() - 0.5) * 0.08; // Reduced from 0.12
            const targetZ = 0.02 + Math.random() * 0.02; // Reduced from 0.03
            
            // Fixed random rotation
            puffMesh.rotation.x = Math.random() * Math.PI * 2;
            puffMesh.rotation.y = Math.random() * Math.PI * 2;
            puffMesh.rotation.z = Math.random() * Math.PI * 2;
            
            // Moderate muzzle particles
            const baseSize = 0.6 + Math.random() * 0.2; // 0.6-0.8 size
            
            // Start extremely small
            puffMesh.scale.set(0.01, 0.01, 0.01);
            
            // Random outward direction with slower speed
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.9 + Math.random() * 0.6; // Reduced from 1.3 + random * 0.8
            
            this.puffs.push({
                mesh: puffMesh,
                age: 0,
                lifespan: 0.6 + Math.random() * 0.3,
                velocity: new THREE.Vector3(
                    Math.cos(angle) * speed,
                    Math.sin(angle) * speed,
                    0.15 + Math.random() * 0.2 // Reduced from 0.2 + random * 0.3
                ),
                rotationSpeed: new THREE.Vector3(0, 0, 0), // No rotation
                initialSize: baseSize,
                // Add target position data for fast initial interpolation
                targetPos: new THREE.Vector3(targetX, targetY, targetZ),
                initialExpansionDone: false, // Track if initial expansion is complete  
                initialExpansionSpeed: 20 + Math.random() * 10 // Very fast expansion for muzzle flash
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
            
            // If puff still alive, update it
            if (puff.age < puff.lifespan) {
                allExpired = false;
                
                // Calculate life ratio
                const lifeRatio = puff.age / puff.lifespan;
                
                // Fast initial position interpolation (first ~50ms - even faster)
                if (!puff.initialExpansionDone) {
                    // Check if we're still in the initial fast expansion phase (now only 50ms)
                    const initialPhaseComplete = puff.age > 0.05; // Reduced from 100ms to 50ms
                    
                    if (initialPhaseComplete) {
                        // Mark initial expansion as done
                        puff.initialExpansionDone = true;
                        
                        // Set position to target to ensure we reached it
                        puff.mesh.position.copy(puff.targetPos);
                    } else {
                        // Very fast interpolation toward target position
                        const lerpFactor = clampedDelta * puff.initialExpansionSpeed;
                        
                        puff.mesh.position.x += (puff.targetPos.x - puff.mesh.position.x) * lerpFactor;
                        puff.mesh.position.y += (puff.targetPos.y - puff.mesh.position.y) * lerpFactor;
                        puff.mesh.position.z += (puff.targetPos.z - puff.mesh.position.z) * lerpFactor;
                        
                        // Quickly scale up to initial size
                        const targetScale = puff.initialSize * 0.9; // Target 90% of final size initially
                        const currentScale = puff.mesh.scale.x;
                        const newScale = currentScale + (targetScale - currentScale) * lerpFactor;
                        puff.mesh.scale.set(newScale, newScale, newScale);
                    }
                } else {
                    // Normal movement after initial expansion
                    const positionX = puff.mesh.position.x + puff.velocity.x * clampedDelta;
                    const positionY = puff.mesh.position.y + puff.velocity.y * clampedDelta;
                    const positionZ = puff.mesh.position.z + puff.velocity.z * clampedDelta;
                    puff.mesh.position.set(positionX, positionY, positionZ);
                
                    // Scale curve for visual fidelity after initial expansion - REDUCE MAX SCALE
                    let scaleFactor;
                    
                    if (lifeRatio < 0.2) {
                        // Quick growth phase - 0 to 0.2 - REDUCE PEAK
                        scaleFactor = 0.9 + (lifeRatio / 0.2) * 0.2; // Start from 90% to 110% (down from 130%)
                    } else if (lifeRatio < 0.7) {
                        // Maintain size with slight growth - 0.2 to 0.7 - REDUCE PEAK
                        scaleFactor = 1.1 + (lifeRatio - 0.2) * 0.1; // 110% to 120% (down from 130% to 150%)
                    } else {
                        // Shrink phase - 0.7 to 1.0
                        scaleFactor = 1.2 - (lifeRatio - 0.7) * (1.2 / 0.3); // Shrink from 120% to 0%
                    }
                    
                    // Apply scale based on the initial size to maintain relative proportions
                    const scale = puff.initialSize * scaleFactor;
                    puff.mesh.scale.set(scale, scale, scale);
                }
                
                // Handle transparency in final phase
                if (lifeRatio > 0.7) {
                    const opacity = 1 - ((lifeRatio - 0.7) / 0.3);
                    puff.mesh.material.opacity = opacity;
                } else {
                    // Reset opacity for particles not in final phase
                    puff.mesh.material.opacity = 1.0;
                }
                
                // Almost no drag to allow particles to travel much further
                const dragFactor = lifeRatio < 0.5 ? 0.995 : 0.99;
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