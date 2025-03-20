/**
 * Proper Shootout game mode implementation
 * All-vs-all shootout where the first player to get 10 kills wins.
 * Up to 10 players can join a lobby.
 */

import { PhysicsSystem } from './physics.js';

export class ProperShootout {
    constructor(scene, localPlayer, networkManager, soundManager) {
        this.scene = scene;
        this.localPlayer = localPlayer;
        this.networkManager = networkManager;
        this.soundManager = soundManager;
        
        // Game state
        this.inLobby = false;
        this.lobbyId = null;
        this.kills = 0;
        this.playerScores = new Map(); // Map of playerId -> kills
        
        // Initialize physics system for collision detection
        this.physics = new PhysicsSystem();
        
        // Map dimensions
        this.mapWidth = 50;
        this.mapLength = 50;
        
        // Initialize the portal, game area, and network handlers
        this.initPortal();
        this.createGameArea();
        this.initNetworkHandlers();
        this.createUI();

        // Make this instance globally accessible for network handlers
        window.properShootout = this;
    }
    
    /**
     * Initialize the portal for Proper Shootout
     */
    initPortal() {
        this.portalGroup = new THREE.Group();
        
        // Calculate portal position - next to the Quick Draw portal
        let portalX = 0;
        let portalY = 2.5;
        let portalZ = 0;
        
        // If town dimensions are available, use them for positioning
        if (window.townDimensions) {
            const streetWidth = window.townDimensions.streetWidth;
            const townLength = window.townDimensions.length;
            
            // Position portal on the side of the street in a line with Quick Draw portal
            portalX = streetWidth * 0.4; // Same X as Quick Draw portal
            portalZ = 6; // Offset on Z axis instead of X to place them in a line
        }
        
        // Create a wooden frame portal with different color
        this.createWoodenFramePortal(portalX, portalY, portalZ);
        
        // Create collision detector for the portal
        this.portalCollider = new THREE.Box3(
            new THREE.Vector3(portalX - 2.5, 0, portalZ - 1),
            new THREE.Vector3(portalX + 2.5, portalY * 2, portalZ + 1)
        );
        
        this.scene.add(this.portalGroup);
        
        // Create portal instructions
        this.createPortalInstructions(new THREE.Vector3(portalX, portalY, portalZ));
    }
    
