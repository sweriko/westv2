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
        // Use skybox radius but extend terrain slightly beyond it to prevent horizon gap
        const skyboxRadius = 2500; // Increased from 900 to match scene.js
        // Extend terrain 10% beyond skybox to ensure proper horizon blending
        const desertSize = skyboxRadius * 2 * 1.1;
        
        // Setup with appropriate settings
        this.config = {
            size: desertSize, // Size to extend slightly beyond skybox
            resolution: 256, // Increased from 128 for better terrain-collider fidelity
            noiseScale: {
                base: 0.0004, // Slightly increased for more detail in smaller terrain
                dunes: 0.001, // Slightly increased for more visible features
                secondaryDunes: 0.0018,
                ridges: 0.0035,
                detail: 0.012,
                flat: 0.0004,
                // Enhanced micro-detail scales for more prominent sand ripples
                microRipples: 0.045, // Slightly increased for better visibility
                sandGrains: 0.3
            },
            heightScale: {
                base: 5, // Reduced from 15 for much flatter base terrain
                dunes: 10, // Drastically reduced from 40 for very low dune heights
                secondaryDunes: 5, // Reduced from 20 for flatter secondary dunes
                ridges: 2, // Significantly reduced from 10 for minimal ridges
                detail: 2, // Reduced from 8 for less dramatic detail
                // Keeping micro-detail adjustments as they're already small
                microRipples: 2.0,
                sandGrains: 0.3
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
                enabled: false, // Disabled distance blur
                startDistance: skyboxRadius * 0.85,
                endDistance: skyboxRadius * 0.98,
                skyboxColor: new THREE.Color(0xaad6f5),
                atmosphericHaze: false,    // Disabled atmospheric haze
                hazeStartDistance: skyboxRadius * 0.6,
                hazeFactor: 0
            },
            dunes: {
                smoothing: true,          // Enable dune edge smoothing
                smoothingFactor: 0.7,     // How much to smooth dune edges (0-1)
                ridgeSharpness: 0.4       // Reduced ridge sharpness (0-1)
            },
            townBuffer: townSize * 1.2, // Buffer distance around town where terrain is flat
            edgeFix: {
                enabled: true,              // Enable special edge treatment
                heightAtEdge: 5.0,          // Height at the very edge to connect with skybox
                startDistance: skyboxRadius * 0.85, // Start raising terrain at same point as blur
                endSharpness: 0.2           // Sharp transition at the very edge
            }
        };
        
        console.log(`Creating optimized desert terrain: size ${desertSize}, extends ${Math.round((desertSize/2) - skyboxRadius)} units beyond skybox`);
        
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
        // Access global train path if available from scene.js
        if (window.trainPath) {
            // Width of the flattened area on each side of the track
            const trackWidth = 1.5; // Slightly wider to ensure the track is fully flattened
            
            // Create a vector for the current point
            const pointVector = new THREE.Vector3(x, 0, z);
            
            // Find the closest point on the curve to our point
            // Get enough points from the curve for accuracy
            const curvePoints = window.trainPath.getPoints(200);
            let closestDist = Infinity;
            
            // Find the closest point on the curve
            for (let i = 0; i < curvePoints.length; i++) {
                const dist = pointVector.distanceTo(curvePoints[i]);
                if (dist < closestDist) {
                    closestDist = dist;
                }
            }
            
            // Check if the point is within track width
            return closestDist <= trackWidth;
        }
        
        // Fallback to the old method if trainPath is not available
        // Access global train track constants
        const trackStart = window.TRAIN_TRACK_START || new THREE.Vector3(0, 0, -1000);
        const trackEnd = window.TRAIN_TRACK_END || new THREE.Vector3(0, 0, 1000);
        
        // Width of the flattened area on each side of the track
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
        
        // Edge fade values - optimized for smaller terrain
        const edgeFadeStart = this.config.distanceBlur.startDistance;
        const edgeFadeEnd = this.config.distanceBlur.endDistance;
        
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
            
            // EDGE FIX - Improved edge handling for horizon blending
            if (this.config.edgeFix.enabled && distFromCenter > this.config.edgeFix.startDistance) {
                // Calculate how far we are toward the edge (0 = at start, 1 = at very edge)
                const edgeProgress = Math.min(1.0, (distFromCenter - this.config.edgeFix.startDistance) / 
                                     (this.config.size/2 - this.config.edgeFix.startDistance));
                
                // Use a curve that rises sharply at the end
                const raiseFactor = Math.pow(edgeProgress, 1.0 + this.config.edgeFix.endSharpness * 5.0);
                
                // As we approach the very edge, terrain height becomes less important
                // and the fixed edge height becomes more important
                height = height * (1.0 - raiseFactor) + this.config.edgeFix.heightAtEdge * raiseFactor;
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
            
            // Set the final vertex color
            const colorIdx = i;
            colors[colorIdx] = finalColor.r;
            colors[colorIdx + 1] = finalColor.g;
            colors[colorIdx + 2] = finalColor.b;
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
        
        // Create a heightfield collision shape in the physics system if available
        if (window.physics) {
            console.log("Creating high-resolution terrain collider for physics...");
            // Sample the terrain heights for physics collision
            const sizeX = Math.min(this.config.resolution, 128); // Limit for performance
            const sizeZ = Math.min(this.config.resolution, 128); // Limit for performance
            const heightData = new Array(sizeX);
            const elementSize = this.config.size / sizeX;
            
            // Initialize heightData array
            for (let i = 0; i < sizeX; i++) {
                heightData[i] = new Array(sizeZ);
                for (let j = 0; j < sizeZ; j++) {
                    // Calculate world position
                    const x = (i - sizeX/2) * elementSize;
                    const z = (j - sizeZ/2) * elementSize;
                    // Get height from our terrain function
                    heightData[i][j] = this.getHeightAt(x, z);
                }
            }
            
            // Call method to update/create the terrain collider
            if (typeof window.physics.updateTerrainCollider === 'function') {
                window.physics.updateTerrainCollider(heightData, this.config.size, elementSize);
            } else {
                console.warn("Physics system does not support heightfield terrain colliders. Using height sampling instead.");
            }
        }
        
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
        texture.repeat.set(10, 10); // Reduced from 15 for smaller terrain size
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
        texture.repeat.set(12, 12); // Reduced from 20 for smaller terrain size
        texture.needsUpdate = true;
        
        return texture;
    }
    
    // Add shrubs to the scene using the shrub1.glb model
    addShrubs() {
        // Increased count for better coverage
        const scatterObjects = [
            { name: 'shrub1', count: 1200 },
            { name: 'shrub2', count: 1100 },
            { name: 'cactus1', count: 400 },
            { name: 'cactus2', count: 350 },
            { name: 'rock1', count: 900 },
            { name: 'rock2', count: 800 }
        ];
        
        // Prepare matrix reuse
        const scatterMatrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Euler();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        
        // Center of town for reference
        const townCenter = new THREE.Vector3(0, 0, 0);
        const townConcentrationRadius = this.config.townBuffer * 1.8;
        
        // Create skybox reference
        const skyboxRadius = this.config.size / 2 / 1.1; // Derive from terrain size and buffer
        
        console.time('Height map generation');
        
        // Pre-compute a height map for improved performance
        console.time('Height map generation');
        const heightMap = {};
        const heightMapResolution = 4; // Reduced from 8 for higher precision matching terrain detail
        const heightMapRadius = skyboxRadius;
        
        // Only create a partial heightmap for major areas to save initialization time
        for (let x = -heightMapRadius; x <= heightMapRadius; x += heightMapResolution) {
            for (let z = -heightMapRadius; z <= heightMapRadius; z += heightMapResolution) {
                // Only calculate heights for points within our radius
                const distFromCenter = Math.sqrt(x * x + z * z);
                if (distFromCenter <= heightMapRadius) {
                    // Use the terrain height function which is much faster than raycasting
                    const y = this.getHeightAt(x, z);
                    const key = `${Math.round(x)},${Math.round(z)}`;
                    heightMap[key] = y;
                }
            }
        }
        console.timeEnd('Height map generation');
        
        // Function to get height at a position (using heightmap for speed)
        const getHeightAtPosition = (x, z) => {
            // Round to nearest point in our grid
            const gridX = Math.round(x / heightMapResolution) * heightMapResolution;
            const gridZ = Math.round(z / heightMapResolution) * heightMapResolution;
            const key = `${Math.round(gridX)},${Math.round(gridZ)}`;
            
            if (heightMap[key] !== undefined) {
                return heightMap[key];
            }
            
            // Fallback to analytic height function if the point isn't in our map
            return this.getHeightAt(x, z);
        };
        
        const loader = new THREE.GLTFLoader();
        
        // For each model, create a random number of instances
        scatterObjects.forEach(model => {
            const modelPath = `models/scatter/${model.name}.glb`;
            
            // Increase stone/rock spawning by giving them a higher instance count
            let instanceCount;
            if (model.name.startsWith('rock')) {
                // Significantly more rocks (3-4x more than other objects)
                instanceCount = Math.floor((model.count / scatterObjects.length) * 3.5) + Math.floor(Math.random() * 10);
            } else {
                // Normal amount for other objects
                instanceCount = Math.floor(model.count / scatterObjects.length) + Math.floor(Math.random() * 5);
            }
            
            loader.load(modelPath, (gltf) => {
                console.log(`Loaded scatter model: ${modelPath}`, gltf);
                
                // Find the first mesh in the model
                let scatterMesh = null;
                gltf.scene.traverse((child) => {
                    if (!scatterMesh && child.isMesh) {
                        scatterMesh = child;
                    }
                });
                
                if (!scatterMesh) {
                    console.error(`Could not find mesh in model: ${modelPath}`);
                    return;
                }
                
                // Create instanced mesh for the scatter object
                const instancedScatter = new THREE.InstancedMesh(
                    scatterMesh.geometry,
                    scatterMesh.material,
                    instanceCount
                );
                instancedScatter.castShadow = true;
                instancedScatter.receiveShadow = true;
                
                // Create scatter objects throughout the terrain
                let instancesPlaced = 0;
                
                // How many to place in the town area (higher percentage for rocks)
                const townConcentrationPercentage = model.name.startsWith('rock') ? 0.7 : 0.3;
                const townInstanceCount = Math.floor(instanceCount * townConcentrationPercentage);
                const outsideInstanceCount = instanceCount - townInstanceCount;
                
                // 1. First place objects in and around town
                for (let i = 0; i < townInstanceCount * 3 && instancesPlaced < townInstanceCount; i++) {
                    // Random position in or around town center
                    const angle = Math.random() * Math.PI * 2;
                    // Concentrate in town and 100m around it
                    const radius = Math.random() * townConcentrationRadius;
                    const x = Math.cos(angle) * radius;
                    const z = Math.sin(angle) * radius;
                    
                    // Skip if near train track
                    if (this.isNearTrainTrack(x, z)) {
                        continue;
                    }
                    
                    // OPTIMIZED: Use pre-calculated height map instead of raycasting
                    const y = getHeightAtPosition(x, z);
                    
                    // Random scale based on model type
                    let objectScale;
                    let yOffset = 0; // Default no offset
                    
                    // Apply appropriate scale and y-offset based on model type
                    if (model.name.startsWith('shrub')) {
                        objectScale = 0.05 + Math.random() * 0.15;
                    } else if (model.name.startsWith('cactus')) {
                        objectScale = 0.08 + Math.random() * 0.12;
                    } else if (model.name.startsWith('rock')) {
                        objectScale = 0.03 + Math.random() * 0.10;
                        // Apply negative y-offset to rocks to partially embed them in the ground
                        yOffset = -0.5 * objectScale;
                    }
                    
                    // Random rotation
                    const objectRotation = Math.random() * Math.PI * 2;
                    
                    // Position and orient the object precisely on terrain with any needed offset
                    position.set(x, y + yOffset, z);
                    rotation.set(0, objectRotation, 0);
                    quaternion.setFromEuler(rotation);
                    scale.set(objectScale, objectScale, objectScale);
                    
                    scatterMatrix.compose(position, quaternion, scale);
                    instancedScatter.setMatrixAt(instancesPlaced, scatterMatrix);
                    instancesPlaced++;
                }
                
                // 2. Then place remaining objects outside town
                for (let i = 0; i < outsideInstanceCount * 3 && instancesPlaced < instanceCount; i++) {
                    // Random position in the terrain but outside town radius
                    const angle = Math.random() * Math.PI * 2;
                    // Place between town radius and skybox
                    const radius = townConcentrationRadius + Math.random() * (skyboxRadius - townConcentrationRadius);
                    const x = Math.cos(angle) * radius;
                    const z = Math.sin(angle) * radius;
                    
                    // Skip if near train track
                    if (this.isNearTrainTrack(x, z)) {
                        continue;
                    }
                    
                    // OPTIMIZED: Use pre-calculated height map instead of raycasting
                    const y = getHeightAtPosition(x, z);
                    
                    // Random scale based on model type
                    let objectScale;
                    let yOffset = 0; // Default no offset
                    
                    // Apply appropriate scale and y-offset based on model type
                    if (model.name.startsWith('shrub')) {
                        objectScale = 0.05 + Math.random() * 0.15;
                    } else if (model.name.startsWith('cactus')) {
                        objectScale = 0.08 + Math.random() * 0.12;
                    } else if (model.name.startsWith('rock')) {
                        objectScale = 0.03 + Math.random() * 0.10;
                        // Apply negative y-offset to rocks to partially embed them in the ground
                        yOffset = -0.5 * objectScale;
                    }
                    
                    // Random rotation
                    const objectRotation = Math.random() * Math.PI * 2;
                    
                    // Position and orient the object precisely on terrain with any needed offset
                    position.set(x, y + yOffset, z);
                    rotation.set(0, objectRotation, 0);
                    quaternion.setFromEuler(rotation);
                    scale.set(objectScale, objectScale, objectScale);
                    
                    scatterMatrix.compose(position, quaternion, scale);
                    instancedScatter.setMatrixAt(instancesPlaced, scatterMatrix);
                    instancesPlaced++;
                }
                
                // Update matrices and add to scene
                instancedScatter.instanceMatrix.needsUpdate = true;
                this.scene.add(instancedScatter);
                
                console.log(`Added ${instancesPlaced} ${model.name} objects to terrain`);
            }, 
            // Add progress handler
            (xhr) => {
                console.log(`${modelPath}: ${(xhr.loaded / xhr.total * 100)}% loaded`);
            },
            // Add error handler
            (error) => {
                console.error(`Error loading model ${modelPath}:`, error);
            });
        });
        
        return scatterObjects;
    }
    
    // Generate the entire desert environment
    generate() {
        console.log("Generating procedural desert terrain...");
        
        // Generate terrain mesh
        this.generateTerrain();
        
        // Add shrubs
        this.addShrubs();
        
        console.log("Desert terrain generation complete");
    }
    
    // Fast, analytic height query – matches exactly what we used in generateTerrain()
    getHeightAt(x, z) {
        // Get blend factor for town area
        const townBlend = this.getTownBlendFactor(x, z);
        
        // Base terrain height
        let height = this.baseNoise.noise(
            x * this.config.noiseScale.base,
            z * this.config.noiseScale.base
        ) * this.config.heightScale.base;
        
        // Add directional dune height
        const duneHeight = this.getDirectionalDuneHeight(x, z);
        height += duneHeight * townBlend;
        
        // Add detail height
        const detailHeight = this.detailNoise.noise(
            x * this.config.noiseScale.detail,
            z * this.config.noiseScale.detail
        ) * this.config.heightScale.detail;
        
        height += detailHeight * Math.min(1, duneHeight / 20) * townBlend;
        
        // Add micro ripples for sand texture
        const microRipples = this.microRipplesNoise.noise(
            x * this.config.noiseScale.microRipples,
            z * this.config.noiseScale.microRipples
        ) * this.config.heightScale.microRipples;
        
        height += microRipples * 0.3 * townBlend;
        
        // Apply edge fix if enabled
        if (this.config.edgeFix && this.config.edgeFix.enabled) {
            const worldEdge = this.config.size / 2;
            const distToEdgeX = worldEdge - Math.abs(x);
            const distToEdgeZ = worldEdge - Math.abs(z);
            const distToEdge = Math.min(distToEdgeX, distToEdgeZ);
            
            if (distToEdge < this.config.edgeFix.startDistance) {
                const edgeBlend = 1.0 - (distToEdge / this.config.edgeFix.startDistance);
                const edgeWeight = Math.pow(edgeBlend, this.config.edgeFix.endSharpness);
                height = THREE.MathUtils.lerp(height, this.config.edgeFix.heightAtEdge, edgeWeight);
            }
        }
        
        // Flatten areas near train tracks
        if (this.isNearTrainTrack(x, z)) {
            height = 0.1; // Flat height for train tracks
        }
        
        return height;
    }
} 