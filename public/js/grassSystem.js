/**
 * GrassSystem.js
 * Implements the stylized procedural grass system for desert terrain.
 * Based on the Ghost of Tsushima grass rendering technique.
 */

// Constants for grass rendering - updated to match reference
const NUM_GRASS = (32 * 32) * 3;
const GRASS_SEGMENTS_LOW = 1;
const GRASS_SEGMENTS_HIGH = 6;
const GRASS_VERTICES_LOW = (GRASS_SEGMENTS_LOW + 1) * 2;
const GRASS_VERTICES_HIGH = (GRASS_SEGMENTS_HIGH + 1) * 2;
const GRASS_LOD_DIST = 20; // Increased from 25 for smoother transitions
const GRASS_MAX_DIST = 300; // Increased from 180 to cover more ground
const GRASS_BASE_PATCH_SIZE = 5 * 2; // Base size that will be randomized
const GRASS_MIN_PATCH_SIZE = GRASS_BASE_PATCH_SIZE * 0.6; // Minimum patch size
const GRASS_MAX_PATCH_SIZE = GRASS_BASE_PATCH_SIZE * 2.0; // Maximum patch size
const GRASS_WIDTH = 0.1;
const GRASS_HEIGHT = 1.5;
// Define a limit for the maximum number of patches to avoid excessive memory usage
const MAX_PATCHES = 3000; // Adjust based on performance
// Calculate a larger radius for full ground coverage
const GRASS_GROUND_RADIUS = 3000; // Set to a large value to cover the entire ground
const LANDSCAPE_SIZE = 5000; // Define the total landscape square size

export class GrassSystem {
  constructor(scene, camera) {
    console.log("Initializing grass system...");
    this.scene = scene;
    this.camera = camera;
    this.meshesLow = [];
    this.meshesHigh = [];
    this.group = new THREE.Group();
    this.group.name = "DESERT_GRASS";
    this.totalTime = 0;
    this.lastCameraPosition = new THREE.Vector3();
    
    // Store reference to terrain for height sampling
    this.desertTerrain = window.desertTerrain;
    
    // Initialize seed for consistent random numbers
    this.setSeed(0); // Set to 0 to match reference
    
    // Load grass texture - try both potential paths
    console.log("Loading grass texture...");
    
    // Check if texture exists at either path
    const textureLoader = new THREE.TextureLoader();
    this.grassTexture = textureLoader.load(
      'models/textures/grassblade.png',
      (texture) => {
        console.log("Grass texture loaded successfully");
        this.onTextureLoaded(texture);
      },
      undefined,
      (error) => {
        console.warn("Failed to load grassblade.png from models/textures directory, trying other paths...", error);
        
        // Try alternative path
        this.grassTexture = textureLoader.load(
          'textures/grassblade.png',
          (texture) => {
            console.log("Grass texture loaded from textures directory");
            this.onTextureLoaded(texture);
          },
          undefined,
          (error) => {
            console.warn("Failed to load from textures directory, trying models directory...", error);
            
            // Try third path
            this.grassTexture = textureLoader.load(
              'models/grassblade.png',
              (texture) => {
                console.log("Grass texture loaded from models directory");
                this.onTextureLoaded(texture);
              },
              undefined,
              (error) => {
                console.error("Failed to load grass texture from all paths:", error);
                // Create a fallback texture - green square with transparency
                this.createFallbackTexture();
              }
            );
          }
        );
      }
    );
    
    // Add group to scene now
    this.scene.add(this.group);
    
    // Track all grass patches
    this.patches = [];
    
    // Track all patch positions for faster lookups
    this.patchPositions = new Set();
    
    // Last update time for patch cleanup
    this.lastCleanupTime = 0;
    
    console.log("Grass system initialized - waiting for texture to load");
  }
  
  // Handle texture loading
  onTextureLoaded(texture) {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 16; // Improves appearance at angles
    
    // Create materials now that texture is loaded
    this.grassMaterialLow = this.createGrassMaterial(true);
    this.grassMaterialHigh = this.createGrassMaterial(false);
    
    // Create base grass geometries
    this.geometryLow = this.createGrassGeometry(GRASS_SEGMENTS_LOW);
    this.geometryHigh = this.createGrassGeometry(GRASS_SEGMENTS_HIGH);
    
    // Create geometry variations for different patch sizes
    this.geometryVariationsLow = [];
    this.geometryVariationsHigh = [];
    
    // Create small, medium and large patch variations
    const sizeVariations = [
      { size: GRASS_MIN_PATCH_SIZE, density: 0.7 },
      { size: GRASS_BASE_PATCH_SIZE, density: 1.0 }, // Base size, normal density
      { size: GRASS_BASE_PATCH_SIZE * 1.5, density: 1.4 },
      { size: GRASS_MAX_PATCH_SIZE, density: 2.0 }
    ];
    
    for (const variation of sizeVariations) {
      this.geometryVariationsLow.push(
        this.createGrassGeometry(GRASS_SEGMENTS_LOW, variation.size, variation.density)
      );
      this.geometryVariationsHigh.push(
        this.createGrassGeometry(GRASS_SEGMENTS_HIGH, variation.size, variation.density)
      );
    }
    
    // Initial update to position grass around starting position
    if (this.camera) {
      console.log("Creating initial grass patches...");
      this.lastCameraPosition.copy(this.camera.position);
      this.updatePatches();
    }
  }
  