    /**
     * Creates a wooden frame portal with a different color from Quick Draw
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} z - Z position
     */
    createWoodenFramePortal(x, y, z) {
        const frameWidth = 5;
        const frameHeight = 7;
        const beamThickness = 0.25;
        
        // Create wooden beam material with texture
        const woodMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513,  // Brown
            roughness: 0.9,
            metalness: 0.1
        });
        
        // Create the wooden frame beams
        // Top beam
        const topBeam = new THREE.Mesh(
            new THREE.BoxGeometry(frameWidth, beamThickness, beamThickness),
            woodMaterial
        );
        topBeam.position.set(0, frameHeight/2, 0);
        this.portalGroup.add(topBeam);
        
        // Bottom beam
        const bottomBeam = new THREE.Mesh(
            new THREE.BoxGeometry(frameWidth, beamThickness, beamThickness),
            woodMaterial
        );
        bottomBeam.position.set(0, -frameHeight/2, 0);
        this.portalGroup.add(bottomBeam);
        
        // Left beam
        const leftBeam = new THREE.Mesh(
            new THREE.BoxGeometry(beamThickness, frameHeight, beamThickness),
            woodMaterial
        );
        leftBeam.position.set(-frameWidth/2, 0, 0);
        this.portalGroup.add(leftBeam);
        
        // Right beam
        const rightBeam = new THREE.Mesh(
            new THREE.BoxGeometry(beamThickness, frameHeight, beamThickness),
            woodMaterial
        );
        rightBeam.position.set(frameWidth/2, 0, 0);
        this.portalGroup.add(rightBeam);
        
        // Use a custom shader for a green portal filling (different from Quick Draw's blue)
        const fillingGeometry = new THREE.PlaneGeometry(frameWidth - beamThickness, frameHeight - beamThickness, 32, 32);
        const fillingMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                uniform float time;
                
                void main() {
                    vUv = uv;
                    // Add subtle displacement to vertices
                    vec3 pos = position;
                    pos.x += sin(position.y * 2.0 + time * 0.5) * 0.01;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                varying vec2 vUv;
                
                // Simple noise function
                float noise(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }
                
                void main() {
                    // Green base color for Proper Shootout (vs blue for Quick Draw)
                    vec3 baseColor = vec3(0.0, 0.8, 0.3);
                    
                    // Add subtle swirl pattern
                    float swirl = sin(vUv.x * vUv.y * 10.0 + time * 0.2) * 0.1;
                    
                    // Add a bit of noise pattern
                    float noiseVal = noise(vUv * 5.0 + vec2(time * 0.05, time * 0.03));
                    
                    // Mix colors for subtle effect
                    vec3 color = mix(baseColor, vec3(0.2, 1.0, 0.4), swirl + noiseVal * 0.1);
                    
                    // Add edge glow
                    float edgeX = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x);
                    float edgeY = smoothstep(0.0, 0.07, vUv.y) * smoothstep(1.0, 0.93, vUv.y);
                    float edge = edgeX * edgeY;
                    
                    // Subtle pulsing
                    float pulse = 0.9 + sin(time * 0.5) * 0.1;
                    color = mix(color, vec3(0.4, 1.0, 0.7), (1.0 - edge) * pulse * 0.2);
                    
                    gl_FragColor = vec4(color, 0.9); // Slightly transparent
                }
            `,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        const filling = new THREE.Mesh(fillingGeometry, fillingMaterial);
        filling.position.set(0, 0, -0.05);
        this.portalGroup.add(filling);
        
        // Update the time uniform in the shader
        this.animatePortalFilling(fillingMaterial);
        
        // Create a wooden sign on top of the portal
        this.createWoodenSign(frameWidth, frameHeight);
        
        // Add particle effect around the portal
        this.addPortalParticles(frameWidth, frameHeight);
        
        // Position the portal
        this.portalGroup.position.set(x, y, z);
        this.portalGroup.rotation.y = Math.PI / 2; // Keep the same rotation to match Quick Draw portal
    }
    
    /**
     * Updates the time uniform in the portal shader
     * @param {THREE.ShaderMaterial} material - The shader material
     */
    animatePortalFilling(material) {
        const animate = () => {
            material.uniforms.time.value += 0.01;
            requestAnimationFrame(animate);
        };
        
        requestAnimationFrame(animate);
    }
    
    /**
     * Creates a wooden sign on top of the portal with text visible from both sides
     * @param {number} frameWidth - Width of the portal frame
     * @param {number} frameHeight - Height of the portal frame
     */
    createWoodenSign(frameWidth, frameHeight) {
        // Create wooden sign material
        const woodMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513,  // Brown
            roughness: 0.9,
            metalness: 0.1
        });
        
        // Create sign post
        const signWidth = frameWidth * 0.8;
        const signHeight = 0.8;
        const signDepth = 0.1;
        
        // Create the wooden sign board
        const signGeometry = new THREE.BoxGeometry(signWidth, signHeight, signDepth);
        const sign = new THREE.Mesh(signGeometry, woodMaterial);
        
        // Position the sign above the portal
        sign.position.set(0, frameHeight/2 + signHeight/2 + 0.1, 0);
        
        // Create two small posts to connect the sign to the portal frame
        const postGeometry = new THREE.BoxGeometry(0.2, 0.4, 0.2);
        
        // Left post
        const leftPost = new THREE.Mesh(postGeometry, woodMaterial);
        leftPost.position.set(-signWidth/3, frameHeight/2 + 0.2, 0);
        
        // Right post
        const rightPost = new THREE.Mesh(postGeometry, woodMaterial);
        rightPost.position.set(signWidth/3, frameHeight/2 + 0.2, 0);
        
        // Create text for both sides of the sign
        const createSignText = (isBack) => {
            const textCanvas = document.createElement('canvas');
            const context = textCanvas.getContext('2d');
            textCanvas.width = 512;
            textCanvas.height = 128;
            
            // Clear background
            context.fillStyle = '#8B4513'; // Match the wood color
            context.fillRect(0, 0, textCanvas.width, textCanvas.height);
            
            // Add wood grain texture
            context.strokeStyle = '#6B3F13'; // Darker wood color for grain
            context.lineWidth = 2;
            for (let i = 0; i < 20; i++) {
                const y = i * 7;
                context.beginPath();
                context.moveTo(0, y);
                // Wavy line for wood grain
                for (let x = 0; x < textCanvas.width; x += 20) {
                    context.lineTo(x + 10, y + (Math.random() * 4 - 2));
                }
                context.stroke();
            }
            
            // Add text
            context.fillStyle = 'white';
            context.font = 'bold 70px Western, Arial, sans-serif';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText('Shootout', 256, 64);
            
            // Add a slightly darker stroke to make text more readable
            context.strokeStyle = 'rgba(0,0,0,0.5)';
            context.lineWidth = 2;
            context.strokeText('Shootout', 256, 64);
            
            const texture = new THREE.CanvasTexture(textCanvas);
            texture.needsUpdate = true;
            
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.FrontSide
            });
            
            // Create text plane slightly larger than the sign to avoid z-fighting
            const textGeometry = new THREE.PlaneGeometry(signWidth - 0.05, signHeight - 0.05);
            const textMesh = new THREE.Mesh(textGeometry, material);
            
            // Position text just in front of the sign
            const zOffset = isBack ? -signDepth/2 - 0.01 : signDepth/2 + 0.01;
            textMesh.position.set(0, 0, zOffset);
            
            // If this is the back face, rotate it 180 degrees
            if (isBack) {
                textMesh.rotation.y = Math.PI;
            }
            
            return textMesh;
        };
        
        // Create front and back text
        const frontText = createSignText(false);
        const backText = createSignText(true);
        
        // Add text to sign
        sign.add(frontText);
        sign.add(backText);
        
        // Add everything to the portal group
        this.portalGroup.add(sign);
        this.portalGroup.add(leftPost);
        this.portalGroup.add(rightPost);
    }
    
    /**
     * Adds particle effects around the portal
     * @param {number} width - Width of the portal
     * @param {number} height - Height of the portal
     */
    addPortalParticles(width, height) {
        const particleCount = 50;
        const particleGroup = new THREE.Group();
        
        // Create particle material (green to match portal)
        const particleMaterial = new THREE.PointsMaterial({
            color: 0x00FF00,
            size: 0.15,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending
        });
        
        // Create particle geometry
        const particleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = []; // Store velocities for animation
        
        // Create particles around the frame
        for (let i = 0; i < particleCount; i++) {
            // Position particles around the portal frame
            const side = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
            let x, y;
            
            switch(side) {
                case 0: // top
                    x = (Math.random() - 0.5) * width;
                    y = height/2 + Math.random() * 0.5;
                    break;
                case 1: // right
                    x = width/2 + Math.random() * 0.5;
                    y = (Math.random() - 0.5) * height;
                    break;
                case 2: // bottom
                    x = (Math.random() - 0.5) * width;
                    y = -height/2 - Math.random() * 0.5;
                    break;
                case 3: // left
                    x = -width/2 - Math.random() * 0.5;
                    y = (Math.random() - 0.5) * height;
                    break;
            }
            
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 0.2; // Small Z variation
            
            // Random velocities moving toward the portal
            velocities.push({
                x: -x * 0.01 * (0.5 + Math.random() * 0.5),
                y: -y * 0.01 * (0.5 + Math.random() * 0.5),
                z: (Math.random() - 0.5) * 0.01,
                life: 0,
                maxLife: 60 + Math.floor(Math.random() * 60) // Random lifetime
            });
        }
        
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const particles = new THREE.Points(particleGeometry, particleMaterial);
        particleGroup.add(particles);
        this.portalGroup.add(particleGroup);
        
        // Animate particles
        const animateParticles = () => {
            const positions = particles.geometry.attributes.position.array;
            
            // Update each particle
            for (let i = 0; i < particleCount; i++) {
                // Update position based on velocity
                positions[i * 3] += velocities[i].x;
                positions[i * 3 + 1] += velocities[i].y;
                positions[i * 3 + 2] += velocities[i].z;
                
                // Update life
                velocities[i].life++;
                
                // If particle has reached end of life or center of portal, reset it
                if (velocities[i].life >= velocities[i].maxLife || 
                    (Math.abs(positions[i * 3]) < 0.3 && Math.abs(positions[i * 3 + 1]) < 0.3)) {
                    
                    // Reset to edge of portal
                    const side = Math.floor(Math.random() * 4);
                    let x, y;
                    
                    switch(side) {
                        case 0: // top
                            x = (Math.random() - 0.5) * width;
                            y = height/2 + Math.random() * 0.5;
                            break;
                        case 1: // right
                            x = width/2 + Math.random() * 0.5;
                            y = (Math.random() - 0.5) * height;
                            break;
                        case 2: // bottom
                            x = (Math.random() - 0.5) * width;
                            y = -height/2 - Math.random() * 0.5;
                            break;
                        case 3: // left
                            x = -width/2 - Math.random() * 0.5;
                            y = (Math.random() - 0.5) * height;
                            break;
                    }
                    
                    positions[i * 3] = x;
                    positions[i * 3 + 1] = y;
                    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
                    
                    // New velocity
                    velocities[i] = {
                        x: -x * 0.01 * (0.5 + Math.random() * 0.5),
                        y: -y * 0.01 * (0.5 + Math.random() * 0.5),
                        z: (Math.random() - 0.5) * 0.01,
                        life: 0,
                        maxLife: 60 + Math.floor(Math.random() * 60)
                    };
                }
            }
            
            // Update geometry
            particles.geometry.attributes.position.needsUpdate = true;
            
            requestAnimationFrame(animateParticles);
        };
        
        requestAnimationFrame(animateParticles);
    }
    
    /**
     * Creates a floating instruction panel for the portal
     * @param {THREE.Vector3} portalPosition - The position of the portal
     */
    createPortalInstructions(portalPosition) {
        // Create a container for the instructions
        const instructionsId = 'proper-shootout-instructions';
        
        // Check if it already exists
        let instructionsElement = document.getElementById(instructionsId);
        if (!instructionsElement) {
            instructionsElement = document.createElement('div');
            instructionsElement.id = instructionsId;
            instructionsElement.className = 'portal-instructions';
            instructionsElement.style.position = 'absolute';
            instructionsElement.style.top = '35%';
            instructionsElement.style.left = '50%';
            instructionsElement.style.transform = 'translate(-50%, -50%)';
            instructionsElement.style.color = 'white';
            instructionsElement.style.backgroundColor = 'rgba(0,0,0,0.7)';
            instructionsElement.style.padding = '20px';
            instructionsElement.style.borderRadius = '10px';
            instructionsElement.style.textAlign = 'center';
            instructionsElement.style.width = '400px';
            instructionsElement.style.display = 'none';
            instructionsElement.style.zIndex = '500';
            instructionsElement.style.fontFamily = 'Arial, sans-serif';
            
            instructionsElement.innerHTML = `
                <h2 style="color:#4CAF50; margin-bottom:10px;">Proper Shootout</h2>
                <p>Enter the portal to join a Shootout match!</p>
                <ul style="text-align:left; margin-top:10px; padding-left:20px;">
                    <li>First player to 10 kills wins the match</li>
                    <li>You'll respawn at a random location when killed</li>
                    <li>Press the Exit button to leave the match</li>
                    <li>Up to 10 players can join a single match</li>
                </ul>
            `;
            
            document.getElementById('game-container').appendChild(instructionsElement);
        }
        
        // Show instructions when player gets close to portal
        // Adjust the proximity box based on portal position
        const proximityBox = new THREE.Box3(
            new THREE.Vector3(portalPosition.x - 4, portalPosition.y - 4, portalPosition.z - 4),
            new THREE.Vector3(portalPosition.x + 4, portalPosition.y + 4, portalPosition.z + 4)
        );
        
        // Store the box reference and element for the portal
        this.portalProximityBox = proximityBox;
        this.instructionsElement = instructionsElement;
    }
    
    /**
     * Create UI elements for Proper Shootout game mode.
     */
    createUI() {
        // Text overlay for messages
        this.messageOverlay = document.createElement('div');
        this.messageOverlay.id = 'proper-shootout-message';
        this.messageOverlay.style.position = 'absolute';
        this.messageOverlay.style.top = '30%';
        this.messageOverlay.style.left = '50%';
        this.messageOverlay.style.transform = 'translate(-50%, -50%)';
        this.messageOverlay.style.color = 'white';
        this.messageOverlay.style.fontSize = '36px';
        this.messageOverlay.style.fontWeight = 'bold';
        this.messageOverlay.style.textAlign = 'center';
        this.messageOverlay.style.display = 'none';
        this.messageOverlay.style.fontFamily = 'Western, Arial, sans-serif';
        this.messageOverlay.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.5)';
        this.messageOverlay.style.zIndex = '1000';
        document.getElementById('game-container').appendChild(this.messageOverlay);
        
        // Status indicator
        this.statusIndicator = document.createElement('div');
        this.statusIndicator.id = 'proper-shootout-status';
        this.statusIndicator.style.position = 'absolute';
        this.statusIndicator.style.top = '120px';
        this.statusIndicator.style.left = '20px';
        this.statusIndicator.style.color = 'white';
        this.statusIndicator.style.fontSize = '16px';
        this.statusIndicator.style.backgroundColor = 'rgba(0,0,0,0.5)';
        this.statusIndicator.style.padding = '5px';
        this.statusIndicator.style.borderRadius = '5px';
        this.statusIndicator.style.display = 'none';
        document.getElementById('game-container').appendChild(this.statusIndicator);
        
        // Scoreboard
        this.scoreboard = document.createElement('div');
        this.scoreboard.id = 'proper-shootout-scoreboard';
        this.scoreboard.style.position = 'absolute';
        this.scoreboard.style.top = '10px';
        this.scoreboard.style.right = '10px';
        this.scoreboard.style.width = '200px';
        this.scoreboard.style.color = 'white';
        this.scoreboard.style.fontSize = '14px';
        this.scoreboard.style.backgroundColor = 'rgba(0,0,0,0.7)';
        this.scoreboard.style.padding = '10px';
        this.scoreboard.style.borderRadius = '5px';
        this.scoreboard.style.display = 'none';
        this.scoreboard.style.zIndex = '900';
        document.getElementById('game-container').appendChild(this.scoreboard);
        
        // Exit button
        this.exitButton = document.createElement('button');
        this.exitButton.id = 'proper-shootout-exit';
        this.exitButton.textContent = 'Exit Match';
        this.exitButton.style.position = 'absolute';
        this.exitButton.style.top = '10px';
        this.exitButton.style.left = '10px';
        this.exitButton.style.padding = '5px 10px';
        this.exitButton.style.backgroundColor = '#F44336';
        this.exitButton.style.color = 'white';
        this.exitButton.style.border = 'none';
        this.exitButton.style.borderRadius = '5px';
        this.exitButton.style.cursor = 'pointer';
        this.exitButton.style.display = 'none';
        this.exitButton.style.zIndex = '1000';
        this.exitButton.addEventListener('click', () => {
            this.leaveMatch();
        });
        document.getElementById('game-container').appendChild(this.exitButton);
    }
    
    /**
     * Create the game area for the Proper Shootout mode
     */
    createGameArea() {
        this.gameAreaGroup = new THREE.Group();
        
        // Determine map position - somewhere outside the town boundary
        let mapCenterX = 0;
        let mapCenterZ = 0;
        
        // If town dimensions are available, position map outside town
        if (window.townDimensions) {
            const townLength = window.townDimensions.length;
            
            // Position shootout map opposite to Quick Draw arenas
            mapCenterZ = -townLength - 50; // 50 units past the south boundary
        } else {
            mapCenterZ = -100; // Default position if town dimensions aren't available
        }
        
        // Create ground
        const groundGeometry = new THREE.PlaneGeometry(this.mapWidth, this.mapLength);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513, // Brown dirt color
            roughness: 0.9,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(mapCenterX, 0.01, mapCenterZ); // Slightly above zero to prevent z-fighting
        ground.receiveShadow = true;
        this.gameAreaGroup.add(ground);
        
        // Create a border around the map
        this.createMapBorder(mapCenterX, mapCenterZ);
        
        // Add some simple buildings
        this.addSimpleBuildings(mapCenterX, mapCenterZ);
        
        // Store map center position
        this.mapCenter = new THREE.Vector3(mapCenterX, 0, mapCenterZ);
        
        // Initially hide the game area
        this.gameAreaGroup.visible = false;
        this.scene.add(this.gameAreaGroup);
        
        // Create boundary physics
        this.createMapBoundary();
    }
    
    /**
     * Create a visible border around the shootout map
     * @param {number} centerX - X center of the map
     * @param {number} centerZ - Z center of the map
     */
    createMapBorder(centerX, centerZ) {
        const borderHeight = 1;
        const borderWidth = 1;
        
        // Border material
        const borderMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513, // Brown
            roughness: 0.8,
            metalness: 0.2
        });
        
        // Create four border segments
        const createBorderSegment = (x, z, sizeX, sizeZ) => {
            const geometry = new THREE.BoxGeometry(sizeX, borderHeight, sizeZ);
            const border = new THREE.Mesh(geometry, borderMaterial);
            border.position.set(x, borderHeight / 2, z);
            border.castShadow = true;
            border.receiveShadow = true;
            this.gameAreaGroup.add(border);
            return border;
        };
        
        // Left border (negative X)
        const leftBorder = createBorderSegment(
            centerX - this.mapWidth / 2, 
            centerZ, 
            borderWidth, 
            this.mapLength
        );
        
        // Right border (positive X)
        const rightBorder = createBorderSegment(
            centerX + this.mapWidth / 2, 
            centerZ, 
            borderWidth, 
            this.mapLength
        );
        
        // Front border (negative Z)
        const frontBorder = createBorderSegment(
            centerX, 
            centerZ - this.mapLength / 2, 
            this.mapWidth, 
            borderWidth
        );
        
        // Back border (positive Z)
        const backBorder = createBorderSegment(
            centerX, 
            centerZ + this.mapLength / 2, 
            this.mapWidth, 
            borderWidth
        );
    }
    
    /**
     * Add simple buildings to the map for cover
     * @param {number} centerX - X center of the map
     * @param {number} centerZ - Z center of the map
     */
    addSimpleBuildings(centerX, centerZ) {
        // Add a few primitive buildings scattered around
        const buildingCount = 8;
        const buildingPositions = [];
        
        // Ensure buildings don't overlap by keeping track of positions
        for (let i = 0; i < buildingCount; i++) {
            let validPosition = false;
            let x, z;
            
            // Try to find a non-overlapping position
            for (let attempts = 0; attempts < 10 && !validPosition; attempts++) {
                // Random position within the map
                x = centerX + (Math.random() - 0.5) * (this.mapWidth - 6);
                z = centerZ + (Math.random() - 0.5) * (this.mapLength - 6);
                
                validPosition = true;
                
                // Check against existing buildings
                for (const pos of buildingPositions) {
                    const distance = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(z - pos.z, 2));
                    if (distance < 8) { // Minimum distance between buildings
                        validPosition = false;
                        break;
                    }
                }
            }
            
            if (validPosition) {
                buildingPositions.push({ x, z });
                this.createSimpleBuilding(x, z);
            }
        }
    }
    
    /**
     * Create a simple building at the specified position
     * @param {number} x - X position
     * @param {number} z - Z position
     */
    createSimpleBuilding(x, z) {
        // Randomize building dimensions
        const width = 3 + Math.random() * 3;
        const height = 3 + Math.random() * 2;
        const depth = 3 + Math.random() * 3;
        
        const buildingGroup = new THREE.Group();
        
        // Building body
        const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
        const buildingMaterial = new THREE.MeshStandardMaterial({
            color: Math.random() > 0.5 ? 0x8B4513 : 0xA0522D, // Brown variations
            roughness: 0.8,
            metalness: 0.2
        });
        const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
        building.position.set(0, height / 2, 0);
        building.castShadow = true;
        building.receiveShadow = true;
        buildingGroup.add(building);
        
        // Simple flat roof
        const roofGeometry = new THREE.BoxGeometry(width + 0.5, 0.2, depth + 0.5);
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: 0x4D3300, // Darker brown
            roughness: 0.9,
            metalness: 0.1
        });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(0, height + 0.1, 0);
        roof.castShadow = true;
        buildingGroup.add(roof);
        
        // Add some simple windows and a door
        // Door
        if (Math.random() > 0.5) {
            const doorGeometry = new THREE.PlaneGeometry(1, 2);
            const doorMaterial = new THREE.MeshStandardMaterial({
                color: 0x4D2600, // Dark brown
                roughness: 0.8,
                metalness: 0.2,
                side: THREE.DoubleSide
            });
            const door = new THREE.Mesh(doorGeometry, doorMaterial);
            door.position.set(0, 1, depth / 2 + 0.01);
            buildingGroup.add(door);
        }
        
        // Add 1-3 windows
        const windowCount = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < windowCount; i++) {
            const windowGeometry = new THREE.PlaneGeometry(0.8, 0.8);
            const windowMaterial = new THREE.MeshStandardMaterial({
                color: 0xECF0F1, // White-ish
                roughness: 0.4,
                metalness: 0.6,
                side: THREE.DoubleSide
            });
            
            // Create window
            const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);
            
            // Decide which wall to place the window on
            const wallIndex = Math.floor(Math.random() * 4);
            switch (wallIndex) {
                case 0: // Front wall
                    windowMesh.position.set(-width / 4 + i * width / 2, height / 2, depth / 2 + 0.01);
                    break;
                case 1: // Back wall
                    windowMesh.position.set(-width / 4 + i * width / 2, height / 2, -depth / 2 - 0.01);
                    windowMesh.rotation.y = Math.PI;
                    break;
                case 2: // Left wall
                    windowMesh.position.set(-width / 2 - 0.01, height / 2, -depth / 4 + i * depth / 2);
                    windowMesh.rotation.y = -Math.PI / 2;
                    break;
                case 3: // Right wall
                    windowMesh.position.set(width / 2 + 0.01, height / 2, -depth / 4 + i * depth / 2);
                    windowMesh.rotation.y = Math.PI / 2;
                    break;
            }
            
            buildingGroup.add(windowMesh);
        }
        
        // Position the building
        buildingGroup.position.set(x, 0, z);
        
        // Random rotation for variety
        buildingGroup.rotation.y = Math.random() * Math.PI * 2;
        
        this.gameAreaGroup.add(buildingGroup);
    }
    
    /**
   * Create a physics boundary for the shootout map
   */
  createMapBoundary() {
    if (!this.physics) return;
    
    // Remove any existing boundary first
    this.removeMapBoundary();
    
    // Create a box boundary around the map
    const boundaryBody = new CANNON.Body({
      mass: 0, // Static body
      material: this.physics.defaultMaterial
    });
    
    // Add a box shape for each border
    const halfWidth = this.mapWidth / 2;
    const halfLength = this.mapLength / 2;
    const borderThickness = 1;
    const wallHeight = 5;
    
    // Left border (negative X)
    const leftBorderShape = new CANNON.Box(new CANNON.Vec3(
      borderThickness / 2, 
      wallHeight / 2, 
      halfLength
    ));
    boundaryBody.addShape(
      leftBorderShape, 
      new CANNON.Vec3(this.mapCenter.x - halfWidth, wallHeight / 2, this.mapCenter.z)
    );
    
    // Right border (positive X)
    const rightBorderShape = new CANNON.Box(new CANNON.Vec3(
      borderThickness / 2, 
      wallHeight / 2, 
      halfLength
    ));
    boundaryBody.addShape(
      rightBorderShape, 
      new CANNON.Vec3(this.mapCenter.x + halfWidth, wallHeight / 2, this.mapCenter.z)
    );
    
    // Front border (negative Z)
    const frontBorderShape = new CANNON.Box(new CANNON.Vec3(
      halfWidth, 
      wallHeight / 2, 
      borderThickness / 2
    ));
    boundaryBody.addShape(
      frontBorderShape, 
      new CANNON.Vec3(this.mapCenter.x, wallHeight / 2, this.mapCenter.z - halfLength)
    );
    
    // Back border (positive Z)
    const backBorderShape = new CANNON.Box(new CANNON.Vec3(
      halfWidth, 
      wallHeight / 2, 
      borderThickness / 2
    ));
    boundaryBody.addShape(
      backBorderShape, 
      new CANNON.Vec3(this.mapCenter.x, wallHeight / 2, this.mapCenter.z + halfLength)
    );
    
    boundaryBody.mapBoundary = true; // Tag this body as a map boundary
    boundaryBody.collisionFilterGroup = 2; // Group 2 for boundaries
    
    // Add the boundary body to the world
    this.physics.world.addBody(boundaryBody);
    this.physics.bodies.push(boundaryBody);
    
    // Store a reference to easily find this body later
    this.mapBoundaryBody = boundaryBody;
    
    // If debug mode is enabled, create a visual representation
    if (this.physics.debugMode) {
      this.physics.createDebugMesh(boundaryBody);
      console.log("Creating debug visualization for shootout map boundary");
    }
    
    console.log("Created shootout map boundary");
  }
    
    /**
     * Remove the map boundary
     */
    removeMapBoundary() {
        if (this.mapBoundaryBody && this.physics) {
            this.physics.world.removeBody(this.mapBoundaryBody);
            
            // Remove from physics bodies array
            const index = this.physics.bodies.indexOf(this.mapBoundaryBody);
            if (index !== -1) {
                this.physics.bodies.splice(index, 1);
            }
            
            // Clear the reference
            this.mapBoundaryBody = null;
            console.log("Removed shootout map boundary");
        }
    }
    
    /**
     * Initialize network handlers for Proper Shootout game mode.
     */
    initNetworkHandlers() {
        // Extend existing network manager with Proper Shootout methods
        this.networkManager.sendProperShootoutJoin = () => {
            if (this.networkManager.socket && this.networkManager.socket.readyState === WebSocket.OPEN) {
                this.networkManager.socket.send(JSON.stringify({
                    type: 'properShootoutJoin'
                }));
            }
        };
        
        this.networkManager.sendProperShootoutLeave = () => {
            if (this.networkManager.socket && this.networkManager.socket.readyState === WebSocket.OPEN) {
                this.networkManager.socket.send(JSON.stringify({
                    type: 'properShootoutLeave'
                }));
            }
        };
        
        // Hook into the existing socket onmessage handler
        const originalOnMessage = this.networkManager.socket.onmessage;
        this.networkManager.socket.onmessage = (event) => {
            // Call original handler
            if (originalOnMessage) {
                originalOnMessage(event);
            }
            
            try {
                const message = JSON.parse(event.data);
                
                // Handle Proper Shootout specific messages
                switch (message.type) {
                    case 'properShootoutJoin':
                        this.handleJoinConfirmation(message);
                        break;
                    case 'properShootoutLeave':
                        this.handleLeaveConfirmation(message);
                        break;
                    case 'properShootoutKill':
                        this.handleKillNotification(message);
                        break;
                    case 'properShootoutScores':
                        this.updateScores(message.scores);
                        break;
                    case 'properShootoutPlayerJoin':
                        this.handlePlayerJoin(message);
                        break;
                    case 'properShootoutPlayerLeave':
                        this.handlePlayerLeave(message);
                        break;
                    case 'properShootoutEnd':
                        this.handleMatchEnd(message);
                        break;
                }
            } catch (err) {
                console.error('Error parsing Proper Shootout message:', err);
            }
        };
    }
    
    /**
   * Update method called from main animation loop.
   */
  update(deltaTime) {
    // Skip if player not loaded
    if (!this.localPlayer || !this.localPlayer.group) {
      return;
    }
    
    // Update physics system
    if (this.physics) {
      this.physics.update(deltaTime);
      
      // If the player is in the shootout map, enforce map boundary collision
      if (this.inLobby && this.mapBoundaryBody) {
        const playerPos = this.localPlayer.group.position.clone();
        const isInMap = this.isPointInMap(playerPos);
        
        if (!isInMap) {
          // If player is outside the map, push them back in
          const dirToCenter = new THREE.Vector3(
            this.mapCenter.x - playerPos.x,
            0,
            this.mapCenter.z - playerPos.z
          ).normalize();
          
          // Move player back inside
          this.localPlayer.group.position.x += dirToCenter.x * 0.1;
          this.localPlayer.group.position.z += dirToCenter.z * 0.1;
        }
        
        // Make sure map boundary is visualized in debug mode - with proper null checking
        if (this.physics.debugMode && this.mapBoundaryBody) {
          // Check if debugMeshes array exists and has items
          let hasDebugMesh = false;
          if (this.physics.debugMeshes && Array.isArray(this.physics.debugMeshes)) {
            hasDebugMesh = this.physics.debugMeshes.some(item => item && item.body === this.mapBoundaryBody);
          }
          
          if (!hasDebugMesh) {
            this.physics.createDebugMesh(this.mapBoundaryBody);
            console.log("Recreating debug visualization for shootout map boundary");
          }
        }
      }
    }
    
    // Update portal instruction visibility
    this.updatePortalInstructions();

    // Check for portal collision when not in lobby
    if (!this.inLobby) {
        const playerPos = this.localPlayer.group.position.clone();
        
        // Check if player is colliding with the portal
        if (this.portalCollider && this.portalCollider.containsPoint(playerPos)) {
            this.joinMatch();
        }
    }
  }
    
    /**
     * Check if a point is inside the map
     * @param {THREE.Vector3} point - The point to check
     * @returns {boolean} - True if inside the map
     */
    isPointInMap(point) {
        // Simple rectangular check
        return (
            point.x >= this.mapCenter.x - this.mapWidth / 2 &&
            point.x <= this.mapCenter.x + this.mapWidth / 2 &&
            point.z >= this.mapCenter.z - this.mapLength / 2 &&
            point.z <= this.mapCenter.z + this.mapLength / 2
        );
    }
    
    /**
     * Check if player is near the portal and show appropriate instructions
     */
    updatePortalInstructions() {
        if (!this.localPlayer || !this.localPlayer.group) {
            return;
        }
        
        const playerPos = this.localPlayer.group.position.clone();
        
        // Check if near portal
        if (this.portalProximityBox && this.portalProximityBox.containsPoint(playerPos) && 
            !this.inLobby) {
            // Show portal instructions
            if (this.instructionsElement) {
                this.instructionsElement.style.display = 'block';
            }
        } else {
            // Hide instructions
            if (this.instructionsElement) {
                this.instructionsElement.style.display = 'none';
            }
        }
    }
    
    /**
     * Updates the status indicator.
     */
    updateStatusIndicator() {
        if (!this.statusIndicator) return;
        
        if (this.inLobby) {
            this.statusIndicator.textContent = `Proper Shootout: ${this.kills} / 10 kills`;
            this.statusIndicator.style.display = 'block';
            this.statusIndicator.style.backgroundColor = 'rgba(76, 175, 80, 0.7)'; // Green
        } else {
            this.statusIndicator.style.display = 'none';
        }
    }
    
    /**
     * Updates the scoreboard with player scores
     * @param {Array} scores - Array of {playerId, playerName, kills}
     */
    updateScoreboard(scores) {
        if (!this.scoreboard) return;
        
        if (!this.inLobby) {
            this.scoreboard.style.display = 'none';
            return;
        }
        
        this.scoreboard.style.display = 'block';
        
        // Sort scores by kills in descending order
        scores.sort((a, b) => b.kills - a.kills);
        
        // Create HTML content
        let html = '<h3>Scoreboard</h3><table style="width:100%">';
        html += '<tr><th style="text-align:left">Player</th><th style="text-align:right">Kills</th></tr>';
        
        scores.forEach(score => {
            // Highlight local player
            const isLocalPlayer = score.playerId === this.localPlayer.id;
            const style = isLocalPlayer ? 'color:#4CAF50;font-weight:bold;' : '';
            
            html += `<tr style="${style}">
                <td>${isLocalPlayer ? 'You' : 'Player ' + score.playerId}</td>
                <td style="text-align:right">${score.kills}</td>
            </tr>`;
        });
        
        html += '</table>';
        this.scoreboard.innerHTML = html;
    }
    
    /**
     * Join the Proper Shootout match
     */
    joinMatch() {
        if (this.inLobby) {
            return; // Already in a match
        }
        
        this.showMessage('Joining Shootout match...');
        
        // Send join request to server
        this.networkManager.sendProperShootoutJoin();
        
        console.log("Sent request to join Proper Shootout match");
    }
    
    /**
     * Handle join confirmation from server
     * @param {Object} message - Server message
     */
    handleJoinConfirmation(message) {
        this.inLobby = true;
        this.lobbyId = message.lobbyId;
        this.kills = 0;
        
        // Make the game area visible
        this.gameAreaGroup.visible = true;
        
        // Teleport player to a random position in the map
        this.respawnAtRandomPosition();
        
        // Show UI elements
        this.exitButton.style.display = 'block';
        this.updateStatusIndicator();
        this.updateScores(message.scores || []);
        
        // Show welcome message
        this.showMessage('Joined Shootout match!', 2000);
        
        console.log(`Joined Proper Shootout match with lobby ID: ${this.lobbyId}`);
    }
    
    /**
     * Leave the current match
     */
    leaveMatch() {
        if (!this.inLobby) {
            return; // Not in a match
        }
        
        // Send leave request to server
        this.networkManager.sendProperShootoutLeave();
        
        // Handle cleanup locally in case server message is delayed
        this.handleLeaveConfirmation();
    }
    
    /**
     * Handle leave confirmation
     */
    handleLeaveConfirmation() {
        this.inLobby = false;
        this.lobbyId = null;
        this.kills = 0;
        
        // Hide game area
        this.gameAreaGroup.visible = false;
        
        // Hide UI elements
        this.exitButton.style.display = 'none';
        this.statusIndicator.style.display = 'none';
        this.scoreboard.style.display = 'none';
        
        // Return player to town
        this.localPlayer.spawnPlayerRandomly();
        
        console.log("Left Proper Shootout match");
    }
    
    /**
     * Handle notification that another player joined the match
     * @param {Object} message - Server message with player info
     */
    handlePlayerJoin(message) {
        if (!this.inLobby) return;
        
        this.showMessage(`Player ${message.playerId} joined the match!`, 2000);
        
        // Update scoreboard if scores are provided
        if (message.scores) {
            this.updateScores(message.scores);
        }
    }
    
    /**
     * Handle notification that another player left the match
     * @param {Object} message - Server message with player info
     */
    handlePlayerLeave(message) {
        if (!this.inLobby) return;
        
        this.showMessage(`Player ${message.playerId} left the match!`, 2000);
        
        // Update scoreboard if scores are provided
        if (message.scores) {
            this.updateScores(message.scores);
        }
    }
    
    /**
     * Handle kill notification
     * @param {Object} message - Kill notification with killer and victim info
     */
    handleKillNotification(message) {
        if (!this.inLobby) return;
        
        const killerId = message.killerId;
        const victimId = message.victimId;
        
        // Check if local player got a kill
        if (killerId === this.localPlayer.id) {
            this.kills++;
            this.updateStatusIndicator();
            
            // Show kill message
            this.showMessage(`You killed Player ${victimId}!`, 2000);
        }
        // Check if local player was killed
        else if (victimId === this.localPlayer.id) {
            // Show death message
            this.showMessage(`Killed by Player ${killerId}!`, 2000);
            
            // Respawn after a short delay
            setTimeout(() => {
                this.respawnAtRandomPosition();
            }, 2000);
        }
        // Another player killed another player
        else {
            this.showMessage(`Player ${killerId} killed Player ${victimId}!`, 2000);
        }
        
        // Update scoreboard if scores are provided
        if (message.scores) {
            this.updateScores(message.scores);
        }
    }
    
    /**
     * Update scores from server
     * @param {Array} scores - Array of {playerId, kills}
     */
    updateScores(scores) {
        if (!this.inLobby) return;
        
        // Store scores locally
        this.playerScores.clear();
        scores.forEach(score => {
            this.playerScores.set(score.playerId, score.kills);
            
            // Update local kills if it's the local player
            if (score.playerId === this.localPlayer.id) {
                this.kills = score.kills;
                this.updateStatusIndicator();
            }
        });
        
        // Update scoreboard UI
        this.updateScoreboard(scores);
    }
    
    /**
     * Handle match end notification
     * @param {Object} message - Match end info with winner
     */
    handleMatchEnd(message) {
        if (!this.inLobby) return;
        
        const winnerId = message.winnerId;
        const isLocalPlayerWinner = winnerId === this.localPlayer.id;
        
        // Show end message
        if (isLocalPlayerWinner) {
            this.showMessage('You won the match!', 3000);
        } else {
            this.showMessage(`Player ${winnerId} won the match!`, 3000);
        }
        
        // Return to town after a delay
        setTimeout(() => {
            this.handleLeaveConfirmation();
        }, 3000);
    }
    
    /**
     * Respawn player at a random position within the map
     */
    respawnAtRandomPosition() {
        if (!this.localPlayer) return;
        
        // Generate random position within the map
        const x = this.mapCenter.x + (Math.random() - 0.5) * (this.mapWidth - 5);
        const y = 1.6;
        const z = this.mapCenter.z + (Math.random() - 0.5) * (this.mapLength - 5);
        
        // Teleport player
        this.localPlayer.group.position.set(x, y, z);
        
        // Random rotation
        this.localPlayer.group.rotation.y = Math.random() * Math.PI * 2;
        
        // Reset health
        this.localPlayer.health = 100;
        if (typeof window.updateHealthUI === 'function') {
            window.updateHealthUI(this.localPlayer);
        }
    }
    
    /**
     * Helper to show a message in the center of the screen.
     * @param {string} message - The message to display
     * @param {number} duration - How long to show the message (0 = indefinite)
     */
    showMessage(message, duration = 0) {
        if (!this.messageOverlay) return;
        
        this.messageOverlay.textContent = message;
        this.messageOverlay.style.display = 'block';
        
        if (duration > 0) {
            setTimeout(() => {
                this.messageOverlay.style.display = 'none';
            }, duration);
        }
    }
    
    /**
     * Cleanup resources.
     */
    cleanup() {
        // Leave any active match
        if (this.inLobby) {
            this.leaveMatch();
        }
        
        // Remove the portal group
        if (this.portalGroup) {
            this.scene.remove(this.portalGroup);
            this.portalGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        
        // Remove game area
        if (this.gameAreaGroup) {
            this.scene.remove(this.gameAreaGroup);
            this.gameAreaGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        
        // Remove instruction elements
        if (this.instructionsElement && this.instructionsElement.parentNode) {
            this.instructionsElement.parentNode.removeChild(this.instructionsElement);
        }
        
        // Clean up physics
        this.removeMapBoundary();
        if (this.physics) {
            this.physics.cleanup();
        }
        
        // Remove UI elements
        if (this.messageOverlay && this.messageOverlay.parentNode) {
            this.messageOverlay.parentNode.removeChild(this.messageOverlay);
        }
        
        if (this.statusIndicator && this.statusIndicator.parentNode) {
            this.statusIndicator.parentNode.removeChild(this.statusIndicator);
        }
        
        if (this.scoreboard && this.scoreboard.parentNode) {
            this.scoreboard.parentNode.removeChild(this.scoreboard);
        }
        
        if (this.exitButton && this.exitButton.parentNode) {
            this.exitButton.parentNode.removeChild(this.exitButton);
        }
    }
}