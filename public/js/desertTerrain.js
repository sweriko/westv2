/**
 * Creates an endless procedural desert terrain around the town.
 * Based on Perlin noise for natural-looking dunes and terrain features.
 */

// A simple Perlin noise implementation for terrain generation
class PerlinNoise {
    constructor(seed = Math.random()) {
        this.seed = seed;
        this.perm = new Array(512);
        this.gradP = new Array(512);
        
        // Initialize permutation table
        const p = new Array(256);
        for (let i = 0; i < 256; i++) {
            p[i] = Math.floor(seed * 10000 + i) % 256;
        }
        
        // Populate permutation tables
        for (let i = 0; i < 512; i++) {
            this.perm[i] = p[i & 255];
            this.gradP[i] = this.gradients[this.perm[i] % 12];
        }
    }
    
    gradients = [
        [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
        [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
        [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
    ];
    
    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }
    
    lerp(a, b, t) {
        return (1 - t) * a + t * b;
    }
    
    grad(hash, x, y, z) {
        const g = this.gradP[hash];
        return g[0] * x + g[1] * y + g[2] * z;
    }
    
    noise(x, y, z = 0) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;
        
        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);
        
        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);
        
        const A = this.perm[X] + Y;
        const AA = this.perm[A] + Z;
        const AB = this.perm[A + 1] + Z;
        const B = this.perm[X + 1] + Y;
        const BA = this.perm[B] + Z;
        const BB = this.perm[B + 1] + Z;
        
        return this.lerp(
            this.lerp(
                this.lerp(this.grad(this.perm[AA], x, y, z), this.grad(this.perm[BA], x - 1, y, z), u),
                this.lerp(this.grad(this.perm[AB], x, y - 1, z), this.grad(this.perm[BB], x - 1, y - 1, z), u),
                v
            ),
            this.lerp(
                this.lerp(this.grad(this.perm[AA + 1], x, y, z - 1), this.grad(this.perm[BA + 1], x - 1, y, z - 1), u),
                this.lerp(this.grad(this.perm[AB + 1], x, y - 1, z - 1), this.grad(this.perm[BB + 1], x - 1, y - 1, z - 1), u),
                v
            ),
            w
        );
    }
}

export class DesertTerrain {
    constructor(scene, townDimensions) {
        this.scene = scene;
        this.townDimensions = townDimensions;
        
        // Calculate optimal terrain size based on town dimensions
        const townSize = Math.max(townDimensions.width, townDimensions.length);
        const desertSize = Math.max(5000, townSize * 25); // At least 25x larger than town
        
        // Setup with appropriate settings
        this.config = {
            size: desertSize, // Size based on town dimensions
            resolution: 196, // Resolution of the terrain (vertices per side)
            cactiCount: 60, // Number of cacti to place
            noiseScale: {
                base: 0.0003,
                dunes: 0.0008,
                secondaryDunes: 0.0015,
                ridges: 0.003,
                detail: 0.01,
                flat: 0.0003,
                // Enhanced micro-detail scales for more prominent sand ripples
                microRipples: 0.05, // Reduced from 0.08 for larger ripples
                sandGrains: 0.3
            },
            heightScale: {
                base: 15,
                dunes: 70,
                secondaryDunes: 30,
                ridges: 15,
                detail: 8,
                // Increased height adjustments for more pronounced micro-detail
                microRipples: 1.5, // Increased from 0.6 for more visible ripples
                sandGrains: 0.3  // Slightly increased from 0.2
            },
            duneDirection: Math.PI * 0.25, // Wind direction
            sandColors: [
                new THREE.Color(0xe6c288), // Base sand color
                new THREE.Color(0xd9b276), // Slightly darker
                new THREE.Color(0xf2d6a2), // Slightly lighter
                new THREE.Color(0xc19e65), // Darker/shadow areas
                new THREE.Color(0xf7e0b5)  // Highlight areas
            ],
            townBuffer: townSize * 1.2 // Buffer distance around town where terrain is flat
        };
        
        console.log(`Creating desert terrain with size ${desertSize} around town of size ${townSize}`);
        
        // Create noise generators
        this.baseNoise = new PerlinNoise(Math.random());
        this.duneNoise = new PerlinNoise(Math.random() + 100);
        this.secondaryDuneNoise = new PerlinNoise(Math.random() + 150);
        this.ridgeNoise = new PerlinNoise(Math.random() + 175);
        this.detailNoise = new PerlinNoise(Math.random() + 200);
        this.colorNoise = new PerlinNoise(Math.random() + 300);
        // Add micro-detail noise generators
        this.microRipplesNoise = new PerlinNoise(Math.random() + 400);
        this.sandGrainsNoise = new PerlinNoise(Math.random() + 500);
    }
    