  // Create a fallback texture if loading fails
  createFallbackTexture() {
    console.log("Creating fallback grass texture");
    
    // Create a canvas-based texture
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Fill with transparent
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw a simple grass blade shape
    ctx.fillStyle = 'rgba(0,200,0,0.9)';
    ctx.beginPath();
    ctx.moveTo(32, 0);        // Top point
    ctx.lineTo(64, 128);      // Bottom right
    ctx.lineTo(0, 128);       // Bottom left
    ctx.closePath();
    ctx.fill();
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    this.grassTexture = texture;
    
    // Create materials with the fallback texture
    this.grassMaterialLow = this.createGrassMaterial(true);
    this.grassMaterialHigh = this.createGrassMaterial(false);
    
    // Create base grass geometries
    this.geometryLow = this.createGrassGeometry(GRASS_SEGMENTS_LOW);
    this.geometryHigh = this.createGrassGeometry(GRASS_SEGMENTS_HIGH);
    
    // Create geometry variations for different patch sizes
    this.geometryVariationsLow = [];
    this.geometryVariationsHigh = [];
    
    // Create small, medium and large patch variations
    const sizeVariations = [
      { size: GRASS_MIN_PATCH_SIZE, density: 0.7 },
      { size: GRASS_BASE_PATCH_SIZE, density: 1.0 }, // Base size, normal density
      { size: GRASS_BASE_PATCH_SIZE * 1.5, density: 1.4 },
      { size: GRASS_MAX_PATCH_SIZE, density: 2.0 }
    ];
    
    for (const variation of sizeVariations) {
      this.geometryVariationsLow.push(
        this.createGrassGeometry(GRASS_SEGMENTS_LOW, variation.size, variation.density)
      );
      this.geometryVariationsHigh.push(
        this.createGrassGeometry(GRASS_SEGMENTS_HIGH, variation.size, variation.density)
      );
    }
    
    // Initial update to position grass around starting position
    if (this.camera) {
      console.log("Creating initial grass patches with fallback texture...");
      this.lastCameraPosition.copy(this.camera.position);
      this.updatePatches();
    }
  }
  
