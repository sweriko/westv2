/**
 * Dust Particle Effect for horses running through the desert
 * Creates a stylized low-poly dust cloud trailing behind the horse hooves
 */
export class DustParticleEffect {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.scene.add(this.group);
        
        this.particleSystems = {};
        
        // Use an object pool for particles to reduce GC
        this.particlePool = [];
        this.materialsPool = [];
        
        // Create shared geometry that will be reused - LARGER BASE SIZE
        this.dustGeometry = new THREE.IcosahedronGeometry(0.25, 0); // Increased from 0.15
    }
    
    /**
     * Preload all resources needed for the dust effect
     * Call during initialization to avoid FPS drops on first use
     */
    preload(numParticles = 30) {
        // Create and cache particles
        for (let i = 0; i < numParticles; i++) {
            this._getParticle();
        }
        
        // Make them all invisible and return to pool
        for (let i = 0; i < this.group.children.length; i++) {
            const mesh = this.group.children[i];
            mesh.visible = false;
            this.particlePool.push(mesh);
        }
        
        return this;
    }
    
    /**
     * Create a dust effect attached to a bone
     * @param {THREE.Object3D} bone - The bone to attach the dust effect to
     * @param {string} horseId - Unique ID for this horse instance
     */
    createForHorse(bone, horseId) {
        if (!bone) {
            console.error("No bone provided for dust effect");
            return;
        }
        
        // If we already have a particle system for this horse, clear it
        if (this.particleSystems[horseId]) {
            this._clearParticlesForHorse(horseId);
        }
        
        this.particleSystems[horseId] = {
            bone: bone,
            particles: [],
            lastEmitTime: 0,
            emitInterval: 0.05 // 50ms between particle emissions
        };
    }
    
    /**
     * Clear all particles for a specific horse
     * @param {string} horseId - Horse ID to clear particles for
     * @private
     */
    _clearParticlesForHorse(horseId) {
        const system = this.particleSystems[horseId];
        if (!system) return;
        
        // Return all particles to the pool
        for (const particle of system.particles) {
            if (particle.mesh) {
                particle.mesh.visible = false;
                this.particlePool.push(particle.mesh);
            }
        }
        
        // Clear the particles array
        system.particles = [];
    }
    
    /**
     * Get a particle mesh from the pool or create a new one
     * @returns {THREE.Mesh} - The particle mesh
     * @private
     */
    _getParticle() {
        if (this.particlePool.length > 0) {
            const mesh = this.particlePool.pop();
            mesh.visible = true;
            return mesh;
        }
        
        // Create new material with proper settings - slightly warmer dust color
        const material = new THREE.MeshPhongMaterial({
            color: 0xDDCBAA, // Sandy/dusty color with slightly warmer tone
            flatShading: true,
            shininess: 0,
            transparent: true,
            depthWrite: false
        });
        
        this.materialsPool.push(material);
        
        // Create new mesh with dust geometry
        const mesh = new THREE.Mesh(this.dustGeometry, material);
        
        // Set renderOrder to ensure proper rendering
        mesh.renderOrder = 990;
        
        this.group.add(mesh);
        return mesh;
    }
    
    /**
     * Emit dust particles from a horse hoof
     * @param {string} horseId - Horse ID to emit particles for
     * @param {number} deltaTime - Time since last frame
     * @private  
     */
    _emitParticles(horseId, deltaTime) {
        const system = this.particleSystems[horseId];
        if (!system || !system.bone) return;
        
        // Update emit timer
        system.lastEmitTime += deltaTime;
        
        // Check if it's time to emit new particles
        if (system.lastEmitTime >= system.emitInterval) {
            system.lastEmitTime = 0;
            
            // Get world position of the bone
            const boneWorldPos = new THREE.Vector3();
            system.bone.getWorldPosition(boneWorldPos);
            
            // Get world quaternion of the bone
            const boneWorldQuat = new THREE.Quaternion();
            system.bone.getWorldQuaternion(boneWorldQuat);
            
            // Create 1-3 particles per emission - MORE PARTICLES
            const numParticles = Math.floor(Math.random() * 3) + 1; // 1-3 particles
            
            for (let i = 0; i < numParticles; i++) {
                // Get a particle from the pool
                const dustMesh = this._getParticle();
                
                // Position at the hoof with slight random offset
                const offsetX = (Math.random() - 0.5) * 0.2;
                const offsetY = -0.15 + (Math.random() - 0.5) * 0.1; // ADDED DEFAULT Y OFFSET DOWN
                const offsetZ = (Math.random() - 0.5) * 0.2;
                
                // Position at bone with offset - now including the default down offset
                dustMesh.position.copy(boneWorldPos);
                dustMesh.position.x += offsetX;
                dustMesh.position.y += offsetY; // This now includes our default -0.15 offset
                dustMesh.position.z += offsetZ;
                
                // Random rotation
                dustMesh.rotation.x = Math.random() * Math.PI * 2;
                dustMesh.rotation.y = Math.random() * Math.PI * 2;
                dustMesh.rotation.z = Math.random() * Math.PI * 2;
                
                // Start with even smaller scale for more dramatic growth
                dustMesh.scale.set(0.05, 0.05, 0.05); // Decreased from 0.1
                
                // Calculate a random direction within a backward-pointing cone
                // Get backward direction (opposite of horse movement)
                const backwardDir = new THREE.Vector3(0, 0, -1);
                backwardDir.applyQuaternion(boneWorldQuat);
                
                // Add random spread within a cone
                const spreadFactor = 0.6; // Increased spread
                backwardDir.x += (Math.random() - 0.5) * spreadFactor;
                backwardDir.y += Math.random() * 0.9; // More upward bias
                backwardDir.z += (Math.random() - 0.5) * spreadFactor;
                backwardDir.normalize();
                
                // Calculate random speed
                const speed = 0.5 + Math.random() * 0.6;
                
                // Add the particle to the system - LARGER MAX SIZE
                system.particles.push({
                    mesh: dustMesh,
                    velocity: backwardDir.multiplyScalar(speed),
                    age: 0,
                    lifespan: 1.0 + Math.random() * 0.5, // 1-1.5 second lifespan
                    maxSize: 0.8 + Math.random() * 0.7, // Increased from 0.5+0.3 to 0.8+0.7
                    rotation: new THREE.Vector3(
                        (Math.random() - 0.5) * 1.0,
                        (Math.random() - 0.5) * 1.0,
                        (Math.random() - 0.5) * 1.0
                    )
                });
            }
        }
    }
    
    /**
     * Update all particle systems
     * @param {number} deltaTime - Time elapsed since last frame
     */
    update(deltaTime) {
        // Limit delta time to avoid large jumps that cause performance issues
        const clampedDelta = Math.min(deltaTime, 0.05);
        
        // Update each particle system
        for (const horseId in this.particleSystems) {
            const system = this.particleSystems[horseId];
            
            // Emit new particles
            this._emitParticles(horseId, clampedDelta);
            
            // Update existing particles
            const activeParticles = [];
            
            for (const particle of system.particles) {
                // Update age
                particle.age += clampedDelta;
                
                // Check if particle is still alive
                if (particle.age < particle.lifespan) {
                    // Calculate life ratio
                    const lifeRatio = particle.age / particle.lifespan;
                    
                    // Update position
                    particle.mesh.position.x += particle.velocity.x * clampedDelta;
                    particle.mesh.position.y += particle.velocity.y * clampedDelta;
                    particle.mesh.position.z += particle.velocity.z * clampedDelta;
                    
                    // Update rotation
                    particle.mesh.rotation.x += particle.rotation.x * clampedDelta;
                    particle.mesh.rotation.y += particle.rotation.y * clampedDelta;
                    particle.mesh.rotation.z += particle.rotation.z * clampedDelta;
                    
                    // IMPROVED SCALE ANIMATION - grow more quickly and to a larger size
                    let scale;
                    if (lifeRatio < 0.25) {
                        // Faster grow phase (0-25% of life) - more dramatic growth curve
                        // Use cubic easing for accelerating growth
                        const growthProgress = lifeRatio / 0.25;
                        const easedGrowth = growthProgress * growthProgress * growthProgress;
                        scale = easedGrowth * particle.maxSize;
                    } else if (lifeRatio < 0.7) {
                        // Maintain size with slight additional growth (25-70% of life)
                        const additionalGrowth = (lifeRatio - 0.25) / 0.45 * 0.2; // Up to 20% additional growth
                        scale = particle.maxSize * (1.0 + additionalGrowth);
                    } else {
                        // Shrink phase (70-100% of life)
                        // Use ease-in for smoother start to shrinking
                        const shrinkProgress = (lifeRatio - 0.7) / 0.3;
                        const easedShrink = 1.0 - (shrinkProgress * shrinkProgress);
                        scale = particle.maxSize * 1.2 * easedShrink; // Start from 120% of max size
                    }
                    
                    particle.mesh.scale.set(scale, scale, scale);
                    
                    // Update opacity/transparency in final phase
                    if (lifeRatio > 0.7) {
                        const opacity = 1 - ((lifeRatio - 0.7) / 0.3);
                        particle.mesh.material.opacity = opacity;
                    } else {
                        particle.mesh.material.opacity = 1.0;
                    }
                    
                    // Slightly slow down particles over time (drag)
                    particle.velocity.multiplyScalar(0.98);
                    
                    // Add small upward drift to simulate rising dust
                    particle.velocity.y += 0.02 * clampedDelta; // Doubled from 0.01
                    
                    // Keep particle in active list
                    activeParticles.push(particle);
                } else {
                    // Return particle to pool
                    particle.mesh.visible = false;
                    this.particlePool.push(particle.mesh);
                }
            }
            
            // Update the particles array with only active particles
            system.particles = activeParticles;
        }
    }
    
    /**
     * Clean up resources
     */
    dispose() {
        // Clear all particles
        for (const horseId in this.particleSystems) {
            this._clearParticlesForHorse(horseId);
        }
        
        // Clear all materials from pool
        for (const material of this.materialsPool) {
            material.dispose();
        }
        
        // Remove from scene
        if (this.scene) {
            this.scene.remove(this.group);
        }
        
        this.particleSystems = {};
        this.particlePool = [];
        this.materialsPool = [];
        
        // Dispose of geometry
        if (this.dustGeometry) {
            this.dustGeometry.dispose();
        }
    }
} 