    // Create directional dunes effect
    getDirectionalDuneHeight(x, z) {
        // Extract directional component based on wind angle
        const direction = this.config.duneDirection;
        
        // Rotate coordinates based on wind direction
        const rotX = x * Math.cos(direction) + z * Math.sin(direction);
        const rotZ = -x * Math.sin(direction) + z * Math.cos(direction);
        
        // Sample noise for directional dune patterns
        const duneHeight = this.duneNoise.noise(
            rotX * this.config.noiseScale.dunes,
            rotZ * this.config.noiseScale.dunes * 0.5
        ) * this.config.heightScale.dunes;
        
        // Add secondary dune system
        const secondaryHeight = this.secondaryDuneNoise.noise(
            rotX * this.config.noiseScale.secondaryDunes,
            rotZ * this.config.noiseScale.secondaryDunes
        ) * this.config.heightScale.secondaryDunes;
        
        // Add ridge details
        const ridges = this.ridgeNoise.noise(
            rotX * this.config.noiseScale.ridges,
            rotZ * this.config.noiseScale.ridges
        );
        
        // Create sharper ridges with absolute value transform
        const ridgeHeight = (Math.abs(ridges * 2 - 1)) * this.config.heightScale.ridges;
        
        return duneHeight + secondaryHeight + ridgeHeight;
    }
    
    // Calculate blend factor based on distance from town center
    getTownBlendFactor(x, z) {
        // Calculate distance from town center
        // Town is centered at (0,0,0) in the world
        const distFromTownCenter = Math.sqrt(
            Math.pow(x, 2) + 
            Math.pow(z, 2)
        );
        
        // Calculate town extents with buffer
        const townExtent = Math.max(
            this.townDimensions.width,
            this.townDimensions.length
        ) / 2 + this.config.townBuffer;
        
        // Create smooth blend from town to desert
        const blendDistance = 50; // Distance over which to blend
        const blendStart = townExtent;
        const blendEnd = blendStart + blendDistance;
        
        if (distFromTownCenter < blendStart) {
            return 0; // Fully town (flat)
        } else if (distFromTownCenter > blendEnd) {
            return 1; // Fully desert
        } else {
            // Smooth blend in between
            return (distFromTownCenter - blendStart) / blendDistance;
        }
    }
    