  // Create a single grass material with appropriate detail level
  createGrassMaterial(isLowDetail) {
    const vertexShader = `
      uniform vec2 grassSize;
      uniform vec4 grassParams;
      uniform vec4 grassDraw;
      uniform float time;
      uniform vec3 playerPos;
      uniform mat4 viewMatrixInverse;
      uniform vec3 patchOrigin;

      attribute float vertIndex;

      varying vec4 vGrassParams;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      varying float vEdgeFade;

      // Math utility functions
      float saturate(float x) {
        return clamp(x, 0.0, 1.0);
      }

      float linearstep(float minValue, float maxValue, float v) {
        return clamp((v - minValue) / (maxValue - minValue), 0.0, 1.0);
      }

      float easeOut(float x, float t) {
        return 1.0 - pow(1.0 - x, t);
      }

      float easeIn(float x, float t) {
        return pow(x, t);
      }

      // Hash functions
      vec2 hash22(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
      }

      vec4 hash42(vec2 p) {
        vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
        p4 += dot(p4, p4.wzxy + 33.33);
        return fract((p4.xxyz + p4.yzzw) * p4.zywx) * 2.0 - 1.0;
      }

      // Noise function for wind
      float noise12(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        
        // Smooth interpolation
        vec2 u = f * f * (3.0 - 2.0 * f);
        
        // Hash corners
        float a = dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
        float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
        float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
        float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
        
        // Mix
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.5 + 0.5;
      }

      // Matrix utility functions
      mat3 rotateX(float theta) {
        float c = cos(theta);
        float s = sin(theta);
        return mat3(
          vec3(1.0, 0.0, 0.0),
          vec3(0.0, c, -s),
          vec3(0.0, s, c)
        );
      }

      mat3 rotateY(float theta) {
        float c = cos(theta);
        float s = sin(theta);
        return mat3(
          vec3(c, 0.0, s),
          vec3(0.0, 1.0, 0.0),
          vec3(-s, 0.0, c)
        );
      }

      mat3 rotateAxis(vec3 axis, float angle) {
        axis = normalize(axis);
        float s = sin(angle);
        float c = cos(angle);
        float oc = 1.0 - c;
        
        return mat3(
          oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,
          oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,
          oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c
        );
      }

      void main() {
        vec3 grassOffset = vec3(position.x, position.y, position.z);

        // Calculate absolute world position of this blade
        vec3 grassBladeWorldPos = vec3(
          patchOrigin.x + grassOffset.x,
          patchOrigin.y + grassOffset.y,
          patchOrigin.z + grassOffset.z
        );

        // Edge fade based on distance from patch center - using a smooth quadratic falloff
        // that creates a more circular appearance
        float distFromCenter = length(vec2(grassOffset.x, grassOffset.z));
        float patchRadius = grassParams.w;
        float fadeStart = patchRadius * 0.7;  // Start fading at 70% of radius
        float fadeEnd = patchRadius * 0.95;   // Complete fade by 95% of radius
        vEdgeFade = smoothstep(fadeStart, fadeEnd, distFromCenter);

        float heightmapSample = 0.0;
        float heightmapSampleHeight = 1.0;

        vec4 hashVal1 = hash42(vec2(grassBladeWorldPos.x, grassBladeWorldPos.z));

        float highLODOut = smoothstep(grassDraw.x * 0.5, grassDraw.x, distance(cameraPosition, grassBladeWorldPos));
        float lodFadeIn = smoothstep(grassDraw.x, grassDraw.y, distance(cameraPosition, grassBladeWorldPos));

        // REMOVED: Check for terrain type and allowed grass areas
        // All areas now allow grass growth
        
        float randomAngle = hashVal1.x * 2.0 * 3.14159;
        float randomShade = clamp(hashVal1.y * 0.5 + 0.5, 0.5, 1.0);
        float randomHeight = mix(0.75, 1.5, hashVal1.z * 0.5 + 0.5) * heightmapSampleHeight;
        float randomWidth = heightmapSampleHeight;
        float randomLean = mix(0.1, 0.4, hashVal1.w * 0.5 + 0.5);

        vec2 hashGrassColour = hash22(vec2(grassBladeWorldPos.x, grassBladeWorldPos.z)) * 0.5 + 0.5;
        float leanAnimation = (noise12(vec2(time * 0.35) + grassBladeWorldPos.xz * 137.423) * 2.0 - 1.0) * 0.1;

        float GRASS_SEGMENTS = grassParams.x;
        float GRASS_VERTICES = grassParams.y;

        // Figure out vertex id
        float vertID = mod(float(vertIndex), GRASS_VERTICES);

        // 1 = front, -1 = back
        float zSide = -(floor(vertIndex / GRASS_VERTICES) * 2.0 - 1.0);

        // 0 = left, 1 = right
        float xSide = mod(vertID, 2.0);

        float heightPercent = (vertID - xSide) / (GRASS_SEGMENTS * 2.0);

        // Select grass blade variation (0-4 for 5 variations)
        float bladeVariation = floor(hashVal1.x * 5.0);

        float grassTotalHeight = grassSize.y * randomHeight;
        float grassTotalWidthHigh = easeOut(1.0 - heightPercent, 2.0);
        float grassTotalWidthLow = 1.0 - heightPercent;
        float grassTotalWidth = grassSize.x * mix(grassTotalWidthHigh, grassTotalWidthLow, highLODOut) * randomWidth;

        // Shift verts
        float x = (xSide - 0.5) * grassTotalWidth;
        float y = heightPercent * grassTotalHeight;

        float windDir = noise12(grassBladeWorldPos.xz * 0.05 + 0.05 * time) * 6.28318;
        float windNoiseSample = noise12(grassBladeWorldPos.xz * 0.25 + time * 1.0) * 2.0 - 1.0;
        float windLeanAngle = mix(0.25, 1.0, clamp(windNoiseSample * 0.5 + 0.5, 0.0, 1.0));
        windLeanAngle = easeIn(windLeanAngle, 2.0) * 1.25;
        vec3 windAxis = vec3(cos(windDir), 0.0, sin(windDir));

        windLeanAngle *= heightPercent;

        float distToPlayer = distance(grassBladeWorldPos.xz, playerPos.xz);
        float playerFalloff = smoothstep(2.5, 1.0, distToPlayer);
        float playerLeanAngle = mix(0.0, 0.2, playerFalloff * linearstep(0.5, 0.0, windLeanAngle));
        vec3 grassToPlayer = normalize(vec3(playerPos.x, 0.0, playerPos.z) - vec3(grassBladeWorldPos.x, 0.0, grassBladeWorldPos.z));
        vec3 playerLeanAxis = vec3(grassToPlayer.z, 0, -grassToPlayer.x);

        randomLean += leanAnimation;

        float easedHeight = mix(easeIn(heightPercent, 2.0), 1.0, highLODOut);
        float curveAmount = -randomLean * easedHeight;

        float ncurve1 = -randomLean * easedHeight;
        vec3 n1 = vec3(0.0, (heightPercent + 0.01), 0.0);
        n1 = rotateX(ncurve1) * n1;

        float ncurve2 = -randomLean * easedHeight * 0.9;
        vec3 n2 = vec3(0.0, (heightPercent + 0.01) * 0.9, 0.0);
        n2 = rotateX(ncurve2) * n2;

        vec3 ncurve = normalize(n1 - n2);

        mat3 grassMat = rotateAxis(playerLeanAxis, playerLeanAngle) * rotateAxis(windAxis, windLeanAngle) * rotateY(randomAngle);

        vec3 grassFaceNormal = vec3(0.0, 0.0, 1.0);
        grassFaceNormal = grassMat * grassFaceNormal;
        grassFaceNormal *= zSide;

        vec3 grassVertexNormal = vec3(0.0, -ncurve.z, ncurve.y);
        vec3 grassVertexNormal1 = rotateY(3.14159 * 0.3 * zSide) * grassVertexNormal;

        grassVertexNormal1 = grassMat * grassVertexNormal1;
        grassVertexNormal1 *= zSide;

        vec3 grassVertexPosition = vec3(x, y, 0.0);
        grassVertexPosition = rotateX(curveAmount) * grassVertexPosition;
        grassVertexPosition = grassMat * grassVertexPosition;

        grassVertexPosition += grassOffset;

        vGrassParams = vec4(heightPercent, grassBladeWorldPos.y, highLODOut, xSide);
        
        const float SKY_RATIO = 0.15;
        vec3 UP = vec3(0.0, 1.0, 0.0);
        float skyFadeIn = (1.0 - highLODOut) * SKY_RATIO;
        vNormal = normalize(mix(UP, grassVertexNormal1, skyFadeIn));

        vec3 pos = grassVertexPosition;

        vec3 viewDir = normalize(cameraPosition - grassBladeWorldPos);
        vec3 viewDirXZ = normalize(vec3(viewDir.x, 0.0, viewDir.z));
        vec3 grassFaceNormalXZ = normalize(vec3(grassFaceNormal.x, 0.0, grassFaceNormal.z));

        float viewDotNormal = saturate(dot(grassFaceNormal, viewDirXZ));
        float viewSpaceThickenFactor = easeOut(1.0 - viewDotNormal, 4.0) * smoothstep(0.0, 0.2, viewDotNormal);

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        
        // Thicken effect for better visibility
        mvPosition.x += viewSpaceThickenFactor * (xSide - 0.5) * grassTotalWidth * 0.5 * zSide;
        
        gl_Position = projectionMatrix * mvPosition;
        
        vPosition = pos;
        vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
        
        // Map UV to select one of the 5 blade variations
        // Each blade is 1/5 of the total width
        float uvX = (xSide * 0.2) + (bladeVariation * 0.2);
        vUv = vec2(uvX, heightPercent);
      }
    `;
    
    const fragmentShader = this.getFragmentShader();
    
    // Set up the uniforms
    const uniforms = {
      grassTexture: { value: this.grassTexture },
      diffuse: { value: new THREE.Color(0x446644) },
      specular: { value: new THREE.Color(0x223322) },
      shininess: { value: 10 },
      opacity: { value: 1.0 },
      time: { value: 0.0 },
      grassSize: { value: new THREE.Vector2(GRASS_WIDTH, GRASS_HEIGHT) },
      grassParams: {
        value: new THREE.Vector4(
          isLowDetail ? GRASS_SEGMENTS_LOW : GRASS_SEGMENTS_HIGH,
          isLowDetail ? GRASS_VERTICES_LOW : GRASS_VERTICES_HIGH,
          0.0,  // Not used
          GRASS_MAX_PATCH_SIZE * 0.5  // Used for edge fading
        )
      },
      grassDraw: {
        value: new THREE.Vector4(
          GRASS_LOD_DIST * 0.8, // Adjusted for smoother LOD transition
          GRASS_MAX_DIST * 0.9, // Fade out before hitting max distance
          0.0,
          0.0
        )
      },
      playerPos: { value: new THREE.Vector3(0, 0, 0) },
      patchOrigin: { value: new THREE.Vector3(0, 0, 0) },
      viewMatrixInverse: { value: new THREE.Matrix4() }
    };
    
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide
    });
  }
  
  // Separate method for fragment shader to keep code cleaner
  getFragmentShader() {
    return `
      uniform vec3 diffuse;
      uniform vec3 specular;
      uniform float shininess;
      uniform float opacity;
      uniform float time;
      uniform sampler2D grassTexture;
      
      varying vec4 vGrassParams;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      varying float vEdgeFade;
      
      // Light data (mimic Three.js directional light)
      struct DirectionalLight {
        vec3 direction;
        vec3 color;
      };
      
      const DirectionalLight directionalLight = DirectionalLight(
        normalize(vec3(-0.5, 0.8, 0.5)),
        vec3(1.0, 1.0, 1.0)
      );
      
      // Utility functions
      float saturate(float x) {
        return clamp(x, 0.0, 1.0);
      }
      
      float easeIn(float x, float t) {
        return pow(x, t);
      }
      
      vec3 calculateLighting(vec3 normal, vec3 viewDir, vec3 baseColor) {
        // Ambient term
        vec3 ambient = vec3(0.3) * baseColor;
        
        // Diffuse term with wrapped lighting for softer look
        float wrap = 0.5;
        float NdotL = saturate((dot(normal, directionalLight.direction) + wrap) / (1.0 + wrap));
        vec3 diffuseLight = NdotL * directionalLight.color * baseColor;
        
        // Simple specular for highlights
        vec3 halfVector = normalize(directionalLight.direction + viewDir);
        float NdotH = max(0.0, dot(normal, halfVector));
        vec3 specularLight = pow(NdotH, shininess) * specular * directionalLight.color;
        
        // Back-lighting for translucency effect
        float backLight = saturate((dot(viewDir, -directionalLight.direction) + wrap) / (1.0 + wrap));
        float backFalloff = 0.5;
        vec3 backScatter = directionalLight.color * pow(backLight, 1.0) * backFalloff * baseColor * (1.0 - vGrassParams.z);
        
        return ambient + diffuseLight + specularLight + backScatter;
      }
      
      void main() {
        // Grass color processing
        float heightPercent = vGrassParams.x;
        float lodFadeIn = vGrassParams.z;
        
        // Sample the grass texture
        vec4 texSample = texture2D(grassTexture, vUv);
        
        // Use texture color directly
        vec3 baseColor = texSample.rgb;
        
        // Apply ambient occlusion at the base for natural grounding
        float ao = mix(0.25, 1.0, easeIn(heightPercent, 2.0));
        baseColor *= ao;
        
        // Lighting calculation
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 litColor = calculateLighting(normalize(vNormal), viewDir, baseColor);
        
        // Use alpha from texture if available, and apply edge fade with a sharper cutoff
        float fadeThreshold = 0.75; // Higher value creates a sharper circular edge
        float alpha = texSample.a * (1.0 - step(fadeThreshold, vEdgeFade));
        
        if (alpha < 0.5) discard; // Discard pixels with low alpha
        
        gl_FragColor = vec4(litColor, alpha);
      }
    `;
  }
  
  createGrassGeometry(segments, patchSize = GRASS_BASE_PATCH_SIZE, bladeMultiplier = 1.0) {
    this.setSeed(0); // Set seed to 0 to match reference

    const VERTICES = (segments + 1) * 2;
    
    // Scale number of grass blades based on patch size relative to base size
    const scaledNumGrass = Math.floor(NUM_GRASS * bladeMultiplier);

    // Create indices
    const indices = [];
    for (let i = 0; i < segments; ++i) {
      const vi = i * 2;
      indices[i*12+0] = vi + 0;
      indices[i*12+1] = vi + 1;
      indices[i*12+2] = vi + 2;

      indices[i*12+3] = vi + 2;
      indices[i*12+4] = vi + 1;
      indices[i*12+5] = vi + 3;

      const fi = VERTICES + vi;
      indices[i*12+6] = fi + 2;
      indices[i*12+7] = fi + 1;
      indices[i*12+8] = fi + 0;

      indices[i*12+9]  = fi + 3;
      indices[i*12+10] = fi + 1;
      indices[i*12+11] = fi + 2;
    }

    // Create offsets with individual heights - using polar coordinates for more circular distribution
    const offsets = [];
    const halfPatchSize = patchSize * 0.5;
    
    for (let i = 0; i < scaledNumGrass; ++i) {
      // Use a circular distribution with square root for more uniform density
      // This creates more blades near the center and fewer at the edges
      const radius = halfPatchSize * Math.sqrt(this.randRange(0, 1));
      const angle = this.randRange(0, Math.PI * 2);
      
      // Convert to cartesian coordinates
      const ox = radius * Math.cos(angle);
      const oz = radius * Math.sin(angle);
      
      // Note: Height (oy) will be set during rendering based on the patch origin
      offsets.push(ox);
      offsets.push(0); // Y offset will be determined by terrain
      offsets.push(oz);
    }

    // Create vertex IDs
    const vertID = new Uint8Array(VERTICES*2);
    for (let i = 0; i < VERTICES*2; ++i) {
      vertID[i] = i;
    }

    // Create instanced geometry
    const geo = new THREE.InstancedBufferGeometry();
    geo.instanceCount = scaledNumGrass;
    geo.setAttribute('vertIndex', new THREE.Uint8BufferAttribute(vertID, 1));
    geo.setAttribute('position', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
    geo.setIndex(indices);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1 + patchSize * 2);
    
    // Store the patch size with the geometry for later reference
    geo.userData = {
      patchSize: patchSize,
      bladeMultiplier: bladeMultiplier
    };

    return geo;
  }
  
  createGrassPatch(position) {
    if (!this.grassMaterialLow || !this.grassMaterialHigh || 
        !this.geometryVariationsLow || !this.geometryVariationsHigh ||
        this.geometryVariationsLow.length === 0 || this.geometryVariationsHigh.length === 0) {
      console.warn("Cannot create grass patch - materials or geometries not initialized");
      return null;
    }
    
    // Get the terrain height at this position
    if (this.desertTerrain) {
      const terrainHeight = this.desertTerrain.getHeightAt(position.x, position.z);
      position.y = terrainHeight + 0.05; // Small offset to prevent z-fighting
    }
    
    // Calculate distance to camera
    const distToCamera = position.distanceTo(this.camera.position);
    
    // Use low detail mesh for far away patches, high detail for close ones
    const isLowDetail = distToCamera > GRASS_LOD_DIST;

    // Select a random variation based on a hash of the position
    // This ensures consistent patch sizes at the same world positions
    const posHash = Math.abs(Math.sin(position.x * 0.1) * Math.cos(position.z * 0.1)) * this.geometryVariationsLow.length;
    const variationIndex = Math.floor(posHash) % this.geometryVariationsLow.length;
    
    // Get the appropriate geometry based on detail level and variation
    const geometry = isLowDetail 
      ? this.geometryVariationsLow[variationIndex] 
      : this.geometryVariationsHigh[variationIndex];
    
    const material = isLowDetail ? this.grassMaterialLow : this.grassMaterialHigh;
    
    // Create a mesh for this patch
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = true;
    mesh.position.copy(position);
    this.group.add(mesh);
    
    // Save reference to type of mesh
    if (isLowDetail) {
      this.meshesLow.push(mesh);
    } else {
      this.meshesHigh.push(mesh);
    }
    
    // Store the patch size for later reference
    const patchSize = geometry.userData.patchSize;
    
    // Create patch data
    const patch = {
      position: position.clone(),
      isLowDetail: isLowDetail,
      mesh: mesh,
      lastSeen: performance.now(), // Track when this patch was last seen
      variationIndex: variationIndex,
      patchSize: patchSize
    };
    
    // Add to patches array and track position
    this.patches.push(patch);
    
    // Use a more precise position key to avoid duplicate patches
    const posKey = `${position.x.toFixed(1)},${position.z.toFixed(1)}`;
    this.patchPositions.add(posKey);
    
    return patch;
  }
  
  // Update grass patches as the player moves
  updatePatches() {
    if (!this.camera) {
      console.warn("Cannot update grass patches - camera is undefined");
      return;
    }
    
    if (!this.grassMaterialLow || !this.grassMaterialHigh || 
        !this.geometryVariationsLow || !this.geometryVariationsHigh) {
      console.warn("Cannot update grass patches - materials or geometries not initialized");
      return;
    }
    
    const now = performance.now();
    console.log(`Updating grass patches around camera at ${this.camera.position.x.toFixed(1)}, ${this.camera.position.z.toFixed(1)}`);
    
    // Calculate base position (center of the grid)
    const basePos = new THREE.Vector3().copy(this.camera.position);
    basePos.y = 0; // Keep grass at ground level
    
    // Use average patch size for grid calculations
    const avgPatchSize = GRASS_BASE_PATCH_SIZE;
    
    // Calculate base cell coordinates
    const baseCellX = Math.floor(basePos.x / avgPatchSize);
    const baseCellZ = Math.floor(basePos.z / avgPatchSize);
    
    // Determine coverage radius (how many patches in each direction)
    const visibleRadius = Math.floor(GRASS_MAX_DIST / avgPatchSize);
    
    // For debugging
    let patchesCreated = 0;
    
    // Create frustum for culling
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);
    
    // Only create new patches if we haven't exceeded the maximum
    if (this.patches.length < MAX_PATCHES) {
      // Create a dense grid of patches around the player for proper coverage
      for (let x = -visibleRadius; x <= visibleRadius; x++) {
        for (let z = -visibleRadius; z <= visibleRadius; z++) {
          // Add jitter to cell positions to break the grid pattern
          const jitter = avgPatchSize * 0.5;
          const cellX = (baseCellX + x) * avgPatchSize + this.randRange(-jitter, jitter);
          const cellZ = (baseCellZ + z) * avgPatchSize + this.randRange(-jitter, jitter);
          
          // Skip if this position is too far from camera (squared distance check for performance)
          const distSq = (cellX - basePos.x) * (cellX - basePos.x) + (cellZ - basePos.z) * (cellZ - basePos.z);
          if (distSq > GRASS_MAX_DIST * GRASS_MAX_DIST) {
            continue;
          }
          
          // Position key for lookup
          const posKey = `${cellX.toFixed(1)},${cellZ.toFixed(1)}`;
          
          // Skip if this patch already exists
          if (this.patchPositions.has(posKey)) {
            // Update the last seen time for this patch
            const patch = this.patches.find(p => 
              Math.abs(p.position.x - cellX) < 0.1 && 
              Math.abs(p.position.z - cellZ) < 0.1);
            
            if (patch) {
              patch.lastSeen = now;
            }
            continue;
          }
          
          // Create cell position
          const cellPos = new THREE.Vector3(cellX, 0, cellZ);
          
          // Create AABB for frustum culling
          const aabb = new THREE.Box3().setFromCenterAndSize(
            cellPos,
            new THREE.Vector3(GRASS_MAX_PATCH_SIZE, 1000, GRASS_MAX_PATCH_SIZE)
          );
          
          // Create new patch (the height will be set in createGrassPatch)
          const patch = this.createGrassPatch(new THREE.Vector3(cellX, 0, cellZ));
          if (patch) {
            patchesCreated++;
            patch.lastSeen = now;
          }
        }
      }
    } else {
      console.warn(`Maximum patch count reached (${MAX_PATCHES}), skipping new patch creation`);
    }
    
    console.log(`Created ${patchesCreated} new grass patches, total patches: ${this.patches.length}`);
    
    // Update all patches and clean up old ones
    this.updatePatchesVisibility(now);
    
    // Periodically clean up distant/unused patches
    if (now - this.lastCleanupTime > 10000) { // Every 10 seconds
      this.cleanupDistantPatches(now);
      this.lastCleanupTime = now;
    }
  }
  
  // Separate method to update patch visibility
  updatePatchesVisibility(now) {
    // Update visibility of all patches based on distance
    for (const patch of this.patches) {
      const distToCamera = patch.position.distanceTo(this.camera.position);
      
      // Check if this patch is still needed (inside max distance)
      if (distToCamera < GRASS_MAX_DIST) {
        patch.mesh.visible = true;
        patch.lastSeen = now; // Update last seen time
        
        // Update LOD if needed
        const shouldBeLowDetail = distToCamera > GRASS_LOD_DIST;
        if (patch.isLowDetail !== shouldBeLowDetail) {
          // Switch LOD level but keep same size variation
          patch.isLowDetail = shouldBeLowDetail;
          
          // Get the appropriate geometry based on detail level and variation
          const newGeometry = shouldBeLowDetail 
            ? this.geometryVariationsLow[patch.variationIndex] 
            : this.geometryVariationsHigh[patch.variationIndex];
            
          const newMaterial = shouldBeLowDetail ? this.grassMaterialLow : this.grassMaterialHigh;
          
          patch.mesh.geometry = newGeometry;
          patch.mesh.material = newMaterial;
          
          // Update mesh references
          if (shouldBeLowDetail) {
            // Remove from high detail list, add to low detail
            const index = this.meshesHigh.indexOf(patch.mesh);
            if (index !== -1) this.meshesHigh.splice(index, 1);
            this.meshesLow.push(patch.mesh);
          } else {
            // Remove from low detail list, add to high detail
            const index = this.meshesLow.indexOf(patch.mesh);
            if (index !== -1) this.meshesLow.splice(index, 1);
            this.meshesHigh.push(patch.mesh);
          }
        }
      } else {
        // Patch is too far away, hide it
        patch.mesh.visible = false;
      }
    }
  }
  
  // Clean up distant patches to prevent memory issues
  cleanupDistantPatches(now) {
    const maxPatchAge = 20000; // Remove patches that haven't been seen in 20 seconds
    const patchesToRemove = [];
    
    // Find all patches that haven't been seen recently
    for (let i = 0; i < this.patches.length; i++) {
      const patch = this.patches[i];
      const patchAge = now - patch.lastSeen;
      
      if (patchAge > maxPatchAge) {
        patchesToRemove.push(i);
      }
    }
    
    // Remove patches in reverse order to maintain correct indices
    for (let i = patchesToRemove.length - 1; i >= 0; i--) {
      const index = patchesToRemove[i];
      const patch = this.patches[index];
      
      // Remove from position tracking
      this.patchPositions.delete(`${patch.position.x.toFixed(1)},${patch.position.z.toFixed(1)}`);
      
      // Remove from scene
      this.group.remove(patch.mesh);
      
      // Remove from appropriate mesh array
      if (patch.isLowDetail) {
        const meshIndex = this.meshesLow.indexOf(patch.mesh);
        if (meshIndex !== -1) this.meshesLow.splice(meshIndex, 1);
      } else {
        const meshIndex = this.meshesHigh.indexOf(patch.mesh);
        if (meshIndex !== -1) this.meshesHigh.splice(meshIndex, 1);
      }
      
      // Remove from patches array
      this.patches.splice(index, 1);
    }
    
    if (patchesToRemove.length > 0) {
      console.log(`Cleaned up ${patchesToRemove.length} distant/unused grass patches`);
    }
  }
  
  // Update grass system
  update(deltaTime, playerPosition) {
    if (!this.camera) {
      console.warn("Cannot update grass system - camera is undefined");
      return;
    }
    
    if (!this.grassMaterialLow || !this.grassMaterialHigh) {
      // Materials not yet loaded, skip update
      return;
    }
    
    // Update time
    this.totalTime += deltaTime;
    
    // Update materials
    this.grassMaterialLow.uniforms.time.value = this.totalTime;
    this.grassMaterialHigh.uniforms.time.value = this.totalTime;
    
    if (playerPosition) {
      this.grassMaterialLow.uniforms.playerPos.value.copy(playerPosition);
      this.grassMaterialHigh.uniforms.playerPos.value.copy(playerPosition);
    }
    
    // Update viewMatrixInverse for billboarding (if needed)
    if (this.camera) {
      this.grassMaterialLow.uniforms.viewMatrixInverse.value.copy(this.camera.matrixWorld);
      this.grassMaterialHigh.uniforms.viewMatrixInverse.value.copy(this.camera.matrixWorld);
      
      // Update grass patches if player has moved significantly
      if (this.camera.position.distanceTo(this.lastCameraPosition) > GRASS_BASE_PATCH_SIZE / 4) {
        this.lastCameraPosition.copy(this.camera.position);
        this.updatePatches();
      }
    }
    
    // Update patch origin uniforms to enable per-blade height sampling
    for (const mesh of this.meshesLow.concat(this.meshesHigh)) {
      if (mesh.material.uniforms && mesh.material.uniforms.patchOrigin) {
        mesh.material.uniforms.patchOrigin.value.copy(mesh.position);
      }
    }
  }
  
  // Clean up resources
  dispose() {
    console.log("Disposing grass system...");
    
    // Remove grass group from scene
    this.scene.remove(this.group);
    
    // Dispose of geometries and materials
    if (this.geometryLow) this.geometryLow.dispose();
    if (this.geometryHigh) this.geometryHigh.dispose();
    
    // Dispose of geometry variations
    if (this.geometryVariationsLow) {
      this.geometryVariationsLow.forEach(geo => geo.dispose());
      this.geometryVariationsLow = [];
    }
    
    if (this.geometryVariationsHigh) {
      this.geometryVariationsHigh.forEach(geo => geo.dispose());
      this.geometryVariationsHigh = [];
    }
    
    if (this.grassMaterialLow) this.grassMaterialLow.dispose();
    if (this.grassMaterialHigh) this.grassMaterialHigh.dispose();
    if (this.grassTexture) this.grassTexture.dispose();
    
    // Clear arrays
    this.meshesLow = [];
    this.meshesHigh = [];
    this.patches = [];
  }
  
  // These methods are now just placeholders - they always return false to allow grass everywhere
  isInTownArea(x, z) {
    // Now always return false to allow grass in town area
    return false;
  }
  
  // Check if position is near train track
  isNearTrainTrack(x, z) {
    // Now always return false to allow grass near train tracks
    return false;
  }
  
  // Simple random number utility with seed
  setSeed(seed) {
    this.seed = seed || 0;
  }
  
  randRange(min, max) {
    // Simple deterministic random function
    this.seed = (this.seed * 9301 + 49297) % 233280;
    const random = this.seed / 233280;
    return min + random * (max - min);
  }
} 