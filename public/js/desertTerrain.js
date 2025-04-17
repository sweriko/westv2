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
            cactiCount: 120, // Number of cacti to place (increased from 60)
            noiseScale: {
                base: 0.0003,
                dunes: 0.0008,
                secondaryDunes: 0.0015,
                ridges: 0.003,
                detail: 0.01,
                flat: 0.0003,
                // Enhanced micro-detail scales for more prominent sand ripples
                microRipples: 0.04, // Adjusted for better groove definition
                sandGrains: 0.3
            },
            heightScale: {
                base: 15,
                dunes: 40, // Reduced from 70 for lower dune heights
                secondaryDunes: 20, // Reduced from 30
                ridges: 10, // Reduced from 15
                detail: 8,
                // Increased height adjustments for more pronounced micro-detail
                microRipples: 2.0, // Increased for more visible grooves
                sandGrains: 0.3  // Slightly increased from 0.2
            },
            duneDirection: Math.PI * 0.25, // Wind direction
            sandColors: [
                new THREE.Color(0xec9e5c), // Base sand color
                new THREE.Color(0xd4884a), // Slightly darker
                new THREE.Color(0xf7b777), // Slightly lighter
                new THREE.Color(0xb7703e), // Darker/shadow areas
                new THREE.Color(0xffc890)  // Highlight areas
            ],
            distanceBlur: {
                enabled: true,
                startDistance: desertSize * 0.35, // Start blurring at 35% distance from center
                endDistance: desertSize * 0.5,    // Maximum blur at edge
                skyboxColor: new THREE.Color(0xaad6f5), // Light blue to match skybox horizon
                atmosphericHaze: true,            // Enable atmospheric haze on dunes
                hazeStartDistance: desertSize * 0.15, // Start atmospheric effect closer
                hazeFactor: 0.6                  // Strength of the atmospheric effect
            },
            dunes: {
                smoothing: true,          // Enable dune edge smoothing
                smoothingFactor: 0.7,     // How much to smooth dune edges (0-1)
                ridgeSharpness: 0.4       // Reduced ridge sharpness (0-1)
            },
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
        
        // Add ridge details with reduced sharpness
        const ridges = this.ridgeNoise.noise(
            rotX * this.config.noiseScale.ridges,
            rotZ * this.config.noiseScale.ridges
        );
        
        // Create smoother ridges if smoothing is enabled
        let ridgeHeight;
        if (this.config.dunes.smoothing) {
            // Use a smoother curve for ridge calculation
            const smoothedRidge = (Math.abs(ridges * 2 - 1));
            // Apply smoothing factor
            const smoothingPower = 1.0 + this.config.dunes.smoothingFactor * 2.0;
            ridgeHeight = Math.pow(smoothedRidge, smoothingPower) * this.config.heightScale.ridges;
            
            // Further reduce sharp edges by applying a gentler curve
            ridgeHeight *= this.config.dunes.ridgeSharpness;
        } else {
            // Original ridge calculation
            ridgeHeight = (Math.abs(ridges * 2 - 1)) * this.config.heightScale.ridges;
        }
        
        return duneHeight + secondaryHeight + ridgeHeight;
    }
    
    // Check if a point is near the train track
    isNearTrainTrack(x, z) {
        // Access global train track constants
        const trackStart = window.TRAIN_TRACK_START || new THREE.Vector3(0, 0, -1000);
        const trackEnd = window.TRAIN_TRACK_END || new THREE.Vector3(0, 0, 1000);
        
        // Width of the flattened area on each side of the track (1m as requested)
        const trackWidth = 1.0;
        
        // Create a line segment representing the track
        const trackVector = new THREE.Vector3().subVectors(trackEnd, trackStart).normalize();
        const pointVector = new THREE.Vector3(x, 0, z);
        
        // Calculate the projection of the point onto the track line
        const trackStartToPoint = new THREE.Vector3().subVectors(pointVector, trackStart);
        const dotProduct = trackStartToPoint.dot(trackVector);
        
        // Clamp the projection to the track segment
        const projectionScalar = Math.max(0, Math.min(dotProduct, trackEnd.distanceTo(trackStart)));
        
        // Calculate the closest point on the track
        const closestPoint = new THREE.Vector3().copy(trackStart).addScaledVector(trackVector, projectionScalar);
        
        // Calculate the distance from the point to the closest point on the track
        const distance = pointVector.distanceTo(closestPoint);
        
        // Check if the point is within the track width and within the track segment
        return distance <= trackWidth && projectionScalar >= 0 && projectionScalar <= trackEnd.distanceTo(trackStart);
    }
    
    // Get blend factor for town area (0 = in town, 1 = full desert)
    getTownBlendFactor(x, z) {
        // Calculate distance from town center
        const distFromTown = Math.sqrt(x * x + z * z);
        
        // Check if point is near train track
        const isOnTrack = this.isNearTrainTrack(x, z);
        
        // If near train track, return 0 to make it flat
        if (isOnTrack) {
            return 0;
        }
        
        // Normal town blending
        if (distFromTown < this.config.townBuffer) {
            // Completely flat within town
            return 0;
        } else if (distFromTown < this.config.townBuffer * 1.5) {
            // Gradual transition at edge of town
            const transitionFactor = (distFromTown - this.config.townBuffer) / (this.config.townBuffer * 0.5);
            return Math.pow(transitionFactor, 2.0); // Squared for smoother transition
        } else {
            // Full desert terrain
            return 1.0;
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
        
        // Create buffer for vertex height adjustments (for sand waves)
        const heightAtEdge = this.config.size * 0.03;  // Raise edges slightly to blend with sky better
        
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
            
            // Add directional dunes with smoothing
            let duneHeight = this.getDirectionalDuneHeight(x, z);
            
            // Smooth transitions between dunes for more natural silhouettes
            if (this.config.dunes.smoothing) {
                // Apply additional smoothing to dune transitions
                const smoothingNoise = this.baseNoise.noise(
                    x * this.config.noiseScale.dunes * 2,
                    z * this.config.noiseScale.dunes * 2
                );
                
                // Use noise to slightly adjust dune height in a natural way
                duneHeight *= (0.85 + smoothingNoise * 0.3);
            }
            
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
            
            // Apply atmospheric haze effect to dune edges and higher areas
            if (this.config.distanceBlur.atmosphericHaze && distFromCenter > this.config.distanceBlur.hazeStartDistance) {
                // Calculate haze factor based on distance and height
                const distanceFactor = Math.min(1.0, (distFromCenter - this.config.distanceBlur.hazeStartDistance) / 
                                   (this.config.distanceBlur.endDistance - this.config.distanceBlur.hazeStartDistance));
                
                // More haze on higher terrain (silhouettes against sky)
                const heightFactor = Math.min(1.0, height / (this.config.heightScale.dunes * 0.5));
                
                // Combine factors with configurable intensity
                const hazeFactor = distanceFactor * heightFactor * this.config.distanceBlur.hazeFactor;
                
                // Apply more intense sky color blending to higher dunes
                const skyColorBlend = this.config.distanceBlur.skyboxColor.clone();
                
                // Apply haze color blend
                colors[colorIdx] = finalColor.r * (1 - hazeFactor) + skyColorBlend.r * hazeFactor;
                colors[colorIdx + 1] = finalColor.g * (1 - hazeFactor) + skyColorBlend.g * hazeFactor;
                colors[colorIdx + 2] = finalColor.b * (1 - hazeFactor) + skyColorBlend.b * hazeFactor;
            }
            
            // Apply distance blur/fog effect by blending with skybox color at edges
            if (this.config.distanceBlur.enabled && distFromCenter > this.config.distanceBlur.startDistance) {
                const blurFactor = Math.min(1.0, (distFromCenter - this.config.distanceBlur.startDistance) / 
                                       (this.config.distanceBlur.endDistance - this.config.distanceBlur.startDistance));
                
                // Apply stronger color blend for more dramatic effect
                colors[colorIdx] = colors[colorIdx] * (1 - blurFactor) + this.config.distanceBlur.skyboxColor.r * blurFactor;
                colors[colorIdx + 1] = colors[colorIdx + 1] * (1 - blurFactor) + this.config.distanceBlur.skyboxColor.g * blurFactor;
                colors[colorIdx + 2] = colors[colorIdx + 2] * (1 - blurFactor) + this.config.distanceBlur.skyboxColor.b * blurFactor;
                
                // Gradually raise the terrain at edges to create a smooth blend with sky
                if (distFromCenter > this.config.distanceBlur.startDistance) {
                    const heightBlendFactor = Math.pow(blurFactor, 2.0); // Stronger curve for height adjustment
                    vertices[i + 1] += heightAtEdge * heightBlendFactor;
                }
            }
        }
        
        // Add colors to geometry
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        
        // Create sand material with textures
        const sandMaterial = new THREE.MeshPhongMaterial({
            vertexColors: true,
            shininess: 0,
            specular: new THREE.Color(0x000000),
            normalMap: normalMapTexture,
            normalScale: new THREE.Vector2(1.2, 1.2),
            fog: true
        });
        
        // Ensure no environment reflections
        sandMaterial.envMap = null;
        
        // No custom shader modifications - rely on the built-in fog system and vertex colors
        
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
        const normalStrength = 40; // Increased from 30 to restore groove visibility
        
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
                    windAlignedX * 35,
                    windAlignedY * 12
                ) * 1.8;
                
                // Fine sand grain texture
                const grains = this.sandGrainsNoise.noise(nx * 200, ny * 200) * 0.2;
                
                // Medium-scale variations
                const mediumVar = this.detailNoise.noise(nx * 40, ny * 40) * 0.5;
                
                // Combine layers - emphasize ripples more but with balanced intensity
                const combined = ripples * 0.8 + grains * 0.3 + mediumVar * 0.2; // Adjusted weights to better show grooves
                
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
                const baseRoughness = 245; // High base roughness
                
                // Wind direction-aligned roughness variation (simulates sand accumulation)
                const windDirection = this.config.duneDirection;
                const alignedX = nx * Math.cos(windDirection) + ny * Math.sin(windDirection);
                const alignedY = -nx * Math.sin(windDirection) + ny * Math.cos(windDirection);
                
                // More pronounced wind ripples with stronger contrast for roughness variation
                const windPattern = this.microRipplesNoise.noise(alignedX * 30, alignedY * 8);
                
                // Fine grain roughness detail
                const fineGrains = this.sandGrainsNoise.noise(nx * 300, ny * 300) * 5;
                
                // Calculate final roughness value - higher in troughs, slightly lower on crests
                // This variation helps with visual appearance while keeping overall roughness high
                const roughness = Math.min(255, Math.max(230, 
                    baseRoughness + (windPattern < 0 ? 10 : -5) + fineGrains
                ));
                
                // Store the value
                data[y * size + x] = roughness;
            }
        }
        
        // Create texture from data
        const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(20, 20);
        texture.needsUpdate = true;
        
        return texture;
    }
    
    // Add cacti to the scene
    addCacti() {
        // Create cactus materials
        const cactusMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d5c2d,
            roughness: 0.8,
            metalness: 0.2,
        });
        
        // Cactus segments to be instanced
        const segmentGeometries = [
            // Main trunk (shorter now)
            this.createCactusTrunk(2.5, 4, 20, 8),
            // Arm segment (horizontal part)
            this.createCactusArm(1.8, 2.2, 8, 8),
            // Arm tip (vertical part) 
            this.createCactusTrunk(1.5, 1.8, 12, 8),
        ];
        
        // Create instanced mesh for each geometry type
        const cactusCount = this.config.cactiCount;
        const instancedSegments = [];
        
        // Create instanced mesh for each segment type
        for (let i = 0; i < segmentGeometries.length; i++) {
            const instancedMesh = new THREE.InstancedMesh(
                segmentGeometries[i],
                cactusMaterial,
                cactusCount * (i === 0 ? 1 : 2) // One trunk per cactus, two arms per cactus
            );
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = true;
            instancedSegments.push(instancedMesh);
        }
        
        // Helper matrices and vectors
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
            
            // Random scale and rotation
            const cactusScale = 0.3 + Math.random() * 0.5; // Slightly smaller scale range
            const trunkRotation = Math.random() * Math.PI * 2;
            
            // Position and orient the trunk
            position.set(x, y, z);
            rotation.set(0, trunkRotation, 0);
            quaternion.setFromEuler(rotation);
            scale.set(cactusScale, cactusScale, cactusScale);
            
            matrix.compose(position, quaternion, scale);
            instancedSegments[0].setMatrixAt(i, matrix);
            
            // Add arms to the cactus with varying heights and angles
            for (let arm = 0; arm < 2; arm++) {
                // Calculate arm position on the trunk
                const armHeight = 5 + Math.random() * 8; // Lower arm position
                const armAngle = arm * Math.PI + (Math.random() * 0.5 - 0.25);
                const armLength = 4 + Math.random() * 3;
                
                // Horizontal arm segment
                const armX = x + Math.cos(trunkRotation + armAngle) * 2 * cactusScale;
                const armZ = z + Math.sin(trunkRotation + armAngle) * 2 * cactusScale;
                const armY = y + armHeight * cactusScale;
                
                position.set(armX, armY, armZ);
                rotation.set(Math.PI/2, trunkRotation + armAngle + Math.PI/2, 0);
                quaternion.setFromEuler(rotation);
                
                matrix.compose(position, quaternion, scale);
                instancedSegments[1].setMatrixAt(i * 2 + arm, matrix);
                
                // Vertical arm tip
                const tipX = armX + Math.cos(trunkRotation + armAngle) * armLength * cactusScale;
                const tipZ = armZ + Math.sin(trunkRotation + armAngle) * armLength * cactusScale;
                const tipY = armY;
                
                position.set(tipX, tipY, tipZ);
                rotation.set(0, trunkRotation, 0);
                quaternion.setFromEuler(rotation);
                
                matrix.compose(position, quaternion, scale);
                instancedSegments[2].setMatrixAt(i * 2 + arm, matrix);
            }
        }
        
        // Update matrices and add to scene
        for (const instancedMesh of instancedSegments) {
            instancedMesh.instanceMatrix.needsUpdate = true;
            this.scene.add(instancedMesh);
        }
        
        return instancedSegments;
    }
    
    // Create a cactus trunk segment
    createCactusTrunk(topRadius, bottomRadius, height, segments) {
        const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, segments);
        geometry.translate(0, height/2, 0);
        return geometry;
    }
    
    // Create a cactus arm segment (horizontal part)
    createCactusArm(topRadius, bottomRadius, length, segments) {
        const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, length, segments);
        geometry.rotateZ(Math.PI/2);
        geometry.translate(length/2, 0, 0);
        return geometry;
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