    // Generate terrain mesh
    generateTerrain() {
        // Create textures for sand
        const normalMapTexture = this.createSandNormalMap();
        const roughnessTexture = this.createSandRoughnessMap();
        
        // Create geometry
        const geometry = new THREE.PlaneGeometry(
            this.config.size, 
            this.config.size, 
            this.config.resolution, 
            this.config.resolution
        );
        
        geometry.rotateX(-Math.PI / 2);
        
        const vertices = geometry.attributes.position.array;
        
        // Create vertex colors array
        const colors = new Float32Array(vertices.length);
        
        // Edge fade values
        const edgeFadeStart = this.config.size * 0.4; // Start fading at 40% from center
        const edgeFadeEnd = this.config.size * 0.5;   // Complete fade at edge
        
        // Apply noise to create terrain
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const z = vertices[i + 2];
            
            // Calculate distance from center for edge blending
            const distFromCenter = Math.sqrt(x * x + z * z);
            
            // Calculate town blend factor (0 = flat town area, 1 = full desert)
            const townBlend = this.getTownBlendFactor(x, z);
            
            // Base terrain
            let height = this.baseNoise.noise(x * this.config.noiseScale.base, z * this.config.noiseScale.base) * this.config.heightScale.base;
            
            // Add directional dunes
            const duneHeight = this.getDirectionalDuneHeight(x, z);
            
            // Apply town blend factor to terrain height
            height += duneHeight * townBlend;
            
            // Add small ripples to dunes (more pronounced farther from town)
            const detailHeight = this.detailNoise.noise(x * this.config.noiseScale.detail, z * this.config.noiseScale.detail) 
                * this.config.heightScale.detail;
            height += detailHeight * Math.min(1, duneHeight / 20) * townBlend;
            
            // Add micro-ripples from wind patterns - aligned with wind direction
            const windDirection = this.config.duneDirection;
            const alignedX = x * Math.cos(windDirection) + z * Math.sin(windDirection);
            const alignedZ = -x * Math.sin(windDirection) + z * Math.cos(windDirection);
            
            // More pronounced micro-ripples
            const microRipples = this.microRipplesNoise.noise(
                alignedX * this.config.noiseScale.microRipples,
                alignedZ * this.config.noiseScale.microRipples * 5 // More stretching for pronounced directional ripples
            ) * this.config.heightScale.microRipples;
            
            // Create additional small ripple detail for more complex patterns
            const secondaryRipples = this.microRipplesNoise.noise(
                alignedX * this.config.noiseScale.microRipples * 2,
                alignedZ * this.config.noiseScale.microRipples * 7
            ) * this.config.heightScale.microRipples * 0.4;
            
            // Add sand grain detail for very close-up detail
            const sandGrains = this.sandGrainsNoise.noise(
                x * this.config.noiseScale.sandGrains,
                z * this.config.noiseScale.sandGrains
            ) * this.config.heightScale.sandGrains;
            
            // Apply micro-detail based on distance from town (more detail in desert areas)
            height += (microRipples + secondaryRipples + sandGrains) * townBlend;
            
            // Add occasional flat areas (dried lake beds)
            const flatArea = this.baseNoise.noise(x * this.config.noiseScale.flat + 500, z * this.config.noiseScale.flat + 500);
            if (flatArea > 0.6 && townBlend > 0.8) {
                height *= 0.2;
            }
            
            // Apply edge blending - gradually reduce height near edges
            if (distFromCenter > edgeFadeStart) {
                const edgeFactor = 1.0 - Math.min(1, (distFromCenter - edgeFadeStart) / (edgeFadeEnd - edgeFadeStart));
                height *= edgeFactor;
            }
            
            // Apply height to vertex
            vertices[i + 1] = height;
            
            // Calculate color index
            const colorNoise = this.colorNoise.noise(
                x * this.config.noiseScale.base * 2, 
                z * this.config.noiseScale.base * 2
            );
            
            // Calculate slope for color variation (approximation)
            let slope = 0;
            if (i > 3 && i < vertices.length - 3) {
                const prevHeight = vertices[i - 2];
                const nextHeight = vertices[i + 4];
                slope = Math.abs(nextHeight - prevHeight) / 2;
            }
            
            // Blend different sand colors
            const heightFactor = Math.max(0, Math.min(1, (height + 10) / 80));
            
            // Start with base color
            let finalColor = this.config.sandColors[0].clone();
            
            // Add darker sand in valleys
            if (heightFactor < 0.5) {
                finalColor.lerp(this.config.sandColors[1], 0.5 - heightFactor);
            }
            
            // Add lighter sand on peaks
            if (heightFactor > 0.5) {
                finalColor.lerp(this.config.sandColors[2], (heightFactor - 0.5) * 2);
            }
            
            // Add random variation
            if (colorNoise > 0) {
                finalColor.lerp(this.config.sandColors[4], colorNoise * 0.3);
            } else {
                finalColor.lerp(this.config.sandColors[3], -colorNoise * 0.3);
            }
            
            // Add slope-based coloring
            if (slope > 0.2) {
                const slopeFactor = Math.min(1, (slope - 0.2) * 5);
                finalColor.lerp(this.config.sandColors[3], slopeFactor * 0.5);
            }
            
            // Add micro-ripple highlights and shadows
            const microDetail = microRipples / this.config.heightScale.microRipples;
            if (microDetail > 0.3) {
                // Add highlights to ripple peaks
                finalColor.lerp(this.config.sandColors[4], (microDetail - 0.3) * 0.2);
            } else if (microDetail < -0.3) {
                // Add shadows to ripple valleys
                finalColor.lerp(this.config.sandColors[3], Math.abs(microDetail + 0.3) * 0.2);
            }
            
            // Store color
            const colorIdx = i;
            colors[colorIdx] = finalColor.r;
            colors[colorIdx + 1] = finalColor.g;
            colors[colorIdx + 2] = finalColor.b;
        }
        
        // Add colors to geometry
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        
        // Create sand material with textures
        const sandMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.98, // Keep high roughness to avoid shininess
            metalness: 0.0,  // Keep zero metalness
            flatShading: false,
            fog: true,
            normalMap: normalMapTexture,
            roughnessMap: roughnessTexture,
            normalScale: new THREE.Vector2(1.0, 1.0), // Increased from 0.6 to enhance normal map effect
            emissive: new THREE.Color(0x271000),
            emissiveIntensity: 0.05,
            envMapIntensity: 0.1, // Keep low to avoid shininess
            bumpMap: normalMapTexture, // Add bump map using the normal map for extra detail
            bumpScale: 0.3 // Subtle bump effect for additional texture
        });
        
        // Create terrain mesh
        this.terrainMesh = new THREE.Mesh(geometry, sandMaterial);
        this.terrainMesh.receiveShadow = true;
        this.terrainMesh.castShadow = true;
        
        // Position the terrain mesh a tiny bit below the current ground plane
        // to avoid z-fighting and ensure seamless transition
        this.terrainMesh.position.y = -0.05;
        
        // Center the terrain on the town's center (0,0,0)
        // This ensures the town is in the center of our desert terrain
        this.terrainMesh.position.set(0, -0.05, 0);
        
        this.scene.add(this.terrainMesh);
        
        return this.terrainMesh;
    }
    
    // Create a procedural normal map for sand texture
    createSandNormalMap() {
        const size = 1024;
        const data = new Uint8Array(size * size * 4);
        const normalStrength = 40; // Increased from 25 for stronger normal effect
        
        // Generate sand ripple and grain patterns using noise
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                // Calculate normalized coordinates
                const nx = x / size;
                const ny = y / size;
                
                // Multiple layers of noise for different scales of detail
                // Wind ripples - elongated with directional flow
                const windDirection = this.config.duneDirection;
                const windAlignedX = nx * Math.cos(windDirection) + ny * Math.sin(windDirection);
                const windAlignedY = -nx * Math.sin(windDirection) + ny * Math.cos(windDirection);
                
                // Enhanced ripple pattern - more pronounced
                const ripples = this.microRipplesNoise.noise(
                    windAlignedX * 40, // Reduced from 80 for larger ripples
                    windAlignedY * 15  // Reduced from 30 for more pronounced elongation
                ) * 1.5; // Amplified ripple effect
                
                // Fine sand grain texture
                const grains = this.sandGrainsNoise.noise(nx * 200, ny * 200) * 0.2;
                
                // Medium-scale variations
                const mediumVar = this.detailNoise.noise(nx * 40, ny * 40) * 0.5;
                
                // Combine layers - emphasize ripples more
                const combined = ripples * 0.8 + grains * 0.4 + mediumVar * 0.3;
                
                // Convert to normal map values
                // Calculate local derivatives for normal
                const idx = (y * size + x) * 4;
                
                // Calculate height differences for normal approximation
                const left = x > 0 ? ripples * 0.8 + this.sandGrainsNoise.noise((nx - 1/size) * 200, ny * 200) * 0.2 + 
                    this.detailNoise.noise((nx - 1/size) * 40, ny * 40) * 0.3 : combined;
                const right = x < size-1 ? ripples * 0.8 + this.sandGrainsNoise.noise((nx + 1/size) * 200, ny * 200) * 0.2 +
                    this.detailNoise.noise((nx + 1/size) * 40, ny * 40) * 0.3 : combined;
                const up = y > 0 ? ripples * 0.8 + this.sandGrainsNoise.noise(nx * 200, (ny - 1/size) * 200) * 0.2 +
                    this.detailNoise.noise(nx * 40, (ny - 1/size) * 40) * 0.3 : combined;
                const down = y < size-1 ? ripples * 0.8 + this.sandGrainsNoise.noise(nx * 200, (ny + 1/size) * 200) * 0.2 +
                    this.detailNoise.noise(nx * 40, (ny + 1/size) * 40) * 0.3 : combined;
                
                // X normal component (R)
                data[idx] = Math.min(255, Math.max(0, 128 + normalStrength * (right - left)));
                // Y normal component (G)
                data[idx + 1] = Math.min(255, Math.max(0, 128 + normalStrength * (down - up)));
                // Z normal component (B) - always positive since we're looking at the top
                data[idx + 2] = 255;
                // Alpha
                data[idx + 3] = 255;
            }
        }
        
        // Create texture from data
        const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(15, 15); // Reduced from 20 to make patterns larger
        texture.needsUpdate = true;
        
        return texture;
    }
    
    // Create a procedural roughness map for sand texture
    createSandRoughnessMap() {
        const size = 512;
        const data = new Uint8Array(size * size);
        
        // Generate sand grain patterns
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                // Calculate normalized coordinates
                const nx = x / size;
                const ny = y / size;
                
                // Multi-layer noise for varying roughness
                const baseRoughness = 220; // Slightly reduced from 230 to allow more variation
                
                // Wind direction-aligned roughness variation (simulates sand accumulation)
                const windDirection = this.config.duneDirection;
                const alignedX = nx * Math.cos(windDirection) + ny * Math.sin(windDirection);
                const alignedY = -nx * Math.sin(windDirection) + ny * Math.cos(windDirection);
                
                // More pronounced wind ripples with stronger contrast
                const windPattern = this.microRipplesNoise.noise(alignedX * 30, alignedY * 8) * 2.0;
                
                // Secondary smaller ripples
                const smallRipples = this.microRipplesNoise.noise(alignedX * 60, alignedY * 12) * 0.8;
                
                // Combine fine grain detail
                const fineGrains = this.sandGrainsNoise.noise(nx * 300, ny * 300) * 15;
                
                // Medium grain detail
                const mediumGrains = this.detailNoise.noise(nx * 50, ny * 50) * 10;
                
                // Make sure ripple crests have different roughness than troughs
                // to enhance the visual appearance of the ripples
                const windRoughness = windPattern * 20;
                const smallRippleRoughness = smallRipples * 10;
                
                // Calculate final roughness value
                // Higher value = rougher = less specular highlight
                const roughness = Math.min(255, Math.max(180, 
                    baseRoughness + windRoughness + smallRippleRoughness + fineGrains + mediumGrains
                ));
                
                // Store the value
                data[y * size + x] = roughness;
            }
        }
        
        // Create texture from data
        const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(20, 20); // Adjusted for better scaling with normal map
        texture.needsUpdate = true;
        
        return texture;
    }
    
    // Add cacti to the scene
    addCacti() {
        // Create cactus trunk geometry
        const trunkGeometry = new THREE.CylinderGeometry(3, 5, 50, 8);
        trunkGeometry.translate(0, 25, 0);
        
        // Create material
        const cactusMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d5c2d,
            roughness: 0.8,
            metalness: 0.2,
        });
        
        // Create instanced mesh 
        const cactusCount = this.config.cactiCount;
        const instancedCacti = new THREE.InstancedMesh(
            trunkGeometry,
            cactusMaterial,
            cactusCount
        );
        instancedCacti.castShadow = true;
        
        // Position cacti
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Euler();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        
        // Create cacti in a ring pattern around the town
        for (let i = 0; i < cactusCount; i++) {
            // Random position avoiding town center area using a ring distribution
            let x, z, townBlend;
            const angle = Math.random() * Math.PI * 2; // Random angle around circle
            const minRadius = Math.max(this.townDimensions.width, this.townDimensions.length) + 150; // Min distance from town center
            const maxRadius = this.config.size * 0.3; // Max distance from town center
            
            // Calculate position in a ring around the town
            const radius = minRadius + Math.random() * (maxRadius - minRadius);
            x = Math.cos(angle) * radius;
            z = Math.sin(angle) * radius;
            
            // Verify this position is in the desert part of the terrain
            townBlend = this.getTownBlendFactor(x, z);
            
            // If not in desert, try again with a larger radius
            if (townBlend < 0.9) {
                const adjustedRadius = minRadius * 1.2;
                x = Math.cos(angle) * adjustedRadius;
                z = Math.sin(angle) * adjustedRadius;
                townBlend = this.getTownBlendFactor(x, z);
            }
            
            // Calculate height based on terrain
            const baseHeight = this.baseNoise.noise(x * this.config.noiseScale.base, z * this.config.noiseScale.base) 
                * this.config.heightScale.base;
            const duneHeight = this.getDirectionalDuneHeight(x, z);
            const y = baseHeight + duneHeight;
            
            // Random scale
            const cactusScale = 0.3 + Math.random() * 0.7;
            
            // Set matrix for this instance
            position.set(x, y, z);
            rotation.set(0, Math.random() * Math.PI * 2, 0);
            quaternion.setFromEuler(rotation);
            scale.set(cactusScale, cactusScale, cactusScale);
            
            matrix.compose(position, quaternion, scale);
            instancedCacti.setMatrixAt(i, matrix);
        }
        
        instancedCacti.instanceMatrix.needsUpdate = true;
        this.scene.add(instancedCacti);
        
        return instancedCacti;
    }
    
    // Generate the entire desert environment
    generate() {
        console.log("Generating procedural desert terrain...");
        
        // Generate terrain mesh
        this.generateTerrain();
        
        // Add cacti
        this.addCacti();
        
        console.log("Desert terrain generation complete");
    }
} 